import {
  applyDecorators,
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiCookieAuth } from '@nestjs/swagger';
import { AdminRole } from '@prisma/client';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';

export const ROLES_KEY = 'roles';

export interface AuthAdmin {
  id: string;
  email: string;
  role: AdminRole;
  fullName: string | null;
}

/**
 * Admin endpointlarni himoyalaydi.
 *  @AdminAuth()                      — har qanday faol admin
 *  @AdminAuth(AdminRole.SUPER_ADMIN) — faqat super admin
 */
export const AdminAuth = (...roles: AdminRole[]) =>
  applyDecorators(
    SetMetadata(ROLES_KEY, roles),
    UseGuards(JwtAuthGuard, RolesGuard),
    ApiBearerAuth(),
    ApiCookieAuth('access_token'),
  );

export const CurrentAdmin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthAdmin =>
    ctx.switchToHttp().getRequest<{ admin: AuthAdmin }>().admin,
);
