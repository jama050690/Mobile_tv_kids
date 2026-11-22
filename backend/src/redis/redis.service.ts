import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Redis, RedisOptions } from 'ioredis';
import { appConfig, AppConfig } from '../config/app.config';

type Handler = (message: string) => void;

/**
 * Redis — kesh va pub/sub uchun.
 * Redis ishlamay qolsa ham API to'xtamaydi: kesh o'tkazib yuboriladi va to'g'ridan-to'g'ri DB ishlatiladi.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  readonly client: Redis;
  private readonly subscriber: Redis;
  private readonly handlers = new Map<string, Set<Handler>>();
  private lastErrorLogAt = 0;

  constructor(@Inject(appConfig.KEY) cfg: AppConfig) {
    const base: RedisOptions = {
      maxRetriesPerRequest: 1,
      retryStrategy: (times) => Math.min(times * 500, 5000),
    };
    // Asosiy klient: ulanish yo'q bo'lsa buyruqlar navbatga qo'yilmaydi (darhol fallback)
    this.client = new Redis(cfg.redisUrl, { ...base, enableOfflineQueue: false, commandTimeout: 1000 });
    this.subscriber = new Redis(cfg.redisUrl, { ...base, enableOfflineQueue: true });

    const onError = (err: Error) => {
      const now = Date.now();
      if (now - this.lastErrorLogAt > 30_000) {
        this.lastErrorLogAt = now;
        this.logger.warn(`Redis xatosi: ${err.message} (kesh vaqtincha o'chirilgan)`);
      }
    };
    this.client.on('error', onError);
    this.subscriber.on('error', onError);
    this.subscriber.on('message', (channel: string, message: string) => {
      this.handlers.get(channel)?.forEach((h) => {
        try {
          h(message);
        } catch (e) {
          this.logger.error(`Pub/sub handler xatosi: ${(e as Error).message}`);
        }
      });
    });
  }

  get isReady(): boolean {
    return this.client.status === 'ready';
  }

  async getJson<T>(key: string): Promise<T | null> {
    if (!this.isReady) return null;
    try {
      const value = await this.client.get(key);
      return value ? (JSON.parse(value) as T) : null;
    } catch {
      return null;
    }
  }

  async setJson(key: string, value: unknown, ttlSec: number): Promise<void> {
    if (!this.isReady) return;
    try {
      await this.client.set(key, JSON.stringify(value), 'EX', Math.max(1, Math.ceil(ttlSec)));
    } catch {
      /* kesh ixtiyoriy */
    }
  }

  async del(...keys: string[]): Promise<void> {
    if (!this.isReady || keys.length === 0) return;
    try {
      await this.client.unlink(...keys);
    } catch {
      /* ignore */
    }
  }

  /** SCAN orqali pattern bo'yicha o'chirish (KEYS ishlatilmaydi — production uchun xavfsiz) */
  async delByPattern(pattern: string): Promise<void> {
    if (!this.isReady) return;
    try {
      let cursor = '0';
      do {
        const [next, keys] = await this.client.scan(cursor, 'MATCH', pattern, 'COUNT', 200);
        cursor = next;
        if (keys.length) await this.client.unlink(...keys);
      } while (cursor !== '0');
    } catch {
      /* ignore */
    }
  }

  /** Kalit yo'q bo'lsa o'rnatadi (lock / throttle). Redis yo'q bo'lsa true qaytaradi. */
  async setIfAbsent(key: string, ttlSec: number): Promise<boolean> {
    if (!this.isReady) return true;
    try {
      return (await this.client.set(key, '1', 'EX', ttlSec, 'NX')) === 'OK';
    } catch {
      return true;
    }
  }

  async publish(channel: string, message: string): Promise<boolean> {
    if (!this.isReady) return false;
    try {
      await this.client.publish(channel, message);
      return true;
    } catch {
      return false;
    }
  }

  async subscribe(channel: string, handler: Handler): Promise<void> {
    let set = this.handlers.get(channel);
    if (!set) {
      set = new Set();
      this.handlers.set(channel, set);
      this.subscriber.subscribe(channel).catch((e: Error) =>
        this.logger.warn(`Subscribe xatosi (${channel}): ${e.message}`),
      );
    }
    set.add(handler);
  }

  async ping(): Promise<boolean> {
    if (!this.isReady) return false;
    try {
      return (await this.client.ping()) === 'PONG';
    } catch {
      return false;
    }
  }

  async onModuleDestroy() {
    await Promise.allSettled([this.client.quit(), this.subscriber.quit()]);
  }
}
