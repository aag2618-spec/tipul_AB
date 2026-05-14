-- Stage 4 — דף ניהול מנוי למשתמש (עדכון כרטיס + ביטול חידוש).
-- מטרה: ל-webhook (api/webhooks/cardcom/admin) יש כיום זרימה אחת לכל
-- CardcomTransaction של tenant=ADMIN. מאז שלב 4 יש 2 זרימות נוספות:
--   1) UPDATE_CARD — המשתמש עדכן את הכרטיס השמור (Operation=CreateTokenOnly,
--      amount=0, ללא subscriptionPaymentId). webhook יוצר SavedCardToken חדש
--      ומסמן את הישן isActive=false + מחבר את המנויים הפעילים לטוקן החדש.
--   2) PACKAGE_PURCHASE — שלב 5 (חבילות SMS/AI). שמור כאן כדי שלא נצטרך
--      migration נוסף בעוד יום-יומיים.
--
-- השדה purpose nullable כדי שכל הרשומות הקיימות (SUBSCRIPTION_CREATE
-- היסטוריות) יישארו null. ה-webhook מתייחס ל-null כ-SUBSCRIPTION_CREATE
-- לתאימות לאחור.

-- 1) Enum חדש
CREATE TYPE "CardcomTransactionPurpose" AS ENUM (
  'SUBSCRIPTION_CREATE',
  'UPDATE_CARD',
  'PACKAGE_PURCHASE'
);

-- 2) שדה nullable ב-CardcomTransaction
ALTER TABLE "CardcomTransaction"
  ADD COLUMN "purpose" "CardcomTransactionPurpose";
