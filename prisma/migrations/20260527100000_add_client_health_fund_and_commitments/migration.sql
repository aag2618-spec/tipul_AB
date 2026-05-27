-- CreateEnum
CREATE TYPE "CommitmentStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CANCELLED');

-- AlterTable
ALTER TABLE "Client" ADD COLUMN "healthFund" "HealthInsurer";

-- CreateTable
CREATE TABLE "ClientCommitment" (
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

-- CreateIndex
CREATE INDEX "ClientCommitment_clientId_idx" ON "ClientCommitment"("clientId");

-- CreateIndex
CREATE INDEX "ClientCommitment_therapistId_idx" ON "ClientCommitment"("therapistId");

-- CreateIndex
CREATE INDEX "ClientCommitment_status_idx" ON "ClientCommitment"("status");

-- AddForeignKey
ALTER TABLE "ClientCommitment" ADD CONSTRAINT "ClientCommitment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientCommitment" ADD CONSTRAINT "ClientCommitment_therapistId_fkey" FOREIGN KEY ("therapistId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
