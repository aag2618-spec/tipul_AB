/**
 * Unit tests — POST /api/webhooks/sumit (ענף המנוי / anti-privilege-escalation)
 *
 * הממצא: ענף המנוי איתר משתמש לפי Customer.Email בלבד והעניק מנוי ACTIVE +
 * שחרור חסימה, כשההגנה היחידה הייתה חתימת HMAC. אם ה-secret דלף — תוקף יכול
 * לזייף בקשה חתומה עם מייל קורבן ולשחרר/להעניק מנוי בלי תשלום.
 *
 * מנוי-התוכנה עובר תמיד דרך Cardcom; ענף המנוי של Sumit הוא קוד לא-נתמך. binding
 * בנוסח Meshulam לא יעיל כאן (אין זרם לגיטימי שיקשור מזהה תחילה → תוקף שמגיע
 * ראשון קושר ערך משלו). לכן התיקון **דוחה** את האירוע ולא מעניק דבר.
 *
 * הבדיקות מדמות בקשה חתומה (verifySumitWebhook מוקפא ל-true) ומוודאות שאף אירוע
 * מנוי לא מוביל להענקת מנוי / שחרור / שינוי סטטוס.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────

const verifySumitWebhookMock = vi.fn();
const verifyPaymentByExternalIdMock = vi.fn();
const checkRateLimitMock = vi.fn();
const verifyWebhookTimestampMock = vi.fn();
const claimWebhookMock = vi.fn();
const finalizeWebhookMock = vi.fn();
const releaseWebhookClaimMock = vi.fn();
const saveFailedWebhookMock = vi.fn();
const completeWebhookPaymentMock = vi.fn();

const userFindFirstMock = vi.fn();
const userUpdateMock = vi.fn();
const adminAlertCreateMock = vi.fn();
const subscriptionPaymentCreateMock = vi.fn();
const transactionMock = vi.fn();

vi.mock("@/lib/sumit", () => ({
  verifySumitWebhook: (...a: unknown[]) => verifySumitWebhookMock(...a),
}));

vi.mock("@/lib/webhook-verification", () => ({
  verifyPaymentByExternalId: (...a: unknown[]) => verifyPaymentByExternalIdMock(...a),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (...a: unknown[]) => checkRateLimitMock(...a),
  WEBHOOK_RATE_LIMIT: { maxRequests: 60, windowMs: 60 * 1000 },
}));

vi.mock("@/lib/webhook-replay-protection", () => ({
  verifyWebhookTimestamp: (...a: unknown[]) => verifyWebhookTimestampMock(...a),
  claimWebhook: (...a: unknown[]) => claimWebhookMock(...a),
  finalizeWebhook: (...a: unknown[]) => finalizeWebhookMock(...a),
  releaseWebhookClaim: (...a: unknown[]) => releaseWebhookClaimMock(...a),
}));

vi.mock("@/lib/webhook-retry", () => ({
  saveFailedWebhook: (...a: unknown[]) => saveFailedWebhookMock(...a),
}));

vi.mock("@/lib/payments/receipt-service", () => ({
  completeWebhookPayment: (...a: unknown[]) => completeWebhookPaymentMock(...a),
}));

vi.mock("@/lib/prisma", () => ({
  default: {
    user: {
      findFirst: (...a: unknown[]) => userFindFirstMock(...a),
      update: (...a: unknown[]) => userUpdateMock(...a),
    },
    adminAlert: { create: (...a: unknown[]) => adminAlertCreateMock(...a) },
    subscriptionPayment: {
      create: (...a: unknown[]) => subscriptionPaymentCreateMock(...a),
    },
    $transaction: (...a: unknown[]) => transactionMock(...a),
  },
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────

function buildRequest(body: object) {
  const raw = JSON.stringify(body);
  const headers = new Headers({
    "content-type": "application/json",
    "x-sumit-signature": "sha256=deadbeef",
    "x-forwarded-for": "9.9.9.9",
  });
  return new Request("https://test.local/api/webhooks/sumit", {
    method: "POST",
    headers,
    body: raw,
  }) as unknown as import("next/server").NextRequest;
}

let POST: typeof import("../route").POST;

beforeEach(async () => {
  vi.resetAllMocks();
  process.env.SUMIT_WEBHOOK_SECRET = "test-secret";

  // ברירת מחדל: כל שכבות המעטפת עוברות, כדי לבודד את לוגיקת ענף המנוי.
  verifySumitWebhookMock.mockReturnValue(true);
  verifyWebhookTimestampMock.mockReturnValue(true);
  checkRateLimitMock.mockReturnValue({ allowed: true });
  claimWebhookMock.mockResolvedValue({ status: "claimed", eventId: "ev-1" });
  finalizeWebhookMock.mockResolvedValue(undefined);
  // אין תשלום-מטופל תואם → נופלים לענף המנוי.
  verifyPaymentByExternalIdMock.mockResolvedValue(null);
  userUpdateMock.mockResolvedValue({});
  adminAlertCreateMock.mockResolvedValue({});
  subscriptionPaymentCreateMock.mockResolvedValue({});

  const mod = await import("../route");
  POST = mod.POST;
});

function successPayload() {
  return {
    Event: "payment.success",
    PaymentID: "sumit-pay-1",
    Amount: 99,
    DocumentURL: "https://doc",
    Timestamp: new Date().toISOString(),
    Customer: { Name: "קורבן", Email: "victim@example.com" },
  };
}

function failedPayload() {
  return {
    Event: "payment.failed",
    PaymentID: "sumit-pay-2",
    ErrorMessage: "declined",
    Timestamp: new Date().toISOString(),
    Customer: { Name: "קורבן", Email: "victim@example.com" },
  };
}

describe("POST /api/webhooks/sumit — subscription branch is rejected, never grants", () => {
  it("payment.success מזויף: לא מעניק מנוי ולא משחרר חסימה — מתריע לאדמין", async () => {
    userFindFirstMock.mockResolvedValue({ id: "u1" });

    const res = await POST(buildRequest(successPayload()));

    expect(res?.status).toBe(200);
    // ⛔ שום הענקת מנוי / עדכון משתמש / רישום תשלום
    expect(transactionMock).not.toHaveBeenCalled();
    expect(userUpdateMock).not.toHaveBeenCalled();
    expect(subscriptionPaymentCreateMock).not.toHaveBeenCalled();
    // ✅ התראת אדמין ל-forensics
    expect(adminAlertCreateMock).toHaveBeenCalledTimes(1);
    const alertArg = adminAlertCreateMock.mock.calls[0][0] as {
      data: { userId: string; title: string };
    };
    expect(alertArg.data.userId).toBe("u1");
    expect(alertArg.data.title).toContain("Sumit");
  });

  it("payment.failed מזויף: לא משנה subscriptionStatus ל-PAST_DUE", async () => {
    userFindFirstMock.mockResolvedValue({ id: "u1" });

    const res = await POST(buildRequest(failedPayload()));

    expect(res?.status).toBe(200);
    expect(userUpdateMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
    // מתריע לאדמין שהמייל תואם משתמש
    expect(adminAlertCreateMock).toHaveBeenCalledTimes(1);
  });

  it("מייל שאינו תואם משתמש: אין שינוי ואין adminAlert (ללא רעש)", async () => {
    userFindFirstMock.mockResolvedValue(null);

    const res = await POST(buildRequest(successPayload()));

    expect(res?.status).toBe(200);
    expect(userUpdateMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
    expect(subscriptionPaymentCreateMock).not.toHaveBeenCalled();
    expect(adminAlertCreateMock).not.toHaveBeenCalled();
  });
});
