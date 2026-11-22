import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Channel, Prisma, Program, SlotStatus, UrlHealth } from '@prisma/client';
import { DateTime } from 'luxon';
import { isAgeSuitable } from '../common/utils/age.util';
import { localDayRangeUtc, parseAdminTime, secondsBetween, toLocalIso } from '../common/utils/time.util';
import { EventsService } from '../events/events.service';
import { PrismaService } from '../prisma/prisma.service';
import { PlayoutCacheService } from '../redis/playout-cache.service';
import { CopyDayDto, CreateSlotDto, SequenceDto, UpdateSlotDto } from './dto/schedule.dto';

type Tx = Prisma.TransactionClient;

export interface SlotWarning {
  code: 'SLOT_LONGER_THAN_MEDIA' | 'MEDIA_TRUNCATED' | 'URL_BROKEN' | 'PROGRAM_INACTIVE' | 'AGE_MISMATCH' | 'IN_PAST';
  message: string;
  slotStartsAtUtc?: string;
}

const MAX_SLOT_SEC = 24 * 3600;
const MAX_RANGE_DAYS = 31;
/** Slot va video davomiyligi orasidagi ruxsat etilgan farq */
const DURATION_TOLERANCE_SEC = 5;

const SLOT_INCLUDE = {
  program: {
    select: {
      id: true,
      title: true,
      durationSec: true,
      ageRating: true,
      streamType: true,
      urlStatus: true,
      isActive: true,
      thumbnailUrl: true,
    },
  },
} satisfies Prisma.ScheduleSlotInclude;

type SlotWithProgram = Prisma.ScheduleSlotGetPayload<{ include: typeof SLOT_INCLUDE }>;

@Injectable()
export class ScheduleService {
  private readonly logger = new Logger(ScheduleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: PlayoutCacheService,
    private readonly events: EventsService,
  ) {}

  // =========================================================
  //  O'qish
  // =========================================================

  async list(channelId: string | undefined, fromRaw: string, toRaw: string, tz?: string) {
    const { from, to } = this.parseRange(fromRaw, toRaw);
    const slots = await this.prisma.scheduleSlot.findMany({
      where: { channelId, startsAtUtc: { lt: to }, endsAtUtc: { gt: from } },
      orderBy: [{ channelId: 'asc' }, { startsAtUtc: 'asc' }],
      include: SLOT_INCLUDE,
    });
    return slots.map((s) => this.present(s, tz));
  }

  async get(id: string, tz?: string) {
    const slot = await this.prisma.scheduleSlot.findUnique({ where: { id }, include: SLOT_INCLUDE });
    if (!slot) throw new NotFoundException('Slot topilmadi');
    return this.present(slot, tz);
  }

  // =========================================================
  //  Yaratish / tahrirlash / o'chirish
  // =========================================================

  async create(dto: CreateSlotDto) {
    const [channel, program] = await Promise.all([this.getChannel(dto.channelId), this.getProgram(dto.programId)]);
    const start = parseAdminTime(dto.startsAt, dto.timezone, 'startsAt');
    const end = dto.endsAt
      ? parseAdminTime(dto.endsAt, dto.timezone, 'endsAt')
      : new Date(start.getTime() + program.durationSec * 1000);
    this.assertSlotRange(start, end);

    const slot = await this.prisma.$transaction(async (tx) => {
      await this.lockChannel(tx, channel.id);
      await this.assertNoOverlap(tx, channel.id, start, end);
      return tx.scheduleSlot.create({
        data: { channelId: channel.id, programId: program.id, startsAtUtc: start, endsAtUtc: end, status: this.statusFor(start, end) },
        include: SLOT_INCLUDE,
      });
    });

    await this.afterChange(channel.id, start, end);
    return { slot: this.present(slot, dto.timezone), warnings: this.buildWarnings(channel, program, start, end) };
  }

  async update(id: string, dto: UpdateSlotDto) {
    const existing = await this.prisma.scheduleSlot.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Slot topilmadi');
    const channel = await this.getChannel(existing.channelId);
    const program = await this.getProgram(dto.programId ?? existing.programId);

    const start = dto.startsAt ? parseAdminTime(dto.startsAt, dto.timezone, 'startsAt') : existing.startsAtUtc;
    let end: Date;
    if (dto.endsAt) end = parseAdminTime(dto.endsAt, dto.timezone, 'endsAt');
    else if (dto.programId && dto.programId !== existing.programId) end = new Date(start.getTime() + program.durationSec * 1000);
    else end = new Date(start.getTime() + (existing.endsAtUtc.getTime() - existing.startsAtUtc.getTime()));
    this.assertSlotRange(start, end);

    const slot = await this.prisma.$transaction(async (tx) => {
      await this.lockChannel(tx, channel.id);
      await this.assertNoOverlap(tx, channel.id, start, end, id);
      return tx.scheduleSlot.update({
        where: { id },
        data: { programId: program.id, startsAtUtc: start, endsAtUtc: end, status: this.statusFor(start, end) },
        include: SLOT_INCLUDE,
      });
    });

    const minStart = start < existing.startsAtUtc ? start : existing.startsAtUtc;
    const maxEnd = end > existing.endsAtUtc ? end : existing.endsAtUtc;
    await this.afterChange(channel.id, minStart, maxEnd);
    return { slot: this.present(slot, dto.timezone), warnings: this.buildWarnings(channel, program, start, end) };
  }

  async remove(id: string) {
    const slot = await this.prisma.scheduleSlot.findUnique({ where: { id } });
    if (!slot) throw new NotFoundException('Slot topilmadi');
    await this.prisma.scheduleSlot.delete({ where: { id } });
    await this.afterChange(slot.channelId, slot.startsAtUtc, slot.endsAtUtc);
  }

  /** Oraliqdagi slotlarni o'chirish (boshlanish vaqti [from, to) ichida bo'lganlar) */
  async clearRange(channelId: string, fromRaw: string, toRaw: string) {
    const { from, to } = this.parseRange(fromRaw, toRaw);
    await this.getChannel(channelId);
    const { count } = await this.prisma.scheduleSlot.deleteMany({
      where: { channelId, startsAtUtc: { gte: from, lt: to } },
    });
    await this.afterChange(channelId, from, to);
    return { deleted: count };
  }

  /**
   * Dasturlarni ketma-ket qo'shish: har biri oldingisi tugagan zahoti boshlanadi.
   * Admin uchun eng qulay usul — "playlist" kabi to'ldirish.
   */
  async sequence(dto: SequenceDto) {
    const channel = await this.getChannel(dto.channelId);
    const uniqueIds = [...new Set(dto.programIds)];
    const programs = await this.prisma.program.findMany({ where: { id: { in: uniqueIds } } });
    const byId = new Map(programs.map((p) => [p.id, p]));
    const missing = uniqueIds.filter((id) => !byId.has(id));
    if (missing.length) throw new NotFoundException(`Dasturlar topilmadi: ${missing.join(', ')}`);

    const gapMs = (dto.gapSec ?? 0) * 1000;

    const result = await this.prisma.$transaction(
      async (tx) => {
        await this.lockChannel(tx, channel.id);

        let cursor: Date;
        if (dto.startsAt) {
          cursor = parseAdminTime(dto.startsAt, dto.timezone, 'startsAt');
        } else {
          const last = await tx.scheduleSlot.findFirst({
            where: { channelId: channel.id, endsAtUtc: { gt: new Date() } },
            orderBy: { endsAtUtc: 'desc' },
          });
          cursor = last ? last.endsAtUtc : DateTime.utc().plus({ minutes: 1 }).startOf('minute').toJSDate();
        }
        const rangeStart = cursor;

        const rows: Prisma.ScheduleSlotCreateManyInput[] = [];
        const warnings: SlotWarning[] = [];
        for (const pid of dto.programIds) {
          const program = byId.get(pid)!;
          const start = cursor;
          const end = new Date(start.getTime() + program.durationSec * 1000);
          rows.push({ channelId: channel.id, programId: pid, startsAtUtc: start, endsAtUtc: end, status: this.statusFor(start, end) });
          warnings.push(...this.buildWarnings(channel, program, start, end));
          cursor = new Date(end.getTime() + gapMs);
        }
        const rangeEnd = rows[rows.length - 1].endsAtUtc as Date;

        await this.assertNoOverlap(tx, channel.id, rangeStart, rangeEnd);
        await tx.scheduleSlot.createMany({ data: rows });
        return { from: rangeStart, to: rangeEnd, created: rows.length, warnings };
      },
      { timeout: 20_000 },
    );

    await this.afterChange(channel.id, result.from, result.to);
    return {
      created: result.created,
      fromUtc: result.from.toISOString(),
      toUtc: result.to.toISOString(),
      warnings: this.dedupeWarnings(result.warnings),
    };
  }

  /** Bir kunlik jadvalni boshqa kun(lar)ga nusxalash — kundalik takrorlanuvchi efir uchun */
  async copyDay(dto: CopyDayDto) {
    const channel = await this.getChannel(dto.channelId);
    const source = localDayRangeUtc(dto.sourceDate, dto.timezone);
    const sourceSlots = await this.prisma.scheduleSlot.findMany({
      where: { channelId: channel.id, startsAtUtc: { gte: source.from, lt: source.to } },
      orderBy: { startsAtUtc: 'asc' },
    });
    if (sourceSlots.length === 0) throw new BadRequestException(`${dto.sourceDate} kunida slotlar yo'q`);

    const targets = [...new Set(dto.targetDates)].filter((d) => d !== dto.sourceDate);
    const sourceDayStart = DateTime.fromISO(dto.sourceDate, { zone: dto.timezone }).startOf('day');

    const summary = await this.prisma.$transaction(
      async (tx) => {
        await this.lockChannel(tx, channel.id);
        const out: { date: string; created: number; deleted: number }[] = [];

        for (const date of targets) {
          const target = localDayRangeUtc(date, dto.timezone);
          const targetDayStart = DateTime.fromISO(date, { zone: dto.timezone }).startOf('day');
          let deleted = 0;
          if (dto.replace) {
            deleted = (await tx.scheduleSlot.deleteMany({
              where: { channelId: channel.id, startsAtUtc: { gte: target.from, lt: target.to } },
            })).count;
          }

          // Mahalliy soat saqlanadi (DST o'tishida ham 18:00 -> 18:00)
          const rows = sourceSlots.map((s) => {
            const localStart = DateTime.fromJSDate(s.startsAtUtc).setZone(dto.timezone);
            const offsetInDay = localStart.diff(sourceDayStart);
            const start = targetDayStart.plus(offsetInDay).toUTC().toJSDate();
            const end = new Date(start.getTime() + (s.endsAtUtc.getTime() - s.startsAtUtc.getTime()));
            return { channelId: channel.id, programId: s.programId, startsAtUtc: start, endsAtUtc: end, status: this.statusFor(start, end) };
          });

          const first = rows[0].startsAtUtc;
          const last = rows[rows.length - 1].endsAtUtc;
          await this.assertNoOverlap(tx, channel.id, first, last, undefined, date);
          await tx.scheduleSlot.createMany({ data: rows });
          out.push({ date, created: rows.length, deleted });
        }
        return out;
      },
      { timeout: 30_000 },
    );

    await this.cache.invalidateChannel(channel.id);
    await this.events.emit({ type: 'schedule.updated', channelId: channel.id });
    return { sourceDate: dto.sourceDate, timezone: dto.timezone, results: summary };
  }

  /**
   * Jadval validatsiyasi: bo'shliqlar (efirsiz vaqt), davomiylik nomuvofiqligi,
   * ishlamayotgan URL'lar, nofaol dasturlar, yosh toifasi nomuvofiqligi.
   */
  async validate(channelId: string, fromRaw: string, toRaw: string, tz?: string) {
    const { from, to } = this.parseRange(fromRaw, toRaw);
    const channel = await this.getChannel(channelId);
    const slots = await this.prisma.scheduleSlot.findMany({
      where: { channelId, startsAtUtc: { lt: to }, endsAtUtc: { gt: from } },
      orderBy: { startsAtUtc: 'asc' },
      include: { program: true },
    });

    const gaps: { fromUtc: string; toUtc: string; fromLocal?: string; toLocal?: string; durationSec: number }[] = [];
    const issues: (SlotWarning & { slotId: string; programTitle: string })[] = [];
    let cursor = from;
    let coveredSec = 0;

    const pushGap = (a: Date, b: Date) => {
      const sec = secondsBetween(a, b);
      if (sec <= 1) return;
      gaps.push({
        fromUtc: a.toISOString(),
        toUtc: b.toISOString(),
        ...(tz ? { fromLocal: toLocalIso(a, tz), toLocal: toLocalIso(b, tz) } : {}),
        durationSec: Math.round(sec),
      });
    };

    for (const s of slots) {
      const start = s.startsAtUtc < from ? from : s.startsAtUtc;
      const end = s.endsAtUtc > to ? to : s.endsAtUtc;
      if (start > cursor) pushGap(cursor, start);
      coveredSec += Math.max(0, secondsBetween(start, end));
      if (end > cursor) cursor = end;

      for (const w of this.buildWarnings(channel, s.program, s.startsAtUtc, s.endsAtUtc, false)) {
        issues.push({ ...w, slotId: s.id, programTitle: s.program.title });
      }
    }
    if (cursor < to) pushGap(cursor, to);

    const totalSec = secondsBetween(from, to);
    return {
      channelId,
      fromUtc: from.toISOString(),
      toUtc: to.toISOString(),
      slots: slots.length,
      coveragePercent: totalSec > 0 ? Math.round((coveredSec / totalSec) * 10000) / 100 : 0,
      gaps,
      issues,
      isValid: gaps.length === 0 && issues.every((i) => i.code !== 'URL_BROKEN' && i.code !== 'PROGRAM_INACTIVE'),
    };
  }

  // =========================================================
  //  Slot statusini yangilab turish (SCHEDULED -> LIVE -> ENDED)
  // =========================================================

  @Cron(CronExpression.EVERY_MINUTE, { name: 'slot-status' })
  async refreshStatuses() {
    const now = new Date();
    try {
      await this.prisma.$transaction([
        this.prisma.scheduleSlot.updateMany({
          where: { status: { not: SlotStatus.ENDED }, endsAtUtc: { lte: now } },
          data: { status: SlotStatus.ENDED },
        }),
        this.prisma.scheduleSlot.updateMany({
          where: { status: { not: SlotStatus.LIVE }, startsAtUtc: { lte: now }, endsAtUtc: { gt: now } },
          data: { status: SlotStatus.LIVE },
        }),
        this.prisma.scheduleSlot.updateMany({
          where: { status: { not: SlotStatus.SCHEDULED }, startsAtUtc: { gt: now } },
          data: { status: SlotStatus.SCHEDULED },
        }),
      ]);
    } catch (e) {
      this.logger.warn(`Slot statuslarini yangilashda xato: ${(e as Error).message}`);
    }
  }

  // =========================================================
  //  Yordamchilar
  // =========================================================

  /** Bir kanal jadvaliga parallel yozuvlarni ketma-ketlashtiradi (race condition'dan himoya) */
  private async lockChannel(tx: Tx, channelId: string) {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${channelId}::text))::text AS locked`;
  }

  private async assertNoOverlap(tx: Tx, channelId: string, start: Date, end: Date, excludeId?: string, label?: string) {
    const conflict = await tx.scheduleSlot.findFirst({
      where: {
        channelId,
        ...(excludeId ? { id: { not: excludeId } } : {}),
        startsAtUtc: { lt: end },
        endsAtUtc: { gt: start },
      },
      orderBy: { startsAtUtc: 'asc' },
      include: { program: { select: { title: true } } },
    });
    if (conflict) {
      throw new ConflictException({
        statusCode: 409,
        message: `${label ? `${label}: ` : ''}Vaqt oralig'i boshqa slot bilan to'qnashadi`,
        conflict: {
          slotId: conflict.id,
          programTitle: conflict.program.title,
          startsAtUtc: conflict.startsAtUtc.toISOString(),
          endsAtUtc: conflict.endsAtUtc.toISOString(),
        },
      });
    }
  }

  private assertSlotRange(start: Date, end: Date) {
    const sec = secondsBetween(start, end);
    if (sec <= 0) throw new BadRequestException("endsAt startsAt'dan keyin bo'lishi kerak");
    if (sec > MAX_SLOT_SEC) throw new BadRequestException("Slot 24 soatdan uzun bo'lishi mumkin emas");
  }

  private parseRange(fromRaw: string, toRaw: string) {
    const from = new Date(fromRaw);
    const to = new Date(toRaw);
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) throw new BadRequestException("from/to noto'g'ri");
    if (to <= from) throw new BadRequestException("to from'dan keyin bo'lishi kerak");
    if (secondsBetween(from, to) > MAX_RANGE_DAYS * 86_400) {
      throw new BadRequestException(`Oraliq ${MAX_RANGE_DAYS} kundan oshmasligi kerak`);
    }
    return { from, to };
  }

  private statusFor(start: Date, end: Date, now = new Date()): SlotStatus {
    if (end <= now) return SlotStatus.ENDED;
    if (start <= now) return SlotStatus.LIVE;
    return SlotStatus.SCHEDULED;
  }

  private buildWarnings(
    channel: Pick<Channel, 'ageGroup'>,
    program: Pick<Program, 'durationSec' | 'urlStatus' | 'isActive' | 'ageRating'> & { isLiveStream?: boolean },
    start: Date,
    end: Date,
    checkPast = true,
  ): SlotWarning[] {
    const w: SlotWarning[] = [];
    const at = start.toISOString();
    const slotSec = Math.round(secondsBetween(start, end));
    if (!program.isLiveStream) {
      if (slotSec > program.durationSec + DURATION_TOLERANCE_SEC) {
        w.push({
          code: 'SLOT_LONGER_THAN_MEDIA',
          message: `Slot videodan ${slotSec - program.durationSec}s uzun — oxirida ilova keyingi dasturni kutish ekranini ko'rsatadi`,
          slotStartsAtUtc: at,
        });
      } else if (slotSec < program.durationSec - DURATION_TOLERANCE_SEC) {
        w.push({
          code: 'MEDIA_TRUNCATED',
          message: `Video slotdan ${program.durationSec - slotSec}s uzun — oxiri kesiladi`,
          slotStartsAtUtc: at,
        });
      }
    }
    if (program.urlStatus === UrlHealth.BROKEN) {
      w.push({ code: 'URL_BROKEN', message: "Video URL ishlamayapti (health-check)", slotStartsAtUtc: at });
    }
    if (!program.isActive) {
      w.push({ code: 'PROGRAM_INACTIVE', message: "Dastur nofaol — efirda ko'rsatilmaydi", slotStartsAtUtc: at });
    }
    if (!isAgeSuitable(channel.ageGroup, program.ageRating)) {
      w.push({
        code: 'AGE_MISMATCH',
        message: `Dastur yosh toifasi (${program.ageRating}) kanal toifasiga (${channel.ageGroup}) mos emas`,
        slotStartsAtUtc: at,
      });
    }
    if (checkPast && end <= new Date()) {
      w.push({ code: 'IN_PAST', message: "Slot o'tib ketgan vaqtga qo'yildi", slotStartsAtUtc: at });
    }
    return w;
  }

  private dedupeWarnings(warnings: SlotWarning[]): SlotWarning[] {
    // Bir xil turdagi ogohlantirishlardan ko'pi bilan 20 tasini qaytaramiz
    const counts = new Map<string, number>();
    return warnings.filter((w) => {
      const n = (counts.get(w.code) ?? 0) + 1;
      counts.set(w.code, n);
      return n <= 20;
    });
  }

  private async getChannel(id: string) {
    const channel = await this.prisma.channel.findUnique({ where: { id } });
    if (!channel) throw new NotFoundException('Kanal topilmadi');
    return channel;
  }

  private async getProgram(id: string) {
    const program = await this.prisma.program.findUnique({ where: { id } });
    if (!program) throw new NotFoundException('Dastur topilmadi');
    return program;
  }

  private async afterChange(channelId: string, from: Date, to: Date) {
    await this.cache.invalidateChannel(channelId);
    await this.events.emit({
      type: 'schedule.updated',
      channelId,
      from: from.toISOString(),
      to: to.toISOString(),
    });
  }

  private present(s: SlotWithProgram, tz?: string) {
    return {
      id: s.id,
      channelId: s.channelId,
      programId: s.programId,
      startsAtUtc: s.startsAtUtc.toISOString(),
      endsAtUtc: s.endsAtUtc.toISOString(),
      ...(tz ? { startsAtLocal: toLocalIso(s.startsAtUtc, tz), endsAtLocal: toLocalIso(s.endsAtUtc, tz) } : {}),
      durationSec: Math.round(secondsBetween(s.startsAtUtc, s.endsAtUtc)),
      status: s.status,
      program: s.program,
    };
  }
}
