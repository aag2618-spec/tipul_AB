-- prisma/sql/audit-append-only.sql
--
-- חלק ב' (מנעול) — הגנת append-only ברמת PostgreSQL על טבלאות ה-audit.
--
-- למה: עד כה ההגנה היחידה הייתה "אין endpoint למחיקה בקוד" — שלא עומדת
-- מול גישת DB ישירה / DATABASE_URL שדלף / קוד עתידי. כאן טריגר ברמת ה-DB
-- חוסם עריכה ומחיקה של שורות audit, פרט למה שמותר במכוון:
--   • מחיקה — רק של שורות מעבר לחלון ה-retention. ה-cron מוחק ב-12/24 חודש,
--     אך הטריגר מתיר מחיקה כבר מ-11/23 חודש — **buffer מכוון של חודש**: כך
--     הפרשי שעון בין now() של ה-DB ל-cutoff שמחושב ב-JS, והבדלי חשבון-חודשים
--     (setMonth מול INTERVAL סביב סוף חודש / שנה מעוברת), לעולם לא יחסמו את
--     מחיקת ה-retention הלגיטימית. ה-append-only נשמר לכל מה שצעיר מ-11/23 חודש.
--   • עדכון — רק של עמודות שרשרת החתימות (prevHash/rowHash/hashedAt), שאותן
--     ה-cron audit-chain ממלא אחרי ה-INSERT; ובאדמין גם שדות ה-undo
--     (undoable/undoExpiresAt/revertedAt/revertedById) שתוכננו לעדכון.
--
-- ⚠️ תחזוקה: כל עמודת תוכן חדשה שתתווסף למודלים האלה חייבת להתווסף לבדיקת
--    ה-IS DISTINCT FROM למטה — אחרת היא תהפוך mutable בשקט (חור append-only).
--
-- מה זה לא: הטריגר **לא נוגע במסלול ה-INSERT** — גישה ל-PHI לעולם לא נכשלת
-- בגללו. וגם — בעל ה-DATABASE_URL יכול לכבות את הטריגר; זו הגנה+עדות
-- (השרשרת תתפוס שבירה), לא חומה מוחלטת. הגנה מוחלטת דורשת WORM חיצוני.
--
-- אידמפוטנטי — בטוח להריץ שוב בכל deploy (CREATE OR REPLACE + DROP IF EXISTS).
-- מורץ מ-start:prod אחרי `prisma db push`, כך שהעמודות כבר קיימות.

-- ===== DataAccessAuditLog =====
CREATE OR REPLACE FUNCTION audit_data_access_append_only()
RETURNS trigger AS $$
BEGIN
  IF (TG_OP = 'DELETE') THEN
    -- חלון retention 24 חודש + buffer של חודש → חוסם מחיקה רק עד 23 חודש,
    -- כדי שמחיקת ה-cron (ב-24 חודש) לעולם לא תיחסם בגלל הפרשי שעון/חשבון-חודש.
    IF OLD."createdAt" >= now() - INTERVAL '23 months' THEN
      RAISE EXCEPTION
        'DataAccessAuditLog is append-only: DELETE allowed only past the retention window (~24 months)';
    END IF;
    RETURN OLD;
  ELSIF (TG_OP = 'UPDATE') THEN
    -- מתירים עדכון רק של עמודות השרשרת. כל שינוי בעמודת תוכן = חסום.
    IF ( OLD."id"          IS DISTINCT FROM NEW."id"
      OR OLD."userId"      IS DISTINCT FROM NEW."userId"
      OR OLD."userEmail"   IS DISTINCT FROM NEW."userEmail"
      OR OLD."userName"    IS DISTINCT FROM NEW."userName"
      OR OLD."recordType"  IS DISTINCT FROM NEW."recordType"
      OR OLD."recordId"    IS DISTINCT FROM NEW."recordId"
      OR OLD."action"      IS DISTINCT FROM NEW."action"
      OR OLD."clientId"    IS DISTINCT FROM NEW."clientId"
      OR OLD."ipAddress"   IS DISTINCT FROM NEW."ipAddress"
      OR OLD."userAgent"   IS DISTINCT FROM NEW."userAgent"
      OR OLD."meta"        IS DISTINCT FROM NEW."meta"
      OR OLD."createdAt"   IS DISTINCT FROM NEW."createdAt" ) THEN
      RAISE EXCEPTION
        'DataAccessAuditLog is append-only: content columns are immutable (only chain-hash columns may change)';
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_data_access_append_only ON "DataAccessAuditLog";
CREATE TRIGGER trg_data_access_append_only
  BEFORE UPDATE OR DELETE ON "DataAccessAuditLog"
  FOR EACH ROW EXECUTE FUNCTION audit_data_access_append_only();

-- ===== AdminAuditLog =====
CREATE OR REPLACE FUNCTION audit_admin_append_only()
RETURNS trigger AS $$
BEGIN
  IF (TG_OP = 'DELETE') THEN
    -- חלון retention 12 חודש + buffer של חודש → חוסם מחיקה רק עד 11 חודש,
    -- כדי שמחיקת ה-cron (ב-12 חודש) לעולם לא תיחסם בגלל הפרשי שעון/חשבון-חודש.
    IF OLD."createdAt" >= now() - INTERVAL '11 months' THEN
      RAISE EXCEPTION
        'AdminAuditLog is append-only: DELETE allowed only past the retention window (~12 months)';
    END IF;
    RETURN OLD;
  ELSIF (TG_OP = 'UPDATE') THEN
    -- מתירים עדכון רק של עמודות השרשרת + שדות ה-undo. עמודות הליבה = immutable.
    IF ( OLD."id"          IS DISTINCT FROM NEW."id"
      OR OLD."action"      IS DISTINCT FROM NEW."action"
      OR OLD."targetType"  IS DISTINCT FROM NEW."targetType"
      OR OLD."targetId"    IS DISTINCT FROM NEW."targetId"
      OR OLD."details"     IS DISTINCT FROM NEW."details"
      OR OLD."adminId"     IS DISTINCT FROM NEW."adminId"
      OR OLD."adminEmail"  IS DISTINCT FROM NEW."adminEmail"
      OR OLD."adminName"   IS DISTINCT FROM NEW."adminName"
      OR OLD."createdAt"   IS DISTINCT FROM NEW."createdAt" ) THEN
      RAISE EXCEPTION
        'AdminAuditLog is append-only: core columns are immutable (only undo/chain-hash columns may change)';
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_admin_audit_append_only ON "AdminAuditLog";
CREATE TRIGGER trg_admin_audit_append_only
  BEFORE UPDATE OR DELETE ON "AdminAuditLog"
  FOR EACH ROW EXECUTE FUNCTION audit_admin_append_only();
