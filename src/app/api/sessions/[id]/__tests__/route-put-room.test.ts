/**
 * Unit tests — PUT /api/sessions/[id], שינוי/הסרת חדר (שלב 2 — חדרים).
 *
 * הנקודות הקריטיות:
 *   • שיוך חדר מאמת שהחדר שייך לקליניקה, וגוזר location=שם החדר (snapshot).
 *   • שינוי חדר בלבד (בלי שינוי זמן) חייב להריץ בדיקת חפיפת חדר — אחרת אפשר
 *     לשבץ שתי פגישות לאותו חדר באותה שעה ("החדר תפוס").
 *   • הסרת חדר (roomId ריק) מאפסת roomId+location.
 *   • מזכירה רשאית לשנות חדר (front-desk) — roomId ב-ALLOWED_FOR_SECRETARY.
 *
 * ה-handler כבד; כל ה-I/O החיצוני ממוקמק. parseBody וה-schema אמיתיים — כך
 * שגם ולידציית roomId נבדקת ב-boundary.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const requireAuth = vi.fn();
const loadScopeUser = vi.fn();
const isSecretary = vi.fn();
const secretaryCan = vi.fn();
const findFirst = vi.fn();
const update = vi.fn();
const findUnique = vi.fn();
const clinicRoomFindFirst = vi.fn();
const findClinicLocationConflict = vi.fn();
const buildClinicConflictMessage = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    therapySession: {
      findFirst: (...a: unknown[]) => findFirst(...a),
      update: (...a: unknown[]) => update(...a),
      findUnique: (...a: unknown[]) => findUnique(...a),
    },
    clinicRoom: {
      findFirst: (...a: unknown[]) => clinicRoomFindFirst(...a),
    },
  },
}));
vi.mock("@/lib/api-auth", () => ({
  requireAuth: (...a: unknown[]) => requireAuth(...a),
}));
vi.mock("@/lib/scope", () => ({
  loadScopeUser: (...a: unknown[]) => loadScopeUser(...a),
  isSecretary: (...a: unknown[]) => isSecretary(...a),
  secretaryCan: (...a: unknown[]) => secretaryCan(...a),
  buildSessionWhere: () => ({}),
}));
vi.mock("@/lib/secretary-mode", () => ({
  loadScopeUserWithMode: (...a: unknown[]) => loadScopeUser(...a),
}));
vi.mock("@/lib/session-overlap", () => ({
  findClinicLocationConflict: (...a: unknown[]) => findClinicLocationConflict(...a),
  buildClinicConflictMessage: (...a: unknown[]) => buildClinicConflictMessage(...a),
}));
vi.mock("@/lib/payment-service", () => ({ createPaymentForSession: vi.fn() }));
vi.mock("@/lib/resend", () => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/sms", () => ({ sendSMSIfEnabled: vi.fn() }));
vi.mock("@/lib/google-calendar-sync", () => ({
  syncSessionUpdateToGoogleCalendar: vi.fn(),
  syncSessionDeletionToGoogleCalendar: vi.fn(),
}));
vi.mock("@/lib/audit-logger", () => ({ logDataAccess: vi.fn() }));
vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { PUT } from "../route";

async function callPUT(body: unknown): Promise<Response> {
  const req = new Request("https://test.local/api/sessions/session-1", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;
  const r = await PUT(req, { params: Promise.resolve({ id: "session-1" }) });
  if (!r) throw new Error("PUT returned undefined");
  return r as Response;
}

const FUTURE_START = new Date("2026-07-01T10:00:00Z");
const FUTURE_END = new Date("2026-07-01T11:00:00Z");

function baseExisting(overrides: Record<string, unknown> = {}) {
  return {
    id: "session-1",
    clientId: "client-1",
    therapistId: "therapist-1",
    organizationId: "org-1",
    roomId: null,
    location: null,
    startTime: FUTURE_START,
    endTime: FUTURE_END,
    status: "SCHEDULED",
    googleEventId: null,
    price: 200,
    client: { defaultSessionPrice: 200 },
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  requireAuth.mockResolvedValue({ userId: "therapist-1" });
  loadScopeUser.mockResolvedValue({ id: "therapist-1", role: "USER", organizationId: "org-1" });
  isSecretary.mockReturnValue(false);
  secretaryCan.mockReturnValue(true);
  findFirst.mockResolvedValue(baseExisting());
  clinicRoomFindFirst.mockResolvedValue({ id: "room-1", name: "חדר 1" });
  findClinicLocationConflict.mockResolvedValue(null);
  buildClinicConflictMessage.mockReturnValue("החדר תפוס");
  update.mockResolvedValue({
    id: "session-1",
    clientId: "client-1",
    status: "SCHEDULED",
    startTime: FUTURE_START,
    endTime: FUTURE_END,
    price: 200,
    location: "חדר 1",
    roomId: "room-1",
    client: { name: "ישראל", email: null, phone: null },
  });
  findUnique.mockResolvedValue({
    id: "session-1",
    status: "SCHEDULED",
    price: 200,
    roomId: "room-1",
    location: "חדר 1",
    client: { name: "ישראל", email: null, phone: null },
    payment: null,
  });
});

describe("PUT /api/sessions/[id] — שינוי חדר", () => {
  it("שיוך חדר — מאמת שייכות, כותב roomId + location=שם החדר", async () => {
    const res = await callPUT({ roomId: "room-1" });
    expect(res.status).toBe(200);
    expect(clinicRoomFindFirst).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][0].data.roomId).toBe("room-1");
    expect(update.mock.calls[0][0].data.location).toBe("חדר 1");
  });

  it("שינוי חדר בלבד (בלי זמן) מריץ בדיקת חפיפת חדר על החדר החדש", async () => {
    await callPUT({ roomId: "room-1" });
    expect(findClinicLocationConflict).toHaveBeenCalledTimes(1);
    expect(findClinicLocationConflict.mock.calls[0][0]).toMatchObject({
      roomId: "room-1",
      organizationId: "org-1",
      excludeSessionId: "session-1",
    });
  });

  it("חדר שלא שייך לקליניקה — 400, בלי כתיבה", async () => {
    clinicRoomFindFirst.mockResolvedValue(null);
    const res = await callPUT({ roomId: "room-x" });
    expect(res.status).toBe(400);
    expect(update).not.toHaveBeenCalled();
  });

  it("החדר תפוס (חפיפת חדר) — 409, בלי כתיבה", async () => {
    findClinicLocationConflict.mockResolvedValue({
      id: "other", startTime: FUTURE_START, endTime: FUTURE_END,
      location: "חדר 1", therapistName: "דנה", clientName: "רותי", type: "IN_PERSON",
    });
    const res = await callPUT({ roomId: "room-1" });
    expect(res.status).toBe(409);
    expect(update).not.toHaveBeenCalled();
  });

  it("הסרת חדר (roomId ריק) — מאפס roomId ו-location", async () => {
    findFirst.mockResolvedValue(baseExisting({ roomId: "room-1", location: "חדר 1" }));
    const res = await callPUT({ roomId: "" });
    expect(res.status).toBe(200);
    // חדר לא נשלף (אין מה לאמת בהסרה)
    expect(clinicRoomFindFirst).not.toHaveBeenCalled();
    expect(update.mock.calls[0][0].data.roomId).toBeNull();
    expect(update.mock.calls[0][0].data.location).toBeNull();
  });

  it("מזכירה רשאית לשנות חדר — לא נחסם (front-desk)", async () => {
    isSecretary.mockReturnValue(true);
    const res = await callPUT({ roomId: "room-1" });
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][0].data.roomId).toBe("room-1");
  });

  it("ללא roomId ב-body — לא נוגעים בחדר (לא נשלף, לא נכתב roomId)", async () => {
    const res = await callPUT({ price: 250 });
    expect(res.status).toBe(200);
    expect(clinicRoomFindFirst).not.toHaveBeenCalled();
    // roomId לא ב-data כשלא נשלח (השארת הקיים)
    expect("roomId" in update.mock.calls[0][0].data).toBe(false);
  });
});
