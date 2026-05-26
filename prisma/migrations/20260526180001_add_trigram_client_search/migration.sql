-- Trigram search — חיפוש מהיר בשמות מטופלים בעברית
--
-- הבעיה: שאילתת `WHERE name ILIKE '%דני%'` (חיפוש בתוך מחרוזת) לא יכולה
-- להשתמש באינדקס B-tree רגיל. PostgreSQL חייב לסרוק את כל הטבלה.
--
-- הפתרון: הרחבת pg_trgm מפצלת מחרוזת ל-trigrams (3 תווים בכל פעם)
-- ויוצרת GIN index שמאפשר חיפוש substring מהיר פי מאות.
--
-- שאילתות שמואצות:
--   src/app/api/clinic-admin/clients/route.ts (חיפוש שם/אימייל/טלפון בקליניקה)
--   src/app/api/email/incoming/route.ts (איתור לקוח לפי email contains)
--   עתידי: העברת חיפוש dashboard/clients/page.tsx מצד-לקוח לצד-שרת
--
-- מבחינת אחסון: GIN trigram index שוקל ~3-5x גודל הטקסט המאונדקס.
-- עבור 100K מטופלים זה כ-30-50MB — זניח.

-- ==================== הרחבת pg_trgm ====================
-- Idempotent — לא יוצר שוב אם כבר קיים. דורש privileges של superuser
-- ב-DB לוקאלי, או הרצה מ-Supabase Dashboard / Neon / RDS UI בייצור.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ==================== Client text search (4 GIN indexes) ====================
CREATE INDEX IF NOT EXISTS "Client_name_trgm_idx"
    ON "Client" USING GIN ("name" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "Client_firstName_trgm_idx"
    ON "Client" USING GIN ("firstName" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "Client_lastName_trgm_idx"
    ON "Client" USING GIN ("lastName" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "Client_phone_trgm_idx"
    ON "Client" USING GIN ("phone" gin_trgm_ops);
