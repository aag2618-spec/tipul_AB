-- AlterTable: הוספת שדות הנחה ל-tier_limits
ALTER TABLE "tier_limits" ADD COLUMN "discountQuarterly" INTEGER NOT NULL DEFAULT 5;
ALTER TABLE "tier_limits" ADD COLUMN "discountSemiAnnual" INTEGER NOT NULL DEFAULT 10;
ALTER TABLE "tier_limits" ADD COLUMN "discountAnnual" INTEGER NOT NULL DEFAULT 17;

-- CreateEnum
CREATE TYPE "PromotionTarget" AS ENUM ('NEW_SUBSCRIBERS', 'UPGRADERS', 'ALL');

-- CreateTable: מבצעים זמניים
CREATE TABLE "promotions" (
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
