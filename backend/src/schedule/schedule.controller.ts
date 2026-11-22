import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsOptional } from 'class-validator';
import { AdminAuth } from '../common/decorators/auth.decorators';
import { IsTimezone } from '../common/validators/is-timezone.validator';
import {
  ChannelRangeQueryDto,
  CopyDayDto,
  CreateSlotDto,
  ScheduleRangeQueryDto,
  SequenceDto,
  UpdateSlotDto,
} from './dto/schedule.dto';
import { ScheduleService } from './schedule.service';

class TzQuery {
  @IsOptional()
  @IsTimezone()
  tz?: string;
}

@ApiTags('Admin / Schedule (EPG)')
@AdminAuth()
@Controller('admin/schedule')
export class ScheduleController {
  constructor(private readonly schedule: ScheduleService) {}

  @Get()
  @ApiOperation({ summary: "Oraliqdagi slotlar (Calendar/Timeline ko'rinishi uchun)" })
  list(@Query() q: ScheduleRangeQueryDto) {
    return this.schedule.list(q.channelId, q.from, q.to, q.tz);
  }

  @Get('validate')
  @ApiOperation({ summary: "Jadval validatsiyasi: bo'shliqlar, davomiylik, buzilgan URL, yosh toifasi" })
  validate(@Query() q: ChannelRangeQueryDto) {
    return this.schedule.validate(q.channelId, q.from, q.to, q.tz);
  }

  @Post()
  @ApiOperation({ summary: "Bitta slot qo'shish (endsAt berilmasa video davomiyligi bo'yicha)" })
  create(@Body() dto: CreateSlotDto) {
    return this.schedule.create(dto);
  }

  @Post('sequence')
  @ApiOperation({ summary: "Bir nechta dasturni ketma-ket qo'shish (playlist)" })
  sequence(@Body() dto: SequenceDto) {
    return this.schedule.sequence(dto);
  }

  @Post('copy-day')
  @ApiOperation({ summary: 'Kunlik jadvalni boshqa kunlarga nusxalash' })
  copyDay(@Body() dto: CopyDayDto) {
    return this.schedule.copyDay(dto);
  }

  @Delete()
  @ApiOperation({ summary: "Oraliqdagi slotlarni o'chirish" })
  clearRange(@Query() q: ChannelRangeQueryDto) {
    return this.schedule.clearRange(q.channelId, q.from, q.to);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string, @Query() q: TzQuery) {
    return this.schedule.get(id, q.tz);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSlotDto) {
    return this.schedule.update(id, dto);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.schedule.remove(id);
  }
}
