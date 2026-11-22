import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AdminRole } from '@prisma/client';
import { AdminAuth } from '../common/decorators/auth.decorators';
import { UrlHealthService } from '../url-health/url-health.service';
import { CheckUrlDto, CreateProgramDto, ListProgramsQueryDto, UpdateProgramDto } from './dto/program.dto';
import { ProgramsService } from './programs.service';

@ApiTags('Admin / Programs')
@AdminAuth()
@Controller('admin/programs')
export class ProgramsController {
  constructor(
    private readonly programs: ProgramsService,
    private readonly health: UrlHealthService,
  ) {}

  @Get()
  @ApiOperation({ summary: "Multfilm/ko'rsatuvlar ro'yxati (filtr + sahifalash)" })
  list(@Query() q: ListProgramsQueryDto) {
    return this.programs.list(q);
  }

  /** Forma to'ldirilayotganda URL'ni saqlamasdan oldin tekshirish */
  @Post('check-url')
  @HttpCode(200)
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Ixtiyoriy URL health-check (saqlanmaydi)' })
  checkUrl(@Body() dto: CheckUrlDto) {
    return this.health.check(dto.url, dto.streamType);
  }

  @Post('check-all')
  @HttpCode(200)
  @AdminAuth(AdminRole.SUPER_ADMIN)
  @ApiOperation({ summary: "Barcha faol dasturlar URL'larini hozir tekshirish" })
  async checkAll() {
    const result = await this.health.checkAllActive();
    return result ?? { skipped: true, reason: "Cron o'chirilgan yoki tekshiruv allaqachon ketmoqda" };
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.programs.get(id);
  }

  @Post()
  create(@Body() dto: CreateProgramDto) {
    return this.programs.create(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProgramDto) {
    return this.programs.update(id, dto);
  }

  @Post(':id/check-url')
  @HttpCode(200)
  @ApiOperation({ summary: 'Dastur URL (asosiy + zaxira) health-check, natija bazaga yoziladi' })
  check(@Param('id', ParseUUIDPipe) id: string) {
    return this.programs.checkProgramUrl(id);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.programs.remove(id);
  }
}
