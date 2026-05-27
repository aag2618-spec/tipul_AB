-- CreateEnum (idempotent — skip if already exists from earlier manual apply)
DO $$ BEGIN
    CREATE TYPE "CommitmentStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CANCELLED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AlterTable (idempotent)
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "healthFund" "HealthInsurer";

-- CreateTable (idempotent)
CREATE TABLE IF NOT EXISTS "ClientCommitment" (
    "id" TEXT NOT NULL,
    "commitmentNumber" TEXT,
    "form17Number" TEXT,
    "referringDoctor" TEXT,
    "referralDate" TIMESTAMP(3),
    "approvedSessions" INTEGER,
    "usedSessions" INTEGER NOT NULL DEFAULT 0,
    "copaymentAmount" DECIMAL(10,2),
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "status" "CommitmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "clientId" TEXT NOT NULL,
    "therapistId" TEXT NOT NULL,

    CONSTRAINT "ClientCommitment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (idempotent)
CREATE INDEX IF NOT EXISTS "ClientCommitment_clientId_idx" ON "ClientCommitment"("clientId");
CREATE INDEX IF NOT EXISTS "ClientCommitment_therapistId_idx" ON "ClientCommitment"("therapistId");
CREATE INDEX IF NOT EXISTS "ClientCommitment_status_idx" ON "ClientCommitment"("status");

-- AddForeignKey (idempotent)
DO $$ BEGIN
    ALTER TABLE "ClientCommitment" ADD CONSTRAINT "ClientCommitment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "ClientCommitment" ADD CONSTRAINT "ClientCommitment_therapistId_fkey" FOREIGN KEY ("therapistId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
