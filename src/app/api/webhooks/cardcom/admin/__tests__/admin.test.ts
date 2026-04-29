/**
 * Unit tests — POST /api/webhooks/cardcom/admin
 *
 * Walk the security envelope: IP allowlist (soft) → GetLpResult verification →
 * timestamp → idempotent claim. Each guard is the only thing standing between
 * an attacker and a write to financial DB rows, so each gets its own test.
 *
 * Body-processing logic (CardcomTransaction.update, SubscriptionPayment, etc.)
 * is exercised via the integration suite — too noisy to fake here.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────

const claimWebhookMock = vi.fn();
const finalizeWebhookMock = vi.fn();
const releaseWebhookClaimMock = vi.fn();
const checkRateLimitMock = vi.fn();
const getAdminCardcomClientMock = vi.fn();
const getLpResultMock = vi.fn();

vi.mock("@/lib/cardcom/webhook-claim", () => ({
  claimWebhook: (...a: unknown[]) => claimWebhookMock(...a),
  finalizeWebhook: (...a: unknown[]) => finalizeWebhookMock(...a),
  releaseWebhookClaim: (...a: unknown[]) => releaseWebhookClaimMock(...a),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (...a: unknown[]) => checkRateLimitMock(...a),
}));

vi.mock("@/lib/cardcom/admin-config", () => ({
  getAdminCardcomClient: () => getAdminCardcomClientMock(),
}));

vi.mock("@/lib/site-settings", () => ({
  getAdminBusinessProfile: () =>
    Promise.resolve({
      type: "EXEMPT",
      name: "MyTipul",
      idNumber: "123",
      address: "",
      phone: "",
      email: "",
      vatRate: 0,
      logoUrl: null,
      footerText: null,
    }),
}));

vi.mock("@/lib/prisma", () => ({
  default: {
    cardcomTransaction: {
      findUnique: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue({}),
    },
    subscriptionPayment: { update: vi.fn().mockResolvedValue({}) },
    user: { update: vi.fn().mockResolvedValue({}) },
    savedCardToken: { upsert: vi.fn().mockResolvedValue({}) },
    cardcomInvoice: { create: vi.fn().mockResolvedValue({}) },
    chargebackEvent: { create: vi.fn().mockResolvedValue({}) },
    adminAlert: { create: vi.fn().mockResolvedValue({}) },
    orphanCardcomDocument: { updateMany: vi.fn().mockResolvedValue({}) },
    adminAuditLog: { create: vi.fn().mockResolvedValue({}) },
    $transaction: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock("@/lib/audit", () => ({
  withAudit: async (_actor: unknown, _opts: unknown, fn: any) =>
    fn({
      cardcomTransaction: { update: vi.fn().mockResolvedValue({}) },
      subscriptionPayment: { update: vi.fn().mockResolvedValue({}) },
      user: { update: vi.fn().mockResolvedValue({}) },
      savedCardToken: { upsert: vi.fn().mockResolvedValue({}) },
      cardcomInvoice: { create: vi.fn().mockResolvedValue({}) },
      orphanCardcomDocument: { updateMany: vi.fn().mockResolvedValue({}) },
    }),
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

// ─── Helpers ──────────────────────────────────────────────────────────────

/**
 * Build a Cardcom-like webhook request. The body is just a notification — no
 * HMAC signing since the new verification fetches canonical state from
 * GetLpResult. Tests control GetLpResult's behavior via getLpResultMock.
 */
function buildRequest(
  body: object = {},
  opts: { ip?: string; ts?: string; lowProfileId?: string | null } = {}
) {
  const lpId = opts.lowProfileId === undefined ? "lp-1" : opts.lowProfileId;
  const payload: Record<string, unknown> = {
    ResponseCode: "0",
    Timestamp: opts.ts ?? new Date().toISOString(),
    ...body,
  };
  if (lpId !== null) payload.LowProfileId = lpId;
  const raw = JSON.stringify(payload);
  const headers = new Headers({
    "content-type": "application/json",
    "x-forwarded-for": opts.ip ?? "1.2.3.4",
  });
  return new Request("https://test.local/api/webhooks/cardcom/admin", {
    method: "POST",
    headers,
    body: raw,
  }) as unknown as import("next/server").NextRequest;
}

let POST: typeof import("../route").POST;

// Tiny wrapper so TS knows the response is defined (the route always returns
// a NextResponse — but TS infers `Response | undefined` from the async signature).
async function callPOST(
  req: import("next/server").NextRequest
): Promise<Response> {
  const r = await POST(req);
  if (!r) throw new Error("POST returned undefined");
  return r as Response;
}

beforeEach(async () => {
  vi.resetAllMocks();
  process.env.CARDCOM_WEBHOOK_IP_ALLOWLIST = "1.2.3.4,5.6.7.8";
  // Allow timestamp checks to skip the prod-strict branch.
  (process.env as { NODE_ENV?: string }).NODE_ENV = "development";

  checkRateLimitMock.mockReturnValue({
    allowed: true,
    resetAt: Date.now() + 60_000,
    remaining: 99,
  });
  // Default: GetLpResult returns the same LowProfileId — verification passes.
  getLpResultMock.mockResolvedValue({
    LowProfileId: "lp-1",
    ResponseCode: 0,
    Operation: "ChargeOnly",
  });
  getAdminCardcomClientMock.mockResolvedValue({
    getLpResult: (...a: unknown[]) => getLpResultMock(...a),
  });
  claimWebhookMock.mockResolvedValue({ status: "claimed", eventId: "ev-1" });
  finalizeWebhookMock.mockResolvedValue(undefined);

  // Re-import after mocks are set up.
  const mod = await import("../route");
  POST = mod.POST;
});

afterEach(() => {
  delete process.env.CARDCOM_WEBHOOK_IP_ALLOWLIST;
});

// ─── Tests ────────────────────────────────────────────────────────────────

describe("POST /api/webhooks/cardcom/admin — IP allowlist (soft)", () => {
  it("admits an IP outside the allowlist (real verification is GetLpResult)", async () => {
    // After the GetLpResult flip, IP allowlist is defense-in-depth only.
    // A non-allowlisted IP must NOT short-circuit with 403 — Cardcom may rotate
    // outbound IPs without notice, and GetLpResult is the source of truth.
    const req = buildRequest({}, { ip: "9.9.9.9" });
    const res = await callPOST(req);
    expect(res.status).not.toBe(403);
    // GetLpResult was called — verification proceeded past IP check.
    expect(getLpResultMock).toHaveBeenCalledTimes(1);
  });

  it("admits an allowlisted IP", async () => {
    const req = buildRequest({}, { ip: "1.2.3.4" });
    const res = await callPOST(req);
    expect(claimWebhookMock).toHaveBeenCalledTimes(1);
    expect(res.status).not.toBe(403);
  });
});

describe("POST /api/webhooks/cardcom/admin — GetLpResult verification", () => {
  it("rejects a body whose LowProfileId differs from GetLpResult's response", async () => {
    // Attacker POSTs a webhook claiming LowProfileId "lp-1" but GetLpResult
    // returns a different id (or none) → body cannot be trusted.
    getLpResultMock.mockResolvedValue({ LowProfileId: "different-id", ResponseCode: 0 });
    const req = buildRequest();
    const res = await callPOST(req);
    expect(res.status).toBe(401);
    expect(claimWebhookMock).not.toHaveBeenCalled();
  });

  it("rejects when GetLpResult throws (Cardcom unreachable / unknown LP)", async () => {
    getLpResultMock.mockRejectedValue(new Error("CARDCOM_HTTP_500"));
    const req = buildRequest();
    const res = await callPOST(req);
    expect(res.status).toBe(401);
    expect(claimWebhookMock).not.toHaveBeenCalled();
  });

  it("rejects when no admin client can be loaded (missing credentials)", async () => {
    getAdminCardcomClientMock.mockRejectedValue(new Error("CARDCOM_MISSING_TERMINAL"));
    const req = buildRequest();
    const res = await callPOST(req);
    expect(res.status).toBe(500);
    expect(claimWebhookMock).not.toHaveBeenCalled();
  });

  it("uses GetLpResult's ResponseCode (string-coerced) for the verified payload", async () => {
    // Cardcom returns ResponseCode as a number from GetLpResult; the rest of
    // the handler compares with === "0" (string equality).
    getLpResultMock.mockResolvedValue({
      LowProfileId: "lp-1",
      ResponseCode: 0,
      Operation: "ChargeOnly",
    });
    const req = buildRequest();
    const res = await callPOST(req);
    expect(claimWebhookMock).toHaveBeenCalledTimes(1);
    expect(res.status).not.toBe(401);
  });
});

describe("POST /api/webhooks/cardcom/admin — timestamp anti-replay", () => {
  it("rejects a stale timestamp (>5 minutes old)", async () => {
    const stale = new Date(Date.now() - 6 * 60 * 1000).toISOString();
    const req = buildRequest({}, { ts: stale });
    const res = await callPOST(req);
    expect(res.status).toBe(400);
    // Verification must short-circuit before GetLpResult — saves a Cardcom call.
    expect(getLpResultMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/webhooks/cardcom/admin — idempotency", () => {
  it("returns 200 idempotent:true when claim says already_processed", async () => {
    claimWebhookMock.mockResolvedValue({ status: "already_processed", eventId: "ev-1" });
    const req = buildRequest();
    const res = await callPOST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.idempotent).toBe(true);
    // Crucially: handler does NOT finalize a second time.
    expect(finalizeWebhookMock).not.toHaveBeenCalled();
  });

  it("returns 503 with Retry-After when claim is in_progress", async () => {
    claimWebhookMock.mockResolvedValue({ status: "in_progress", eventId: "ev-1" });
    const req = buildRequest();
    const res = await callPOST(req);
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("60");
    expect(finalizeWebhookMock).not.toHaveBeenCalled();
  });

  it("rejects a payload without LowProfileId before any verification work", async () => {
    const req = buildRequest({}, { lowProfileId: null });
    const res = await callPOST(req);
    expect(res.status).toBe(400);
    expect(getLpResultMock).not.toHaveBeenCalled();
    expect(claimWebhookMock).not.toHaveBeenCalled();
  });
});
