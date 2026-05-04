-- ==================== Clinic Invitations Migration (MyTipul A) ====================
-- מערכת הזמנות לקליניקה: בעל/ת קליניקה יוצר/ת invitation עם email,
-- המוזמן/ת מקבל/ת קישור (NEXTAUTH_URL/invite/{token}) ולחיצה מפעילה
-- accept שמקשר/ת את ה-User לארגון.
--
-- nullable + defaults — תאימות לאחור מלאה. אין שינוי במשתמשים קיימים.

-- ==================== 1. enum InvitationStatus ====================
DO $$ BEGIN
  CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'EXPIRED', 'REVOKED', 'REJECTED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ==================== 2. Table ClinicInvitation ====================
CREATE TABLE IF NOT EXISTS "ClinicInvitation" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "phone" TEXT,
  "intendedName" TEXT,
  "clinicRole" "ClinicRole" NOT NULL,
  "billingPaidByClinic" BOOLEAN NOT NULL DEFAULT true,
  "secretaryPermissions" JSONB,
  "token" TEXT NOT NULL,
  "smsOtpHash" TEXT,
  "smsOtpAttempts" INTEGER NOT NULL DEFAULT 0,
  "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
  "createdById" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "acceptedAt" TIMESTAMP(3),
  "acceptedByUserId" TEXT,
  "revokedAt" TIMESTAMP(3),
  "revokedById" TEXT,
  "lastResentAt" TIMESTAMP(3),

  CONSTRAINT "ClinicInvitation_pkey" PRIMARY KEY ("id")
);

-- ==================== 3. Indexes ====================
CREATE UNIQUE INDEX IF NOT EXISTS "ClinicInvitation_token_key" ON "ClinicInvitation"("token");
CREATE INDEX IF NOT EXISTS "ClinicInvitation_organizationId_status_idx" ON "ClinicInvitation"("organizationId", "status");
CREATE INDEX IF NOT EXISTS "ClinicInvitation_email_status_idx" ON "ClinicInvitation"("email", "status");
CREATE INDEX IF NOT EXISTS "ClinicInvitation_expiresAt_idx" ON "ClinicInvitation"("expiresAt");
-- @unique על token יוצר אינדקס Postgres אוטומטי — אין צורך בכפול.

-- ==================== 4. Foreign Keys ====================
ALTER TABLE "ClinicInvitation"
  ADD CONSTRAINT "ClinicInvitation_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
