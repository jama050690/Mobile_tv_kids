import { Injectable } from '@nestjs/common';
import { AgeGroup, Prisma, StreamType, UrlHealth } from '@prisma/client';
import { localDayRangeUtc, toLocalIso, utcOffsetLabel, utcOffsetMinutes } from '../common/utils/time.util';
import { ChannelsService, PublicChannel } from '../channels/channels.service';
import { PrismaService } from '../prisma/prisma.service';
import { CacheKeys } from '../redis/playout-cache.service';
import { RedisService } from '../redis/redis.service';

const PROGRAM_SELECT = {
  id: true,
  title: true,
  description: true,
  thumbnailUrl: true,
  ageRating: true,
  durationSec: true,
  videoUrl: true,
  fallbackUrl: true,
  streamType: true,
  isLiveStream: true,
  urlStatus: true,
  fallbackUrlStatus: true,
} satisfies Prisma.ProgramSelect;

/** Keshda saqlanadigan slot (sanalar ISO satr ko'rinishida) */
interface CachedSlot {
  id: string;
  startsAtUtc: string;
  endsAtUtc: string;
  program: Prisma.ProgramGetPayload<{ select: typeof PROGRAM_SELECT }>;
}

interface ChannelState {
  current: CachedSlot | null;
  next: CachedSlot | null;
  computedAt: string;
  validUntil: string;
}

/**
 * PLAYING     — video efirda, playback.seekOffsetSec dan boshlab o'ynatiladi
 * FILLER      — slot hali tugamagan, lekin video tugadi (video slotdan qisqa) -> "Keyingi multfilm tez orada"
 * UNAVAILABLE — video URL va zaxira URL ishlamayapti -> keyingi dasturni kutish ekrani
 * OFF_AIR     — hozir jadvalda hech narsa yo'q
 */
export type OnAirStatus = 'PLAYING' | 'FILLER' | 'UNAVAILABLE' | 'OFF_AIR';

const STATE_MAX_TTL_SEC = 60;
const EPG_TTL_SEC = 300;

@Injectable()
export class PlayoutService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly channels: ChannelsService,
  ) {}

  /** Bitta kanal: hozir efirda nima ketyapti, qaysi sekunddan boshlash kerak, keyingisi nima */
  async getNow(ref: string, tz: string) {
    const channel = await this.channels.findActiveByRef(ref);
    const now = new Date();
    const state = await this.getChannelState(channel.id, now);
    return { ...this.timeInfo(now, tz), ...this.present(channel, state, now, tz) };
  }

  /** Barcha kanallar bo'yicha hozirgi/keyingi dastur (asosiy ekran, kanallar paneli) */
  async getGuideNow(tz: string, ageGroup?: AgeGroup) {
    const channels = await this.channels.listPublic(ageGroup);
    const now = new Date();
    const items = await Promise.all(
      channels.map(async (c) => this.present(c, await this.getChannelState(c.id, now), now, tz)),
    );
    return { ...this.timeInfo(now, tz), channels: items };
  }

  /** Tanlangan kanalning kunlik dasturi — foydalanuvchi mahalliy kuni va vaqtida */
  async getSchedule(ref: string, tz: string, date?: string) {
    const channel = await this.channels.findActiveByRef(ref);
    const range = localDayRangeUtc(date, tz);
    const key = CacheKeys.epg(channel.id, range.from.getTime(), range.to.getTime());

    let slots = await this.redis.getJson<CachedSlot[]>(key);
    if (!slots) {
      const rows = await this.prisma.scheduleSlot.findMany({
        where: {
          channelId: channel.id,
          startsAtUtc: { lt: range.to },
          endsAtUtc: { gt: range.from },
          program: { isActive: true },
        },
        orderBy: { startsAtUtc: 'asc' },
        include: { program: { select: PROGRAM_SELECT } },
      });
      slots = rows.map((r) => this.toCached(r));
      await this.redis.setJson(key, slots, EPG_TTL_SEC);
    }

    const now = Date.now();
    return {
      ...this.timeInfo(new Date(), tz),
      date: range.date,
      dayStartUtc: range.from.toISOString(),
      dayEndUtc: range.to.toISOString(),
      channel,
      items: slots.map((s) => {
        const start = Date.parse(s.startsAtUtc);
        const end = Date.parse(s.endsAtUtc);
        return {
          ...this.slotView(s, tz),
          state: end <= now ? 'ENDED' : start <= now ? 'LIVE' : 'UPCOMING',
        };
      }),
    };
  }

  /** Server vaqti — ilova soatini sinxronlash uchun (qurilma soati noto'g'ri bo'lishi mumkin) */
  getTime(tz: string) {
    return this.timeInfo(new Date(), tz);
  }

  // =========================================================
  //  Ichki mantiq
  // =========================================================

  private async getChannelState(channelId: string, now: Date): Promise<ChannelState> {
    const key = CacheKeys.channelState(channelId);
    const cached = await this.redis.getJson<ChannelState>(key);
    if (cached && Date.parse(cached.validUntil) > now.getTime() && Date.parse(cached.computedAt) <= now.getTime()) {
      return cached;
    }

    const include = { program: { select: PROGRAM_SELECT } };
    const [current, next] = await Promise.all([
      this.prisma.scheduleSlot.findFirst({
        where: { channelId, startsAtUtc: { lte: now }, endsAtUtc: { gt: now }, program: { isActive: true } },
        orderBy: { startsAtUtc: 'desc' },
        include,
      }),
      this.prisma.scheduleSlot.findFirst({
        where: { channelId, startsAtUtc: { gt: now }, program: { isActive: true } },
        orderBy: { startsAtUtc: 'asc' },
        include,
      }),
    ]);

    // Holat keyingi o'zgarishgacha (joriy slot tugashi / keyingisi boshlanishi) yoki max 60s keshlanadi
    const limits = [now.getTime() + STATE_MAX_TTL_SEC * 1000];
    if (current) limits.push(current.endsAtUtc.getTime());
    if (next) limits.push(next.startsAtUtc.getTime());

    const state: ChannelState = {
      current: current ? this.toCached(current) : null,
      next: next ? this.toCached(next) : null,
      computedAt: now.toISOString(),
      validUntil: new Date(Math.min(...limits)).toISOString(),
    };
    const ttl = (Math.min(...limits) - now.getTime()) / 1000;
    if (ttl >= 1) await this.redis.setJson(key, state, ttl);
    return state;
  }

  private present(channel: PublicChannel, state: ChannelState, now: Date, tz: string) {
    const nowMs = now.getTime();
    let status: OnAirStatus = 'OFF_AIR';
    let playback: ReturnType<typeof this.buildPlayback> = null;
    let current: (ReturnType<typeof this.slotView> & { elapsedSec: number; remainingSec: number; progress: number }) | null = null;
    const changeAt: number[] = [];

    if (state.current) {
      const s = state.current;
      const start = Date.parse(s.startsAtUtc);
      const end = Date.parse(s.endsAtUtc);
      const slotSec = (end - start) / 1000;
      const elapsed = (nowMs - start) / 1000;
      changeAt.push(end);

      current = {
        ...this.slotView(s, tz),
        elapsedSec: Math.floor(elapsed),
        remainingSec: Math.max(0, Math.ceil((end - nowMs) / 1000)),
        progress: Math.min(1, Math.max(0, Math.round((elapsed / slotSec) * 1000) / 1000)),
      };

      // Video qayerda tugaydi: video davomiyligi yoki slot oxiri (qaysi biri oldin bo'lsa)
      const playUntilSec = s.program.isLiveStream ? slotSec : Math.min(s.program.durationSec, slotSec);
      if (elapsed >= playUntilSec) {
        status = 'FILLER';
      } else {
        playback = this.buildPlayback(s, elapsed, playUntilSec, nowMs);
        status = playback ? 'PLAYING' : 'UNAVAILABLE';
        if (playback) changeAt.push(start + playUntilSec * 1000);
      }
    }

    const next = state.next
      ? {
          ...this.slotView(state.next, tz),
          startsInSec: Math.max(0, Math.ceil((Date.parse(state.next.startsAtUtc) - nowMs) / 1000)),
        }
      : null;
    if (state.next) changeAt.push(Date.parse(state.next.startsAtUtc));

    // Ilova qachon qayta so'rashi kerak (keyingi holat o'zgarishi)
    const nextChange = changeAt.filter((t) => t > nowMs);
    const refreshInSec = nextChange.length
      ? Math.max(1, Math.ceil((Math.min(...nextChange) - nowMs) / 1000))
      : STATE_MAX_TTL_SEC;

    return { channel, status, current, playback, next, refreshInSec };
  }

  /**
   * Seek offset: dastur 10:00:00 UTC da boshlangan, hozir 10:03:20 => seekOffsetSec = 200.
   * Asosiy URL buzilgan bo'lsa zaxira URL ishlatiladi; ikkalasi ham buzilgan bo'lsa null.
   */
  private buildPlayback(s: CachedSlot, elapsedSec: number, playUntilSec: number, nowMs: number) {
    const p = s.program;
    const primaryOk = p.urlStatus !== UrlHealth.BROKEN;
    const fallbackOk = !!p.fallbackUrl && p.fallbackUrlStatus !== UrlHealth.BROKEN;
    if (!primaryOk && !fallbackOk) return null;

    const url = primaryOk ? p.videoUrl : (p.fallbackUrl as string);
    const fallbackUrl = primaryOk ? (fallbackOk ? p.fallbackUrl : null) : null;
    const start = Date.parse(s.startsAtUtc);

    return {
      programId: p.id,
      url,
      fallbackUrl,
      streamType: p.streamType as StreamType,
      isLive: p.isLiveStream,
      /** Pleer shu sekunddan boshlashi kerak (millisekund aniqlikda) */
      seekOffsetSec: p.isLiveStream ? 0 : Math.round(elapsedSec * 1000) / 1000,
      /** Video shu sekundda to'xtatiladi (slot video'dan qisqa bo'lsa) */
      playUntilSec,
      playUntilUtc: new Date(start + playUntilSec * 1000).toISOString(),
      remainingSec: Math.max(0, Math.ceil(playUntilSec - (nowMs - start) / 1000)),
      usingFallback: !primaryOk,
    };
  }

  private slotView(s: CachedSlot, tz: string) {
    return {
      slotId: s.id,
      startsAtUtc: s.startsAtUtc,
      endsAtUtc: s.endsAtUtc,
      startsAtLocal: toLocalIso(s.startsAtUtc, tz),
      endsAtLocal: toLocalIso(s.endsAtUtc, tz),
      durationSec: Math.round((Date.parse(s.endsAtUtc) - Date.parse(s.startsAtUtc)) / 1000),
      program: {
        id: s.program.id,
        title: s.program.title,
        description: s.program.description,
        thumbnailUrl: s.program.thumbnailUrl,
        ageRating: s.program.ageRating,
        durationSec: s.program.durationSec,
      },
    };
  }

  private toCached(row: {
    id: string;
    startsAtUtc: Date;
    endsAtUtc: Date;
    program: CachedSlot['program'];
  }): CachedSlot {
    return {
      id: row.id,
      startsAtUtc: row.startsAtUtc.toISOString(),
      endsAtUtc: row.endsAtUtc.toISOString(),
      program: row.program,
    };
  }

  private timeInfo(now: Date, tz: string) {
    return {
      serverTimeUtc: now.toISOString(),
      serverEpochMs: now.getTime(),
      timezone: tz,
      localTime: toLocalIso(now, tz),
      utcOffset: utcOffsetLabel(tz, now),
      utcOffsetMinutes: utcOffsetMinutes(tz, now),
    };
  }
}
