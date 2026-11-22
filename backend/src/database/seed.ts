/**
 * Boshlang'ich ma'lumotlar:
 *  - davlatlar va timezone'lar
 *  - birinchi SUPER_ADMIN (SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD)
 *  - (SEED_DEMO_DATA=true bo'lsa) demo kanallar, multfilmlar va 2 kunlik jadval
 *
 * Qayta ishga tushirish xavfsiz (idempotent).
 *   Lokal:      npm run db:seed
 *   Production: npm run db:seed:prod
 */
import { AdminRole, AgeGroup, PrismaClient, StreamType } from '@prisma/client';
import * as argon2 from 'argon2';
import { DateTime } from 'luxon';

try {
  process.loadEnvFile?.('.env');
} catch {
  /* .env bo'lmasa muhit o'zgaruvchilari ishlatiladi */
}

const prisma = new PrismaClient();

const REGIONS = [
  { code: 'UZ', name: "O'zbekiston", defaultTimezone: 'Asia/Tashkent', timezones: ['Asia/Tashkent', 'Asia/Samarkand'] },
  { code: 'KZ', name: "Qozog'iston", defaultTimezone: 'Asia/Almaty', timezones: ['Asia/Almaty', 'Asia/Qostanay', 'Asia/Aqtobe', 'Asia/Aqtau', 'Asia/Atyrau', 'Asia/Oral', 'Asia/Qyzylorda'] },
  { code: 'KG', name: "Qirg'iziston", defaultTimezone: 'Asia/Bishkek', timezones: ['Asia/Bishkek'] },
  { code: 'TJ', name: 'Tojikiston', defaultTimezone: 'Asia/Dushanbe', timezones: ['Asia/Dushanbe'] },
  { code: 'TM', name: 'Turkmaniston', defaultTimezone: 'Asia/Ashgabat', timezones: ['Asia/Ashgabat'] },
  { code: 'RU', name: 'Rossiya', defaultTimezone: 'Europe/Moscow', timezones: ['Europe/Moscow', 'Europe/Kaliningrad', 'Europe/Samara', 'Asia/Yekaterinburg', 'Asia/Omsk', 'Asia/Novosibirsk', 'Asia/Krasnoyarsk', 'Asia/Irkutsk', 'Asia/Yakutsk', 'Asia/Vladivostok', 'Asia/Magadan', 'Asia/Kamchatka'] },
  { code: 'TR', name: 'Turkiya', defaultTimezone: 'Europe/Istanbul', timezones: ['Europe/Istanbul'] },
  { code: 'AE', name: 'BAA', defaultTimezone: 'Asia/Dubai', timezones: ['Asia/Dubai'] },
  { code: 'KR', name: 'Janubiy Koreya', defaultTimezone: 'Asia/Seoul', timezones: ['Asia/Seoul'] },
  { code: 'DE', name: 'Germaniya', defaultTimezone: 'Europe/Berlin', timezones: ['Europe/Berlin'] },
  { code: 'GB', name: 'Buyuk Britaniya', defaultTimezone: 'Europe/London', timezones: ['Europe/London'] },
  { code: 'US', name: 'AQSH', defaultTimezone: 'America/New_York', timezones: ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Phoenix', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu'] },
];

const DEMO_CHANNELS = [
  { slug: 'multfilm-klassika', title: 'Multfilm Klassika', number: 1, ageGroup: AgeGroup.ALL, description: 'Sevimli klassik multfilmlar' },
  { slug: 'talimiy', title: "Ta'limiy", number: 2, ageGroup: AgeGroup.AGE_4_7, description: "O'rgatuvchi ko'rsatuvlar" },
  { slug: 'inglizcha', title: 'Inglizcha', number: 3, ageGroup: AgeGroup.AGE_4_7, description: "Ingliz tilidagi multfilmlar" },
];

// Ochiq test videolari (faqat demo/test uchun — production'da o'z kontentingiz bilan almashtiring)
const DEMO_PROGRAMS = [
  {
    title: '[DEMO] Big Buck Bunny (HLS)',
    videoUrl: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
    fallbackUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    streamType: StreamType.HLS,
    durationSec: 596,
    thumbnailUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/BigBuckBunny.jpg',
    ageRating: AgeGroup.ALL,
  },
  {
    title: '[DEMO] Big Buck Bunny (MP4)',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    fallbackUrl: null,
    streamType: StreamType.MP4,
    durationSec: 596,
    thumbnailUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/BigBuckBunny.jpg',
    ageRating: AgeGroup.ALL,
  },
  {
    title: '[DEMO] For Bigger Fun',
    videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerFun.mp4',
    fallbackUrl: null,
    streamType: StreamType.MP4,
    durationSec: 60,
    thumbnailUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/ForBiggerFun.jpg',
    ageRating: AgeGroup.AGE_4_7,
  },
];

async function seedRegions() {
  for (const r of REGIONS) {
    await prisma.region.upsert({ where: { code: r.code }, update: {}, create: r });
  }
  console.log(`✔ Davlatlar: ${REGIONS.length}`);
}

async function seedAdmin() {
  const email = (process.env.SEED_ADMIN_EMAIL ?? '').trim().toLowerCase();
  const password = process.env.SEED_ADMIN_PASSWORD ?? '';
  if (!email || !password) {
    console.log('⚠ SEED_ADMIN_EMAIL / SEED_ADMIN_PASSWORD berilmagan — admin yaratilmadi');
    return;
  }
  if (password.length < 10) throw new Error("SEED_ADMIN_PASSWORD kamida 10 belgi bo'lishi kerak");
  const existing = await prisma.adminUser.findUnique({ where: { email } });
  if (existing) {
    console.log(`✔ Admin mavjud: ${email}`);
    return;
  }
  await prisma.adminUser.create({
    data: {
      email,
      fullName: 'Super Admin',
      role: AdminRole.SUPER_ADMIN,
      passwordHash: await argon2.hash(password, { type: argon2.argon2id }),
    },
  });
  console.log(`✔ Super admin yaratildi: ${email}`);
}

async function seedDemo() {
  const channels = [];
  for (const c of DEMO_CHANNELS) {
    channels.push(await prisma.channel.upsert({ where: { slug: c.slug }, update: {}, create: c }));
  }

  const programs = [];
  for (const p of DEMO_PROGRAMS) {
    const found = await prisma.program.findFirst({ where: { title: p.title } });
    programs.push(found ?? (await prisma.program.create({ data: p })));
  }
  console.log(`✔ Demo kanallar: ${channels.length}, multfilmlar: ${programs.length}`);

  // Bugun (Asia/Tashkent) 00:00 dan boshlab 2 kun — dasturlar aylanma tartibda
  const from = DateTime.now().setZone('Asia/Tashkent').startOf('day').toUTC();
  const to = from.plus({ days: 2 });

  for (const [ci, channel] of channels.entries()) {
    const exists = await prisma.scheduleSlot.count({
      where: { channelId: channel.id, startsAtUtc: { lt: to.toJSDate() }, endsAtUtc: { gt: from.toJSDate() } },
    });
    if (exists > 0) {
      console.log(`• ${channel.title}: jadval allaqachon bor (${exists} slot)`);
      continue;
    }
    const rows = [];
    let cursor = from.toJSDate();
    let i = ci; // har kanal boshqa dasturdan boshlansin
    while (cursor < to.toJSDate()) {
      const p = programs[i % programs.length];
      const end = new Date(cursor.getTime() + p.durationSec * 1000);
      rows.push({ channelId: channel.id, programId: p.id, startsAtUtc: cursor, endsAtUtc: end });
      cursor = end;
      i++;
    }
    await prisma.scheduleSlot.createMany({ data: rows });
    console.log(`✔ ${channel.title}: ${rows.length} slot`);
  }
}

async function main() {
  await seedRegions();
  await seedAdmin();
  if ((process.env.SEED_DEMO_DATA ?? 'false').toLowerCase() === 'true') await seedDemo();
}

main()
  .then(() => console.log('Seed tugadi.'))
  .catch((e: Error) => {
    console.error('Seed xatosi:', e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
