import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { CookieOptions, Request, Response } from 'express';
import { AdminAuth, AuthAdmin, CurrentAdmin } from '../common/decorators/auth.decorators';
import { appConfig, AppConfig } from '../config/app.config';
import { AuthService, ClientMeta, IssuedTokens } from './auth.service';
import { LoginDto, RefreshDto } from './dto/login.dto';
import { ACCESS_COOKIE } from './guards/jwt-auth.guard';

const REFRESH_COOKIE = 'refresh_token';
const REFRESH_PATH = '/api/v1/admin/auth';

@ApiTags('Admin / Auth')
@Controller('admin/auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(appConfig.KEY) private readonly cfg: AppConfig,
  ) {}

  @Post('login')
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Admin login (access token + httpOnly refresh cookie)' })
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { tokens, admin } = await this.auth.login(dto.email, dto.password, this.meta(req));
    this.setCookies(res, tokens);
    return { accessToken: tokens.accessToken, expiresIn: tokens.accessExpiresIn, admin };
  }

  @Post('refresh')
  @HttpCode(200)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Access tokenni yangilash (refresh rotation)' })
  async refresh(@Body() dto: RefreshDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const raw = this.cookie(req, REFRESH_COOKIE) ?? dto.refreshToken;
    try {
      const { tokens, admin } = await this.auth.refresh(raw, this.meta(req));
      this.setCookies(res, tokens);
      return { accessToken: tokens.accessToken, expiresIn: tokens.accessExpiresIn, admin };
    } catch (e) {
      this.clearCookies(res);
      throw e;
    }
  }

  @Post('logout')
  @HttpCode(204)
  @ApiOperation({ summary: 'Chiqish (refresh token bekor qilinadi)' })
  async logout(@Body() dto: RefreshDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.auth.logout(this.cookie(req, REFRESH_COOKIE) ?? dto.refreshToken);
    this.clearCookies(res);
  }

  @Post('logout-all')
  @HttpCode(204)
  @AdminAuth()
  @ApiOperation({ summary: 'Barcha qurilmalardagi sessiyalarni yopish' })
  async logoutAll(@CurrentAdmin() admin: AuthAdmin, @Res({ passthrough: true }) res: Response) {
    await this.auth.revokeAll(admin.id);
    this.clearCookies(res);
  }

  @Get('me')
  @AdminAuth()
  @ApiOperation({ summary: 'Joriy admin' })
  me(@CurrentAdmin() admin: AuthAdmin) {
    return this.auth.me(admin.id);
  }

  // ---------------- helpers ----------------

  private baseCookie(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.cfg.auth.cookieSecure,
      sameSite: 'strict',
      domain: this.cfg.auth.cookieDomain,
    };
  }

  private setCookies(res: Response, t: IssuedTokens) {
    res.cookie(ACCESS_COOKIE, t.accessToken, {
      ...this.baseCookie(),
      path: '/api',
      maxAge: t.accessExpiresIn * 1000,
    });
    res.cookie(REFRESH_COOKIE, t.refreshToken, {
      ...this.baseCookie(),
      path: REFRESH_PATH,
      expires: t.refreshExpiresAt,
    });
  }

  private clearCookies(res: Response) {
    res.clearCookie(ACCESS_COOKIE, { ...this.baseCookie(), path: '/api' });
    res.clearCookie(REFRESH_COOKIE, { ...this.baseCookie(), path: REFRESH_PATH });
  }

  private cookie(req: Request, name: string): string | undefined {
    return (req.cookies as Record<string, string> | undefined)?.[name];
  }

  private meta(req: Request): ClientMeta {
    return { ip: req.ip, userAgent: req.headers['user-agent'] };
  }
}
