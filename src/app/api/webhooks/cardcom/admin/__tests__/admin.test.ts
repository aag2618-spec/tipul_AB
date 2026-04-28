/**
 * Unit tests — POST /api/webhooks/cardcom/admin
 *
 * Walk the security envelope: IP allowlist → HMAC → timestamp → idempotent
 * claim. Each guard is the only thing standing between an attacker and a
 * write to financial DB rows, so each gets its own test.
 *
 * Body-processing logic (CardcomTransaction.update, SubscriptionPayment, etc.)
 * is exercised via the integration suite — too noisy to fake here.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHmac } from "node:crypto";

// ─── Mocks ────────────────────────────────────────────────────────────────

const claimWebhookMock = vi.fn();
const finalizeWebhookMock = vi.fn();
const releaseWebhookClaimMock = vi.fn();
const checkRateLimitMock = vi.fn();
const getAdminWebhookSecretMock = vi.fn();

vi.mock("@/lib/cardcom/webhook-claim", () => ({
  claimWebhook: (...a: unknown[]) => claimWebhookMock(...a),
  finalizeWebhook: (...a: unknown[]) => finalizeWebhookMock(...a),
  releaseWebhookClaim: (...a: unknown[]) => releaseWebhookClaimMock(...a),
}));

vi.mock("@/lib/rate-limit", () => ({
  checkRateLimit: (...a: unknown[]) => checkRateLimitMock(...a),
}));

vi.mock("@/lib/cardcom/admin-config", () => ({
  getAdminWebhookSecret: () => getAdminWebhookSecretMock(),
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

const SECRET = "test-webhook-secret";

function signed(body: object, opts: { ip?: string; sig?: string; ts?: string } = {}) {
  const raw = JSON.stringify({
    LowProfileId: "lp-1",
    ResponseCode: "0",
    Timestamp: opts.ts ?? new Date().toISOString(),
    ...body,
  });
  const sig =
    opts.sig ??
    createHmac("sha256", SECRET).update(raw, "utf8").digest("hex");
  const headers = new Headers({
    "content-type": "application/json",
    "x-cardcom-signature": sig,
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
  process.env.CARDCOM_ADMIN_WEBHOOK_SECRET = SECRET;
  process.env.CARDCOM_WEBHOOK_IP_ALLOWLIST = "1.2.3.4,5.6.7.8";
  // Allow timestamp checks to skip the prod-strict branch.
  (process.env as { NODE_ENV?: string }).NODE_ENV = "development";

  checkRateLimitMock.mockReturnValue({
    allowed: true,
    resetAt: Date.now() + 60_000,
    remaining: 99,
  });
  getAdminWebhookSecretMock.mockReturnValue(SECRET);
  claimWebhookMock.mockResolvedValue({ status: "claimed", eventId: "ev-1" });
  finalizeWebhookMock.mockResolvedValue(undefined);

  // Re-import after mocks are set up.
  const mod = await import("../route");
  POST = mod.POST;
});

afterEach(() => {
  delete process.env.CARDCOM_ADMIN_WEBHOOK_SECRET;
  delete process.env.CARDCOM_WEBHOOK_IP_ALLOWLIST;
});

// ─── Tests ────────────────────────────────────────────────────────────────

describe("POST /api/webhooks/cardcom/admin — IP allowlist", () => {
  it("rejects an IP outside the allowlist with 403", async () => {
    const req = signed({}, { ip: "9.9.9.9" });
    const res = await callPOST(req);
    expect(res.status).toBe(403);
    // No DB work attempted.
    expect(claimWebhookMock).not.toHaveBeenCalled();
  });

  it("admits an allowlisted IP", async () => {
    const req = signed({}, { ip: "1.2.3.4" });
    const res = await callPOST(req);
    // Claim called → IP guard passed (and HMAC + timestamp).
    expect(claimWebhookMock).toHaveBeenCalledTimes(1);
    expect(res.status).not.toBe(403);
  });
});

describe("POST /api/webhooks/cardcom/admin — HMAC signature", () => {
  it("rejects an invalid signature with 401", async () => {
    const req = signed({}, { sig: "deadbeef".repeat(8) });
    const res = await callPOST(req);
    expect(res.status).toBe(401);
    expect(claimWebhookMock).not.toHaveBeenCalled();
  });

  it("rejects a missing signature with 401", async () => {
    const raw = JSON.stringify({
      LowProfileId: "lp-x",
      ResponseCode: "0",
      Timestamp: new Date().toISOString(),
    });
    const req = new Request("https://test.local/api/webhooks/cardcom/admin", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "1.2.3.4",
      },
      body: raw,
    }) as unknown as import("next/server").NextRequest;
    const res = await callPOST(req);
    expect(res.status).toBe(401);
  });
});

describe("POST /api/webhooks/cardcom/admin — timestamp anti-replay", () => {
  it("rejects a stale timestamp (>5 minutes old)", async () => {
    const stale = new Date(Date.now() - 6 * 60 * 1000).toISOString();
    const req = signed({}, { ts: stale });
    const res = await callPOST(req);
    expect(res.status).toBe(400);
  });
});

describe("POST /api/webhooks/cardcom/admin — idempotency", () => {
  it("returns 200 idempotent:true when claim says already_processed", async () => {
    claimWebhookMock.mockResolvedValue({ status: "already_processed", eventId: "ev-1" });
    const req = signed({});
    const res = await callPOST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.idempotent).toBe(true);
    // Crucially: handler does NOT finalize a second time.
    expect(finalizeWebhookMock).not.toHaveBeenCalled();
  });

  it("returns 503 with Retry-After when claim is in_progress", async () => {
    claimWebhookMock.mockResolvedValue({ status: "in_progress", eventId: "ev-1" });
    const req = signed({});
    const res = await callPOST(req);
    expect(res.status).toBe(503);
    expect(res.headers.get("retry-after")).toBe("60");
    expect(finalizeWebhookMock).not.toHaveBeenCalled();
  });

  it("rejects a payload without LowProfileId before claiming", async () => {
    const raw = JSON.stringify({
      ResponseCode: "0",
      Timestamp: new Date().toISOString(),
    });
    const sig = createHmac("sha256", SECRET).update(raw, "utf8").digest("hex");
    const req = new Request("https://test.local/api/webhooks/cardcom/admin", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-cardcom-signature": sig,
        "x-forwarded-for": "1.2.3.4",
      },
      body: raw,
    }) as unknown as import("next/server").NextRequest;
    const res = await callPOST(req);
    expect(res.status).toBe(400);
    expect(claimWebhookMock).not.toHaveBeenCalled();
  });
});
