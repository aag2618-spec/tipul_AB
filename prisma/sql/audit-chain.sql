-- H4 — Tamper-evident audit chain (Phase 1: detection only).
--
-- מוסיף "שרשרת חותמות" (hash-chain) לשתי טבלאות ה-audit:
--   • AdminAuditLog      (chainKey = 'admin')
--   • DataAccessAuditLog (chainKey = 'dataaccess')
--
-- כל שורה חדשה מקבלת:
--   seq      — מספר רץ בשרשרת (lastSeq+1, נשמר ב-AuditChainHead).
--   prevHash — ה-rowHash של השורה הקודמת.
--   rowHash  — sha256(prevHash + השדות המהותיים של השורה).
-- כך שינוי/מחיקה של שורה באמצע שובר את החוליות והאימות מזהה זאת.
--
-- בטיחות מרבית (קריטי): כל החישוב ב-BEFORE INSERT trigger עטוף ב-EXCEPTION
-- handler. אם משהו נכשל (pgcrypto חסר, באג) — השורה נכתבת *בלי* שרשור
-- (rowHash=NULL) ולא נחסמת. זה חיוני כי withAudit עוטף פעולות אמיתיות
-- (חיוב/חסימה) באותה טרנזקציה — כשל ב-trigger אסור שיגלגל פעולה אמיתית.
--
-- אידמפוטנטי לחלוטין — מיועד להרצה בכל deploy מ-start:prod (prisma db execute).
-- ה-db push (שרץ לפניו ב-start:prod) כבר הוסיף את העמודות seq/prevHash/rowHash
-- ואת טבלת AuditChainHead, כך שהן קיימות כשהסקריפט הזה רץ.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── פונקציות חישוב ה-hash (מקור אמת יחיד — גם ה-trigger וגם ה-verifier קוראים להן) ──
-- IMMUTABLE + LANGUAGE sql כדי שניתן יהיה לקרוא להן גם בשאילתת האימות.
-- COALESCE לכל שדה (לא NULL) + מפריד E'\x1f' (Unit Separator) שלא יופיע בתוכן,
-- כדי שצירוף השדות יהיה חד-משמעי. p_prev אף פעם לא NULL ('GENESIS' או hash).

CREATE OR REPLACE FUNCTION audit_admin_rowhash(
  p_prev        text,
  p_id          text,
  p_action      text,
  p_target_type text,
  p_target_id   text,
  p_admin_id    text,
  p_admin_email text,
  p_admin_name  text,
  p_details     text,
  p_created     timestamp
) RETURNS text AS $$
  SELECT encode(digest(
    concat_ws(E'\x1f',
      p_prev,
      COALESCE(p_id, ''),
      COALESCE(p_action, ''),
      COALESCE(p_target_type, ''),
      COALESCE(p_target_id, ''),
      COALESCE(p_admin_id, ''),
      COALESCE(p_admin_email, ''),
      COALESCE(p_admin_name, ''),
      COALESCE(p_details, ''),
      COALESCE(to_char(p_created, 'YYYY-MM-DD"T"HH24:MI:SS.US'), '')
    ),
    'sha256'
  ), 'hex');
$$ LANGUAGE sql IMMUTABLE;

CREATE OR REPLACE FUNCTION audit_dataaccess_rowhash(
  p_prev        text,
  p_id          text,
  p_user_id     text,
  p_user_email  text,
  p_user_name   text,
  p_record_type text,
  p_record_id   text,
  p_action      text,
  p_client_id   text,
  p_ip          text,
  p_user_agent  text,
  p_meta        text,
  p_created     timestamp
) RETURNS text AS $$
  SELECT encode(digest(
    concat_ws(E'\x1f',
      p_prev,
      COALESCE(p_id, ''),
      COALESCE(p_user_id, ''),
      COALESCE(p_user_email, ''),
      COALESCE(p_user_name, ''),
      COALESCE(p_record_type, ''),
      COALESCE(p_record_id, ''),
      COALESCE(p_action, ''),
      COALESCE(p_client_id, ''),
      COALESCE(p_ip, ''),
      COALESCE(p_user_agent, ''),
      COALESCE(p_meta, ''),
      COALESCE(to_char(p_created, 'YYYY-MM-DD"T"HH24:MI:SS.US'), '')
    ),
    'sha256'
  ), 'hex');
$$ LANGUAGE sql IMMUTABLE;

-- ── trigger: AdminAuditLog ──
-- מקביליות: ה-UPDATE על AuditChainHead נועל את שורת הראש (לא SELECT-ואז-UPDATE,
-- כדי שלא נקרא snapshot ישן תחת Serializable). RETURNING מחזיר אטומית את ה-seq
-- החדש ואת ה-lastHash הישן (=prevHash). תחת READ COMMITTED כותב מקביל ממתין
-- וקורא את הערך העדכני (שרשרת תקינה). תחת Serializable התנגשות → serialization
-- error שנתפס למטה ⇒ שורה לא-משורשרת (rowHash=NULL), בלי לחסום את ה-insert.
-- ה-verifier מתעלם משורות לא-משורשרות, ולכן אין "שבירה" כוזבת.
CREATE OR REPLACE FUNCTION audit_admin_chain() RETURNS trigger AS $$
DECLARE
  v_seq  bigint;
  v_prev text;
BEGIN
  -- אם כבר משורשר (backfill ידני) — לא לדרוס.
  IF NEW."rowHash" IS NOT NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO "AuditChainHead" ("chainKey", "lastSeq", "lastHash", "updatedAt")
    VALUES ('admin', 0, 'GENESIS', now())
    ON CONFLICT ("chainKey") DO NOTHING;

  -- אטומי: מגדיל seq, נועל את השורה, ומחזיר seq חדש + lastHash הישן (=prevHash).
  UPDATE "AuditChainHead"
    SET "lastSeq" = "lastSeq" + 1, "updatedAt" = now()
    WHERE "chainKey" = 'admin'
    RETURNING "lastSeq", "lastHash" INTO v_seq, v_prev;

  NEW."seq"      := v_seq;
  NEW."prevHash" := v_prev;
  NEW."rowHash"  := audit_admin_rowhash(
    v_prev, NEW."id", NEW."action", NEW."targetType", NEW."targetId",
    NEW."adminId", NEW."adminEmail", NEW."adminName", NEW."details", NEW."createdAt"
  );

  UPDATE "AuditChainHead"
    SET "lastHash" = NEW."rowHash"
    WHERE "chainKey" = 'admin';

  RETURN NEW;
EXCEPTION
  WHEN serialization_failure OR deadlock_detected THEN
    -- התנגשות תחת Serializable (כתיבות אדמין מקבילות דרך withAudit): זורקים
    -- מחדש כדי שה-retry של withAudit (40001/40P01) ינסה שוב ויסגור את החוליה.
    -- בלי זה היינו כותבים שורה לא-משורשרת בשקט — חור בכיסוי ה-tamper-evidence
    -- דווקא בפעולות הכסף/חסימה. (כותבים רגילים ב-READ COMMITTED לא מגיעים לכאן —
    -- ה-UPDATE שם ממתין על הנעילה במקום להתנגש.)
    RAISE;
  WHEN OTHERS THEN
    -- כשל אמיתי (pgcrypto חסר/באג) — אסור לחסום את ה-insert. השורה נכתבת בלי
    -- שרשור (השינויים ל-AuditChainHead מתגלגלים ע"י savepoint של plpgsql);
    -- ה-verifier מתעלם משורות rowHash IS NULL ⇒ אין "שבירה" כוזבת.
    NEW."seq"      := NULL;
    NEW."prevHash" := NULL;
    NEW."rowHash"  := NULL;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_admin_chain_trg ON "AdminAuditLog";
CREATE TRIGGER audit_admin_chain_trg
  BEFORE INSERT ON "AdminAuditLog"
  FOR EACH ROW EXECUTE FUNCTION audit_admin_chain();

-- ── trigger: DataAccessAuditLog ──
-- אותו דפוס כמו audit_admin_chain (UPDATE ... RETURNING אטומי).
CREATE OR REPLACE FUNCTION audit_dataaccess_chain() RETURNS trigger AS $$
DECLARE
  v_seq  bigint;
  v_prev text;
BEGIN
  IF NEW."rowHash" IS NOT NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO "AuditChainHead" ("chainKey", "lastSeq", "lastHash", "updatedAt")
    VALUES ('dataaccess', 0, 'GENESIS', now())
    ON CONFLICT ("chainKey") DO NOTHING;

  UPDATE "AuditChainHead"
    SET "lastSeq" = "lastSeq" + 1, "updatedAt" = now()
    WHERE "chainKey" = 'dataaccess'
    RETURNING "lastSeq", "lastHash" INTO v_seq, v_prev;

  NEW."seq"      := v_seq;
  NEW."prevHash" := v_prev;
  NEW."rowHash"  := audit_dataaccess_rowhash(
    v_prev, NEW."id", NEW."userId", NEW."userEmail", NEW."userName",
    NEW."recordType", NEW."recordId", NEW."action", NEW."clientId",
    NEW."ipAddress", NEW."userAgent", NEW."meta", NEW."createdAt"
  );

  UPDATE "AuditChainHead"
    SET "lastHash" = NEW."rowHash"
    WHERE "chainKey" = 'dataaccess';

  RETURN NEW;
EXCEPTION
  WHEN serialization_failure OR deadlock_detected THEN
    RAISE; -- כמו ב-admin: זורקים מחדש לטובת retry; לא לכתוב שורה לא-עקבית.
  WHEN OTHERS THEN
    NEW."seq"      := NULL;
    NEW."prevHash" := NULL;
    NEW."rowHash"  := NULL;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_dataaccess_chain_trg ON "DataAccessAuditLog";
CREATE TRIGGER audit_dataaccess_chain_trg
  BEFORE INSERT ON "DataAccessAuditLog"
  FOR EACH ROW EXECUTE FUNCTION audit_dataaccess_chain();
