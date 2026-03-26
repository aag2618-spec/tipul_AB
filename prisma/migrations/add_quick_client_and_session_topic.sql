-- Add isQuickClient to Client (פונה מזדמן — נוצר מהיומן עם מינימום פרטים)
ALTER TABLE "Client" ADD COLUMN "isQuickClient" BOOLEAN NOT NULL DEFAULT false;

-- Add topic to TherapySession (נושא הפגישה — חובה לפגישת ייעוץ)
ALTER TABLE "TherapySession" ADD COLUMN "topic" TEXT;
