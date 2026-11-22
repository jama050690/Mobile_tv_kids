import { Inject, Injectable, Logger, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import { appConfig, AppConfig } from '../config/app.config';
import { PrismaService } from '../prisma/prisma.service';
import { AccessTokenPayload } from './guards/jwt-auth.guard';

export interface ClientMeta {
  ip?: string;
  userAgent?: string;
}

export interface IssuedTokens {
  accessToken: string;
  accessExpiresIn: number;
  refreshToken: string;
  refreshExpiresAt: Date;
}

const sha256 = (v: string) => createHash('sha256').update(v).digest('hex');

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);
  private dummyHash = '';

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    @Inject(appConfig.KEY) private readonly cfg: AppConfig,
  ) {}

  async onModuleInit() {
    // Mavjud bo'lmagan email bilan login qilinganda ham vaqt bir xil bo'lishi uchun (timing attack)
    this.dummyHash = await argon2.hash(randomBytes(16).toString('hex'));
  }

  static hashPassword(password: string): Promise<string> {
    return argon2.hash(password, { type: argon2.argon2id });
  }

  async login(email: string, password: string, meta: ClientMeta) {
    const admin = await this.prisma.adminUser.findUnique({ where: { email } });
    const valid = await argon2.verify(admin?.passwordHash ?? this.dummyHash, password).catch(() => false);
    if (!admin || !valid || !admin.isActive) {
      throw new UnauthorizedException("Email yoki parol noto'g'ri");
    }

    await this.prisma.adminUser.update({ where: { id: admin.id }, data: { lastLoginAt: new Date() } });
    const tokens = await this.issueTokens(admin.id, admin.role, meta);
    return { tokens, admin: this.publicAdmin(admin) };
  }

  /**
   * Refresh token rotation: har refresh'da eski token bekor qilinadi, yangisi beriladi.
   * Agar bekor qilingan token qayta ishlatilsa (o'g'irlangan bo'lishi mumkin) — adminning barcha sessiyalari yopiladi.
   */
  async refresh(rawToken: string | undefined, meta: ClientMeta) {
    if (!rawToken) throw new UnauthorizedException('Refresh token topilmadi');
    const stored = await this.prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(rawToken) },
      include: { admin: true },
    });
    if (!stored) throw new UnauthorizedException('Refresh token yaroqsiz');

    if (stored.revokedAt) {
      this.logger.warn(`Refresh token qayta ishlatildi (admin=${stored.adminId}) — barcha sessiyalar yopildi`);
      await this.revokeAll(stored.adminId);
      throw new UnauthorizedException('Sessiya bekor qilingan, qaytadan kiring');
    }
    if (stored.expiresAt <= new Date() || !stored.admin.isActive) {
      throw new UnauthorizedException("Sessiya muddati o'tgan, qaytadan kiring");
    }

    // Parallel refresh so'rovlarida faqat bittasi muvaffaqiyatli bo'ladi
    const { count } = await this.prisma.refreshToken.updateMany({
      where: { id: stored.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    if (count === 0) throw new UnauthorizedException('Refresh token allaqachon ishlatilgan');

    const tokens = await this.issueTokens(stored.adminId, stored.admin.role, meta);
    return { tokens, admin: this.publicAdmin(stored.admin) };
  }

  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) return;
    await this.prisma.refreshToken.updateMany({
      where: { tokenHash: sha256(rawToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeAll(adminId: string): Promise<void> {
    await this.prisma.refreshToken.updateMany({
      where: { adminId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async me(adminId: string) {
    const admin = await this.prisma.adminUser.findUniqueOrThrow({ where: { id: adminId } });
    return this.publicAdmin(admin);
  }

  private async issueTokens(adminId: string, role: string, meta: ClientMeta): Promise<IssuedTokens> {
    const payload: AccessTokenPayload = { sub: adminId, role, typ: 'access' };
    const accessToken = await this.jwt.signAsync(payload, { expiresIn: this.cfg.auth.jwtAccessTtlSec });

    const refreshToken = randomBytes(48).toString('base64url');
    const refreshExpiresAt = new Date(Date.now() + this.cfg.auth.refreshTokenTtlDays * 86_400_000);
    await this.prisma.refreshToken.create({
      data: {
        adminId,
        tokenHash: sha256(refreshToken),
        expiresAt: refreshExpiresAt,
        ip: meta.ip?.slice(0, 64),
        userAgent: meta.userAgent?.slice(0, 300),
      },
    });

    // Eski (muddati o'tgan) tokenlarni tozalash
    await this.prisma.refreshToken.deleteMany({
      where: { adminId, expiresAt: { lt: new Date(Date.now() - 7 * 86_400_000) } },
    });

    return { accessToken, accessExpiresIn: this.cfg.auth.jwtAccessTtlSec, refreshToken, refreshExpiresAt };
  }

  private publicAdmin(a: { id: string; email: string; fullName: string | null; role: string; lastLoginAt: Date | null }) {
    return { id: a.id, email: a.email, fullName: a.fullName, role: a.role, lastLoginAt: a.lastLoginAt };
  }
}
