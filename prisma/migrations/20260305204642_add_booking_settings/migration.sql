-- AlterEnum: Add PENDING_APPROVAL to SessionStatus
ALTER TYPE "SessionStatus" ADD VALUE 'PENDING_APPROVAL';

-- AlterEnum: Add BOOKING_REQUEST to NotificationType
ALTER TYPE "NotificationType" ADD VALUE 'BOOKING_REQUEST';

-- CreateTable: BookingSettings
CREATE TABLE "BookingSettings" (
    "id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "slug" TEXT NOT NULL,
    "workingHours" JSONB NOT NULL DEFAULT '{}',
    "breaks" JSONB NOT NULL DEFAULT '[]',
    "sessionDuration" INTEGER NOT NULL DEFAULT 50,
    "bufferBetween" INTEGER NOT NULL DEFAULT 10,
    "maxAdvanceDays" INTEGER NOT NULL DEFAULT 30,
    "minAdvanceHours" INTEGER NOT NULL DEFAULT 24,
    "requireApproval" BOOLEAN NOT NULL DEFAULT true,
    "welcomeMessage" TEXT,
    "confirmationMessage" TEXT,
    "defaultSessionType" "SessionType" NOT NULL DEFAULT 'IN_PERSON',
    "defaultPrice" DECIMAL(10,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "therapistId" TEXT NOT NULL,

    CONSTRAINT "BookingSettings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BookingSettings_slug_key" ON "BookingSettings"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "BookingSettings_therapistId_key" ON "BookingSettings"("therapistId");

-- AddForeignKey
ALTER TABLE "BookingSettings" ADD CONSTRAINT "BookingSettings_therapistId_fkey" FOREIGN KEY ("therapistId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
