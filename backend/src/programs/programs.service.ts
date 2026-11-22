import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma, StreamType, UrlHealth } from '@prisma/client';
import { EventsService } from '../events/events.service';
import { PrismaService } from '../prisma/prisma.service';
import { PlayoutCacheService } from '../redis/playout-cache.service';
import { UrlHealthService } from '../url-health/url-health.service';
import { UrlPolicyService } from '../url-health/url-policy.service';
import { CreateProgramDto, ListProgramsQueryDto, UpdateProgramDto } from './dto/program.dto';

@Injectable()
export class ProgramsService {
  private readonly logger = new Logger(ProgramsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: PlayoutCacheService,
    private readonly events: EventsService,
    private readonly policy: UrlPolicyService,
    private readonly health: UrlHealthService,
  ) {}

  async list(q: ListProgramsQueryDto) {
    const where: Prisma.ProgramWhereInput = {
      isActive: q.isActive,
      ageRating: q.ageRating,
      streamType: q.streamType,
      urlStatus: q.urlStatus,
      ...(q.search ? { title: { contains: q.search, mode: 'insensitive' } } : {}),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.program.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      this.prisma.program.count({ where }),
    ]);
    return { items, total, page: q.page, limit: q.limit, pages: Math.ceil(total / q.limit) };
  }

  async get(id: string) {
    const program = await this.prisma.program.findUnique({ where: { id } });
    if (!program) throw new NotFoundException('Dastur topilmadi');
    return program;
  }

  async create(dto: CreateProgramDto) {
    const { checkUrl, ...data } = dto;
    this.policy.assertAllowed(data.videoUrl, 'videoUrl');
    if (data.fallbackUrl) this.policy.assertAllowed(data.fallbackUrl, 'fallbackUrl');

    const program = await this.prisma.program.create({
      data: { ...data, streamType: data.streamType ?? this.detectType(data.videoUrl) },
    });
    if (checkUrl !== false) this.checkInBackground(program.id);
    return program;
  }

  async update(id: string, dto: UpdateProgramDto) {
    const existing = await this.get(id);
    const { checkUrl, ...data } = dto;
    if (data.videoUrl) this.policy.assertAllowed(data.videoUrl, 'videoUrl');
    if (data.fallbackUrl) this.policy.assertAllowed(data.fallbackUrl, 'fallbackUrl');

    const urlChanged =
      (data.videoUrl !== undefined && data.videoUrl !== existing.videoUrl) ||
      (data.fallbackUrl !== undefined && data.fallbackUrl !== existing.fallbackUrl);

    const program = await this.prisma.program.update({
      where: { id },
      data: {
        ...data,
        ...(data.videoUrl && !data.streamType ? { streamType: this.detectType(data.videoUrl) } : {}),
        ...(urlChanged ? { urlStatus: UrlHealth.UNKNOWN, fallbackUrlStatus: UrlHealth.UNKNOWN, urlError: null } : {}),
      },
    });

    await this.cache.invalidateAll();
    await this.events.emit({ type: 'program.updated', programId: id });
    if (urlChanged && checkUrl !== false) this.checkInBackground(id);
    return program;
  }

  /** Jadvalda ishlatilgan dasturni o'chirib bo'lmaydi — uni nofaol qilish kerak */
  async remove(id: string) {
    await this.get(id);
    const used = await this.prisma.scheduleSlot.count({ where: { programId: id } });
    if (used > 0) {
      throw new ConflictException(
        `Dastur jadvalda ${used} marta ishlatilgan. O'chirish o'rniga nofaol qiling (isActive=false) yoki slotlarni o'chiring.`,
      );
    }
    await this.prisma.program.delete({ where: { id } });
  }

  checkProgramUrl(id: string) {
    return this.health.checkProgram(id);
  }

  private detectType(url: string): StreamType {
    const path = new URL(url).pathname.toLowerCase();
    if (path.endsWith('.m3u8')) return StreamType.HLS;
    if (path.endsWith('.mp4') || path.endsWith('.m4v')) return StreamType.MP4;
    throw new BadRequestException("streamType'ni aniqlab bo'lmadi — HLS yoki MP4 ekanini ko'rsating");
  }

  private checkInBackground(id: string) {
    this.health.checkProgram(id).catch((e: Error) => this.logger.warn(`URL tekshiruvi (${id}): ${e.message}`));
  }
}
