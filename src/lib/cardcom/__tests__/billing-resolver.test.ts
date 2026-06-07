// ==================== Unit Tests: resolveCardcomBilling ====================
// בודק את ניתוב הכסף ב-resolveCardcomBilling — איזה מסוף Cardcom גובה את
// המטופל. ניתוב שגוי = כסף אמיתי לחשבון הלא נכון, ולכן הכיסוי כאן מפורט.
//
// מתמקד בשני באגים שתוקנו (אחרי commit 80cf7ff7 "סליקה נפרדת לכל מטפל"):
//   BUG 1 — fallback ל-User.organizationId הפך חיוב legacy חסום (תשלום עם
//           organizationId=null) לחיוב דרך בעל הקליניקה. legacy חייב להישאר
//           זהה ל-resolver המקורי שהשתמש רק ב-organizationId שהועבר.
//   BUG 2 — כשל בשליפת המשתמש השאיר mode=null (legacy) → מטפל/ת שהוגדר/ה
//           CLINIC ושיש לו/ה מסוף פרטי נוּתב/ה למסוף הפרטי במקום לבעל הקליניקה.
//           עכשיו fail-closed: כשל בשליפה → null (חסימה).
//
// Setup: vi.mock("@/lib/prisma") — לא דורש DATABASE_URL.

import { describe, it, expect, beforeEach, vi } from "vitest";

// ─── Prisma mock ─────────────────────────────────────────────────────────
const userFindUnique = vi.fn();
const billingProviderFindFirst = vi.fn();
const organizationFindUnique = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    user: { findUnique: (...a: unknown[]) => userFindUnique(...a) },
    billingProvider: {
      findFirst: (...a: unknown[]) => billingProviderFindFirst(...a),
    },
    organization: {
      findUnique: (...a: unknown[]) => organizationFindUnique(...a),
    },
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { resolveCardcomBilling } from "@/lib/cardcom/billing-resolver";

// ─── עולם בזיכרון ──────────────────────────────────────────────────────────
// מתאר את מצב ה-DB לכל בדיקה: מי המשתמשים, למי יש מסוף פעיל/לא-פעיל, ואילו
// ארגונים קיימים. `userThrows`/`orgThrows` מדמים כשל DB בשליפה הספציפית.
type UserRow = {
  clinicBillingMode: string | null;
  organizationId: string | null;
};
interface World {
  users?: Record<string, UserRow>;
  userThrows?: string[];
  activeTerminals?: string[];
  inactiveTerminals?: string[];
  orgs?: Record<string, { ownerUserId: string }>;
  orgThrows?: string[];
}

function installWorld(w: World) {
  const userThrows = new Set(w.userThrows ?? []);
  const orgThrows = new Set(w.orgThrows ?? []);
  const active = new Set(w.activeTerminals ?? []);
  const inactive = new Set(w.inactiveTerminals ?? []);

  userFindUnique.mockImplementation((args: { where: { id: string } }) => {
    const id = args.where.id;
    if (userThrows.has(id)) {
      return Promise.reject(new Error("user lookup db error"));
    }
    return Promise.resolve(w.users?.[id] ?? null);
  });

  // hasActiveCardcom משתמש ב-isActive:true; hasInactiveCardcom ב-isActive:false.
  billingProviderFindFirst.mockImplementation(
    (args: { where: { userId: string; isActive: boolean } }) => {
      const { userId, isActive } = args.where;
      const set = isActive ? active : inactive;
      return Promise.resolve(set.has(userId) ? { id: `bp-${userId}` } : null);
    },
  );

  organizationFindUnique.mockImplementation((args: { where: { id: string } }) => {
    const id = args.where.id;
    if (orgThrows.has(id)) {
      return Promise.reject(new Error("org lookup db error"));
    }
    return Promise.resolve(w.orgs?.[id] ?? null);
  });
}

beforeEach(() => {
  vi.resetAllMocks();
});

// ─── מטפל/ת עצמאי/ת (ללא ארגון) ─────────────────────────────────────────────
describe("solo — ללא organization", () => {
  it("עם מסוף פעיל → גובה דרך המסוף של המטפל/ת", async () => {
    installWorld({
      users: { t1: { clinicBillingMode: null, organizationId: null } },
      activeTerminals: ["t1"],
    });
    expect(await resolveCardcomBilling("t1", null)).toEqual({
      cardcomOwnerUserId: "t1",
      intendedUserId: "t1",
      fellbackToOrgOwner: false,
    });
  });

  it("בלי מסוף → null", async () => {
    installWorld({
      users: { t1: { clinicBillingMode: null, organizationId: null } },
    });
    expect(await resolveCardcomBilling("t1", null)).toBeNull();
  });
});

// ─── legacy (mode=null) — חייב להישאר זהה ל-resolver המקורי ──────────────────
describe("legacy (mode=null) עם organizationId מועבר", () => {
  it("מסוף פרטי קיים → המסוף הפרטי, ללא fallback", async () => {
    installWorld({
      users: { t1: { clinicBillingMode: null, organizationId: "org1" } },
      activeTerminals: ["t1", "owner1"],
      orgs: { org1: { ownerUserId: "owner1" } },
    });
    expect(await resolveCardcomBilling("t1", "org1")).toEqual({
      cardcomOwnerUserId: "t1",
      intendedUserId: "t1",
      fellbackToOrgOwner: false,
    });
  });

  it("אין מסוף פרטי + לבעלים יש → fallback לבעל הקליניקה", async () => {
    installWorld({
      users: { t1: { clinicBillingMode: null, organizationId: "org1" } },
      activeTerminals: ["owner1"],
      orgs: { org1: { ownerUserId: "owner1" } },
    });
    expect(await resolveCardcomBilling("t1", "org1")).toEqual({
      cardcomOwnerUserId: "owner1",
      intendedUserId: "t1",
      fellbackToOrgOwner: true,
    });
  });

  it("אין מסוף לאף אחד → null", async () => {
    installWorld({
      users: { t1: { clinicBillingMode: null, organizationId: "org1" } },
      orgs: { org1: { ownerUserId: "owner1" } },
    });
    expect(await resolveCardcomBilling("t1", "org1")).toBeNull();
  });

  it("הבעלים גובה את עצמו (intended===owner) → המסוף שלו, fellback=false", async () => {
    installWorld({
      users: { owner1: { clinicBillingMode: null, organizationId: "org1" } },
      activeTerminals: ["owner1"],
      orgs: { org1: { ownerUserId: "owner1" } },
    });
    expect(await resolveCardcomBilling("owner1", "org1")).toEqual({
      cardcomOwnerUserId: "owner1",
      intendedUserId: "owner1",
      fellbackToOrgOwner: false,
    });
  });
});

// ─── BUG 1 — legacy עם תשלום organizationId=null אסור שינותב לבעל הקליניקה ────
describe("BUG 1 — legacy + תשלום organizationId=null", () => {
  it("מטפל/ת בקליניקה, אין מסוף פרטי, תשלום org=null → null (נחסם כמו במקור, לא לבעלים)", async () => {
    // המטפל/ת שייך/ת ל-org1 (User.organizationId), אבל רשומת התשלום נשמרה עם
    // organizationId=null (נתון legacy). לפני התיקון: orgId נפל ל-org1 והכסף
    // נותב ל-owner1. אחרי התיקון: legacy משתמש רק ב-org שהועבר → solo → null.
    installWorld({
      users: { t1: { clinicBillingMode: null, organizationId: "org1" } },
      activeTerminals: ["owner1"],
      orgs: { org1: { ownerUserId: "owner1" } },
    });
    expect(await resolveCardcomBilling("t1", null)).toBeNull();
  });

  it("יש מסוף פרטי, תשלום org=null → המסוף הפרטי (solo, ללא שינוי)", async () => {
    installWorld({
      users: { t1: { clinicBillingMode: null, organizationId: "org1" } },
      activeTerminals: ["t1"],
      orgs: { org1: { ownerUserId: "owner1" } },
    });
    expect(await resolveCardcomBilling("t1", null)).toEqual({
      cardcomOwnerUserId: "t1",
      intendedUserId: "t1",
      fellbackToOrgOwner: false,
    });
  });
});

// ─── BUG 2 — כשל בשליפת המשתמש = חסימה (fail-closed) ─────────────────────────
describe("BUG 2 — כשל בשליפת המשתמש", () => {
  it("השליפה נכשלת + למטפל/ת יש מסוף פרטי → null (לא מנותב למסוף הפרטי)", async () => {
    // התרחיש המסוכן: המטפל/ת באמת CLINIC אבל השליפה נכשלה → mode נקרא null.
    // לפני התיקון: branch ה-legacy נתב את הכסף ל-t1 (המסוף הפרטי). אחרי
    // התיקון: fail-closed → null, ושום כסף לא מנותב על בסיס מידע חסר.
    installWorld({
      userThrows: ["t1"],
      activeTerminals: ["t1", "owner1"],
      orgs: { org1: { ownerUserId: "owner1" } },
    });
    expect(await resolveCardcomBilling("t1", "org1")).toBeNull();
  });

  it("השליפה נכשלת ללא org → null", async () => {
    installWorld({ userThrows: ["t1"], activeTerminals: ["t1"] });
    expect(await resolveCardcomBilling("t1", null)).toBeNull();
  });

  it("user===null (לא נמצא, ללא חריגה) → נחשב legacy ולא נחסם", async () => {
    // user לא קיים אבל אין חריגה — שליפה תקינה שהחזירה null. זה לא כשל ולכן
    // לא חוסמים: ממשיכים כ-legacy בדיוק כמו ה-resolver המקורי (שלא שלף משתמש).
    installWorld({ users: {}, activeTerminals: ["t1"] });
    expect(await resolveCardcomBilling("t1", "org1")).toEqual({
      cardcomOwnerUserId: "t1",
      intendedUserId: "t1",
      fellbackToOrgOwner: false,
    });
  });
});

// ─── OWN — מסוף פרטי או חסימה, ללא fallback לקליניקה ─────────────────────────
describe("OWN", () => {
  it("עם מסוף פרטי → המסוף הפרטי", async () => {
    installWorld({
      users: { t1: { clinicBillingMode: "OWN", organizationId: "org1" } },
      activeTerminals: ["t1", "owner1"],
      orgs: { org1: { ownerUserId: "owner1" } },
    });
    expect(await resolveCardcomBilling("t1", "org1")).toEqual({
      cardcomOwnerUserId: "t1",
      intendedUserId: "t1",
      fellbackToOrgOwner: false,
    });
  });

  it("בלי מסוף פרטי → null (גם אם לבעל הקליניקה יש מסוף)", async () => {
    installWorld({
      users: { t1: { clinicBillingMode: "OWN", organizationId: "org1" } },
      activeTerminals: ["owner1"],
      orgs: { org1: { ownerUserId: "owner1" } },
    });
    expect(await resolveCardcomBilling("t1", "org1")).toBeNull();
  });
});

// ─── CLINIC — תמיד בעל הקליניקה ──────────────────────────────────────────────
describe("CLINIC", () => {
  it("גם כשלמטפל/ת יש מסוף פרטי → גובה דרך בעל הקליניקה", async () => {
    installWorld({
      users: { t1: { clinicBillingMode: "CLINIC", organizationId: "org1" } },
      activeTerminals: ["t1", "owner1"],
      orgs: { org1: { ownerUserId: "owner1" } },
    });
    expect(await resolveCardcomBilling("t1", "org1")).toEqual({
      cardcomOwnerUserId: "owner1",
      intendedUserId: "t1",
      fellbackToOrgOwner: true,
    });
  });

  it("תשלום org=null → נופל ל-User.organizationId ועדיין מנתב לבעלים (פלבק מפורש נשמר אחרי BUG 1)", async () => {
    installWorld({
      users: { t1: { clinicBillingMode: "CLINIC", organizationId: "org1" } },
      activeTerminals: ["t1", "owner1"],
      orgs: { org1: { ownerUserId: "owner1" } },
    });
    expect(await resolveCardcomBilling("t1", null)).toEqual({
      cardcomOwnerUserId: "owner1",
      intendedUserId: "t1",
      fellbackToOrgOwner: true,
    });
  });

  it("לבעל הקליניקה אין מסוף פעיל → null (לעולם לא נופל למסוף הפרטי של המטפל/ת)", async () => {
    installWorld({
      users: { t1: { clinicBillingMode: "CLINIC", organizationId: "org1" } },
      activeTerminals: ["t1"], // למטפל/ת יש מסוף, לבעלים אין — CLINIC עדיין חוסם
      orgs: { org1: { ownerUserId: "owner1" } },
    });
    expect(await resolveCardcomBilling("t1", "org1")).toBeNull();
  });
});

// ─── fail-closed בשליפת הארגון (כשל DB / ארגון לא קיים) ──────────────────────
// הגעה לשליפת הארגון קורית רק אחרי שבדיקת המסוף הפרטי של המטפל/ת נכשלה
// (legacy ללא מסוף, או CLINIC). בשני מצבי הכשל מחזירים null — לא מנחשים מסוף.
describe("שליפת הארגון נכשלת / ארגון לא נמצא", () => {
  it("שליפת הארגון זורקת (DB error) → null", async () => {
    installWorld({
      users: { t1: { clinicBillingMode: null, organizationId: "org1" } },
      orgThrows: ["org1"], // למטפל/ת אין מסוף פרטי → מגיעים לשליפת הארגון
    });
    expect(await resolveCardcomBilling("t1", "org1")).toBeNull();
  });

  it("הארגון לא נמצא (organization_not_found) → null", async () => {
    installWorld({
      users: { t1: { clinicBillingMode: null, organizationId: "org1" } },
      orgs: {}, // org1 לא קיים → org === null
    });
    expect(await resolveCardcomBilling("t1", "org1")).toBeNull();
  });
});
