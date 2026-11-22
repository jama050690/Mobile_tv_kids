import * as ipaddr from 'ipaddr.js';
import { isIP } from 'node:net';

/**
 * Faqat ommaviy (public unicast) IP manzillarga ruxsat beriladi.
 * Bu SSRF hujumlaridan himoya: health-check orqali ichki tarmoq (127.0.0.1, 10.x, 169.254.169.254 ...)
 * manzillariga so'rov yuborib bo'lmaydi.
 */
export function isPublicIp(address: string): boolean {
  if (!isIP(address)) return false;
  try {
    return ipaddr.process(address).range() === 'unicast';
  } catch {
    return false;
  }
}

/** Bir vaqtda ko'pi bilan `limit` ta vazifani bajaradi */
export async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (index < items.length) {
      const current = index++;
      results[current] = await worker(items[current]);
    }
  });
  await Promise.all(runners);
  return results;
}
