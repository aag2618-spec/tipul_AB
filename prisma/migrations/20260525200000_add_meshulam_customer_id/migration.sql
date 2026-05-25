-- AlterTable: הוספת שדה meshulamCustomerId ל-User (anti-IDOR binding)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "meshulamCustomerId" TEXT;

-- CreateIndex: unique constraint — כל customerId של Meshulam מקושר ל-user יחיד
CREATE UNIQUE INDEX IF NOT EXISTS "User_meshulamCustomerId_key" ON "User"("meshulamCustomerId");
