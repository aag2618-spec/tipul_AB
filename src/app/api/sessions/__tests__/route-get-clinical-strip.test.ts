/**
 * Unit tests — GET /api/sessions (route האוסף): סינון תוכן קליני למזכירה.
 *
 * חוב אבטחה (חוק זכויות החולה): ה-GET שלף פגישות עם Prisma `include`, ש-מחזיר
 * את כל ה-scalars — כולל topic/notes (תוכן קליני חסום למזכירה,
 * CLINICAL_FIELDS_BLOCKED_FOR_SECRETARY.session). זה ה-endpoint ש-
 * session-detail-dialog.tsx קורא. תוקן באותו דפוס סינון כמו /api/sessions/[id]
 * ו-/api/sessions/calendar.
 *
 * הקריטי: מזכירה לא מקבלת topic/notes — אך כן roomId/location. מטפל מקבל הכל.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const requireAuth = vi.fn();
const loadScopeUser = vi.fn();
const isSecretary = vi.fn();
const findMany = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    therapySession: {
      findMany: (...a: unknown[]) => findMany(...a),
    },
  },
}));
vi.mock("@/lib/api-auth", () => ({
  requireAuth: (...a: unknown[]) => requireAuth(...a),
}));
vi.mock("@/lib/scope", async () => ({
  ...(await vi.importActual<typeof import("@/lib/scope")>("@/lib/scope")),
  loadScopeUser: (...a: unknown[]) => loadScopeUser(...a),
  isSecretary: (...a: unknown[]) => isSecretary(...a),
  buildSessionWhere: () => ({}),
  buildClientWhere: () => ({}),
  isClinicOwner: () => false,
  secretaryCan: () => true,
  resolveTherapistIdForSession: vi.fn(),
}));
// הראוט קורא loadScopeUserWithMode (secretary-mode) — מאציל ל-mock של loadScopeUser.
vi.mock("@/lib/secretary-mode", () => ({
  loadScopeUserWithMode: (...a: unknown[]) => loadScopeUser(...a),
}));
vi.mock("@/lib/payment-utils", () => ({ calculatePaidAmount: () => 0 }));
vi.mock("@/lib/date-utils", () => ({ parseIsraelTime: (s: string) => new Date(s) }));
vi.mock("@/lib/google-calendar-sync", () => ({ syncSessionToGoogleCalendar: vi.fn() }));
vi.mock("@/lib/audit", () => ({ logDelegatedCreate: vi.fn() }));
vi.mock("@/lib/session-overlap", () => ({
  findClinicLocationConflict: vi.fn(),
  buildClinicConflictMessage: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { GET } from "../route";

type NReq = import("next/server").NextRequest;

async function callGET(): Promise<Response> {
  const req = new Request("https://test.local/api/sessions") as unknown as NReq;
  const r = await GET(req);
  if (!r) throw new Error("GET returned undefined");
  return r as Response;
}

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

describe("GET /api/sessions — סינון תוכן קליני למזכירה", () => {
  it("מזכירה: ללא topic/notes, אך עם roomId/location", async () => {
    isSecretary.mockReturnValue(true);
    findMany.mockResolvedValue([{ ...SESSION_WITH_CLINICAL }]);
    const res = await callGET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    expect(body[0].topic).toBeUndefined();
    expect(body[0].notes).toBeUndefined();
    // roomId/location נדרשים לבורר החדר — חייבים להישאר.
    expect(body[0].roomId).toBe("room-1");
    expect(body[0].location).toBe("חדר 3");
  });

  it("מטפל: מקבל topic/notes כרגיל", async () => {
    isSecretary.mockReturnValue(false);
    findMany.mockResolvedValue([{ ...SESSION_WITH_CLINICAL }]);
    const res = await callGET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body[0].topic).toBe("מעקב חרדה");
    expect(body[0].notes).toBe("המטופל דיווח על שיפור — תוכן קליני");
  });
});
