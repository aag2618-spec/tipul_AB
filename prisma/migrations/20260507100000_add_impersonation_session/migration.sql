-- ==================== ImpersonationSession Migration ====================
-- מאפשר ל-OWNER של קליניקה להיכנס "כעין" THERAPIST/SECRETARY של אותה
-- קליניקה לצורך ביקורת בלבד. הפעולות מתבצעות תחת זהות ה-target ב-data-scope,
-- אבל נרשמות ב-AdminAuditLog עם metadata שמזהה את ה-OWNER.
--
-- מגבלות:
--   1. impersonation אחד פעיל בלבד ל-OWNER (partial unique index).
--   2. 4 שעות מקסימום — auto-stop ב-lazy check בכל קריאה ל-API.
--   3. ADMIN/OWNER אינם target חוקי (נאכף בשרת, לא ב-DB).
--
-- nullable + defaults — תאימות לאחור מלאה. אין שינוי במשתמשים קיימים.

-- ==================== 1. Table ImpersonationSession ====================
CREATE TABLE IF NOT EXISTS "ImpersonationSession" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "impersonatorId" TEXT NOT NULL,
  "targetUserId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "endedAt" TIMESTAMP(3),
  "endedReason" TEXT,
  "impersonatorNameSnapshot" TEXT NOT NULL,
  "targetNameSnapshot" TEXT NOT NULL,
  "ipAddress" TEXT,
  "userAgent" TEXT,

  CONSTRAINT "ImpersonationSession_pkey" PRIMARY KEY ("id")
);

-- ==================== 2. Indexes ====================
CREATE INDEX IF NOT EXISTS "ImpersonationSession_organizationId_startedAt_idx"
  ON "ImpersonationSession"("organizationId", "startedAt");

CREATE INDEX IF NOT EXISTS "ImpersonationSession_impersonatorId_startedAt_idx"
  ON "ImpersonationSession"("impersonatorId", "startedAt");

CREATE INDEX IF NOT EXISTS "ImpersonationSession_targetUserId_startedAt_idx"
  ON "ImpersonationSession"("targetUserId", "startedAt");

-- ==================== 3. Partial Unique Index ====================
-- אוכף "סשן פעיל אחד בלבד ל-OWNER":
--   רק שורות עם endedAt IS NULL מובאות בחשבון לאיכוף ה-uniqueness.
--   Prisma לא תומך ב-partial unique index ב-schema, ולכן ידני כאן.
CREATE UNIQUE INDEX IF NOT EXISTS "ImpersonationSession_one_active_per_impersonator"
  ON "ImpersonationSession"("impersonatorId")
  WHERE "endedAt" IS NULL;

-- ==================== 4. Foreign Keys ====================
ALTER TABLE "ImpersonationSession"
  ADD CONSTRAINT "ImpersonationSession_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ImpersonationSession"
  ADD CONSTRAINT "ImpersonationSession_impersonatorId_fkey"
  FOREIGN KEY ("impersonatorId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ImpersonationSession"
  ADD CONSTRAINT "ImpersonationSession_targetUserId_fkey"
  FOREIGN KEY ("targetUserId") REFERENCES "User"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
