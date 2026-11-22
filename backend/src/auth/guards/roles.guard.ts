import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AdminRole } from '@prisma/client';
import { AuthAdmin, ROLES_KEY } from '../../common/decorators/auth.decorators';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<AdminRole[] | undefined>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!roles || roles.length === 0) return true;

    const admin = ctx.switchToHttp().getRequest<{ admin?: AuthAdmin }>().admin;
    if (!admin) throw new ForbiddenException();
    if (admin.role === AdminRole.SUPER_ADMIN || roles.includes(admin.role)) return true;
    throw new ForbiddenException("Bu amal uchun ruxsat yo'q");
  }
}
