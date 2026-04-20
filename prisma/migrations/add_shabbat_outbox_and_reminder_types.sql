-- Migration: Shabbat/Yom Tov blocking — outbox fields + new CommunicationType enum values
-- Run manually against production DB when ready:
--   psql "$DATABASE_URL" -f prisma/migrations/add_shabbat_outbox_and_reminder_types.sql
--
-- Safe to run multiple times (uses IF NOT EXISTS).
-- Additive only — no data loss.

BEGIN;

-- 1) New enum values for CommunicationType (for dedup of subscription/trial reminders)
ALTER TYPE "CommunicationType" ADD VALUE IF NOT EXISTS 'SUBSCRIPTION_REMINDER_7D';
ALTER TYPE "CommunicationType" ADD VALUE IF NOT EXISTS 'SUBSCRIPTION_REMINDER_3D';
ALTER TYPE "CommunicationType" ADD VALUE IF NOT EXISTS 'SUBSCRIPTION_REMINDER_1D';
ALTER TYPE "CommunicationType" ADD VALUE IF NOT EXISTS 'TRIAL_REMINDER_7D';
ALTER TYPE "CommunicationType" ADD VALUE IF NOT EXISTS 'TRIAL_REMINDER_3D';
ALTER TYPE "CommunicationType" ADD VALUE IF NOT EXISTS 'TRIAL_REMINDER_2D';
ALTER TYPE "CommunicationType" ADD VALUE IF NOT EXISTS 'TRIAL_EXPIRED';

-- 2) Outbox flags on TherapySession — פגישות שנוצרו בשבת/חג ושליחת הודעות נדחתה
ALTER TABLE "TherapySession"
  ADD COLUMN IF NOT EXISTS "pendingConfirmationEmail"     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "pendingConfirmationSms"       BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "pendingTherapistNotifyEmail"  BOOLEAN NOT NULL DEFAULT false;

-- 3) Index חלקי לעזור ל-cron של booking-outbox
CREATE INDEX IF NOT EXISTS "TherapySession_shabbat_outbox_idx"
  ON "TherapySession" ("id")
  WHERE "pendingConfirmationEmail" = true
     OR "pendingConfirmationSms" = true
     OR "pendingTherapistNotifyEmail" = true;

COMMIT;
