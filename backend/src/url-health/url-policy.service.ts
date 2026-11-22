import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { isIP } from 'node:net';
import { appConfig, AppConfig } from '../config/app.config';
import { isPublicIp } from '../common/utils/net.util';

const BLOCKED_SUFFIXES = ['.localhost', '.local', '.internal', '.lan', '.home.arpa'];

/**
 * Media URL xavfsizlik siyosati:
 *  - faqat https (ALLOW_HTTP_MEDIA=true bo'lsa http ham)
 *  - login:parol, javascript:, data:, file: va h.k. taqiqlangan
 *  - localhost / ichki tarmoq manzillari taqiqlangan (SSRF)
 *  - ALLOWED_MEDIA_HOSTS berilsa faqat o'sha domenlar
 */
@Injectable()
export class UrlPolicyService {
  constructor(@Inject(appConfig.KEY) private readonly cfg: AppConfig) {}

  /** Xato bo'lsa sababini, bo'lmasa null qaytaradi */
  validate(raw: string): string | null {
    let url: URL;
    try {
      url = new URL(raw);
    } catch {
      return "URL noto'g'ri formatda";
    }
    const protocols = this.cfg.media.allowHttp ? ['https:', 'http:'] : ['https:'];
    if (!protocols.includes(url.protocol)) {
      return `Faqat ${protocols.map((p) => p.replace(':', '')).join('/')} URL'larga ruxsat berilgan`;
    }
    if (url.username || url.password) return "URL ichida login/parol bo'lmasligi kerak";
    if (raw.length > 2048) return 'URL juda uzun';

    const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    if (host === 'localhost' || BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) {
      return "Ichki tarmoq manzillariga ruxsat yo'q";
    }
    if (isIP(host) && !isPublicIp(host)) return "Ichki (private) IP manzillarga ruxsat yo'q";

    const allowed = this.cfg.media.allowedHosts;
    if (allowed.length && !allowed.some((h) => host === h || host.endsWith(`.${h}`))) {
      return `Domen ruxsat etilganlar ro'yxatida yo'q: ${host}`;
    }
    return null;
  }

  assertAllowed(raw: string, field: string): void {
    const err = this.validate(raw);
    if (err) throw new BadRequestException(`${field}: ${err}`);
  }
}
