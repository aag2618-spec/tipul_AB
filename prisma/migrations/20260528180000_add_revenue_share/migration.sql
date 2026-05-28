-- M11.G3: פיצול הכנסות לקליניקה רב-מטפלים.
-- מטפלת מקבלת אחוז מההכנסה של פגישות שלה (`User.revenueSharePct`)
-- והקליניקה לוקחת את היתרה. כש-`User.revenueSharePct` הוא NULL,
-- האחוז נלקח מ-`Organization.defaultRevenueSharePct`. אם גם זה NULL —
-- ברירת מחדל אחרונה היא 100% למטפלת (כלומר אין פיצול כלל; שומר
-- תאימות לאחור עם המצב הקיים).
--
-- idempotent (IF NOT EXISTS) — בטוח לכשל פריסה חוזרת.
-- שדות nullable בלי DEFAULT — אין צורך ב-backfill. ההגיון של ה-fallback
-- (user → org → 100) ממומש ב-helper בלבד (src/lib/clinic/revenue-share.ts),
-- כדי לאפשר שינוי מדיניות בעתיד בלי מיגרציית נתונים.

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "revenueSharePct" DECIMAL(5, 2);
ALTER TABLE "Organization" ADD COLUMN IF NOT EXISTS "defaultRevenueSharePct" DECIMAL(5, 2);
