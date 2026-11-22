import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Observable, Subject } from 'rxjs';
import { RedisService } from '../redis/redis.service';

export type AppEventType =
  | 'schedule.updated'
  | 'channel.updated'
  | 'channels.changed'
  | 'program.updated';

export interface AppEvent {
  type: AppEventType;
  channelId?: string;
  programId?: string;
  from?: string;
  to?: string;
  at: string;
}

const REDIS_CHANNEL = 'kidstv:events';

/**
 * Real-time hodisalar shinasi.
 * Lokal Subject + Redis pub/sub => bir nechta API instansiya bo'lsa ham barcha SSE mijozlar xabar oladi.
 */
@Injectable()
export class EventsService implements OnModuleInit {
  private readonly logger = new Logger(EventsService.name);
  private readonly subject = new Subject<AppEvent>();
  private readonly instanceId = randomUUID();
  readonly stream$: Observable<AppEvent> = this.subject.asObservable();

  constructor(private readonly redis: RedisService) {}

  async onModuleInit() {
    await this.redis.subscribe(REDIS_CHANNEL, (raw) => {
      try {
        const { origin, event } = JSON.parse(raw) as { origin: string; event: AppEvent };
        if (origin !== this.instanceId) this.subject.next(event);
      } catch {
        this.logger.warn("Noto'g'ri pub/sub xabari");
      }
    });
  }

  async emit(event: Omit<AppEvent, 'at'>): Promise<void> {
    const full: AppEvent = { ...event, at: new Date().toISOString() };
    this.subject.next(full);
    await this.redis.publish(REDIS_CHANNEL, JSON.stringify({ origin: this.instanceId, event: full }));
  }
}
