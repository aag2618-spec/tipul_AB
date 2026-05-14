-- Stage 0: תשתית תמחור גמישה למנויי Cardcom
-- מוסיף:
--   1) enum PricingScope
--   2) טבלאות PricingPolicy + PackagePricingPolicy
--   3) שדות dunning ל-SubscriptionPayment (chargeAttempts, lastChargeError, lastAttemptAt)
--   4) שדות תקרה ל-CustomContract (customMaxTherapists, customMaxSecretaries)
--   5) אינדקסים נדרשים לביצועי resolve + cron חודשי

-- ========== 1) enum PricingScope ==========
CREATE TYPE "PricingScope" AS ENUM ('GLOBAL', 'ORGANIZATION', 'CLINIC_MEMBER', 'USER');

-- ========== 2a) טבלת PricingPolicy ==========
CREATE TABLE "PricingPolicy" (
    "id"             TEXT NOT NULL,
    "scope"          "PricingScope" NOT NULL,
    "organizationId" TEXT,
    "userId"         TEXT,
    "planTier"       "AITier" NOT NULL,
    "monthlyIls"     DECIMAL(10,2) NOT NULL,
    "quarterlyIls"   DECIMAL(10,2),
    "halfYearIls"    DECIMAL(10,2),
    "yearlyIls"      DECIMAL(10,2),
    "validFrom"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil"     TIMESTAMP(3),
    "notes"          TEXT,
    "createdById"    TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PricingPolicy_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PricingPolicy_scope_planTier_validFrom_validUntil_idx"
    ON "PricingPolicy"("scope", "planTier", "validFrom", "validUntil");
CREATE INDEX "PricingPolicy_organizationId_planTier_idx"
    ON "PricingPolicy"("organizationId", "planTier");
CREATE INDEX "PricingPolicy_userId_planTier_idx"
    ON "PricingPolicy"("userId", "planTier");

ALTER TABLE "PricingPolicy"
    ADD CONSTRAINT "PricingPolicy_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- FK ל-organizationId/userId: מחיקת קליניקה/משתמש מוחקת את ה-policies שמטרגטות אותם.
-- (createdBy נשאר עם SetNull לאודיט; אבל policy לקליניקה שכבר נמחקה אין לה משמעות.)
ALTER TABLE "PricingPolicy"
    ADD CONSTRAINT "PricingPolicy_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PricingPolicy"
    ADD CONSTRAINT "PricingPolicy_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

-- CHECK constraint: ה-IDs חייבים להיות עקביים עם ה-scope.
-- מונע policies יתומים שיגרמו לסינון שקט ב-resolver.
ALTER TABLE "PricingPolicy"
    ADD CONSTRAINT "PricingPolicy_scope_ids_chk"
    CHECK (
      (scope = 'GLOBAL' AND "organizationId" IS NULL AND "userId" IS NULL) OR
      (scope = 'ORGANIZATION' AND "organizationId" IS NOT NULL AND "userId" IS NULL) OR
      (scope = 'CLINIC_MEMBER' AND "organizationId" IS NOT NULL AND "userId" IS NOT NULL) OR
      (scope = 'USER' AND "organizationId" IS NULL AND "userId" IS NOT NULL)
    );

-- ========== 2b) טבלת PackagePricingPolicy ==========
CREATE TABLE "PackagePricingPolicy" (
    "id"             TEXT NOT NULL,
    "scope"          "PricingScope" NOT NULL,
    "organizationId" TEXT,
    "userId"         TEXT,
    "packageType"    "PackageType" NOT NULL,
    "credits"        INTEGER NOT NULL,
    "priceIls"       DECIMAL(10,2) NOT NULL,
    "validFrom"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil"     TIMESTAMP(3),
    "notes"          TEXT,
    "createdById"    TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PackagePricingPolicy_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PackagePricingPolicy_scope_packageType_credits_idx"
    ON "PackagePricingPolicy"("scope", "packageType", "credits", "validFrom", "validUntil");
CREATE INDEX "PackagePricingPolicy_organizationId_packageType_idx"
    ON "PackagePricingPolicy"("organizationId", "packageType");
CREATE INDEX "PackagePricingPolicy_userId_packageType_idx"
    ON "PackagePricingPolicy"("userId", "packageType");

ALTER TABLE "PackagePricingPolicy"
    ADD CONSTRAINT "PackagePricingPolicy_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PackagePricingPolicy"
    ADD CONSTRAINT "PackagePricingPolicy_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "Organization"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PackagePricingPolicy"
    ADD CONSTRAINT "PackagePricingPolicy_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PackagePricingPolicy"
    ADD CONSTRAINT "PackagePricingPolicy_scope_ids_chk"
    CHECK (
      (scope = 'GLOBAL' AND "organizationId" IS NULL AND "userId" IS NULL) OR
      (scope = 'ORGANIZATION' AND "organizationId" IS NOT NULL AND "userId" IS NULL) OR
      (scope = 'CLINIC_MEMBER' AND "organizationId" IS NOT NULL AND "userId" IS NOT NULL) OR
      (scope = 'USER' AND "organizationId" IS NULL AND "userId" IS NOT NULL)
    );

-- ========== 3) שדות dunning ל-SubscriptionPayment ==========
ALTER TABLE "SubscriptionPayment"
    ADD COLUMN "chargeAttempts"  INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN "lastChargeError" TEXT,
    ADD COLUMN "lastAttemptAt"   TIMESTAMP(3);

-- אינדקסים לקרון החודשי: סינון מהיר של מי שצריך חיוב חוזר
CREATE INDEX "SubscriptionPayment_autoChargeEnabled_nextChargeAt_idx"
    ON "SubscriptionPayment"("autoChargeEnabled", "nextChargeAt");
CREATE INDEX "SubscriptionPayment_status_nextChargeAt_idx"
    ON "SubscriptionPayment"("status", "nextChargeAt");

-- ========== 4) שדות תקרה ל-CustomContract ==========
ALTER TABLE "CustomContract"
    ADD COLUMN "customMaxTherapists"  INTEGER,
    ADD COLUMN "customMaxSecretaries" INTEGER;
