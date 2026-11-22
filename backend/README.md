# Kids TV — Backend API

Bolalar uchun ko'p kanalli **virtual linear TV** (scheduled playout) backend'i.
Foydalanuvchi kanalni tanlaydi va o'sha soniyada efirda ketayotgan multfilmga **"jonli efir"** kabi ulanadi.

**Stack:** NestJS 11 (TypeScript) · PostgreSQL 17 (Prisma) · Redis 7 · SSE · Docker Compose · Nginx + Let's Encrypt

---

## 1. Tez ishga tushirish (lokal)

```bash
cd backend
cp .env.example .env          # parol/secret'larni o'zgartiring (openssl rand -base64 48)
npm install

docker compose up -d postgres redis   # Postgres -> localhost:5433, Redis -> localhost:6379

npx prisma migrate deploy     # jadvallar + EXCLUDE constraint
npm run db:seed               # davlatlar, super admin, demo kanallar/jadval
npm run start:dev             # http://localhost:3000/api/v1
```

Swagger hujjati: **http://localhost:3000/docs**

> Lokal Postgres (Homebrew) ishlatsangiz — `.env` dagi `DATABASE_URL` ni o'zgartiring.
> `btree_gist` extension kerak (migratsiya o'zi yaratadi, superuser huquqi bo'lishi kerak).

## 2. To'liq stack Docker'da

```bash
docker compose --profile full up -d --build          # postgres + redis + api
docker compose exec api node dist/database/seed.js    # seed (bir marta)
```

### Production (Ubuntu VPS + Nginx + HTTPS)

```bash
# .env:  NODE_ENV=production, DOMAIN=api.sizningdomen.uz, LETSENCRYPT_EMAIL=..., COOKIE_SECURE=true,
#        SWAGGER_ENABLED=false, CORS_ORIGINS=https://admin.sizningdomen.uz, kuchli parollar
docker compose --profile certbot run --rm --service-ports certbot   # 1-marta SSL sertifikat
(cd ../admin && npm ci && npm run build)                            # admin panel -> ../admin/dist
docker compose --profile full --profile proxy up -d --build
```

Admin panel shu domenning o'zida ochiladi: `https://DOMAIN/` (API — `https://DOMAIN/api/v1`).
Panel va API bitta origin'da bo'lgani uchun panelga CORS kerak emas, cookie `SameSite=Strict` ishlaydi.
Panelni yangilash: `cd ../admin && npm run build` — nginx'ni qayta ishga tushirish shart emas.
Batafsil: [`../admin/README.md`](../admin/README.md).

Sertifikat yangilash (cron'ga qo'ying, oyiga 1-2 marta):
```bash
docker compose --profile certbot run --rm --entrypoint "certbot renew --webroot -w /var/www/certbot" certbot
docker compose exec nginx nginx -s reload
```

---

## 3. Arxitektura

```
Flutter ilova ─┐                       ┌─> PostgreSQL (UTC, EXCLUDE constraint)
Admin panel ───┼─> Nginx (HTTPS) ─> API ┤
               │      SSE /events       └─> Redis (efir keshi + pub/sub)
```

| Modul | Vazifasi |
|---|---|
| `playout` | **Asosiy mantiq**: hozirgi efir, seek offset, keyingi dastur, EPG (timezone bo'yicha) |
| `schedule` | Admin: jadval CRUD, to'qnashuv nazorati, ketma-ket qo'shish, kun nusxalash, validatsiya |
| `programs` | Admin: multfilmlar bazasi, URL health-check |
| `channels` | Kanallar CRUD + public katalog |
| `url-health` | HLS/MP4 URL tekshiruvi (SSRF himoyasi bilan), har 6 soatda avtomatik |
| `regions` | Davlatlar va IANA timezone'lar |
| `auth`, `admin-users` | JWT access + refresh rotation, Argon2id, rollar |
| `events` | SSE real-time hodisalar (Redis pub/sub orqali ko'p instansiyali) |

### Vaqt va timezone mantiqi

* Bazada barcha vaqtlar **UTC** (`TIMESTAMPTZ`).
* Ilova `?tz=Asia/Tashkent` (IANA) yuboradi. Bo'lmasa `?country=UZ` → davlat standart zonasi → server default.
* Har bir javobda `startsAtUtc` **va** `startsAtLocal` (`2026-11-22T18:00:00+05:00`) qaytadi.
* EPG kuni foydalanuvchining **mahalliy** kuni bo'yicha olinadi (DST kunlari ham to'g'ri).
* Admin vaqtni `2026-11-22T18:00:00+05:00` yoki `2026-11-22T18:00:00` + `"timezone": "Asia/Tashkent"` ko'rinishida kiritadi.

### Seek offset

Dastur 10:00:00 UTC da boshlangan, hozir 10:03:20 UTC → `playback.seekOffsetSec = 200`.
Pleer videoni 200-soniyadan boshlaydi — barcha tomoshabinlar bir xil kadrni ko'radi.

### Efir holatlari (`status`)

| status | Ma'nosi | Ilova nima qiladi |
|---|---|---|
| `PLAYING` | Video efirda | `playback.url` ni `seekOffsetSec` dan o'ynatadi |
| `FILLER` | Video slotdan qisqa, tugadi | "Keyingi multfilm tez orada" + `next.startsInSec` taymer |
| `UNAVAILABLE` | Asosiy va zaxira URL ishlamayapti | Kutish ekrani, `next` ni ko'rsatadi |
| `OFF_AIR` | Jadvalda hech narsa yo'q | "Efir tanaffusi" |

`refreshInSec` — ilova shu soniyadan keyin `/now` ni qayta so'rashi kerak (keyingi dasturga avtomatik o'tish).

### Fallback

1. Asosiy URL `BROKEN` bo'lsa va zaxira URL ishlayotgan bo'lsa — `playback.url` = zaxira (`usingFallback: true`).
2. Ilova o'zi ham video ochilmasa `playback.fallbackUrl` ni sinaydi va `POST /playback/report` yuboradi → URL navbatdan tashqari tekshiriladi.
3. Ikkalasi ham ishlamasa — `UNAVAILABLE`, `next` dasturga o'tiladi.

---

## 4. API (prefix: `/api/v1`)

### Public (mobil ilova)

| Method | Endpoint | Tavsif |
|---|---|---|
| GET | `/channels?ageGroup=AGE_4_7` | Kanallar katalogi |
| GET | `/channels/:ref` | Kanal (`:ref` = id, slug yoki raqam: `/channels/1`) |
| GET | `/channels/:ref/now?tz=Asia/Tashkent` | **Hozirgi efir + seek offset + keyingi** |
| GET | `/channels/:ref/schedule?tz=...&date=2026-11-22` | Kunlik EPG (mahalliy vaqtda) |
| GET | `/guide/now?tz=...` | Barcha kanallar: hozir/keyingi |
| GET | `/time?tz=...` | Server vaqti (soat sinxronizatsiyasi) |
| GET | `/regions` | Davlatlar va timezone'lar (onboarding) |
| GET | `/regions/resolve?tz=Asia/Tashkent` | Timezone bo'yicha davlatni aniqlash |
| POST | `/playback/report` | `{ programId }` — video ochilmadi |
| GET | `/events?channelId=...` | SSE: `schedule.updated`, `channels.changed`, `program.updated`, `ping` |
| GET | `/health` | API / DB / Redis holati |

`/channels/1/now?tz=Asia/Tashkent` javobi (qisqartirilgan):

```json
{
  "serverTimeUtc": "2026-11-22T13:03:20.000Z",
  "timezone": "Asia/Tashkent",
  "localTime": "2026-11-22T18:03:20+05:00",
  "utcOffset": "+05:00",
  "channel": { "id": "…", "title": "Multfilm Klassika", "number": 1, "ageGroup": "ALL" },
  "status": "PLAYING",
  "current": {
    "slotId": "…",
    "startsAtUtc": "2026-11-22T13:00:00.000Z",
    "startsAtLocal": "2026-11-22T18:00:00+05:00",
    "endsAtLocal": "2026-11-22T18:09:56+05:00",
    "elapsedSec": 200, "remainingSec": 396, "progress": 0.336,
    "program": { "title": "…", "thumbnailUrl": "…", "ageRating": "ALL", "durationSec": 596 }
  },
  "playback": {
    "url": "https://…/video.m3u8", "fallbackUrl": "https://…/video.mp4",
    "streamType": "HLS", "seekOffsetSec": 200, "playUntilSec": 596, "usingFallback": false
  },
  "next": { "startsAtLocal": "2026-11-22T18:09:56+05:00", "startsInSec": 396, "program": { "title": "…" } },
  "refreshInSec": 396
}
```

> **Flutter maslahati:** qurilma soati noto'g'ri bo'lishi mumkin. Seek uchun
> `seekOffsetSec + (javob kelganidan beri o'tgan vaqt)` ishlating, `serverEpochMs` bilan soat farqini hisoblang.

### Admin (JWT talab qilinadi)

Login: `POST /admin/auth/login {email, password}` → `accessToken` (body) + `access_token`, `refresh_token` (httpOnly cookie).
So'rovlarda `Authorization: Bearer <token>` yoki cookie. Yangilash: `POST /admin/auth/refresh`.

| Method | Endpoint | Tavsif |
|---|---|---|
| POST | `/admin/auth/login` · `/refresh` · `/logout` · `/logout-all` | Auth |
| GET | `/admin/auth/me` | Joriy admin |
| CRUD | `/admin/channels` · `PATCH /admin/channels/:id/active` | Kanallar |
| CRUD | `/admin/programs?search=&urlStatus=BROKEN&page=1` | Multfilmlar |
| POST | `/admin/programs/check-url` `{url}` | URL'ni saqlamasdan tekshirish |
| POST | `/admin/programs/:id/check-url` | Dastur URL'ini tekshirish (natija bazaga) |
| POST | `/admin/programs/check-all` | Hammasini tekshirish (SUPER_ADMIN) |
| GET | `/admin/schedule?channelId=&from=&to=&tz=` | Timeline |
| POST | `/admin/schedule` | Slot qo'shish (`endsAt` ixtiyoriy) |
| POST | `/admin/schedule/sequence` | Ketma-ket qo'shish `{channelId, programIds[], startsAt?}` |
| POST | `/admin/schedule/copy-day` | `{channelId, sourceDate, targetDates[], timezone, replace}` |
| GET | `/admin/schedule/validate?channelId=&from=&to=` | Bo'shliqlar, davomiylik, buzilgan URL |
| PATCH/DELETE | `/admin/schedule/:id` | Slot tahrirlash / o'chirish |
| DELETE | `/admin/schedule?channelId=&from=&to=` | Oraliqni tozalash |
| CRUD | `/admin/regions` | Davlatlar (SUPER_ADMIN) |
| CRUD | `/admin/users` | Adminlar (SUPER_ADMIN) |

Slot qo'shishda ogohlantirishlar (`warnings`): `SLOT_LONGER_THAN_MEDIA`, `MEDIA_TRUNCATED`, `URL_BROKEN`,
`PROGRAM_INACTIVE`, `AGE_MISMATCH`, `IN_PAST`. To'qnashuv bo'lsa — **409** va to'qnashgan slot ma'lumoti.

---

## 5. Xavfsizlik

* **Argon2id** parol hash, timing-attack himoyasi
* **JWT access** (15 daq) + **refresh rotation** (token SHA-256 hash'da saqlanadi, qayta ishlatilsa barcha sessiyalar yopiladi)
* httpOnly + `SameSite=Strict` cookie, `Secure` (production)
* Rate limiting: global 120/daq, login 5/daq (+ Nginx `limit_req`)
* `ValidationPipe` (whitelist + forbidNonWhitelisted) — ortiqcha maydonlar rad etiladi
* Helmet, CORS faqat ruxsat etilgan originlar
* **Media URL siyosati:** faqat https, login/parolsiz, `javascript:`/`data:` taqiq, ixtiyoriy domen allowlist
* **SSRF himoyasi:** health-check ichki IP'larga (127.x, 10.x, 169.254.x, ::1 …) ulanmaydi — DNS javobi ham tekshiriladi, redirect'lar qo'lda kuzatiladi
* Bitta kanalda slotlar ustma-ust tushmasligi DB darajasida kafolatlangan (`EXCLUDE USING gist`) + advisory lock

## 6. Monitoring

* `GET /api/v1/health` — Docker `HEALTHCHECK` va tashqi monitoring uchun (DB ishlamasa 503)
* Docker `restart: unless-stopped`, log rotatsiya (20MB × 5)
* Redis ishlamasa API to'xtamaydi — kesh o'tkazib yuboriladi (`status: degraded`)
* Cron: har daqiqada slot statuslari (`SCHEDULED → LIVE → ENDED`), har 6 soatda URL health-check

## 7. Foydali buyruqlar

```bash
npm run build          # production build
npm run typecheck      # TypeScript tekshiruvi
npm run db:migrate     # sxema o'zgarganda yangi migratsiya (dev)
npm run db:studio      # Prisma Studio (DB brauzeri)
```
