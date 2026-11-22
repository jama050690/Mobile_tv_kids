import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service';
import type { AuthAdmin } from '../../common/decorators/auth.decorators';

export interface AccessTokenPayload {
  sub: string;
  role: string;
  typ: 'access';
}

export const ACCESS_COOKIE = 'access_token';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request & { admin?: AuthAdmin }>();
    const token = this.extractToken(req);
    if (!token) throw new UnauthorizedException('Avtorizatsiya talab qilinadi');

    let payload: AccessTokenPayload;
    try {
      payload = await this.jwt.verifyAsync<AccessTokenPayload>(token);
    } catch {
      throw new UnauthorizedException("Token yaroqsiz yoki muddati o'tgan");
    }
    if (payload.typ !== 'access') throw new UnauthorizedException('Token turi noto‘g‘ri');

    // Admin o'chirilgan/bloklangan bo'lsa token darhol ishlamay qoladi
    const admin = await this.prisma.adminUser.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true, fullName: true, isActive: true },
    });
    if (!admin || !admin.isActive) throw new UnauthorizedException('Admin topilmadi yoki bloklangan');

    req.admin = { id: admin.id, email: admin.email, role: admin.role, fullName: admin.fullName };
    return true;
  }

  private extractToken(req: Request): string | undefined {
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) return header.slice(7).trim();
    const cookies = req.cookies as Record<string, string> | undefined;
    return cookies?.[ACCESS_COOKIE];
  }
}
