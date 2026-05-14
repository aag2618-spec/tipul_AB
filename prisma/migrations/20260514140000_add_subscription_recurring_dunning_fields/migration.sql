-- Stage 2 — חיוב חוזר חודשי (Cardcom).
-- שדות נוספים ל-SubscriptionPayment עבור retry schedule נכון + dunning idempotency.
--
-- firstAttemptAt: תאריך הניסיון הראשון של הסבב הנוכחי. משמש לחישוב
--   לוח retry [1, 3, 7] relative-to-first (לא relative-to-now), כך
--   שעיכוב בין ניסיונות לא יסיט את הלוח ל-(1, 3, 9).
-- dunningSentAttempt: עוקב איזה dunning email נשלח כבר.
--   מונע duplicate email אם cron נפל בין email-send ל-DB-update.

ALTER TABLE "SubscriptionPayment"
  ADD COLUMN "firstAttemptAt" TIMESTAMP(3),
  ADD COLUMN "dunningSentAttempt" INTEGER NOT NULL DEFAULT 0;
