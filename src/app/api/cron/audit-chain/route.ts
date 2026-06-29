// src/app/api/cron/audit-chain/route.ts
//
// חלק ב' (שרשרת חתימות / גישה ב', 2026-06-29) — cron שמחשב ומאמת את שרשרת
// ה-hash על AdminAuditLog ו-DataAccessAuditLog.
//
// למה cron ולא טריגר INSERT: כדי **לא לגעת במסלול הרגיש**. אם החתימה הייתה
// רצה בתוך ה-INSERT, באג/contention היו עלולים להפיל רישום גישת PHI. כאן
// ה-INSERT נשאר נקי; השרשרת מחושבת מעט אחר כך, מחוץ ל-flow, וניתנת לבדיקה.
//
// יציבות הסדר (חשוב מאוד): השרשרת משורשרת בסדר (createdAt, id). createdAt הוא
// זמן תחילת ה-INSERT (לא ה-commit). כדי שלא ניצור שרשרת בסדר שגוי (ולכן
// false-positive של שבירה) משתי סיבות אפשריות:
//   1) settle window — חותמים רק שורות בנות 5+ דקות, כך שכל transaction (גם
//      withAudit שחסום ל-10ש') כבר עשה commit לפני שאנחנו מגיעים אליה.
//   2) anchor guard — חותמים **רק** שורות שמיקומן (createdAt,id) אחרי השורה
//      החתומה האחרונה (ה-anchor). שורה "מהעבר" שצצה מאוחר לעולם לא תיחתם בסדר
//      שגוי; היא נשארת לא-חתומה (פער שהאימות סובל) ומתגלה דרך התראת הפיגור.
//
// שני מצבים:
//   • ברירת מחדל — hash בלבד (זול, לכל tick של המתזמן).
//   • ?validate=1 — hash + אימות מלא + בדיקת קיום הטריגרים + פיגור; פעם ביום.

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { checkCronAuth } from "@/lib/cron-auth";
import {
  canonicalizeAdminAuditRow,
  canonicalizeDataAccessRow,
  computeRowHash,
  verifyOrderedChain,
  type HashedRow,
} from "@/lib/audit-chain";

export const dynamic = "force-dynamic";

const SETTLE_MS = 5 * 60 * 1000; // 5 דקות — חלון "התייצבות" של commit
const HASH_BATCH = 500; // שורות לכל fetch בשלב החתימה
const MAX_HASH_ROWS = 20_000; // תקרה לריצה אחת (backlog ראשוני)
const VALIDATE_PAGE = 5_000; // שורות לכל עמוד באימות
const MAX_VALIDATE_ROWS = 500_000; // תקרת בטיחות לאימות (מונע ריצה אינסופית)
const STALE_UNHASHED_MS = 60 * 60 * 1000; // שורה לא-חתומה בת שעה+ = פיגור/אנומליה

const TRIGGER_NAMES = [
  "trg_admin_audit_append_only",
  "trg_data_access_append_only",
] as const;

interface Anchor {
  rowHash: string;
  createdAt: Date;
  id: string;
}

// ─── Table adapter — מאחד את הלוגיקה הגנרית לשתי הטבלאות ────────────────────

interface ChainTableAdapter {
  name: "AdminAuditLog" | "DataAccessAuditLog";
  /** השורה החתומה האחרונה (anchor): rowHash + מיקום (createdAt,id) להמשך השרשרת. */
  findAnchor(): Promise<Anchor | null>;
  /**
   * שורות שטרם נחתמו, "התייצבו" (createdAt < settleCutoff), ו**אחרי ה-anchor**
   * בסדר (createdAt,id) — בסדר עולה. ה-anchor guard מבטיח חתימה מונוטונית.
   */
  fetchUnhashed(settleCutoff: Date, anchor: Anchor | null, take: number): Promise<{ id: string; canonical: string }[]>;
  /** ספירת שורות לא-חתומות ישנות (createdAt < staleCutoff) — לזיהוי פיגור/אנומליה. */
  countStaleUnhashed(staleCutoff: Date): Promise<number>;
  /** כתיבת ה-hash לשורה (הטריגר append-only מתיר עמודות אלה בלבד). */
  writeHash(id: string, prevHash: string | null, rowHash: string): Promise<void>;
  /** עמוד לאימות, בסדר (createdAt,id) עולה, החל אחרי cursor. */
  fetchValidatePage(cursorId: string | undefined, take: number): Promise<HashedRow[]>;
}

/** תנאי Prisma "אחרי ה-anchor בסדר (createdAt,id)" — או ריק אם אין anchor. */
function afterAnchorWhere(anchor: Anchor | null) {
  if (!anchor) return {};
  return {
    OR: [
      { createdAt: { gt: anchor.createdAt } },
      { createdAt: anchor.createdAt, id: { gt: anchor.id } },
    ],
  };
}

const dataAccessAdapter: ChainTableAdapter = {
  name: "DataAccessAuditLog",
  async findAnchor() {
    const a = await prisma.dataAccessAuditLog.findFirst({
      where: { rowHash: { not: null } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { rowHash: true, createdAt: true, id: true },
    });
    return a?.rowHash ? { rowHash: a.rowHash, createdAt: a.createdAt, id: a.id } : null;
  },
  async fetchUnhashed(settleCutoff, anchor, take) {
    const rows = await prisma.dataAccessAuditLog.findMany({
      where: { hashedAt: null, createdAt: { lt: settleCutoff }, ...afterAnchorWhere(anchor) },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take,
      select: {
        id: true, userId: true, userEmail: true, userName: true,
        recordType: true, recordId: true, action: true, clientId: true,
        ipAddress: true, userAgent: true, meta: true, createdAt: true,
      },
    });
    return rows.map((r) => ({ id: r.id, canonical: canonicalizeDataAccessRow(r) }));
  },
  async countStaleUnhashed(staleCutoff) {
    return prisma.dataAccessAuditLog.count({
      where: { hashedAt: null, createdAt: { lt: staleCutoff } },
    });
  },
  async writeHash(id, prevHash, rowHash) {
    await prisma.dataAccessAuditLog.update({
      where: { id },
      data: { prevHash, rowHash, hashedAt: new Date() },
    });
  },
  async fetchValidatePage(cursorId, take) {
    const rows = await prisma.dataAccessAuditLog.findMany({
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      select: {
        id: true, prevHash: true, rowHash: true,
        userId: true, userEmail: true, userName: true,
        recordType: true, recordId: true, action: true, clientId: true,
        ipAddress: true, userAgent: true, meta: true, createdAt: true,
      },
    });
    return rows.map((r) => ({
      id: r.id, prevHash: r.prevHash, rowHash: r.rowHash,
      canonical: canonicalizeDataAccessRow(r),
    }));
  },
};

const adminAdapter: ChainTableAdapter = {
  name: "AdminAuditLog",
  async findAnchor() {
    const a = await prisma.adminAuditLog.findFirst({
      where: { rowHash: { not: null } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: { rowHash: true, createdAt: true, id: true },
    });
    return a?.rowHash ? { rowHash: a.rowHash, createdAt: a.createdAt, id: a.id } : null;
  },
  async fetchUnhashed(settleCutoff, anchor, take) {
    const rows = await prisma.adminAuditLog.findMany({
      where: { hashedAt: null, createdAt: { lt: settleCutoff }, ...afterAnchorWhere(anchor) },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take,
      select: {
        id: true, action: true, targetType: true, targetId: true,
        details: true, adminId: true, adminEmail: true, adminName: true,
        createdAt: true,
      },
    });
    return rows.map((r) => ({ id: r.id, canonical: canonicalizeAdminAuditRow(r) }));
  },
  async countStaleUnhashed(staleCutoff) {
    return prisma.adminAuditLog.count({
      where: { hashedAt: null, createdAt: { lt: staleCutoff } },
    });
  },
  async writeHash(id, prevHash, rowHash) {
    await prisma.adminAuditLog.update({
      where: { id },
      data: { prevHash, rowHash, hashedAt: new Date() },
    });
  },
  async fetchValidatePage(cursorId, take) {
    const rows = await prisma.adminAuditLog.findMany({
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
      select: {
        id: true, prevHash: true, rowHash: true,
        action: true, targetType: true, targetId: true,
        details: true, adminId: true, adminEmail: true, adminName: true,
        createdAt: true,
      },
    });
    return rows.map((r) => ({
      id: r.id, prevHash: r.prevHash, rowHash: r.rowHash,
      canonical: canonicalizeAdminAuditRow(r),
    }));
  },
};

// ─── Hashing — חותם שורות חדשות שהתייצבו, בסדר מונוטוני אחרי ה-anchor ────────

async function hashTable(adapter: ChainTableAdapter): Promise<{ hashed: number; remaining: boolean }> {
  const settleCutoff = new Date(Date.now() - SETTLE_MS);
  const anchor = await adapter.findAnchor();
  let prevHash: string | null = anchor?.rowHash ?? null;
  let hashed = 0;

  while (hashed < MAX_HASH_ROWS) {
    const batch = await adapter.fetchUnhashed(settleCutoff, anchor, HASH_BATCH);
    if (batch.length === 0) break;

    for (const row of batch) {
      const rowHash = computeRowHash(prevHash, row.canonical);
      await adapter.writeHash(row.id, prevHash, rowHash);
      prevHash = rowHash;
      hashed++;
      if (hashed >= MAX_HASH_ROWS) break;
    }

    if (batch.length < HASH_BATCH) break;
  }

  return { hashed, remaining: hashed >= MAX_HASH_ROWS };
}

// ─── Validation — הולך על כל השרשרת בעמודים, סוחב prev חוצה-עמודים ──────────

interface ValidateResult {
  ok: boolean;
  checked: number;
  truncated: boolean;
  brokenAt?: { id: string; index: number; reason: string };
}

async function validateTable(adapter: ChainTableAdapter): Promise<ValidateResult> {
  let prev: HashedRow | null = null;
  let cursorId: string | undefined;
  let totalChecked = 0;
  let totalSeen = 0;

  while (totalSeen < MAX_VALIDATE_ROWS) {
    const page = await adapter.fetchValidatePage(cursorId, VALIDATE_PAGE);
    if (page.length === 0) break;
    totalSeen += page.length;

    const res = verifyOrderedChain(page, { initialPrev: prev });
    totalChecked += res.checked;
    if (!res.ok && res.brokenAt) {
      return { ok: false, checked: totalChecked, truncated: false, brokenAt: res.brokenAt };
    }
    prev = res.endPrev;
    cursorId = page[page.length - 1].id;

    if (page.length < VALIDATE_PAGE) break;
  }

  const truncated = totalSeen >= MAX_VALIDATE_ROWS;
  if (truncated) {
    // לא תקרה שקטה — מתעדים שהאימות לא כיסה את כל הטבלה בריצה זו.
    logger.warn("[cron audit-chain] validation truncated at cap", {
      table: adapter.name,
      cap: MAX_VALIDATE_ROWS,
    });
  }
  return { ok: true, checked: totalChecked, truncated };
}

// ─── בדיקת קיום והפעלת הטריגרים (מזהה ניטרול/הסרה של ה-append-only) ─────────

async function findMissingTriggers(): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ tgname: string; tgenabled: string }[]>`
    SELECT tgname, tgenabled::text AS tgenabled
    FROM pg_trigger
    WHERE tgname IN ('trg_admin_audit_append_only', 'trg_data_access_append_only')
      AND NOT tgisinternal
  `;
  // tgenabled='D' = disabled. נחשב "קיים ותקין" רק אם לא disabled.
  const healthy = new Set(rows.filter((r) => r.tgenabled !== "D").map((r) => r.tgname));
  return TRIGGER_NAMES.filter((n) => !healthy.has(n));
}

// ─── AdminAlert deduped ─────────────────────────────────────────────────────

async function raiseSystemAlert(
  title: string,
  message: string,
  actionRequired: string
): Promise<void> {
  const existing = await prisma.adminAlert.findFirst({
    where: { type: "SYSTEM", status: "PENDING", title },
    select: { id: true },
  });
  if (existing) return;
  await prisma.adminAlert.create({
    data: { type: "SYSTEM", priority: "URGENT", title, message, actionRequired },
  });
}

// ─── Handler ────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const guard = await checkCronAuth(req);
    if (guard) return guard;

    const doValidate = new URL(req.url).searchParams.get("validate") === "1";
    const adapters = [adminAdapter, dataAccessAdapter];
    const summary: Record<string, unknown> = { validated: doValidate };

    for (const adapter of adapters) {
      const hashResult = await hashTable(adapter);
      summary[`${adapter.name}_hashed`] = hashResult.hashed;
      summary[`${adapter.name}_hashBacklog`] = hashResult.remaining;

      if (doValidate) {
        const v = await validateTable(adapter);
        summary[`${adapter.name}_checked`] = v.checked;
        summary[`${adapter.name}_chainOk`] = v.ok;
        summary[`${adapter.name}_truncated`] = v.truncated;
        if (!v.ok && v.brokenAt) {
          summary[`${adapter.name}_brokenAt`] = v.brokenAt;
          const reasonHe =
            v.brokenAt.reason === "CONTENT_MISMATCH"
              ? "תוכן שורה שונה אחרי החתימה (עריכה)"
              : v.brokenAt.reason === "LINK_MISMATCH"
                ? "שבירת רצף — שורה נמחקה/הוזרקה באמצע השרשרת"
                : "שורה ללא חתימה במקום לא צפוי";
          await raiseSystemAlert(
            `שלמות יומן ה-audit נפגעה (${adapter.name})`,
            `אימות שרשרת החתימות נכשל בטבלה ${adapter.name}. שורה חשודה: ${v.brokenAt.id}. ` +
              `סוג השבירה: ${reasonHe}. ייתכן שמישהו עם גישת DB ישירה ערך/מחק רשומות audit. ` +
              `יש לחקור (forensics) מול גיבויים ולשקול דיווח אירוע אבטחה.`,
            "לבדוק גישות DB אחרונות, להשוות מול גיבוי, ולתעד אירוע אבטחה אם אומת."
          );
          logger.error("[cron audit-chain] CHAIN BREAK", { table: adapter.name, brokenAt: v.brokenAt });
        }

        // פיגור חתימה / אנומליה: שורה ישנה (שעה+) שעדיין לא נחתמה.
        const staleCount = await adapter.countStaleUnhashed(new Date(Date.now() - STALE_UNHASHED_MS));
        summary[`${adapter.name}_staleUnhashed`] = staleCount;
        if (staleCount > 0) {
          await raiseSystemAlert(
            `חתימת יומן ה-audit בפיגור (${adapter.name})`,
            `נמצאו ${staleCount} שורות audit בנות שעה+ שטרם נחתמו בשרשרת. ` +
              `ייתכן שה-cron audit-chain אינו רץ, או שיש אנומליית סדר (שורה שנכתבה ` +
              `עם createdAt מוקדם אחרי שכבר נחתמו שורות מאוחרות). הגנת ה-tamper-evidence ` +
              `חלקית על השורות הללו עד שייחתמו.`,
            "לוודא שהמתזמן הפנימי רץ ושה-endpoint /api/cron/audit-chain מגיב; לחקור שורות לא-חתומות."
          );
        }
      }
    }

    // בדיקת קיום והפעלת הטריגרים (רק במצב validate) — מזהה ניטרול/הסרה.
    if (doValidate) {
      const missing = await findMissingTriggers();
      summary["missingTriggers"] = missing;
      if (missing.length > 0) {
        await raiseSystemAlert(
          "טריגר ה-append-only של יומן ה-audit חסר/מנוטרל",
          `הטריגרים הבאים אינם קיימים או מנוטרלים (disabled): ${missing.join(", ")}. ` +
            `המשמעות: ההגנה שמונעת עריכה/מחיקה של רשומות audit אינה פעילה — מישהו ` +
            `הסיר/כיבה אותה, או שהתקנתה ב-deploy נכשלה בשקט.`,
          "להריץ מחדש את prisma/sql/audit-append-only.sql (deploy מחדש), ולחקור מי כיבה/הסיר."
        );
        logger.error("[cron audit-chain] append-only triggers missing/disabled", { missing });
      }
    }

    logger.info("[cron audit-chain] completed", summary);
    return NextResponse.json({ success: true, ...summary });
  } catch (error) {
    logger.error("[cron audit-chain] error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ message: "שגיאה בחישוב/אימות שרשרת ה-audit" }, { status: 500 });
  }
}
