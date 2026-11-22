import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AgeGroup, Channel } from '@prisma/client';
import { slugify } from '../common/utils/slug.util';
import { EventsService } from '../events/events.service';
import { PrismaService } from '../prisma/prisma.service';
import { CacheKeys, PlayoutCacheService } from '../redis/playout-cache.service';
import { RedisService } from '../redis/redis.service';
import { CreateChannelDto, UpdateChannelDto } from './dto/channel.dto';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PublicChannel = Pick<
  Channel,
  'id' | 'title' | 'slug' | 'number' | 'description' | 'logoUrl' | 'ageGroup'
>;

export const toPublicChannel = (c: Channel | PublicChannel): PublicChannel => ({
  id: c.id,
  title: c.title,
  slug: c.slug,
  number: c.number,
  description: c.description,
  logoUrl: c.logoUrl,
  ageGroup: c.ageGroup,
});

@Injectable()
export class ChannelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
    private readonly cache: PlayoutCacheService,
    private readonly events: EventsService,
  ) {}

  // ---------------- Public ----------------

  /** Faol kanallar (number bo'yicha tartiblangan), Redis'da keshlanadi */
  async listPublic(ageGroup?: AgeGroup): Promise<PublicChannel[]> {
    let channels = await this.redis.getJson<PublicChannel[]>(CacheKeys.publicChannels);
    if (!channels) {
      const rows = await this.prisma.channel.findMany({ where: { isActive: true }, orderBy: { number: 'asc' } });
      channels = rows.map(toPublicChannel);
      await this.redis.setJson(CacheKeys.publicChannels, channels, 300);
    }
    if (!ageGroup) return channels;
    return channels.filter((c) => c.ageGroup === ageGroup || c.ageGroup === AgeGroup.ALL);
  }

  /** :ref = uuid | slug | kanal raqami */
  async findActiveByRef(ref: string): Promise<PublicChannel> {
    const channels = await this.listPublic();
    const channel = UUID_RE.test(ref)
      ? channels.find((c) => c.id === ref)
      : /^\d+$/.test(ref)
        ? channels.find((c) => c.number === Number(ref))
        : channels.find((c) => c.slug === ref.toLowerCase());
    if (!channel) throw new NotFoundException('Kanal topilmadi yoki faol emas');
    return channel;
  }

  // ---------------- Admin ----------------

  listAll() {
    return this.prisma.channel.findMany({
      orderBy: { number: 'asc' },
      include: { _count: { select: { slots: true } } },
    });
  }

  async get(id: string) {
    const channel = await this.prisma.channel.findUnique({ where: { id } });
    if (!channel) throw new NotFoundException('Kanal topilmadi');
    return channel;
  }

  async create(dto: CreateChannelDto) {
    const slug = dto.slug ?? slugify(dto.title);
    if (!slug) throw new BadRequestException("slug yasab bo'lmadi — slug maydonini qo'lda kiriting");
    const number = dto.number ?? (await this.nextNumber());
    const channel = await this.prisma.channel.create({ data: { ...dto, slug, number } });
    await this.afterChange(channel.id);
    return channel;
  }

  async update(id: string, dto: UpdateChannelDto) {
    await this.get(id);
    const channel = await this.prisma.channel.update({ where: { id }, data: dto });
    await this.afterChange(id);
    return channel;
  }

  async setActive(id: string, isActive: boolean) {
    return this.update(id, { isActive });
  }

  /** Kanal o'chirilsa uning jadvali ham o'chadi (CASCADE) */
  async remove(id: string) {
    await this.get(id);
    await this.prisma.channel.delete({ where: { id } });
    await this.afterChange(id);
  }

  private async nextNumber(): Promise<number> {
    const agg = await this.prisma.channel.aggregate({ _max: { number: true } });
    return (agg._max.number ?? 0) + 1;
  }

  private async afterChange(channelId: string) {
    await Promise.all([this.cache.invalidateChannelsList(), this.cache.invalidateChannel(channelId)]);
    await this.events.emit({ type: 'channels.changed', channelId });
  }
}
