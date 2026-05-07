-- ==================== Bulk-Payment support on CardcomTransaction ====================
-- מוסיף עמודה bulkPaymentIds (text[]) שמשמשת את מסלול charge-cardcom-bulk:
-- כשהמטפל גובה תשלום מצרפי באשראי על כמה חובות בבת אחת, ה-API יוצר
-- "umbrella Payment" אחד (PENDING) שאליו מקושר ה-CardcomTransaction דרך
-- paymentId, ובנוסף שומר ב-bulkPaymentIds את ה-IDs של ה-Payments האמיתיים
-- שצריך לסמן PAID אחרי שה-webhook יאשר את התשלום.
--
-- ברירת מחדל '{}' (מערך ריק) — זרימת התשלום היחיד הקיימת לא מושפעת.

ALTER TABLE "CardcomTransaction"
  ADD COLUMN "bulkPaymentIds" TEXT[] NOT NULL DEFAULT '{}';

-- GIN index — ה-race-guard ב-charge-cardcom-bulk עושה
-- WHERE bulkPaymentIds && $1 (`hasSome`). בלי GIN, Postgres עושה Seq Scan
-- על כל הטבלה, מה שמעלה latency ב-SERIALIZABLE TX וגם מגדיל את שיעור
-- ה-conflicts. הערה: לא משתמשים ב-CONCURRENTLY כי Prisma מריץ migrations
-- בתוך transaction. אם הטבלה גדולה מאוד בעת ה-deploy, מומלץ להריץ ידנית
-- את הפקודה הזאת מחוץ ל-migration עם CONCURRENTLY ולמחוק את השורה כאן.
CREATE INDEX IF NOT EXISTS "CardcomTransaction_bulkPaymentIds_gin"
  ON "CardcomTransaction" USING GIN ("bulkPaymentIds");
