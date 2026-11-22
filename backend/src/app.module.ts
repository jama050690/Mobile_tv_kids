import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AdminUsersModule } from './admin-users/admin-users.module';
import { AuthModule } from './auth/auth.module';
import { ChannelsModule } from './channels/channels.module';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';
import { appConfig, AppConfig } from './config/app.config';
import { EventsModule } from './events/events.module';
import { HealthController } from './health/health.controller';
import { PlayoutModule } from './playout/playout.module';
import { PrismaModule } from './prisma/prisma.module';
import { ProgramsModule } from './programs/programs.module';
import { RedisModule } from './redis/redis.module';
import { RegionsModule } from './regions/regions.module';
import { ScheduleSlotsModule } from './schedule/schedule.module';
import { UrlHealthModule } from './url-health/url-health.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, cache: true, load: [appConfig] }),
    ThrottlerModule.forRootAsync({
      inject: [appConfig.KEY],
      useFactory: (cfg: AppConfig) => ({
        throttlers: [{ name: 'default', ttl: 60_000, limit: cfg.rateLimitPerMinute }],
      }),
    }),
    ScheduleModule.forRoot(),
    PrismaModule,
    RedisModule,
    EventsModule,
    AuthModule,
    AdminUsersModule,
    RegionsModule,
    ChannelsModule,
    UrlHealthModule,
    ProgramsModule,
    ScheduleSlotsModule,
    PlayoutModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_FILTER, useClass: PrismaExceptionFilter },
  ],
})
export class AppModule {}
