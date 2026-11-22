import { Global, Module } from '@nestjs/common';
import { PlayoutCacheService } from './playout-cache.service';
import { RedisService } from './redis.service';

@Global()
@Module({
  providers: [RedisService, PlayoutCacheService],
  exports: [RedisService, PlayoutCacheService],
})
export class RedisModule {}
