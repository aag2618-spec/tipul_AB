-- ==================== Clinic Multi-Tenancy Migration ====================
-- מוסיף תמיכה בקליניקות רב-מטפלים: Organization, ClinicPricingPlan, CustomContract,
-- OrgSmsUsage, TherapistDeparture, ClientDepartureChoice, ClientTransferLog.
-- כל השדות נוספים nullable + ברירת מחדל null — תאימות לאחור מלאה.
-- משתמשים קיימים (organizationId=null) ימשיכו לעבוד כאילו שום דבר לא השתנה.

-- ==================== 1. הרחבת Role enum ====================
-- ALTER TYPE ADD VALUE — PostgreSQL 12+ מאפשר שילוב באותה טרנזקציה.
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'CLINIC_OWNER';
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'CLINIC_SECRETARY';

-- ==================== 2. Enums חדשים ====================
DO $$ BEGIN
  CREATE TYPE "ClinicRole" AS ENUM ('OWNER', 'THERAPIST', 'SECRETARY');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "DepartureStatus" AS ENUM ('PENDING', 'COMPLETED', 'CANCELLED');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "DepartureChoice" AS ENUM ('UNDECIDED', 'STAY_WITH_CLINIC', 'FOLLOW_THERAPIST');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- ==================== 3. ClinicPricingPlan ====================
-- אדמין יוצר ועורך מ-/admin/pricing/clinic-plans.
-- חייב לקדום את Organization כי Organization.pricingPlanId נדרש.
CREATE TABLE IF NOT EXISTS "ClinicPricingPlan" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "internalCode" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "isDefault" BOOLEAN NOT NULL DEFAULT false,
  "baseFeeIls" DECIMAL(10,2) NOT NULL,
  "includedTherapists" INTEGER NOT NULL DEFAULT 1,
  "perTherapistFeeIls" DECIMAL(10,2) NOT NULL,
  "volumeDiscountAtCount" INTEGER,
  "perTherapistAtVolumeIls" DECIMAL(10,2),
  "freeSecretaries" INTEGER NOT NULL DEFAULT 3,
  "perSecretaryFeeIls" DECIMAL(10,2),
  "smsQuotaPerMonth" INTEGER NOT NULL DEFAULT 500,
  "aiTierIncluded" "AITier",
  "aiAddonDiscountPercent" INTEGER,
  "maxTherapists" INTEGER,
  "maxSecretaries" INTEGER,
  "description" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ClinicPricingPlan_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ClinicPricingPlan_name_key" ON "ClinicPricingPlan"("name");
CREATE UNIQUE INDEX IF NOT EXISTS "ClinicPricingPlan_internalCode_key" ON "ClinicPricingPlan"("internalCode");

-- ==================== 4. Organization ====================
CREATE TABLE IF NOT EXISTS "Organization" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "businessIdNumber" TEXT,
  "businessName" TEXT,
  "businessAddress" TEXT,
  "businessPhone" TEXT,
  "logoUrl" TEXT,
  "ownerUserId" TEXT NOT NULL,
  "ownerIsTherapist" BOOLEAN NOT NULL DEFAULT false,
  "pricingPlanId" TEXT NOT NULL,
  "aiTier" "AITier" NOT NULL DEFAULT 'ESSENTIAL',
  "subscriptionStatus" "SubscriptionStatus" NOT NULL DEFAULT 'TRIALING',
  "subscriptionStartedAt" TIMESTAMP(3),
  "subscriptionEndsAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Organization_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Organization_ownerUserId_key" ON "Organization"("ownerUserId");
CREATE INDEX IF NOT EXISTS "Organization_ownerUserId_idx" ON "Organization"("ownerUserId");
CREATE INDEX IF NOT EXISTS "Organization_subscriptionStatus_subscriptionEndsAt_idx" ON "Organization"("subscriptionStatus", "subscriptionEndsAt");
CREATE INDEX IF NOT EXISTS "Organization_pricingPlanId_idx" ON "Organization"("pricingPlanId");

-- ==================== 5. CustomContract ====================
CREATE TABLE IF NOT EXISTS "CustomContract" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "monthlyEquivPriceIls" DECIMAL(10,2) NOT NULL,
  "billingCycleMonths" INTEGER NOT NULL DEFAULT 1,
  "customSmsQuota" INTEGER,
  "customAiTier" "AITier",
  "startDate" TIMESTAMP(3) NOT NULL,
  "endDate" TIMESTAMP(3) NOT NULL,
  "autoRenew" BOOLEAN NOT NULL DEFAULT false,
  "renewalMonths" INTEGER NOT NULL DEFAULT 12,
  "annualIncreasePct" DECIMAL(5,2),
  "signedDocumentUrl" TEXT,
  "notes" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CustomContract_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CustomContract_organizationId_key" ON "CustomContract"("organizationId");
CREATE INDEX IF NOT EXISTS "CustomContract_endDate_autoRenew_idx" ON "CustomContract"("endDate", "autoRenew");
CREATE INDEX IF NOT EXISTS "CustomContract_createdById_idx" ON "CustomContract"("createdById");

-- ==================== 6. OrgSmsUsage ====================
CREATE TABLE IF NOT EXISTS "OrgSmsUsage" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "month" INTEGER NOT NULL,
  "year" INTEGER NOT NULL,
  "smsCount" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "OrgSmsUsage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "OrgSmsUsage_organizationId_year_month_key" ON "OrgSmsUsage"("organizationId", "year", "month");
CREATE INDEX IF NOT EXISTS "OrgSmsUsage_organizationId_year_month_idx" ON "OrgSmsUsage"("organizationId", "year", "month");

-- ==================== 7. TherapistDeparture ====================
CREATE TABLE IF NOT EXISTS "TherapistDeparture" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "departingTherapistId" TEXT NOT NULL,
  "status" "DepartureStatus" NOT NULL DEFAULT 'PENDING',
  "decisionDeadline" TIMESTAMP(3) NOT NULL,
  "reason" TEXT,
  "initiatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "completedAt" TIMESTAMP(3),
  CONSTRAINT "TherapistDeparture_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "TherapistDeparture_organizationId_status_idx" ON "TherapistDeparture"("organizationId", "status");
CREATE INDEX IF NOT EXISTS "TherapistDeparture_decisionDeadline_idx" ON "TherapistDeparture"("decisionDeadline");
CREATE INDEX IF NOT EXISTS "TherapistDeparture_departingTherapistId_idx" ON "TherapistDeparture"("departingTherapistId");

-- ==================== 8. ClientDepartureChoice ====================
CREATE TABLE IF NOT EXISTS "ClientDepartureChoice" (
  "id" TEXT NOT NULL,
  "departureId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "choice" "DepartureChoice" NOT NULL DEFAULT 'UNDECIDED',
  "decidedAt" TIMESTAMP(3),
  "decisionToken" TEXT NOT NULL,
  "ipAddress" TEXT,
  CONSTRAINT "ClientDepartureChoice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ClientDepartureChoice_decisionToken_key" ON "ClientDepartureChoice"("decisionToken");
CREATE UNIQUE INDEX IF NOT EXISTS "ClientDepartureChoice_departureId_clientId_key" ON "ClientDepartureChoice"("departureId", "clientId");
CREATE INDEX IF NOT EXISTS "ClientDepartureChoice_decisionToken_idx" ON "ClientDepartureChoice"("decisionToken");
CREATE INDEX IF NOT EXISTS "ClientDepartureChoice_clientId_idx" ON "ClientDepartureChoice"("clientId");

-- ==================== 9. ClientTransferLog ====================
CREATE TABLE IF NOT EXISTS "ClientTransferLog" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "fromTherapistId" TEXT NOT NULL,
  "toTherapistId" TEXT NOT NULL,
  "performedById" TEXT NOT NULL,
  "reason" TEXT,
  "fromTherapistNameSnapshot" TEXT NOT NULL,
  "toTherapistNameSnapshot" TEXT NOT NULL,
  "performedByNameSnapshot" TEXT NOT NULL,
  "transferredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClientTransferLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ClientTransferLog_organizationId_transferredAt_idx" ON "ClientTransferLog"("organizationId", "transferredAt");
CREATE INDEX IF NOT EXISTS "ClientTransferLog_clientId_transferredAt_idx" ON "ClientTransferLog"("clientId", "transferredAt");
CREATE INDEX IF NOT EXISTS "ClientTransferLog_performedById_idx" ON "ClientTransferLog"("performedById");

-- ==================== 10. שדות חדשים בטבלאות קיימות ====================
-- כולם nullable. שינוי לא שובר תאימות.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "clinicRole" "ClinicRole";
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "secretaryPermissions" JSONB;

ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "TherapySession" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "ConsentForm" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "QuestionnaireResponse" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "IntakeResponse" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "CommunicationLog" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "SessionAnalysis" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;
ALTER TABLE "QuestionnaireAnalysis" ADD COLUMN IF NOT EXISTS "organizationId" TEXT;

-- ==================== 11. Indexes על שדות חדשים בטבלאות קיימות ====================
CREATE INDEX IF NOT EXISTS "Client_organizationId_idx" ON "Client"("organizationId");
CREATE INDEX IF NOT EXISTS "Client_organizationId_therapistId_idx" ON "Client"("organizationId", "therapistId");
CREATE INDEX IF NOT EXISTS "TherapySession_organizationId_idx" ON "TherapySession"("organizationId");
CREATE INDEX IF NOT EXISTS "TherapySession_organizationId_startTime_idx" ON "TherapySession"("organizationId", "startTime");
CREATE INDEX IF NOT EXISTS "Payment_organizationId_idx" ON "Payment"("organizationId");
CREATE INDEX IF NOT EXISTS "Document_organizationId_idx" ON "Document"("organizationId");
CREATE INDEX IF NOT EXISTS "ConsentForm_organizationId_idx" ON "ConsentForm"("organizationId");
CREATE INDEX IF NOT EXISTS "QuestionnaireResponse_organizationId_idx" ON "QuestionnaireResponse"("organizationId");
CREATE INDEX IF NOT EXISTS "IntakeResponse_organizationId_idx" ON "IntakeResponse"("organizationId");
CREATE INDEX IF NOT EXISTS "CommunicationLog_organizationId_idx" ON "CommunicationLog"("organizationId");
CREATE INDEX IF NOT EXISTS "SessionAnalysis_organizationId_idx" ON "SessionAnalysis"("organizationId");
CREATE INDEX IF NOT EXISTS "QuestionnaireAnalysis_organizationId_idx" ON "QuestionnaireAnalysis"("organizationId");

-- ==================== 12. Foreign Keys ====================
-- Organization → ClinicPricingPlan (Restrict — לא ניתן למחוק תוכנית בשימוש)
DO $$ BEGIN
  ALTER TABLE "Organization" ADD CONSTRAINT "Organization_pricingPlanId_fkey"
    FOREIGN KEY ("pricingPlanId") REFERENCES "ClinicPricingPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Organization.owner → User (Restrict)
DO $$ BEGIN
  ALTER TABLE "Organization" ADD CONSTRAINT "Organization_ownerUserId_fkey"
    FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- User.organization → Organization (SetNull — מטפל יכול לעזוב ארגון)
DO $$ BEGIN
  ALTER TABLE "User" ADD CONSTRAINT "User_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CustomContract.organization (Cascade)
DO $$ BEGIN
  ALTER TABLE "CustomContract" ADD CONSTRAINT "CustomContract_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- CustomContract.createdBy (Restrict)
DO $$ BEGIN
  ALTER TABLE "CustomContract" ADD CONSTRAINT "CustomContract_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- OrgSmsUsage.organization (Cascade)
DO $$ BEGIN
  ALTER TABLE "OrgSmsUsage" ADD CONSTRAINT "OrgSmsUsage_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- TherapistDeparture.organization (Cascade)
DO $$ BEGIN
  ALTER TABLE "TherapistDeparture" ADD CONSTRAINT "TherapistDeparture_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- TherapistDeparture.departingTherapist (Cascade)
DO $$ BEGIN
  ALTER TABLE "TherapistDeparture" ADD CONSTRAINT "TherapistDeparture_departingTherapistId_fkey"
    FOREIGN KEY ("departingTherapistId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ClientDepartureChoice.departure (Cascade)
DO $$ BEGIN
  ALTER TABLE "ClientDepartureChoice" ADD CONSTRAINT "ClientDepartureChoice_departureId_fkey"
    FOREIGN KEY ("departureId") REFERENCES "TherapistDeparture"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ClientDepartureChoice.client (Cascade) — מחיקת מטופל מסירה גם את בחירותיו
DO $$ BEGIN
  ALTER TABLE "ClientDepartureChoice" ADD CONSTRAINT "ClientDepartureChoice_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ClientTransferLog.organization (Cascade)
DO $$ BEGIN
  ALTER TABLE "ClientTransferLog" ADD CONSTRAINT "ClientTransferLog_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ClientTransferLog.performedBy (Restrict)
DO $$ BEGIN
  ALTER TABLE "ClientTransferLog" ADD CONSTRAINT "ClientTransferLog_performedById_fkey"
    FOREIGN KEY ("performedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Client.organization (SetNull)
DO $$ BEGIN
  ALTER TABLE "Client" ADD CONSTRAINT "Client_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- TherapySession.organization (SetNull)
DO $$ BEGIN
  ALTER TABLE "TherapySession" ADD CONSTRAINT "TherapySession_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Payment.organization (SetNull)
DO $$ BEGIN
  ALTER TABLE "Payment" ADD CONSTRAINT "Payment_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ==================== הערה: Document/ConsentForm/QuestionnaireResponse/IntakeResponse/
-- CommunicationLog/SessionAnalysis/QuestionnaireAnalysis קיבלו רק שדה organizationId
-- (FK bareback בלי relation בסכמה ובלי FK CONSTRAINT). זה מכוון: שמירת גמישות,
-- מפחית עומס בכתיבה. אכיפה ברמת אפליקציה דרך src/lib/scope.ts.
