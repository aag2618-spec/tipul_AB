/**
 * Unit tests — PATCH /api/sessions/[id], שדה topic (נושא הפגישה).
 *
 * הנקודה הקריטית: topic הוא תוכן קליני, ולכן מזכירה חסומה מעדכונו (parity עם
 * ALLOWED_FOR_SECRETARY ב-PUT, ששם notes/topic נחסמים). skipSummary —
 * פעולה אדמיניסטרטיבית — נשאר מותר למזכירה.
 *
 * ה-handler כבד (auth + scope + DB + email/sms/calendar). כל התלויות
 * החיצוניות ממוקמקות; הבדיקה מפעילה את ה-handler ב-boundary.
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
  secretaryCan: () => true,
}));
vi.mock("@/lib/secretary-mode", () => ({
  loadScopeUserWithMode: (...a: unknown[]) => loadScopeUser(...a),
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

import { PATCH } from "../route";

async function callPATCH(body: unknown): Promise<Response> {
  const req = new Request("https://test.local/api/sessions/session-1", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;
  const r = await PATCH(req, { params: Promise.resolve({ id: "session-1" }) });
  if (!r) throw new Error("PATCH returned undefined");
  return r as Response;
}

beforeEach(() => {
  vi.resetAllMocks();
  requireAuth.mockResolvedValue({ userId: "therapist-1" });
  loadScopeUser.mockResolvedValue({ id: "therapist-1", role: "USER" });
  findFirst.mockResolvedValue({ id: "session-1", clientId: "client-1" });
  update.mockResolvedValue({ id: "session-1", topic: "מעקב חרדה", skipSummary: false });
});

describe("PATCH /api/sessions/[id] — topic (חסימת מזכירה)", () => {
  it("חוסם מזכירה מעדכון topic — 403, בלי כתיבה ל-DB", async () => {
    isSecretary.mockReturnValue(true);
    const res = await callPATCH({ topic: "מעקב חרדה" });
    expect(res.status).toBe(403);
    expect(update).not.toHaveBeenCalled();
  });

  it("מאפשר למטפל לעדכן topic — 200, נשמר ב-DB", async () => {
    isSecretary.mockReturnValue(false);
    const res = await callPATCH({ topic: "מעקב חרדה" });
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][0].data.topic).toBe("מעקב חרדה");
  });

  it("מזכירה עדיין יכולה skipSummary (בלי topic) — 200", async () => {
    isSecretary.mockReturnValue(true);
    const res = await callPATCH({ skipSummary: true });
    expect(res.status).toBe(200);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][0].data.skipSummary).toBe(true);
  });

  it("מטפל מנקה נושא (topic ריק) — 200, נשמר", async () => {
    isSecretary.mockReturnValue(false);
    const res = await callPATCH({ topic: "" });
    expect(res.status).toBe(200);
    expect(update.mock.calls[0][0].data.topic).toBe("");
  });

  it("פגישה לא נמצאה — 404, בלי כתיבה", async () => {
    isSecretary.mockReturnValue(false);
    findFirst.mockResolvedValue(null);
    const res = await callPATCH({ topic: "מעקב חרדה" });
    expect(res.status).toBe(404);
    expect(update).not.toHaveBeenCalled();
  });
});
