-- Migration: Add BillingProvider model and update CommunicationSetting

-- 1. Create BillingProviderType enum
CREATE TYPE "BillingProviderType" AS ENUM (
  'MESHULAM',
  'ICOUNT',
  'GREEN_INVOICE',
  'SUMIT',
  'PAYPLUS',
  'CARDCOM',
  'TRANZILA'
);

-- 2. Create BillingProvider table
CREATE TABLE "BillingProvider" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "provider" "BillingProviderType" NOT NULL,
  "displayName" TEXT NOT NULL,
  "apiKey" TEXT NOT NULL,
  "apiSecret" TEXT,
  "webhookSecret" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "isPrimary" BOOLEAN NOT NULL DEFAULT false,
  "settings" JSONB,
  "lastSyncAt" TIMESTAMP(3),
  "lastError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "userId" TEXT NOT NULL,
  CONSTRAINT "BillingProvider_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- 3. Create indexes
CREATE INDEX "BillingProvider_userId_idx" ON "BillingProvider"("userId");
CREATE INDEX "BillingProvider_provider_idx" ON "BillingProvider"("provider");
CREATE INDEX "BillingProvider_userId_isPrimary_idx" ON "BillingProvider"("userId", "isPrimary");

-- 4. Add new fields to CommunicationSetting
ALTER TABLE "CommunicationSetting"
ADD COLUMN IF NOT EXISTS "sendReceiptToClient" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN IF NOT EXISTS "sendReceiptToTherapist" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN IF NOT EXISTS "receiptEmailTemplate" TEXT;

-- Success message
COMMENT ON TABLE "BillingProvider" IS 'Stores encrypted billing provider credentials for each therapist';
