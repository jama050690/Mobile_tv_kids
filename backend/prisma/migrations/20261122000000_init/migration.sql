-- Kids TV — boshlang'ich migratsiya
-- Barcha vaqt ustunlari TIMESTAMPTZ (UTC).

-- CreateEnum
CREATE TYPE "AgeGroup" AS ENUM ('AGE_0_3', 'AGE_4_7', 'AGE_8_12', 'ALL');

-- CreateEnum
CREATE TYPE "StreamType" AS ENUM ('HLS', 'MP4');

-- CreateEnum
CREATE TYPE "SlotStatus" AS ENUM ('SCHEDULED', 'LIVE', 'ENDED');

-- CreateEnum
CREATE TYPE "UrlHealth" AS ENUM ('UNKNOWN', 'OK', 'BROKEN');

-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('SUPER_ADMIN', 'CONTENT_MANAGER');

-- CreateTable
CREATE TABLE "channels" (
    "id" UUID NOT NULL,
    "title" VARCHAR(120) NOT NULL,
    "slug" VARCHAR(80) NOT NULL,
    "number" INTEGER NOT NULL,
    "description" VARCHAR(500),
    "logo_url" VARCHAR(2048),
    "age_group" "AgeGroup" NOT NULL DEFAULT 'ALL',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "channels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "programs" (
    "id" UUID NOT NULL,
    "title" VARCHAR(200) NOT NULL,
    "description" VARCHAR(2000),
    "video_url" VARCHAR(2048) NOT NULL,
    "fallback_url" VARCHAR(2048),
    "stream_type" "StreamType" NOT NULL,
    "is_live_stream" BOOLEAN NOT NULL DEFAULT false,
    "duration_sec" INTEGER NOT NULL,
    "thumbnail_url" VARCHAR(2048),
    "age_rating" "AgeGroup" NOT NULL DEFAULT 'ALL',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "url_status" "UrlHealth" NOT NULL DEFAULT 'UNKNOWN',
    "url_error" VARCHAR(500),
    "url_checked_at" TIMESTAMPTZ(3),
    "fallback_url_status" "UrlHealth" NOT NULL DEFAULT 'UNKNOWN',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "programs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "schedule_slots" (
    "id" UUID NOT NULL,
    "channel_id" UUID NOT NULL,
    "program_id" UUID NOT NULL,
    "starts_at_utc" TIMESTAMPTZ(3) NOT NULL,
    "ends_at_utc" TIMESTAMPTZ(3) NOT NULL,
    "status" "SlotStatus" NOT NULL DEFAULT 'SCHEDULED',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "schedule_slots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "regions" (
    "code" VARCHAR(2) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "default_timezone" VARCHAR(64) NOT NULL,
    "timezones" TEXT[],
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "regions_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "admin_users" (
    "id" UUID NOT NULL,
    "email" VARCHAR(200) NOT NULL,
    "password_hash" TEXT NOT NULL,
    "full_name" VARCHAR(120),
    "role" "AdminRole" NOT NULL DEFAULT 'CONTENT_MANAGER',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "last_login_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "admin_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" UUID NOT NULL,
    "admin_id" UUID NOT NULL,
    "token_hash" VARCHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(3) NOT NULL,
    "revoked_at" TIMESTAMPTZ(3),
    "user_agent" VARCHAR(300),
    "ip" VARCHAR(64),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "channels_slug_key" ON "channels"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "channels_number_key" ON "channels"("number");

-- CreateIndex
CREATE INDEX "channels_is_active_number_idx" ON "channels"("is_active", "number");

-- CreateIndex
CREATE INDEX "programs_is_active_idx" ON "programs"("is_active");

-- CreateIndex
CREATE INDEX "programs_url_status_idx" ON "programs"("url_status");

-- CreateIndex
CREATE INDEX "schedule_slots_channel_id_starts_at_utc_idx" ON "schedule_slots"("channel_id", "starts_at_utc");

-- CreateIndex
CREATE INDEX "schedule_slots_channel_id_ends_at_utc_idx" ON "schedule_slots"("channel_id", "ends_at_utc");

-- CreateIndex
CREATE INDEX "schedule_slots_program_id_idx" ON "schedule_slots"("program_id");

-- CreateIndex
CREATE INDEX "schedule_slots_status_ends_at_utc_idx" ON "schedule_slots"("status", "ends_at_utc");

-- CreateIndex
CREATE UNIQUE INDEX "admin_users_email_key" ON "admin_users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_admin_id_idx" ON "refresh_tokens"("admin_id");

-- AddForeignKey
ALTER TABLE "schedule_slots" ADD CONSTRAINT "schedule_slots_channel_id_fkey" FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "schedule_slots" ADD CONSTRAINT "schedule_slots_program_id_fkey" FOREIGN KEY ("program_id") REFERENCES "programs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_admin_id_fkey" FOREIGN KEY ("admin_id") REFERENCES "admin_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- =====================================================================
-- Qo'shimcha himoya (Prisma sxemasida ifodalab bo'lmaydi)
-- =====================================================================

-- Slot boshlanishi tugashidan oldin bo'lishi shart
ALTER TABLE "schedule_slots"
    ADD CONSTRAINT "schedule_slots_time_order_chk" CHECK ("ends_at_utc" > "starts_at_utc");

-- Davomiylik musbat bo'lishi shart
ALTER TABLE "programs"
    ADD CONSTRAINT "programs_duration_positive_chk" CHECK ("duration_sec" > 0);

-- Bitta kanalda vaqt oraliqlari ustma-ust tushishi DB darajasida taqiqlanadi.
-- '[)' — yarim ochiq oraliq: 10:00-10:30 va 10:30-11:00 to'qnashmaydi.
CREATE EXTENSION IF NOT EXISTS btree_gist;

ALTER TABLE "schedule_slots"
    ADD CONSTRAINT "schedule_slots_no_overlap"
    EXCLUDE USING gist (
        "channel_id" WITH =,
        tstzrange("starts_at_utc", "ends_at_utc", '[)') WITH &&
    );
