import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { Region } from '@prisma/client';
import { appConfig, AppConfig } from '../config/app.config';
import { utcOffsetLabel, utcOffsetMinutes } from '../common/utils/time.util';
import { PrismaService } from '../prisma/prisma.service';
import { CacheKeys, PlayoutCacheService } from '../redis/playout-cache.service';
import { RedisService } from '../redis/redis.service';
import { CreateRegionDto, UpdateRegionDto } from './dto/region.dto';

@Injectable()
export class RegionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly cache: PlayoutCacheService,
    @Inject(appConfig.KEY) private readonly cfg: AppConfig,
  ) {}

  // ---------------- Public ----------------

  async listActive(): Promise<Region[]> {
    const cached = await this.redis.getJson<Region[]>(CacheKeys.activeRegions);
    if (cached) return cached;
    const regions = await this.prisma.region.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
    await this.redis.setJson(CacheKeys.activeRegions, regions, 600);
    return regions;
  }

  async listActivePublic() {
    const now = new Date();
    return (await this.listActive()).map((r) => ({
      code: r.code,
      name: r.name,
      defaultTimezone: r.defaultTimezone,
      utcOffset: utcOffsetLabel(r.defaultTimezone, now),
      timezones: r.timezones.map((tz) => ({ tz, utcOffset: utcOffsetLabel(tz, now) })),
    }));
  }

  /** Qurilma timezone'i bo'yicha davlatni aniqlash (onboarding auto-detect) */
  async resolveByTimezone(tz: string) {
    const regions = await this.listActive();
    const region = regions.find((r) => r.timezones.includes(tz) || r.defaultTimezone === tz) ?? null;
    return {
      timezone: tz,
      utcOffset: utcOffsetLabel(tz),
      utcOffsetMinutes: utcOffsetMinutes(tz),
      region: region ? { code: region.code, name: region.name, defaultTimezone: region.defaultTimezone } : null,
    };
  }

  /**
   * Efir vaqtini ko'rsatish uchun yakuniy timezone:
   *  1) ?tz=  (qurilma IANA timezone'i)  2) ?country= (davlat standart zonasi)  3) server default
   */
  async resolveTimezone(tz?: string, country?: string): Promise<string> {
    if (tz) return tz;
    if (country) {
      const region = (await this.listActive()).find((r) => r.code === country);
      if (region) return region.defaultTimezone;
    }
    return this.cfg.defaultTimezone;
  }

  // ---------------- Admin ----------------

  listAll() {
    return this.prisma.region.findMany({ orderBy: { name: 'asc' } });
  }

  async create(dto: CreateRegionDto) {
    const region = await this.prisma.region.create({
      data: {
        code: dto.code,
        name: dto.name,
        defaultTimezone: dto.defaultTimezone,
        timezones: this.mergeZones(dto.defaultTimezone, dto.timezones),
        isActive: dto.isActive ?? true,
      },
    });
    await this.cache.invalidateRegions();
    return region;
  }

  async update(code: string, dto: UpdateRegionDto) {
    const existing = await this.prisma.region.findUnique({ where: { code } });
    if (!existing) throw new NotFoundException('Davlat topilmadi');
    const defaultTimezone = dto.defaultTimezone ?? existing.defaultTimezone;
    const region = await this.prisma.region.update({
      where: { code },
      data: {
        name: dto.name,
        isActive: dto.isActive,
        defaultTimezone,
        timezones: this.mergeZones(defaultTimezone, dto.timezones ?? existing.timezones),
      },
    });
    await this.cache.invalidateRegions();
    return region;
  }

  async remove(code: string) {
    await this.prisma.region.delete({ where: { code } });
    await this.cache.invalidateRegions();
  }

  private mergeZones(defaultTz: string, zones: string[] = []): string[] {
    return Array.from(new Set([defaultTz, ...zones]));
  }
}
