-- ==================== User: Clinic billing pause (MyTipul B) ====================
-- מוסיף 4 שדות ל-User לתמיכה ב-"הקליניקה משלמת" + השעיית מנוי אישי.
-- כל השדות nullable או עם default false — תאימות לאחור מלאה. משתמשים קיימים
-- (organizationId=null או billingPaidByClinic=false) לא מושפעים.
--
-- שימוש (לפי MyTipul-B):
--   accept invitation עם billingPaidByClinic=true:
--     subscriptionStatusBeforeClinic ← subscriptionStatus
--     subscriptionStatus ← 'PAUSED'
--     subscriptionPausedReason ← 'PAID_BY_CLINIC'
--     subscriptionPausedAt ← now
--     billingPaidByClinic ← true
--
--   הסרה מהקליניקה (DELETE /api/clinic-admin/members/[id]):
--     אם billingPaidByClinic=true ו-subscriptionPausedReason='PAID_BY_CLINIC':
--       subscriptionStatus ← subscriptionStatusBeforeClinic ?? 'TRIALING'
--       trialEndsAt ← now+30d (אם before==null = משתמש חדש שהצטרף ישירות לקליניקה)
--       האחרים → null/false
--
-- אין צורך להוסיף 'PAUSED' ל-enum SubscriptionStatus — כבר קיים (schema.prisma:251).

ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "billingPaidByClinic" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "subscriptionPausedReason" TEXT,
  ADD COLUMN IF NOT EXISTS "subscriptionPausedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "subscriptionStatusBeforeClinic" "SubscriptionStatus";
