// Timezone yordamchilari (kutubxonasiz — brauzerning Intl API'si).
// Admin jadvalni tanlangan zonada (masalan Asia/Tashkent) ko'radi va kiritadi,
// backend'ga esa UTC ISO yoki "lokal vaqt + timezone" yuboriladi.

export const DEFAULT_TZ = 'Asia/Tashkent';

const partsCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(tz: string): Intl.DateTimeFormat {
  let f = partsCache.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    partsCache.set(tz, f);
  }
  return f;
}

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/** UTC vaqtni berilgan zonadagi qismlarga ajratish */
export function zonedParts(date: Date | string | number, tz: string): ZonedParts {
  const d = new Date(date);
  const p: Record<string, number> = {};
  for (const part of partsFormatter(tz).formatToParts(d)) {
    if (part.type !== 'literal') p[part.type] = Number(part.value);
  }
  return { year: p.year, month: p.month, day: p.day, hour: p.hour % 24, minute: p.minute, second: p.second };
}

/** Zonaning shu paytdagi UTC farqi (millisekund) */
export function tzOffsetMs(date: Date | number, tz: string): number {
  const ms = new Date(date).getTime();
  const p = zonedParts(ms, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** Zonadagi "devor soati"ni UTC Date ga aylantirish (DST o'tishlarini hisobga olgan holda) */
export function zonedToUtc(y: number, m: number, d: number, h: number, mi: number, s: number, tz: string): Date {
  const guess = Date.UTC(y, m - 1, d, h, mi, s);
  const off1 = tzOffsetMs(guess, tz);
  let t = guess - off1;
  const off2 = tzOffsetMs(t, tz);
  if (off2 !== off1) t = guess - off2;
  return new Date(t);
}

/** "YYYY-MM-DD" -> o'sha kunning zonadagi boshlanishi va tugashi (UTC) */
export function dayRangeUtc(date: string, tz: string): { from: Date; to: Date } {
  const [y, m, d] = date.split('-').map(Number);
  const from = zonedToUtc(y, m, d, 0, 0, 0, tz);
  const next = addDays(date, 1).split('-').map(Number);
  const to = zonedToUtc(next[0], next[1], next[2], 0, 0, 0, tz);
  return { from, to };
}

const pad = (n: number, len = 2) => String(n).padStart(len, '0');

/** Zonadagi bugungi sana "YYYY-MM-DD" */
export function todayIn(tz: string): string {
  const p = zonedParts(Date.now(), tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

/** "YYYY-MM-DD" ga kun qo'shish */
export function addDays(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/** UTC -> "HH:mm" (yoki soniyasi bilan) zonada */
export function fmtTime(date: Date | string | number, tz: string, withSec = false): string {
  const p = zonedParts(date, tz);
  return withSec ? `${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}` : `${pad(p.hour)}:${pad(p.minute)}`;
}

/** UTC -> "DD.MM.YYYY HH:mm" zonada */
export function fmtDateTime(date: Date | string | number, tz: string): string {
  const p = zonedParts(date, tz);
  return `${pad(p.day)}.${pad(p.month)}.${p.year} ${pad(p.hour)}:${pad(p.minute)}`;
}

/** UTC -> <input type="datetime-local" step=1> qiymati "YYYY-MM-DDTHH:mm:ss" */
export function toLocalInput(date: Date | string | number, tz: string): string {
  const p = zonedParts(date, tz);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}`;
}

/** datetime-local qiymati (zonada) -> UTC Date */
export function fromLocalInput(value: string, tz: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!m) return null;
  return zonedToUtc(+m[1], +m[2], +m[3], +m[4], +m[5], +(m[6] ?? 0), tz);
}

/** Zonaning UTC farqi yorlig'i: "+05:00" */
export function offsetLabel(tz: string, at: Date | number = Date.now()): string {
  const min = Math.round(tzOffsetMs(at, tz) / 60000);
  const sign = min >= 0 ? '+' : '-';
  const a = Math.abs(min);
  return `UTC${sign}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}

/** Sanani o'zbekcha ko'rinishda: "22-noyabr, yakshanba" */
const MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];
const WEEKDAYS = ['yakshanba', 'dushanba', 'seshanba', 'chorshanba', 'payshanba', 'juma', 'shanba'];
export function fmtDayTitle(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${d}-${MONTHS[m - 1]} ${y}, ${WEEKDAYS[wd]}`;
}

/** Brauzer qo'llaydigan barcha IANA zonalar */
export function allTimezones(): string[] {
  try {
    return (Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf('timeZone');
  } catch {
    return [DEFAULT_TZ, 'UTC', 'Europe/Moscow', 'Asia/Almaty', 'Europe/Istanbul', 'America/New_York'];
  }
}

export function isValidTimezone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}
