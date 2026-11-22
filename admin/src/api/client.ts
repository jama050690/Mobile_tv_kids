// HTTP klient.
// Autentifikatsiya faqat httpOnly cookie orqali (access_token + refresh_token) —
// token JavaScript'da saqlanmaydi, shuning uchun XSS orqali o'g'irlab bo'lmaydi.
// 401 kelsa: bitta umumiy refresh so'rovi yuboriladi va asl so'rov qaytariladi.

export const API_BASE = '/api/v1';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly body: unknown = null,
  ) {
    super(message);
  }

  /** 409 to'qnashuvdagi slot ma'lumoti (agar bo'lsa) */
  get conflict(): { programTitle?: string; startsAtUtc?: string; endsAtUtc?: string } | null {
    const b = this.body as { conflict?: Record<string, string> } | null;
    return b?.conflict ?? null;
  }
}

type Query = Record<string, string | number | boolean | null | undefined>;

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  query?: Query;
  body?: unknown;
  /** Refresh mexanizmini o'chirish (login/refresh so'rovlarining o'zi uchun) */
  noRefresh?: boolean;
  signal?: AbortSignal;
}

/** Sessiya tugaganda chaqiriladi (AuthContext o'rnatadi) */
let onUnauthorized: () => void = () => {};
export function setUnauthorizedHandler(fn: () => void) {
  onUnauthorized = fn;
}

let refreshPromise: Promise<boolean> | null = null;

/** Bir vaqtda kelgan bir nechta 401 uchun faqat bitta refresh so'rovi */
function refreshSession(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = fetch(`${API_BASE}/admin/auth/refresh`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    })
      .then((r) => r.ok)
      .catch(() => false)
      .finally(() => {
        // Keyingi 401 uchun yangi refresh imkoniyati
        setTimeout(() => (refreshPromise = null), 0);
      });
  }
  return refreshPromise;
}

function buildUrl(path: string, query?: Query): string {
  const url = new URL(API_BASE + path, window.location.origin);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }
  }
  return url.pathname + url.search;
}

/** Backend xatosidan o'qiladigan xabar (class-validator massivlari ham) */
function extractMessage(body: unknown, status: number): string {
  if (body && typeof body === 'object' && 'message' in body) {
    const m = (body as { message: unknown }).message;
    if (Array.isArray(m)) return m.join('\n');
    if (typeof m === 'string') return m;
  }
  if (status === 429) return "Juda ko'p so'rov. Biroz kutib, qayta urinib ko'ring";
  if (status >= 500) return 'Server xatosi. Keyinroq urinib ko‘ring';
  return `So'rov bajarilmadi (HTTP ${status})`;
}

export async function api<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = 'GET', query, body, noRefresh, signal } = opts;

  const doFetch = () =>
    fetch(buildUrl(path, query), {
      method,
      credentials: 'same-origin',
      headers: body !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal,
    });

  let res: Response;
  try {
    res = await doFetch();
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError(0, "Serverga ulanib bo'lmadi. Internet yoki backend ishlayotganini tekshiring");
  }

  // Access token muddati tugagan bo'lishi mumkin -> refresh -> qayta urinish
  if (res.status === 401 && !noRefresh) {
    const ok = await refreshSession();
    if (ok) {
      res = await doFetch();
    }
    if (!ok || res.status === 401) {
      onUnauthorized();
      throw new ApiError(401, 'Sessiya tugadi. Qaytadan kiring');
    }
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) throw new ApiError(res.status, extractMessage(data, res.status), data);
  return data as T;
}

/** Xatoni foydalanuvchiga ko'rsatiladigan matnga aylantirish */
export function errorText(e: unknown): string {
  if (e instanceof ApiError) {
    const c = e.conflict;
    if (c?.programTitle) return `${e.message}: «${c.programTitle}»`;
    return e.message;
  }
  if (e instanceof Error) return e.message;
  return "Noma'lum xato";
}
