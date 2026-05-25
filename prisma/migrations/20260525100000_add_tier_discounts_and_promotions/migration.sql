-- AlterTable: הוספת שדות הנחה ל-tier_limits (IF NOT EXISTS למקרה שכבר קיימים)
ALTER TABLE "tier_limits" ADD COLUMN IF NOT EXISTS "discountQuarterly" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "tier_limits" ADD COLUMN IF NOT EXISTS "discountSemiAnnual" INTEGER NOT NULL DEFAULT 10;
ALTER TABLE "tier_limits" ADD COLUMN IF NOT EXISTS "discountAnnual" INTEGER NOT NULL DEFAULT 17;

-- CreateEnum (IF NOT EXISTS)
DO $$ BEGIN
  CREATE TYPE "PromotionTarget" AS ENUM ('NEW_SUBSCRIBERS', 'UPGRADERS', 'ALL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- CreateTable: מבצעים זמניים
CREATE TABLE IF NOT EXISTS "promotions" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "discountPercent" INTEGER NOT NULL DEFAULT 0,
    "validFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validUntil" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "targetAudience" "PromotionTarget" NOT NULL DEFAULT 'ALL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promotions_pkey" PRIMARY KEY ("id")
);
