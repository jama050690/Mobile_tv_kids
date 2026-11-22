import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminRole } from '@prisma/client';
import { AdminAuth } from '../common/decorators/auth.decorators';
import { CreateRegionDto, ResolveRegionQueryDto, UpdateRegionDto } from './dto/region.dto';
import { RegionsService } from './regions.service';

@ApiTags('Public / Regions')
@Controller('regions')
export class RegionsPublicController {
  constructor(private readonly regions: RegionsService) {}

  @Get()
  @ApiOperation({ summary: "Faol davlatlar va timezone'lar (onboarding uchun)" })
  list() {
    return this.regions.listActivePublic();
  }

  @Get('resolve')
  @ApiOperation({ summary: "Qurilma timezone'i bo'yicha davlatni aniqlash" })
  resolve(@Query() q: ResolveRegionQueryDto) {
    return this.regions.resolveByTimezone(q.tz);
  }
}

@ApiTags('Admin / Regions')
@AdminAuth(AdminRole.SUPER_ADMIN)
@Controller('admin/regions')
export class RegionsAdminController {
  constructor(private readonly regions: RegionsService) {}

  @Get()
  list() {
    return this.regions.listAll();
  }

  @Post()
  create(@Body() dto: CreateRegionDto) {
    return this.regions.create(dto);
  }

  @Patch(':code')
  update(@Param('code') code: string, @Body() dto: UpdateRegionDto) {
    return this.regions.update(code.toUpperCase(), dto);
  }

  @Delete(':code')
  @HttpCode(204)
  remove(@Param('code') code: string) {
    return this.regions.remove(code.toUpperCase());
  }
}
