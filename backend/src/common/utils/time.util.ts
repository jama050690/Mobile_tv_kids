import { BadRequestException } from '@nestjs/common';
import { DateTime, IANAZone } from 'luxon';

export const isValidTimezone = (tz: string): boolean => IANAZone.isValidZone(tz);

/** UTC sanani foydalanuvchi timezone'idagi ISO-8601 satrga aylantiradi: 2026-11-22T18:00:00+05:00 */
export function toLocalIso(date: Date | string, tz: string): string {
  const dt =
    typeof date === 'string'
      ? DateTime.fromISO(date, { zone: 'utc' })
      : DateTime.fromJSDate(date, { zone: 'utc' });
  return dt.setZone(tz).toISO({ suppressMilliseconds: true }) ?? '';
}

/** "+05:00" ko'rinishidagi offset */
export function utcOffsetLabel(tz: string, at: Date = new Date()): string {
  return DateTime.fromJSDate(at).setZone(tz).toFormat('ZZ');
}

export function utcOffsetMinutes(tz: string, at: Date = new Date()): number {
  return DateTime.fromJSDate(at).setZone(tz).offset;
}

/**
 * Foydalanuvchi timezone'idagi kalendar kunini UTC oraliqqa aylantiradi.
 * Masalan Asia/Tashkent'da 2026-11-22 => [2026-11-21T19:00Z, 2026-11-22T19:00Z).
 * DST o'tish kunlari (23/25 soat) ham to'g'ri hisoblanadi.
 */
export function localDayRangeUtc(date: string | undefined, tz: string) {
  const base = date ? DateTime.fromISO(date, { zone: tz }) : DateTime.now().setZone(tz);
  if (!base.isValid) throw new BadRequestException("date YYYY-MM-DD formatida bo'lishi kerak");
  const start = base.startOf('day');
  const end = start.plus({ days: 1 });
  return {
    date: start.toISODate() as string,
    from: start.toUTC().toJSDate(),
    to: end.toUTC().toJSDate(),
  };
}

/**
 * Admin kiritgan vaqtni UTC Date'ga aylantiradi.
 *  - "2026-11-22T18:00:00+05:00" yoki "...Z" — offset bo'yicha
 *  - "2026-11-22T18:00" + timezone="Asia/Tashkent" — shu zonadagi mahalliy vaqt sifatida
 */
export function parseAdminTime(value: string, timezone?: string, field = 'vaqt'): Date {
  const hasOffset = /(Z|[+-]\d{2}(:?\d{2})?)$/i.test(value.trim());
  let dt: DateTime;
  if (hasOffset) {
    dt = DateTime.fromISO(value, { setZone: true });
  } else if (timezone) {
    if (!isValidTimezone(timezone)) throw new BadRequestException(`Noto'g'ri timezone: ${timezone}`);
    dt = DateTime.fromISO(value, { zone: timezone });
  } else {
    throw new BadRequestException(
      `${field}: offset (Z yoki +05:00) ko'rsating yoki "timezone" maydonini yuboring`,
    );
  }
  if (!dt.isValid) throw new BadRequestException(`${field}: ISO-8601 formatida bo'lishi kerak`);
  return dt.toUTC().toJSDate();
}

export const secondsBetween = (a: Date, b: Date): number => (b.getTime() - a.getTime()) / 1000;
