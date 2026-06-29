// src/lib/audit-chain.ts
// H4 (tamper-evident audit) — אימות שרשרת ה-hash של טבלאות ה-audit.
//
// השרשרת עצמה נכתבת ע"י BEFORE INSERT triggers ב-DB (prisma/sql/audit-chain.sql).
// כאן רק *מאמתים* אותה: עוברים על השורות המשורשרות לפי seq ובודקים לכל שורה
//   1. rowHash תואם לחישוב-מחדש מהשדות + prevHash (זיהוי שינוי שדה).
//   2. prevHash תואם ל-rowHash של קודמתה (זיהוי מחיקה/שחלוף שורה באמצע).
// בנוסף — השורה האחרונה חייבת להתאים ל-AuditChainHead.lastHash (זיהוי מחיקת-זנב).
//
// החישוב-מחדש נעשה דרך *אותן* פונקציות SQL שה-trigger משתמש בהן
// (audit_admin_rowhash / audit_dataaccess_rowhash) — מקור אמת יחיד לנוסחה,
// כך שאין סיכון ל-drift בין מימוש ה-trigger למימוש ה-verifier.

import "server-only";
import prisma from "@/lib/prisma";

export type AuditChainTable = "admin" | "dataaccess";

export interface ChainBreak {
  seq: string;
  reason: "row_hash_mismatch" | "chain_link_broken";
}

export interface ChainVerifyResult {
  table: AuditChainTable;
  /** false אם השרשרת עדיין לא נפרסה (עמודות/פונקציות חסרות ב-DB). */
  initialized: boolean;
  /** כמות השורות המשורשרות (rowHash IS NOT NULL). */
  chainedRows: number;
  /** השורה האחרונה תואמת ל-AuditChainHead.lastHash (זיהוי מחיקת-זנב). */
  tailMatchesHead: boolean;
  /** עד 50 השבירות הראשונות. */
  breaks: ChainBreak[];
  ok: boolean;
}

interface TableConfig {
  table: AuditChainTable;
  breaksSql: string;
  statsSql: string;
}

const ADMIN_CFG: TableConfig = {
  table: "admin",
  breaksSql: `
    WITH chained AS (
      SELECT "seq", "rowHash", "prevHash",
        audit_admin_rowhash("prevHash", "id", "action", "targetType", "targetId",
          "adminId", "adminEmail", "adminName", "details", "createdAt") AS recomputed,
        lag("rowHash") OVER (ORDER BY "seq") AS prev_row_hash,
        row_number() OVER (ORDER BY "seq") AS rn
      FROM "AdminAuditLog"
      WHERE "rowHash" IS NOT NULL
    )
    SELECT "seq"::text AS seq,
      (CASE WHEN "rowHash" <> recomputed THEN 'row_hash_mismatch'
            ELSE 'chain_link_broken' END) AS reason
    FROM chained
    WHERE "rowHash" <> recomputed
       OR (rn > 1 AND "prevHash" IS DISTINCT FROM prev_row_hash)
    ORDER BY "seq"
    LIMIT 50;`,
  statsSql: `
    SELECT
      (SELECT count(*)::int FROM "AdminAuditLog" WHERE "rowHash" IS NOT NULL) AS chained,
      (SELECT "rowHash" FROM "AdminAuditLog" WHERE "rowHash" IS NOT NULL
         ORDER BY "seq" DESC LIMIT 1) AS last_row_hash,
      (SELECT "lastHash" FROM "AuditChainHead" WHERE "chainKey" = 'admin') AS head_hash;`,
};

const DATAACCESS_CFG: TableConfig = {
  table: "dataaccess",
  breaksSql: `
    WITH chained AS (
      SELECT "seq", "rowHash", "prevHash",
        audit_dataaccess_rowhash("prevHash", "id", "userId", "userEmail", "userName",
          "recordType", "recordId", "action", "clientId", "ipAddress", "userAgent",
          "meta", "createdAt") AS recomputed,
        lag("rowHash") OVER (ORDER BY "seq") AS prev_row_hash,
        row_number() OVER (ORDER BY "seq") AS rn
      FROM "DataAccessAuditLog"
      WHERE "rowHash" IS NOT NULL
    )
    SELECT "seq"::text AS seq,
      (CASE WHEN "rowHash" <> recomputed THEN 'row_hash_mismatch'
            ELSE 'chain_link_broken' END) AS reason
    FROM chained
    WHERE "rowHash" <> recomputed
       OR (rn > 1 AND "prevHash" IS DISTINCT FROM prev_row_hash)
    ORDER BY "seq"
    LIMIT 50;`,
  statsSql: `
    SELECT
      (SELECT count(*)::int FROM "DataAccessAuditLog" WHERE "rowHash" IS NOT NULL) AS chained,
      (SELECT "rowHash" FROM "DataAccessAuditLog" WHERE "rowHash" IS NOT NULL
         ORDER BY "seq" DESC LIMIT 1) AS last_row_hash,
      (SELECT "lastHash" FROM "AuditChainHead" WHERE "chainKey" = 'dataaccess') AS head_hash;`,
};

// אם השרשרת עוד לא נפרסה (db push/SQL טרם רצו בייצור) — הפונקציות/עמודות
// חסרות. במצב כזה מחזירים initialized=false ולא "שבירה" (אין על מה להתריע).
function isNotDeployedError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /does not exist|relation .* does not exist|column .* does not exist|function .* does not exist/i.test(
    msg
  );
}

async function verifyOne(cfg: TableConfig): Promise<ChainVerifyResult> {
  try {
    const breaks = await prisma.$queryRawUnsafe<ChainBreak[]>(cfg.breaksSql);
    const stats = await prisma.$queryRawUnsafe<
      { chained: number; last_row_hash: string | null; head_hash: string | null }[]
    >(cfg.statsSql);
    const s = stats[0] ?? { chained: 0, last_row_hash: null, head_hash: null };
    const tailMatchesHead =
      s.chained === 0 ? true : s.last_row_hash === s.head_hash;
    return {
      table: cfg.table,
      initialized: true,
      chainedRows: s.chained,
      tailMatchesHead,
      breaks,
      ok: breaks.length === 0 && tailMatchesHead,
    };
  } catch (err) {
    if (isNotDeployedError(err)) {
      return {
        table: cfg.table,
        initialized: false,
        chainedRows: 0,
        tailMatchesHead: true,
        breaks: [],
        ok: true,
      };
    }
    throw err;
  }
}

export async function verifyAdminChain(): Promise<ChainVerifyResult> {
  return verifyOne(ADMIN_CFG);
}

export async function verifyDataAccessChain(): Promise<ChainVerifyResult> {
  return verifyOne(DATAACCESS_CFG);
}

export async function verifyAllAuditChains(): Promise<ChainVerifyResult[]> {
  return Promise.all([verifyAdminChain(), verifyDataAccessChain()]);
}
