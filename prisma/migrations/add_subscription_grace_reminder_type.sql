-- Migration: ערך enum חדש ל-CommunicationType עבור dedup של תזכורת תקופת חסד.
-- ה-deploy מחיל זאת אוטומטית דרך `prisma db push` (קורא מ-schema.prisma).
-- הקובץ הזה הוא גיבוי להרצה ידנית:
--   psql "$DATABASE_URL" -f prisma/migrations/add_subscription_grace_reminder_type.sql
--
-- בטוח להרצה חוזרת (IF NOT EXISTS). אדיטיבי בלבד — אין אובדן מידע.

ALTER TYPE "CommunicationType" ADD VALUE IF NOT EXISTS 'SUBSCRIPTION_GRACE';
