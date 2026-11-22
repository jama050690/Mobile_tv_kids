// Davomiylik va boshqa formatlash yordamchilari

/** 596 -> "9:56", 3725 -> "1:02:05" */
export function fmtDuration(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  return `${h > 0 ? `${h}:` : ''}${mm}:${String(sec).padStart(2, '0')}`;
}

/** Odamga tushunarli: 18000 -> "5 soat", 90 -> "1 daq 30 s" */
export function fmtHuman(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const out: string[] = [];
  if (h) out.push(`${h} soat`);
  if (m) out.push(`${m} daq`);
  if (sec && !h) out.push(`${sec} s`);
  return out.join(' ') || '0 s';
}

/** "9:56" | "1:02:05" | "596" -> soniya. Noto'g'ri bo'lsa null */
export function parseDuration(input: string): number | null {
  const v = input.trim();
  if (!v) return null;
  if (/^\d+$/.test(v)) return Number(v);
  const m = /^(?:(\d+):)?(\d{1,2}):(\d{1,2})$/.exec(v);
  if (!m) return null;
  const h = Number(m[1] ?? 0);
  const min = Number(m[2]);
  const sec = Number(m[3]);
  if (min > 59 || sec > 59) return null;
  return h * 3600 + min * 60 + sec;
}

/** Bo'sh qatorni undefined ga aylantirish (ixtiyoriy maydonlar uchun) */
export function optional(v: string): string | undefined {
  const t = v.trim();
  return t ? t : undefined;
}

/** Nisbiy vaqt: "5 daqiqa oldin" */
export function fmtAgo(iso: string | null): string {
  if (!iso) return '—';
  const diff = (Date.now() - Date.parse(iso)) / 1000;
  if (diff < 60) return 'hozirgina';
  if (diff < 3600) return `${Math.floor(diff / 60)} daqiqa oldin`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} soat oldin`;
  return `${Math.floor(diff / 86400)} kun oldin`;
}

/** Slug yasash (backend bilan bir xil qoida) */
export function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[‘’ʻʼ'`]/g, '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}
