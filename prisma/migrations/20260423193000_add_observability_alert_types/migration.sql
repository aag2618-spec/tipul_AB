-- Stage 1.15 — Observability: 3 ערכים חדשים ל-AdminAlertType
-- כבר קיימים ב-schema.prisma (שורות 237-239), לא היו ב-migrations
-- CREDIT_CONSUMPTION_FAILED     — consumeSms/AI נכשל (quota exhausted / retry exhausted)
-- IDEMPOTENCY_REPLAY_OF_FAILURE — replay של failure ב-withIdempotency
-- SERIALIZATION_RETRY_EXHAUSTED — retry על 40001/40P01 ב-withAudit נכשל

-- Postgres דורש ALTER TYPE ADD VALUE, ולא ניתן להריץ את זה בתוך טרנזקציה
-- בשילוב ALTER אחר — לכן כל ערך בפקודה נפרדת.
-- IF NOT EXISTS חשוב: מאפשר רה-הרצה בטוחה (למשל אם הערך כבר קיים ב-DB).

ALTER TYPE "AdminAlertType" ADD VALUE IF NOT EXISTS 'CREDIT_CONSUMPTION_FAILED';
ALTER TYPE "AdminAlertType" ADD VALUE IF NOT EXISTS 'IDEMPOTENCY_REPLAY_OF_FAILURE';
ALTER TYPE "AdminAlertType" ADD VALUE IF NOT EXISTS 'SERIALIZATION_RETRY_EXHAUSTED';
