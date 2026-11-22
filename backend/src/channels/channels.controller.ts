import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminAuth } from '../common/decorators/auth.decorators';
import { ChannelsService } from './channels.service';
import { CreateChannelDto, PublicChannelsQueryDto, SetActiveDto, UpdateChannelDto } from './dto/channel.dto';

@ApiTags('Public / Channels')
@Controller('channels')
export class ChannelsPublicController {
  constructor(private readonly channels: ChannelsService) {}

  @Get()
  @ApiOperation({ summary: 'Kanallar katalogi (faqat faol kanallar)' })
  list(@Query() q: PublicChannelsQueryDto) {
    return this.channels.listPublic(q.ageGroup);
  }

  @Get(':ref')
  @ApiOperation({ summary: 'Bitta kanal (:ref = id | slug | raqam)' })
  get(@Param('ref') ref: string) {
    return this.channels.findActiveByRef(ref);
  }
}

@ApiTags('Admin / Channels')
@AdminAuth()
@Controller('admin/channels')
export class ChannelsAdminController {
  constructor(private readonly channels: ChannelsService) {}

  @Get()
  list() {
    return this.channels.listAll();
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.channels.get(id);
  }

  @Post()
  create(@Body() dto: CreateChannelDto) {
    return this.channels.create(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateChannelDto) {
    return this.channels.update(id, dto);
  }

  @Patch(':id/active')
  @ApiOperation({ summary: 'Kanalni faollashtirish / o‘chirish' })
  setActive(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SetActiveDto) {
    return this.channels.setActive(id, dto.isActive);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.channels.remove(id);
  }
}
