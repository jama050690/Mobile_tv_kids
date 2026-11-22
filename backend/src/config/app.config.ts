import { ConfigType, registerAs } from '@nestjs/config';
import { IANAZone } from 'luxon';

const list = (v?: string): string[] =>
  (v ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const bool = (v: string | undefined, def: boolean): boolean =>
  v === undefined || v === '' ? def : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());

const int = (name: string, v: string | undefined, def: number): number => {
  if (v === undefined || v === '') return def;
  const n = Number(v);
  if (!Number.isInteger(n)) throw new Error(`${name} butun son bo'lishi kerak (hozir: "${v}")`);
  return n;
};

const required = (name: string): string => {
  const v = process.env[name];
  if (!v) throw new Error(`${name} muhit o'zgaruvchisi majburiy (.env ni tekshiring)`);
  return v;
};

/**
 * Barcha konfiguratsiya shu yerda bir marta o'qiladi va validatsiya qilinadi.
 * Xato bo'lsa ilova ishga tushmaydi (fail fast).
 */
export const appConfig = registerAs('app', () => {
  const env = process.env;
  const nodeEnv = env.NODE_ENV ?? 'development';
  const isProd = nodeEnv === 'production';

  const jwtAccessSecret = required('JWT_ACCESS_SECRET');
  if (jwtAccessSecret.length < 32) {
    throw new Error("JWT_ACCESS_SECRET kamida 32 belgidan iborat bo'lishi kerak");
  }

  const defaultTimezone = env.DEFAULT_TIMEZONE || 'Asia/Tashkent';
  if (!IANAZone.isValidZone(defaultTimezone)) {
    throw new Error(`DEFAULT_TIMEZONE noto'g'ri IANA timezone: ${defaultTimezone}`);
  }

  required('DATABASE_URL');

  return {
    nodeEnv,
    isProd,
    port: int('PORT', env.PORT, 3000),
    redisUrl: env.REDIS_URL || 'redis://localhost:6379',
    trustProxy: int('TRUST_PROXY', env.TRUST_PROXY, 1),
    swaggerEnabled: bool(env.SWAGGER_ENABLED, !isProd),
    defaultTimezone,
    corsOrigins: list(env.CORS_ORIGINS),
    auth: {
      jwtAccessSecret,
      jwtAccessTtlSec: int('JWT_ACCESS_TTL_SEC', env.JWT_ACCESS_TTL_SEC, 900),
      refreshTokenTtlDays: int('REFRESH_TOKEN_TTL_DAYS', env.REFRESH_TOKEN_TTL_DAYS, 30),
      cookieSecure: bool(env.COOKIE_SECURE, isProd),
      cookieDomain: env.COOKIE_DOMAIN || undefined,
    },
    rateLimitPerMinute: int('RATE_LIMIT_PER_MINUTE', env.RATE_LIMIT_PER_MINUTE, 120),
    media: {
      allowHttp: bool(env.ALLOW_HTTP_MEDIA, false),
      allowedHosts: list(env.ALLOWED_MEDIA_HOSTS).map((h) => h.toLowerCase()),
      checkTimeoutMs: int('URL_CHECK_TIMEOUT_MS', env.URL_CHECK_TIMEOUT_MS, 8000),
      cronEnabled: bool(env.URL_CHECK_CRON_ENABLED, true),
    },
  };
});

export type AppConfig = ConfigType<typeof appConfig>;
