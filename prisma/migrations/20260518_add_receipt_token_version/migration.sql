-- סבב אבטחה 8 (2026-05-18): מניעת token downgrade attack על receipts.
--
-- לפני: verifyReceiptToken קיבל גם 24 hex (96-bit legacy) וגם 32 hex (128-bit
-- חדש) לכל payment. תוקף שמצליח לפצח את 96 הביטים הראשונים של HMAC היה יכול
-- לעקוף את ההגנה של 128 הביטים על קבלות חדשות.
--
-- אחרי: כל payment שומר את גרסת ה-token שמייצר ה-receipt URL שלו.
--   v0 = 96-bit (legacy) — payments שנוצרו לפני 2026-05-17 (סבב 7 / M4).
--   v1 = 128-bit (default) — לכל payments חדשים. בלי שינוי קוד נוסף, כל
--        payment חדש מקבל v=1 ב-DB default.
--
-- Backfill: כל payments הקיימים שנוצרו לפני 2026-05-17 → v=0 (קבלות שכבר
-- נשלחו במייל ללקוחות עם token של 24 hex ימשיכו לעבוד עד ה-sunset). payments
-- מ-2026-05-17 ואילך כבר השתמשו ב-generateReceiptToken החדש (32 hex) ולכן
-- נשארים ב-default v=1.

ALTER TABLE "Payment"
  ADD COLUMN "receiptTokenVersion" INTEGER NOT NULL DEFAULT 1;

UPDATE "Payment"
  SET "receiptTokenVersion" = 0
  WHERE "createdAt" < '2026-05-17'::timestamp;
