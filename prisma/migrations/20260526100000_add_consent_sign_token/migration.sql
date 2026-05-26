-- AlterTable
ALTER TABLE "ConsentForm" ADD COLUMN "signToken" VARCHAR(32);
ALTER TABLE "ConsentForm" ADD COLUMN "signTokenExpiresAt" TIMESTAMP(3);

-- CreateIndex
CREATE UNIQUE INDEX "ConsentForm_signToken_key" ON "ConsentForm"("signToken");
