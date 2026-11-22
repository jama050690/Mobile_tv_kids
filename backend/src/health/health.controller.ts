import { Controller, Get, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Response } from 'express';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

@ApiTags('Health')
@SkipThrottle()
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  /** Docker healthcheck / monitoring uchun. DB ishlamasa 503 qaytaradi */
  @Get()
  @ApiOperation({ summary: 'API, PostgreSQL va Redis holati' })
  async check(@Res({ passthrough: true }) res: Response) {
    const [db, redis] = await Promise.all([
      this.prisma.$queryRaw`SELECT 1`.then(() => true).catch(() => false),
      this.redis.ping(),
    ]);
    const status = db ? (redis ? 'ok' : 'degraded') : 'down';
    if (!db) res.status(503);
    return {
      status,
      checks: { database: db ? 'up' : 'down', redis: redis ? 'up' : 'down' },
      uptimeSec: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}
