-- M11.G3 (קומיט B): snapshot של חלק המטפל/ת בש"ח מההכנסה של פגישה,
-- בעת מעבר ה-Payment המקושר ל-PAID. nullable — null = לא בוצע snapshot
-- (פגישה לא שולמה במלואה, פגישה ישנה לפני פריסת הפיצ'ר, או מטפל/ת
-- עצמאי/ת בלי organizationId).
--
-- idempotent (IF NOT EXISTS) — בטוח לכשל פריסה חוזרת.
-- אין backfill, אין DEFAULT — דוח /clinic-admin/revenue ממשיך לחשב live
-- מההגדרות הנוכחיות; השדה משמש לעקיבות חשבונאית עתידית בלבד.

ALTER TABLE "TherapySession" ADD COLUMN IF NOT EXISTS "therapistRevenueIls" DECIMAL(10, 2);
