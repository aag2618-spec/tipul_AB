/**
 * Unit tests — /api/sessions/[id]: סינון תוכן קליני (topic/notes) מהתגובה למזכירה.
 *
 * חוב אבטחה (חוק זכויות החולה): GET/PUT/PATCH שלפו את הפגישה עם Prisma `include`,
 * ש-מחזיר את **כל ה-scalars** — כולל topic/notes, שני שדות קליניים חסומים למזכירה
 * (CLINICAL_FIELDS_BLOCKED_FOR_SECRETARY.session). לא הוצגו ב-UI אבל נשלחו ב-JSON.
 * הדפוס הנכון (סינון אחרי include) קיים ב-/api/sessions/calendar; כאן הוא הוחל גם
 * על שלושת ה-endpoints של [id].
 *
 * הקריטי: מזכירה לא מקבלת topic/notes — אך כן מקבלת roomId/location
 * (אדמיניסטרטיביים, נדרשים לבורר החדר). מטפל מקבל הכל כרגיל.
 *
 * ה-handlers כבדים (auth + scope + DB + email/sms/calendar). כל התלויות
 * החיצוניות ממוקמקות; הבדיקה מפעילה את ה-handler ב-boundary עם happy-path מינימלי.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const requireAuth = vi.fn();
const loadScopeUser = vi.fn();
const isSecretary = vi.fn();
const findFirst = vi.fn();
const update = vi.fn();
const findUnique = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    therapySession: {
      findFirst: (...a: unknown[]) => findFirst(...a),
      update: (...a: unknown[]) => update(...a),
      findUnique: (...a: unknown[]) => findUnique(...a),
    },
  },
}));
vi.mock("@/lib/api-auth", () => ({
  requireAuth: (...a: unknown[]) => requireAuth(...a),
}));
vi.mock("@/lib/scope", () => ({
  loadScopeUser: (...a: unknown[]) => loadScopeUser(...a),
  isSecretary: (...a: unknown[]) => isSecretary(...a),
  buildSessionWhere: () => ({}),
  secretaryCan: () => true,
}));
vi.mock("@/lib/payment-service", () => ({ createPaymentForSession: vi.fn() }));
vi.mock("@/lib/payment-utils", () => ({ calculatePaidAmount: () => 0 }));
vi.mock("@/lib/resend", () => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/email-utils", () => ({ escapeHtml: (s: string) => s }));
vi.mock("@/lib/sms", () => ({ sendSMSIfEnabled: vi.fn() }));
vi.mock("@/lib/date-utils", () => ({ parseIsraelTime: (s: string) => new Date(s) }));
vi.mock("@/lib/session-overlap", () => ({
  findClinicLocationConflict: vi.fn(),
  buildClinicConflictMessage: vi.fn(),
}));
vi.mock("@/lib/commitments", () => ({ copayApplies: vi.fn() }));
vi.mock("@/lib/google-calendar-sync", () => ({
  syncSessionUpdateToGoogleCalendar: vi.fn(),
  syncSessionDeletionToGoogleCalendar: vi.fn(),
}));
vi.mock("@/lib/audit-logger", () => ({ logDataAccess: vi.fn() }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { GET, PUT, PATCH } from "../route";

type NReq = import("next/server").NextRequest;
const params = { params: Promise.resolve({ id: "session-1" }) };

async function callGET(): Promise<Response> {
  const req = new Request("https://test.local/api/sessions/session-1", {
    method: "GET",
  }) as unknown as NReq;
  const r = await GET(req, params);
  if (!r) throw new Error("GET returned undefined");
  return r as Response;
}

async function callPUT(body: unknown): Promise<Response> {
  const req = new Request("https://test.local/api/sessions/session-1", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NReq;
  const r = await PUT(req, params);
  if (!r) throw new Error("PUT returned undefined");
  return r as Response;
}

async function callPATCH(body: unknown): Promise<Response> {
  const req = new Request("https://test.local/api/sessions/session-1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NReq;
  const r = await PATCH(req, params);
  if (!r) throw new Error("PATCH returned undefined");
  return r as Response;
}

// פגישה כפי שה-DB מחזיר עם include (כל ה-scalars, כולל הקליניים).
const SESSION_WITH_CLINICAL = {
  id: "session-1",
  clientId: "client-1",
  status: "SCHEDULED",
  topic: "מעקב חרדה",
  notes: "המטופל דיווח על שיפור — תוכן קליני",
  roomId: "room-1",
  location: "חדר 3",
  payment: null,
};

beforeEach(() => {
  vi.resetAllMocks();
  requireAuth.mockResolvedValue({ userId: "u1" });
  loadScopeUser.mockResolvedValue({ id: "u1", role: "USER" });
});

describe("GET /api/sessions/[id] — סינון תוכן קליני למזכירה", () => {
  it("מזכירה: ללא topic/notes, אך עם roomId/location", async () => {
    isSecretary.mockReturnValue(true);
    findFirst.mockResolvedValue({ ...SESSION_WITH_CLINICAL });
    const res = await callGET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.topic).toBeUndefined();
    expect(body.notes).toBeUndefined();
    // roomId/location נדרשים לבורר החדר — חייבים להישאר.
    expect(body.roomId).toBe("room-1");
    expect(body.location).toBe("חדר 3");
  });

  it("מטפל: מקבל topic/notes כרגיל", async () => {
    isSecretary.mockReturnValue(false);
    findFirst.mockResolvedValue({ ...SESSION_WITH_CLINICAL });
    const res = await callGET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.topic).toBe("מעקב חרדה");
    expect(body.notes).toBe("המטופל דיווח על שיפור — תוכן קליני");
  });
});

describe("PUT /api/sessions/[id] — סינון תוכן קליני למזכירה", () => {
  const EXISTING = {
    id: "session-1",
    status: "SCHEDULED",
    startTime: new Date("2026-06-15T10:00:00Z"),
    endTime: new Date("2026-06-15T11:00:00Z"),
    therapistId: "u1",
    organizationId: "org-1",
    roomId: "room-1",
    location: "חדר 3",
    client: { defaultSessionPrice: null },
    googleEventId: null,
  };
  const UPDATED = {
    id: "session-1",
    status: "SCHEDULED",
    clientId: "client-1",
    startTime: new Date("2026-06-15T10:00:00Z"),
    client: { id: "client-1", name: "ישראל ישראלי" },
  };

  it("מזכירה: ללא topic/notes בתגובה, אך עם roomId/location", async () => {
    isSecretary.mockReturnValue(true);
    findFirst.mockResolvedValue({ ...EXISTING });
    update.mockResolvedValue({ ...UPDATED });
    findUnique.mockResolvedValue({ ...SESSION_WITH_CLINICAL });
    const res = await callPUT({}); // גוף ריק — מותר למזכירה (אין שדות חסומים)
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.topic).toBeUndefined();
    expect(body.notes).toBeUndefined();
    expect(body.roomId).toBe("room-1");
    expect(body.location).toBe("חדר 3");
  });

  it("מטפל: מקבל topic/notes בתגובה", async () => {
    isSecretary.mockReturnValue(false);
    findFirst.mockResolvedValue({ ...EXISTING });
    update.mockResolvedValue({ ...UPDATED });
    findUnique.mockResolvedValue({ ...SESSION_WITH_CLINICAL });
    const res = await callPUT({});
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.topic).toBe("מעקב חרדה");
    expect(body.notes).toBe("המטופל דיווח על שיפור — תוכן קליני");
  });
});

describe("PATCH /api/sessions/[id] — סינון תוכן קליני למזכירה", () => {
  it("מזכירה (skipSummary): ללא topic/notes בתגובה, אך עם roomId", async () => {
    isSecretary.mockReturnValue(true);
    findFirst.mockResolvedValue({ id: "session-1" });
    update.mockResolvedValue({
      id: "session-1",
      skipSummary: true,
      topic: "מעקב חרדה",
      notes: "תוכן קליני",
      roomId: "room-1",
    });
    const res = await callPATCH({ skipSummary: true });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.topic).toBeUndefined();
    expect(body.notes).toBeUndefined();
    expect(body.roomId).toBe("room-1");
  });

  it("מטפל: מקבל topic/notes בתגובה", async () => {
    isSecretary.mockReturnValue(false);
    findFirst.mockResolvedValue({ id: "session-1" });
    update.mockResolvedValue({
      id: "session-1",
      skipSummary: false,
      topic: "מעקב חרדה",
      notes: "תוכן קליני",
    });
    const res = await callPATCH({ topic: "מעקב חרדה" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.topic).toBe("מעקב חרדה");
    expect(body.notes).toBe("תוכן קליני");
  });
});
