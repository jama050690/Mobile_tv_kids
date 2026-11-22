import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuthService } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAdminUserDto, UpdateAdminUserDto } from './dto/admin-user.dto';

const SAFE_SELECT = {
  id: true,
  email: true,
  fullName: true,
  role: true,
  isActive: true,
  lastLoginAt: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.AdminUserSelect;

@Injectable()
export class AdminUsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  list() {
    return this.prisma.adminUser.findMany({ select: SAFE_SELECT, orderBy: { createdAt: 'asc' } });
  }

  get(id: string) {
    return this.prisma.adminUser.findUniqueOrThrow({ where: { id }, select: SAFE_SELECT });
  }

  async create(dto: CreateAdminUserDto) {
    return this.prisma.adminUser.create({
      data: {
        email: dto.email,
        fullName: dto.fullName,
        role: dto.role,
        passwordHash: await AuthService.hashPassword(dto.password),
      },
      select: SAFE_SELECT,
    });
  }

  async update(id: string, dto: UpdateAdminUserDto, actorId: string) {
    if (id === actorId && (dto.isActive === false || (dto.role && dto.role !== 'SUPER_ADMIN'))) {
      throw new BadRequestException("O'zingizni bloklay yoki rolingizni pasaytira olmaysiz");
    }
    const data: Prisma.AdminUserUpdateInput = {
      email: dto.email,
      fullName: dto.fullName,
      role: dto.role,
      isActive: dto.isActive,
    };
    if (dto.password) data.passwordHash = await AuthService.hashPassword(dto.password);

    const updated = await this.prisma.adminUser.update({ where: { id }, data, select: SAFE_SELECT });
    // Parol o'zgarsa yoki bloklansa — barcha sessiyalar yopiladi
    if (dto.password || dto.isActive === false || dto.role) await this.auth.revokeAll(id);
    return updated;
  }

  async remove(id: string, actorId: string) {
    if (id === actorId) throw new BadRequestException("O'zingizni o'chira olmaysiz");
    await this.prisma.adminUser.delete({ where: { id } });
  }
}
