import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsInt, IsISO8601, IsOptional, IsUUID, Matches, Max, Min } from 'class-validator';
import { IsTimezone } from '../../common/validators/is-timezone.validator';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Vaqt formatlari:
 *  - "2026-11-22T18:00:00+05:00" yoki "2026-11-22T13:00:00Z"
 *  - "2026-11-22T18:00:00" + timezone: "Asia/Tashkent"
 */
export class CreateSlotDto {
  @IsUUID()
  channelId: string;

  @IsUUID()
  programId: string;

  @IsISO8601()
  startsAt: string;

  /** Berilmasa: startsAt + dastur davomiyligi */
  @IsOptional()
  @IsISO8601()
  endsAt?: string;

  /** Offsetsiz vaqt kiritilganda qaysi zonada ekanligi */
  @IsOptional()
  @IsTimezone()
  timezone?: string;
}

export class UpdateSlotDto {
  @IsOptional()
  @IsUUID()
  programId?: string;

  @IsOptional()
  @IsISO8601()
  startsAt?: string;

  @IsOptional()
  @IsISO8601()
  endsAt?: string;

  @IsOptional()
  @IsTimezone()
  timezone?: string;
}

/** Bir nechta dasturni ketma-ket (orqama-orqa) jadvalga qo'shish */
export class SequenceDto {
  @IsUUID()
  channelId: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @IsUUID('all', { each: true })
  programIds: string[];

  /** Berilmasa: kanaldagi oxirgi slot tugagan vaqt (yoki hozir) */
  @IsOptional()
  @IsISO8601()
  startsAt?: string;

  @IsOptional()
  @IsTimezone()
  timezone?: string;

  /** Dasturlar orasidagi tanaffus (soniya) */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3600)
  gapSec?: number;
}

/** Bir kunlik jadvalni boshqa kunlarga nusxalash */
export class CopyDayDto {
  @IsUUID()
  channelId: string;

  @Matches(DATE_RE)
  sourceDate: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(31)
  @Matches(DATE_RE, { each: true })
  targetDates: string[];

  /** Kun chegaralari qaysi zonada hisoblanadi (masalan Asia/Tashkent) */
  @IsTimezone()
  timezone: string;

  /** true bo'lsa maqsad kunlardagi mavjud slotlar o'chirilib, o'rniga yoziladi */
  @IsOptional()
  @IsBoolean()
  replace?: boolean;
}

export class ScheduleRangeQueryDto {
  @IsOptional()
  @IsUUID()
  channelId?: string;

  @IsISO8601()
  from: string;

  @IsISO8601()
  to: string;

  /** Javobda mahalliy vaqtlar ham qaytariladi */
  @IsOptional()
  @IsTimezone()
  tz?: string;
}

export class ChannelRangeQueryDto {
  @IsUUID()
  channelId: string;

  @IsISO8601()
  from: string;

  @IsISO8601()
  to: string;

  @IsOptional()
  @IsTimezone()
  tz?: string;
}
