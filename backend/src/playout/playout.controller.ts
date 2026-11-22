import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { TimezoneQueryDto } from '../regions/dto/region.dto';
import { RegionsService } from '../regions/regions.service';
import { UrlHealthService } from '../url-health/url-health.service';
import { EpgQueryDto, GuideQueryDto, PlaybackReportDto } from './dto/playout.dto';
import { PlayoutService } from './playout.service';

@ApiTags('Public / Playout')
@Controller()
export class PlayoutController {
  constructor(
    private readonly playout: PlayoutService,
    private readonly regions: RegionsService,
    private readonly health: UrlHealthService,
  ) {}

  @Get('channels/:ref/now')
  @ApiOperation({ summary: 'Kanalda hozir efirda nima ketyapti + seek offset + keyingi dastur' })
  async now(@Param('ref') ref: string, @Query() q: TimezoneQueryDto) {
    return this.playout.getNow(ref, await this.regions.resolveTimezone(q.tz, q.country));
  }

  @Get('channels/:ref/schedule')
  @ApiOperation({ summary: 'Kanalning kunlik dasturi (EPG) foydalanuvchi vaqtida' })
  async schedule(@Param('ref') ref: string, @Query() q: EpgQueryDto) {
    return this.playout.getSchedule(ref, await this.regions.resolveTimezone(q.tz, q.country), q.date);
  }

  @Get('guide/now')
  @ApiOperation({ summary: "Barcha kanallar bo'yicha hozirgi va keyingi dasturlar" })
  async guide(@Query() q: GuideQueryDto) {
    return this.playout.getGuideNow(await this.regions.resolveTimezone(q.tz, q.country), q.ageGroup);
  }

  @Get('time')
  @ApiOperation({ summary: 'Server vaqti (soat sinxronizatsiyasi) va timezone offset' })
  async time(@Query() q: TimezoneQueryDto) {
    return this.playout.getTime(await this.regions.resolveTimezone(q.tz, q.country));
  }

  @Post('playback/report')
  @HttpCode(202)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: "Video ochilmadi — URL navbatdan tashqari qayta tekshiriladi" })
  async report(@Body() dto: PlaybackReportDto) {
    const queued = await this.health.requestCheck(dto.programId);
    return { accepted: true, queued };
  }
}
