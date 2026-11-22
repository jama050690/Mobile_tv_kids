import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { AdminRole } from '@prisma/client';
import { AdminAuth, AuthAdmin, CurrentAdmin } from '../common/decorators/auth.decorators';
import { AdminUsersService } from './admin-users.service';
import { CreateAdminUserDto, UpdateAdminUserDto } from './dto/admin-user.dto';

@ApiTags('Admin / Users')
@AdminAuth(AdminRole.SUPER_ADMIN)
@Controller('admin/users')
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}

  @Get()
  list() {
    return this.users.list();
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.users.get(id);
  }

  @Post()
  create(@Body() dto: CreateAdminUserDto) {
    return this.users.create(dto);
  }

  @Patch(':id')
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAdminUserDto,
    @CurrentAdmin() admin: AuthAdmin,
  ) {
    return this.users.update(id, dto, admin.id);
  }

  @Delete(':id')
  @HttpCode(204)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentAdmin() admin: AuthAdmin) {
    return this.users.remove(id, admin.id);
  }
}
