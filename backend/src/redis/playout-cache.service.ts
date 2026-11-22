import { Injectable } from '@nestjs/common';
import { RedisService } from './redis.service';

export const CacheKeys = {
  channelState: (channelId: string) => `playout:state:${channelId}`,
  epg: (channelId: string, fromMs: number, toMs: number) => `playout:epg:${channelId}:${fromMs}-${toMs}`,
  epgPattern: (channelId: string) => `playout:epg:${channelId}:*`,
  publicChannels: 'playout:channels:public',
  activeRegions: 'regions:active',
};

/** Jadval/kanal/dastur o'zgarganda efir keshini tozalaydi */
@Injectable()
export class PlayoutCacheService {
  constructor(private readonly redis: RedisService) {}

  async invalidateChannel(channelId: string): Promise<void> {
    await Promise.all([
      this.redis.del(CacheKeys.channelState(channelId)),
      this.redis.delByPattern(CacheKeys.epgPattern(channelId)),
    ]);
  }

  async invalidateChannelsList(): Promise<void> {
    await this.redis.del(CacheKeys.publicChannels);
  }

  async invalidateAll(): Promise<void> {
    await this.redis.delByPattern('playout:*');
  }

  async invalidateRegions(): Promise<void> {
    await this.redis.del(CacheKeys.activeRegions);
  }
}
