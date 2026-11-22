# Kids TV — Admin panel

React 19 + TypeScript + Vite. Tashqi UI kutubxonasi yo'q (faqat `react-router-dom`).
Backend: [`../backend`](../backend) (NestJS, `/api/v1`).

## Ishga tushirish (lokal)

```bash
# 1) backend ishlab turgan bo'lsin (http://localhost:3000)
cd ../backend && npm run start:dev

# 2) panel
cd ../admin
npm install
npm run dev          # http://localhost:5173
```

Kirish: seed yaratgan admin (`backend/.env` → `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`).

Backend boshqa manzilda bo'lsa: `.env.example` → `.env` va `VITE_API_PROXY=http://...`.

| Buyruq | Vazifasi |
|---|---|
| `npm run dev` | Dev server, `/api` backend'ga proxy qilinadi |
| `npm run typecheck` | TypeScript tekshiruvi |
| `npm run build` | Production build → `dist/` |
| `npm run preview` | Build'ni lokal ko'rish |

## Bo'limlar

| Sahifa | Imkoniyatlar |
|---|---|
| **Bosh sahifa** | Kanallar/multfilmlar soni, ishlamayotgan URL'lar, server holati, "hozir efirda" (jonli progress) |
| **Efir jadvali** | Kanal + kun + timezone; timeline (sudrab surish, qo'shni slotga yopishish, zoom) yoki ro'yxat; slot qo'shish/tahrirlash; ketma-ket qo'shish (playlist, takrorlash); kunni boshqa kunlarga nusxalash; kunni tozalash; qamrov %, bo'sh oraliqlar va ogohlantirishlar |
| **Multfilmlar** | Qidiruv/filtrlar, CRUD, URL tekshiruvi (HLS/MP4, davomiylikni avtomatik aniqlash), hammasini tekshirish |
| **Kanallar** | CRUD, yoqish/o'chirish, jadvalga o'tish |
| **Davlatlar** *(super admin)* | Davlat kodi, standart va qo'shimcha timezone'lar |
| **Adminlar** *(super admin)* | CRUD, rol, bloklash, parol almashtirish |

## Muhim tamoyillar

- **Vaqt.** Baza UTC'da saqlaydi. Panelda tanlangan timezone bo'yicha ko'rsatiladi (yuqoridagi tanlov, brauzerda eslab qolinadi).
  Slot kiritilganda backend'ga *lokal vaqt + timezone* yuboriladi. Konvertatsiyani backend qiladi, DST ham hisobga olinadi.
- **To'qnashuv.** Bir kanalda slotlar ustma-ust tusha olmaydi (DB constraint). Shunday holatda panel `409` xabarini to'qnashgan multfilm nomi bilan ko'rsatadi.
  Sudrab surish xato bersa, slot joyiga qaytadi.
- **Jonli yangilanish.** Panel `/api/v1/events` (SSE) ga ulanadi. Boshqa admin jadvalni o'zgartirsa, sahifa o'zi yangilanadi.
- **Auth.** Token JS'da saqlanmaydi: faqat `httpOnly` cookie ishlatiladi (`SameSite=Strict`). `401` kelganda panel bir marta
  `/admin/auth/refresh` qiladi va so'rovni qaytaradi, refresh ham o'tmasa login sahifasiga yo'naltiradi.

## Production

Panel API bilan bitta domenda Nginx orqali beriladi (`backend/nginx/templates/default.conf.template`):

```bash
cd admin && npm ci && npm run build      # -> admin/dist
cd ../backend && docker compose --profile full --profile proxy up -d
```

- `docker-compose.yml` `../admin/dist` ni nginx'ga `/usr/share/nginx/admin` sifatida ulaydi.
- `/assets/*` 1 yil keshlanadi (fayl nomlarida hash bor), `index.html` esa `no-cache`.
- CSP: `script-src 'self'`, rasmlar `https:` dan. Logo/thumbnail URL'lari **https** bo'lishi kerak.

## Tuzilma

```
src/
  api/          client.ts (fetch + refresh), endpoints.ts, types.ts
  auth/         AuthContext.tsx
  components/   Layout, Modal/Field/Badge (ui.tsx), Toast+confirm, TimezoneSelect, ProgramPicker
  lib/          time.ts (Intl asosidagi timezone hisoblari), format.ts, hooks.ts (useLoad, SSE ...)
  pages/        Login, Dashboard, Channels, Programs, Regions, Users
  pages/schedule/  SchedulePage, Timeline, SlotModal, SequenceModal, CopyDayModal, ValidationPanel
```
