/**
 * Unit tests — /api/clients/[id]?fields=basic: חסימת שדות קליניים (PHI) למזכירה.
 *
 * חוב אבטחה (סבב 2026-06-18, וורקפלו security-review): ענף `fields === "basic"`
 * נבדק *לפני* isSecretary והריץ `prisma.client.findFirst({ where })` ללא `select`,
 * כך ש-Prisma החזיר את כל ה-scalars — כולל השדות הקליניים החסומים למזכירה
 * (CLINICAL_FIELDS_BLOCKED_FOR_SECRETARY.client). מזכירה יכלה לשלוף אותם ישירות
 * דרך ?fields=basic. התיקון: select בטוח (getClientSafeSelectForSecretary) למזכירה
 * בלבד; מטפל/בעלים מקבלים הכל כרגיל.
 *
 * הבדיקה משתמשת ב-getClientSafeSelectForSecretary/isSecretary/buildClientWhere
 * *האמיתיים* (mock רק ל-loadScopeUser ול-prisma), ו-prisma.findFirst מדמה את
 * התנהגות ה-select של Prisma (מחזיר רק את השדות שנבחרו).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import { NextRequest } from "next/server";

const requireAuth = vi.fn();
const loadScopeUser = vi.fn();
const findFirst = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: { client: { findFirst: (...a: unknown[]) => findFirst(...a) } },
}));
vi.mock("@/lib/api-auth", () => ({
  requireAuth: (...a: unknown[]) => requireAuth(...a),
}));
// scope אמיתי חוץ מ-loadScopeUser (כדי לבדוק את ה-safe-select האמיתי).
vi.mock("@/lib/scope", async (importOriginal) => {
  const actual = (await importOriginal()) as typeof import("@/lib/scope");
  return { ...actual, loadScopeUser: (...a: unknown[]) => loadScopeUser(...a) };
});
vi.mock("@/lib/audit-logger", () => ({ logDataAccess: vi.fn() }));
vi.mock("@/lib/rate-limit", () => ({ checkRateLimit: vi.fn(() => ({ allowed: true })) }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), warn: vi.fn(), info: vi.fn() },
}));

import { GET } from "../route";

// לקוח כפי שה-DB מחזיק — כולל שדות קליניים שאסורים למזכירה.
const CLIENT_FULL: Record<string, unknown> = {
  id: "client-1",
  name: "ישראל ישראלי",
  firstName: "ישראל",
  lastName: "ישראלי",
  phone: "050-0000000",
  email: "test@example.com",
  address: "רחוב הבדיקה 1",
  birthDate: null,
  status: "ACTIVE",
  healthFund: "CLALIT",
  defaultSessionPrice: null,
  // קליני — אסור שיגיע למזכירה:
  notes: "תוכן קליני סודי",
  intakeNotes: "הערות אינטייק קליניות",
  initialDiagnosis: "אבחנה ראשונית",
  medicalHistory: "היסטוריה רפואית",
  therapeuticApproaches: "גישה טיפולית",
  approachNotes: "הערות גישה",
  culturalContext: "הקשר תרבותי",
};

const CLINICAL_KEYS = [
  "notes",
  "intakeNotes",
  "initialDiagnosis",
  "medicalHistory",
  "therapeuticApproaches",
  "approachNotes",
  "culturalContext",
];

// מדמה את התנהגות ה-select של Prisma: עם select → רק השדות שנבחרו; בלי → הכל.
function mockSelectAware() {
  findFirst.mockImplementation((args: { select?: Record<string, boolean> }) => {
    if (args?.select) {
      const out: Record<string, unknown> = {};
      for (const k of Object.keys(args.select)) {
        if (args.select[k]) out[k] = CLIENT_FULL[k];
      }
      return Promise.resolve(out);
    }
    return Promise.resolve({ ...CLIENT_FULL });
  });
}

const params = { params: Promise.resolve({ id: "client-1" }) };
function callGET(): Promise<Response> {
  const req = new NextRequest(
    "https://test.local/api/clients/client-1?fields=basic"
  );
  return GET(req, params) as Promise<Response>;
}

beforeEach(() => {
  vi.resetAllMocks();
  requireAuth.mockResolvedValue({
    userId: "u1",
    originalUserId: "u1",
    isImpersonating: false,
  });
  mockSelectAware();
});

describe("GET /api/clients/[id]?fields=basic — חסימת PHI למזכירה", () => {
  it("מזכירה: לא מקבלת שדות קליניים, אך מקבלת פרטי בסיס", async () => {
    loadScopeUser.mockResolvedValue({
      id: "u1",
      clinicRole: "SECRETARY",
      organizationId: "org-1",
      role: "USER",
    });
    const res = await callGET();
    expect(res.status).toBe(200);
    const body = await res.json();
    for (const k of CLINICAL_KEYS) {
      expect(body[k]).toBeUndefined();
    }
    // פרטי בסיס שהצרכנים צריכים — חייבים להישאר.
    expect(body.name).toBe("ישראל ישראלי");
    expect(body.phone).toBe("050-0000000");
    expect(body.healthFund).toBe("CLALIT");
  });

  it("מטפל: מקבל את כל השדות כולל קליניים", async () => {
    loadScopeUser.mockResolvedValue({
      id: "u1",
      clinicRole: "THERAPIST",
      organizationId: "org-1",
      role: "USER",
    });
    const res = await callGET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.notes).toBe("תוכן קליני סודי");
    expect(body.initialDiagnosis).toBe("אבחנה ראשונית");
  });
});
