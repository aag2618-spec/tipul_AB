/**
 * Unit tests — /api/sessions/[id]/status (PATCH): סינון תוכן קליני (topic/notes)
 * מהתגובה למזכירה.
 *
 * חוב אבטחה (חוק זכויות החולה): המסלול שלף את הפגישה ועדכן סטטוס, ואז החזיר את
 * updatedSession המלא — כולל topic/notes (שני שדות קליניים חסומים למזכירה,
 * CLINICAL_FIELDS_BLOCKED_FOR_SECRETARY.session). לא הוצגו ב-UI אבל נשלחו ב-JSON,
 * כך שמזכירה יכלה לקצור אותם בעדכון סטטוס (פעולה שמותרת לה). parity עם
 * /api/sessions ו-/api/sessions/[id].
 *
 * המסלול הנבדק: SCHEDULED→COMPLETED (הקצר ביותר — לא מפעיל מייל/SMS/יומן).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const requireAuth = vi.fn();
const loadScopeUser = vi.fn();
const isSecretary = vi.fn();
const findFirst = vi.fn();
const update = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    therapySession: {
      findFirst: (...a: unknown[]) => findFirst(...a),
      update: (...a: unknown[]) => update(...a),
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
}));
vi.mock("@/lib/secretary-mode", () => ({
  loadScopeUserWithMode: (...a: unknown[]) => loadScopeUser(...a),
}));
vi.mock("@/lib/commitment-usage", () => ({
  applyCommitmentUsageOnStatusChange: vi.fn(),
}));
vi.mock("@/lib/google-calendar-sync", () => ({
  syncSessionToGoogleCalendar: vi.fn(),
  syncSessionDeletionToGoogleCalendar: vi.fn(),
}));
vi.mock("@/lib/resend", () => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/email-utils", () => ({ escapeHtml: (s: string) => s }));
vi.mock("@/lib/sms", () => ({ sendSMSIfEnabled: vi.fn() }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { PATCH } from "../route";

type NReq = import("next/server").NextRequest;
const params = { params: Promise.resolve({ id: "session-1" }) };

async function callPATCH(body: unknown): Promise<Response> {
  const req = new Request("https://test.local/api/sessions/session-1/status", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NReq;
  const r = await PATCH(req, params);
  if (!r) throw new Error("PATCH returned undefined");
  return r as Response;
}

// פגישה קיימת (SCHEDULED) — הרשומה שה-DB מחזיר ב-update כוללת את הקליניים.
const EXISTING = {
  id: "session-1",
  clientId: "client-1",
  commitmentId: null,
  status: "SCHEDULED",
  type: "IN_PERSON",
  startTime: new Date("2026-06-15T10:00:00Z"),
  endTime: new Date("2026-06-15T11:00:00Z"),
  location: "חדר 3",
  googleEventId: null,
  client: { name: "ישראל ישראלי", firstName: "ישראל", email: null, phone: null },
  therapist: { name: "ד\"ר כהן", email: null, phone: null, businessPhone: null },
};
const UPDATED_WITH_CLINICAL = {
  id: "session-1",
  clientId: "client-1",
  status: "COMPLETED",
  topic: "מעקב חרדה",
  notes: "המטופל דיווח על שיפור — תוכן קליני",
  roomId: "room-1",
  location: "חדר 3",
};

beforeEach(() => {
  vi.resetAllMocks();
  requireAuth.mockResolvedValue({ userId: "u1", session: {} });
  loadScopeUser.mockResolvedValue({ id: "u1", role: "USER" });
});

describe("PATCH /api/sessions/[id]/status — סינון תוכן קליני למזכירה", () => {
  it("מזכירה: ללא topic/notes בתגובה, אך עם roomId/location", async () => {
    isSecretary.mockReturnValue(true);
    findFirst.mockResolvedValue({ ...EXISTING });
    update.mockResolvedValue({ ...UPDATED_WITH_CLINICAL });
    const res = await callPATCH({ status: "COMPLETED" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.topic).toBeUndefined();
    expect(body.notes).toBeUndefined();
    // שדות אדמיניסטרטיביים נשמרים.
    expect(body.status).toBe("COMPLETED");
    expect(body.roomId).toBe("room-1");
    expect(body.location).toBe("חדר 3");
  });

  it("מטפל: מקבל topic/notes בתגובה", async () => {
    isSecretary.mockReturnValue(false);
    findFirst.mockResolvedValue({ ...EXISTING });
    update.mockResolvedValue({ ...UPDATED_WITH_CLINICAL });
    const res = await callPATCH({ status: "COMPLETED" });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.topic).toBe("מעקב חרדה");
    expect(body.notes).toBe("המטופל דיווח על שיפור — תוכן קליני");
  });
});
