import { Inject, Injectable, Logger, NotFoundException, OnModuleDestroy } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { StreamType, UrlHealth } from '@prisma/client';
import { LookupAddress, lookup as dnsLookup } from 'node:dns';
import { Agent, fetch, Response } from 'undici';
import { appConfig, AppConfig } from '../config/app.config';
import { isPublicIp, runWithConcurrency } from '../common/utils/net.util';
import { EventsService } from '../events/events.service';
import { PrismaService } from '../prisma/prisma.service';
import { PlayoutCacheService } from '../redis/playout-cache.service';
import { RedisService } from '../redis/redis.service';
import { UrlPolicyService } from './url-policy.service';

export interface UrlCheckResult {
  url: string;
  ok: boolean;
  status: UrlHealth;
  streamType: StreamType | null;
  httpStatus: number | null;
  contentType: string | null;
  supportsRange: boolean | null;
  isLive: boolean | null;
  detectedDurationSec: number | null;
  finalUrl: string | null;
  latencyMs: number;
  warnings: string[];
  error: string | null;
  checkedAt: string;
}

class CheckError extends Error {}

const USER_AGENT = 'KidsTV-HealthCheck/1.0';
const MAX_PLAYLIST_BYTES = 2 * 1024 * 1024;

@Injectable()
export class UrlHealthService implements OnModuleDestroy {
  private readonly logger = new Logger(UrlHealthService.name);
  private readonly agent: Agent;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly cache: PlayoutCacheService,
    private readonly events: EventsService,
    private readonly policy: UrlPolicyService,
    @Inject(appConfig.KEY) private readonly cfg: AppConfig,
  ) {
    // DNS javobini tekshiruvchi agent: domen ichki IP'ga resolve bo'lsa ulanish bloklanadi (DNS rebinding/SSRF)
    this.agent = new Agent({
      headersTimeout: cfg.media.checkTimeoutMs,
      bodyTimeout: cfg.media.checkTimeoutMs,
      connect: {
        timeout: cfg.media.checkTimeoutMs,
        lookup: (hostname, options, callback) => {
          dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
            if (err) return callback(err, '', 4);
            const list = addresses as unknown as LookupAddress[];
            const blocked = list.find((a) => !isPublicIp(a.address));
            if (blocked || list.length === 0) {
              return callback(new Error(`Ichki manzil bloklandi: ${blocked?.address ?? hostname}`), '', 4);
            }
            if ((options as { all?: boolean }).all) {
              (callback as unknown as (e: null, a: LookupAddress[]) => void)(null, list);
            } else {
              callback(null, list[0].address, list[0].family);
            }
          });
        },
      },
    });
  }

  async onModuleDestroy() {
    await this.agent.close();
  }

  // =========================================================
  //  Asosiy tekshiruv
  // =========================================================

  async check(url: string, expected?: StreamType): Promise<UrlCheckResult> {
    const started = Date.now();
    const result: UrlCheckResult = {
      url,
      ok: false,
      status: UrlHealth.BROKEN,
      streamType: expected ?? null,
      httpStatus: null,
      contentType: null,
      supportsRange: null,
      isLive: null,
      detectedDurationSec: null,
      finalUrl: null,
      latencyMs: 0,
      warnings: [],
      error: null,
      checkedAt: new Date().toISOString(),
    };

    try {
      const policyError = this.policy.validate(url);
      if (policyError) throw new CheckError(policyError);

      const type = expected ?? this.guessType(url);
      if (type === StreamType.HLS) await this.checkHls(url, result);
      else await this.checkMp4OrSniff(url, result);

      if (expected && result.streamType && expected !== result.streamType) {
        result.warnings.push(`Kutilgan format ${expected}, lekin aniqlangani ${result.streamType}`);
      }
      result.ok = result.error === null;
      result.status = result.ok ? UrlHealth.OK : UrlHealth.BROKEN;
    } catch (e) {
      result.error = this.describeError(e);
      result.ok = false;
      result.status = UrlHealth.BROKEN;
    }
    result.latencyMs = Date.now() - started;
    return result;
  }

  /** Dasturning asosiy va zaxira URL'ini tekshirib, natijani DB'ga yozadi */
  async checkProgram(programId: string) {
    const program = await this.prisma.program.findUnique({ where: { id: programId } });
    if (!program) throw new NotFoundException('Dastur topilmadi');

    const primary = await this.check(program.videoUrl, program.streamType);
    const fallback = program.fallbackUrl ? await this.check(program.fallbackUrl) : null;

    if (primary.ok && primary.detectedDurationSec && !program.isLiveStream) {
      const diff = Math.abs(primary.detectedDurationSec - program.durationSec);
      if (diff > 5) {
        primary.warnings.push(
          `Video haqiqiy davomiyligi ${primary.detectedDurationSec}s, bazada ${program.durationSec}s (farq ${diff}s)`,
        );
      }
    }
    if (primary.isLive === true && !program.isLiveStream) {
      primary.warnings.push("Bu jonli (live) HLS oqim — dasturda isLiveStream=true qilib belgilang");
    }

    const changed =
      program.urlStatus !== primary.status ||
      program.fallbackUrlStatus !== (fallback?.status ?? UrlHealth.UNKNOWN);

    await this.prisma.program.update({
      where: { id: programId },
      data: {
        urlStatus: primary.status,
        urlError: primary.error?.slice(0, 500) ?? (primary.warnings.join('; ').slice(0, 500) || null),
        urlCheckedAt: new Date(),
        fallbackUrlStatus: fallback?.status ?? UrlHealth.UNKNOWN,
      },
    });

    if (changed) {
      await this.cache.invalidateAll();
      await this.events.emit({ type: 'program.updated', programId });
    }
    return { programId, primary, fallback };
  }

  /** Ilova "video ochilmadi" deb xabar bersa — 10 daqiqada bir martadan ko'p tekshirilmaydi */
  async requestCheck(programId: string): Promise<boolean> {
    const allowed = await this.redis.setIfAbsent(`urlcheck:throttle:${programId}`, 600);
    if (!allowed) return false;
    this.checkProgram(programId).catch((e: Error) =>
      this.logger.warn(`Program ${programId} tekshiruvida xato: ${e.message}`),
    );
    return true;
  }

  /** Har 6 soatda barcha faol dasturlar tekshiriladi (bir nechta instansiyada faqat bittasi ishlaydi) */
  @Cron(CronExpression.EVERY_6_HOURS, { name: 'url-health-check' })
  async checkAllActive(): Promise<{ checked: number; broken: number } | null> {
    if (!this.cfg.media.cronEnabled) return null;
    const locked = await this.redis.setIfAbsent('lock:url-health-cron', 3 * 3600);
    if (!locked) return null;

    const programs = await this.prisma.program.findMany({ where: { isActive: true }, select: { id: true } });
    let broken = 0;
    await runWithConcurrency(programs, 5, async (p) => {
      try {
        const r = await this.checkProgram(p.id);
        if (!r.primary.ok) broken++;
      } catch (e) {
        this.logger.warn(`Tekshiruv xatosi ${p.id}: ${(e as Error).message}`);
      }
    });
    this.logger.log(`URL health-check: ${programs.length} ta tekshirildi, ${broken} ta ishlamayapti`);
    return { checked: programs.length, broken };
  }

  // =========================================================
  //  Format bo'yicha tekshiruvlar
  // =========================================================

  private async checkHls(url: string, r: UrlCheckResult, depth = 0): Promise<void> {
    const { res, finalUrl } = await this.safeFetch(url, {});
    r.httpStatus = res.status;
    r.contentType = res.headers.get('content-type');
    r.finalUrl = finalUrl;
    r.streamType = StreamType.HLS;
    if (res.status !== 200) {
      await res.body?.cancel();
      throw new CheckError(`HTTP ${res.status}`);
    }
    const text = (await this.readLimited(res, MAX_PLAYLIST_BYTES)).toString('utf8').replace(/^﻿/, '');
    if (!text.trimStart().startsWith('#EXTM3U')) throw new CheckError("HLS playlist emas (#EXTM3U topilmadi)");

    if (text.includes('#EXT-X-STREAM-INF')) {
      // Master playlist -> birinchi variant playlistni tekshiramiz
      if (depth > 0) throw new CheckError('Ichma-ich master playlist');
      const lines = text.split(/\r?\n/);
      const idx = lines.findIndex((l) => l.startsWith('#EXT-X-STREAM-INF'));
      const variant = lines.slice(idx + 1).find((l) => l.trim() && !l.startsWith('#'));
      if (!variant) throw new CheckError("Master playlist'da variant topilmadi");
      await this.checkHls(new URL(variant.trim(), finalUrl).toString(), r, depth + 1);
      r.finalUrl = finalUrl;
      return;
    }

    const isVod = text.includes('#EXT-X-ENDLIST') || /#EXT-X-PLAYLIST-TYPE:\s*VOD/.test(text);
    r.isLive = !isVod;
    if (isVod) {
      const total = [...text.matchAll(/#EXTINF:\s*([\d.]+)/g)].reduce((s, m) => s + Number(m[1]), 0);
      r.detectedDurationSec = total > 0 ? Math.round(total) : null;
    }
    if (!/#EXTINF/.test(text)) throw new CheckError("Playlist'da segmentlar yo'q");
  }

  private async checkMp4OrSniff(url: string, r: UrlCheckResult): Promise<void> {
    const { res, finalUrl } = await this.safeFetch(url, { range: 'bytes=0-65535' });
    r.httpStatus = res.status;
    r.contentType = res.headers.get('content-type');
    r.finalUrl = finalUrl;
    if (res.status !== 200 && res.status !== 206) {
      await res.body?.cancel();
      throw new CheckError(`HTTP ${res.status}`);
    }
    r.supportsRange = res.status === 206 || res.headers.get('accept-ranges') === 'bytes';
    const head = await this.readLimited(res, 65536);

    if (head.toString('utf8', 0, 16).replace(/^﻿/, '').startsWith('#EXTM3U')) {
      // Kengaytmasiz HLS URL
      return this.checkHls(url, r);
    }

    r.streamType = StreamType.MP4;
    const isMp4 = head.length >= 12 && head.toString('latin1', 4, 8) === 'ftyp';
    const isVideoType = (r.contentType ?? '').startsWith('video/');
    if (!isMp4 && !isVideoType) throw new CheckError('MP4 video emas (ftyp sarlavhasi topilmadi)');
    if (!r.supportsRange) {
      r.warnings.push("Server Range request'ni qo'llab-quvvatlamaydi — seek (o'rtadan boshlash) ishlamasligi mumkin");
    }
    const cors = res.headers.get('access-control-allow-origin');
    if (!cors) r.warnings.push("CORS sarlavhasi yo'q — Web versiyada ochilmasligi mumkin (mobil ilovaga ta'sir qilmaydi)");
  }

  // =========================================================
  //  Yordamchi funksiyalar
  // =========================================================

  /** Redirect'larni qo'lda kuzatadi va har bir qadamda URL siyosatini tekshiradi */
  private async safeFetch(url: string, headers: Record<string, string>) {
    let current = url;
    for (let hop = 0; hop <= 5; hop++) {
      const err = this.policy.validate(current);
      if (err) throw new CheckError(hop ? `Redirect: ${err}` : err);
      const res: Response = await fetch(current, {
        method: 'GET',
        headers: { 'user-agent': USER_AGENT, accept: '*/*', ...headers },
        redirect: 'manual',
        dispatcher: this.agent,
        signal: AbortSignal.timeout(this.cfg.media.checkTimeoutMs),
      });
      if ([301, 302, 303, 307, 308].includes(res.status)) {
        const location = res.headers.get('location');
        await res.body?.cancel();
        if (!location) throw new CheckError("Redirect manzili yo'q");
        current = new URL(location, current).toString();
        continue;
      }
      return { res, finalUrl: current };
    }
    throw new CheckError("Juda ko'p redirect");
  }

  private async readLimited(res: Response, maxBytes: number): Promise<Buffer> {
    if (!res.body) return Buffer.alloc(0);
    const reader = res.body.getReader();
    const chunks: Buffer[] = [];
    let total = 0;
    try {
      while (total < maxBytes) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(Buffer.from(value));
        total += value.byteLength;
      }
    } finally {
      await reader.cancel().catch(() => undefined);
    }
    return Buffer.concat(chunks).subarray(0, maxBytes);
  }

  private guessType(url: string): StreamType | undefined {
    const path = new URL(url).pathname.toLowerCase();
    if (path.endsWith('.m3u8')) return StreamType.HLS;
    if (path.endsWith('.mp4') || path.endsWith('.m4v')) return StreamType.MP4;
    return undefined;
  }

  private describeError(e: unknown): string {
    if (e instanceof CheckError) return e.message;
    const err = e as Error & { cause?: Error & { code?: string } };
    if (err.name === 'TimeoutError' || err.name === 'AbortError') return 'Javob kutish vaqti tugadi (timeout)';
    const cause = err.cause;
    if (cause?.code === 'ENOTFOUND') return 'Domen topilmadi (DNS)';
    if (cause?.code === 'ECONNREFUSED') return 'Ulanish rad etildi';
    if (cause?.message) return cause.message.slice(0, 300);
    return (err.message || "Noma'lum xato").slice(0, 300);
  }
}
