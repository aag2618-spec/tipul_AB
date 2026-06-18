/**
 * Unit test — webhook/pulseem: אסור לרשום תוכן SMS/טלפון מטופל ללוגים
 * (סבב אבטחה 2026-06-18).
 *
 * חוב: `logger.info("[Pulseem Webhook] Received:", { data: body })` רשם את ה-body
 * הגולמי — כולל body.text (תוכן ה-SMS) ו-body.from (טלפון המטופל). מפתחות אלה
 * לא נתפסים ב-SENSITIVE_KEY_REGEX של ה-logger ולכן הודלפו ל-Render logs.
 *
 * הבדיקה שולחת webhook עם תוכן+טלפון ייחודיים ומוודאת שהם אינם מופיעים באף
 * קריאת logger (info/warn/error).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const info = vi.fn();
const warn = vi.fn();
const error = vi.fn();
const clientFindFirst = vi.fn();
const logFindFirst = vi.fn();
const logCreate = vi.fn();
const notifCreate = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    client: { findFirst: (...a: unknown[]) => clientFindFirst(...a) },
    communicationLog: {
      findFirst: (...a: unknown[]) => logFindFirst(...a),
      create: (...a: unknown[]) => logCreate(...a),
    },
    notification: { create: (...a: unknown[]) => notifCreate(...a) },
  },
}));
vi.mock("@/lib/logger", () => ({
  logger: {
    info: (...a: unknown[]) => info(...a),
    warn: (...a: unknown[]) => warn(...a),
    error: (...a: unknown[]) => error(...a),
  },
}));
vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: () => ({ allowed: true }),
  WEBHOOK_RATE_LIMIT: { limit: 100, windowMs: 60_000 },
}));
vi.mock("@/lib/get-client-ip", () => ({ getClientIp: () => "1.2.3.4" }));
vi.mock("@/lib/cron-auth", () => ({ bearerEquals: () => true }));

import { POST } from "../route";

const SECRET_TEXT = "תוכן רגיש של מטופל SECRET_PHI_12345";
const PATIENT_PHONE = "0501234567";

type NReq = import("next/server").NextRequest;
function postReq(body: unknown): NReq {
  return new Request("https://test.local/api/webhooks/pulseem", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }) as unknown as NReq;
}

beforeEach(() => {
  vi.resetAllMocks();
  // ללא secrets → בלוק האימות מדולג (auth skipped), כך שנבדק נתיב ה-happy-path.
  delete process.env.PULSEEM_HMAC_SECRET;
  delete process.env.PULSEEM_WEBHOOK_SECRET;
  clientFindFirst.mockResolvedValue({
    id: "client-1",
    therapistId: "therapist-1",
    name: "מטופל",
  });
  logFindFirst.mockResolvedValue(null);
  logCreate.mockResolvedValue({ id: "log-1" });
  notifCreate.mockResolvedValue({});
});

describe("Pulseem webhook — אין דליפת PHI ללוגים", () => {
  it("תוכן ה-SMS ומספר הטלפון אינם מופיעים באף קריאת logger", async () => {
    const res = await POST(
      postReq({
        from: PATIENT_PHONE,
        to: "0509999999",
        text: SECRET_TEXT,
        messageId: "m1",
      })
    );
    expect(res.status).toBe(200);

    const allLoggerArgs = [...info.mock.calls, ...warn.mock.calls, ...error.mock.calls]
      .map((call) => JSON.stringify(call))
      .join(" | ");

    expect(allLoggerArgs).not.toContain(SECRET_TEXT);
    expect(allLoggerArgs).not.toContain(PATIENT_PHONE);
  });
});
