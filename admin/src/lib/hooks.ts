import { useCallback, useEffect, useRef, useState } from 'react';
import { errorText } from '../api/client';

/**
 * Ma'lumot yuklash hook'i: loading / error / data va qayta yuklash (reload).
 * deps o'zgarsa avtomatik qayta yuklanadi; eski javoblar e'tiborsiz qoldiriladi.
 */
export function useLoad<T>(loader: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  const reload = useCallback(async (silent = false) => {
    const id = ++seq.current;
    if (!silent) setLoading(true);
    try {
      const res = await loaderRef.current();
      if (id === seq.current) {
        setData(res);
        setError(null);
      }
    } catch (e) {
      if (id === seq.current) setError(errorText(e));
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, error, loading, reload, setData };
}

/** Qiymatni kechiktirish (qidiruv maydoni uchun) */
export function useDebounced<T>(value: T, ms = 300): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** localStorage'da saqlanadigan holat (tanlangan kanal, timezone) */
export function useStoredState<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw !== null ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* private mode */
    }
  }, [key, value]);
  return [value, setValue] as const;
}

/** Har N ms da qayta render (soat, progress uchun) */
export function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

/**
 * Backend SSE hodisalariga obuna (/api/v1/events).
 * Jadvalni boshqa admin o'zgartirsa ham sahifa avtomatik yangilanadi.
 */
export function useServerEvents(
  types: string[],
  handler: (data: { type: string; channelId?: string; programId?: string }) => void,
  channelId?: string,
) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  const typesKey = types.join(',');

  useEffect(() => {
    const url = `/api/v1/events${channelId ? `?channelId=${encodeURIComponent(channelId)}` : ''}`;
    const es = new EventSource(url);
    const listener = (ev: MessageEvent) => {
      try {
        handlerRef.current(JSON.parse(ev.data));
      } catch {
        /* noto'g'ri format — e'tiborsiz */
      }
    };
    const list = typesKey.split(',');
    list.forEach((t) => es.addEventListener(t, listener as EventListener));
    return () => {
      list.forEach((t) => es.removeEventListener(t, listener as EventListener));
      es.close();
    };
  }, [typesKey, channelId]);
}
