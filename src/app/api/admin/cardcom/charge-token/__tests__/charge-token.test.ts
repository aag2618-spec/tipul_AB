/**
 * Unit tests — POST /api/admin/cardcom/charge-token
 *
 * Focus on behaviors that have ACTUALLY broken before:
 *   - Auth gate
 *   - Already-paid guard (don't double-charge)
 *   - Wrong-tenant token (block)
 *   - Inactive/deleted token (block)
 *   - Cardcom decline → store SCRUBBED error in DB and return SCRUBBED to UI
 *   - Cardcom approve → mark CardcomTransaction APPROVED, SubscriptionPayment PAID
 *
 * The DB writes inside withAudit are exercised at the contract level (we
 * verify the right calls happen on the tx mock).
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// ─── Mocks ────────────────────────────────────────────────────────────────

const requirePermissionMock = vi.fn();
const findUniqueIdem = vi.fn();
const subscriptionPaymentFind = vi.fn();
const savedCardTokenFind = vi.fn();
const cardcomTransactionCreate = vi.fn();
const cardcomTransactionUpdateStandalone = vi.fn();
const chargeTokenMock = vi.fn();

const txCardcomTransactionUpdate = vi.fn().mockResolvedValue({});
const txSubscriptionPaymentUpdate = vi.fn().mockResolvedValue({});

vi.mock("@/lib/prisma", () => ({
  default: {
    idempotencyKey: {
      findUnique: (...a: unknown[]) => findUniqueIdem(...a),
      create: vi.fn().mockResolvedValue({}),
    },
    subscriptionPayment: {
      findUnique: (...a: unknown[]) => subscriptionPaymentFind(...a),
    },
    savedCardToken: {
      findUnique: (...a: unknown[]) => savedCardTokenFind(...a),
    },
    cardcomTransaction: {
      create: (...a: unknown[]) => cardcomTransactionCreate(...a),
      update: (...a: unknown[]) => cardcomTransactionUpdateStandalone(...a),
    },
  },
}));

vi.mock("@/lib/api-auth", () => ({
  requirePermission: (...a: unknown[]) => requirePermissionMock(...a),
}));

vi.mock("@/lib/cardcom/admin-config", () => ({
  getAdminCardcomClient: () =>
    Promise.resolve({
      chargeToken: (...a: unknown[]) => chargeTokenMock(...a),
    }),
}));

const txSavedCardTokenUpdate = vi.fn().mockResolvedValue({});
const txUserFindUnique = vi.fn().mockResolvedValue({ subscriptionStatus: "TRIALING" });
const txUserUpdate = vi.fn().mockResolvedValue({});

vi.mock("@/lib/audit", () => ({
  withAudit: async (_actor: unknown, _opts: unknown, fn: any) =>
    fn({
      cardcomTransaction: { update: txCardcomTransactionUpdate },
      subscriptionPayment: { update: txSubscriptionPaymentUpdate },
      savedCardToken: { update: txSavedCardTokenUpdate },
      user: {
        findUnique: txUserFindUnique,
        update: txUserUpdate,
      },
    }),
}));

vi.mock("@/lib/logger", () => ({
  logger: { error: vi.fn(), info: vi.fn(), warn: vi.fn() },
}));

import { POST } from "../route";

// Tiny wrapper so TS knows the response is defined (the route always returns
// a NextResponse — but TS infers `Response | undefined` from the async signature).
async function callPOST(
  req: import("next/server").NextRequest
): Promise<Response> {
  const r = await POST(req);
  if (!r) throw new Error("POST returned undefined");
  return r as Response;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function makeRequest(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://test.local/api/admin/cardcom/charge-token", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;
}

const session = {
  user: { id: "admin-1", email: "admin@x.com", name: "Admin", role: "ADMIN" },
};

const sub = {
  id: "sp-1",
  userId: "u-1",
  status: "PENDING",
  amount: 145,
  currency: "ILS",
  description: "מנוי PRO",
};

const token = {
  id: "tok-1",
  tenant: "ADMIN",
  subscriberId: "u-1",
  isActive: true,
  deletedAt: null,
  token: "secret-token-99",
  cardLast4: "1234",
  cardHolder: "TEST USER",
  expiryMonth: 12,
  expiryYear: 2030,
};

beforeEach(() => {
  vi.resetAllMocks();
  requirePermissionMock.mockResolvedValue({ session, userId: session.user.id });
  findUniqueIdem.mockResolvedValue(null);
  subscriptionPaymentFind.mockResolvedValue(sub);
  savedCardTokenFind.mockResolvedValue(token);
  cardcomTransactionCreate.mockResolvedValue({ id: "ctx-1" });
  cardcomTransactionUpdateStandalone.mockResolvedValue({});
  txSavedCardTokenUpdate.mockResolvedValue({});
  txUserFindUnique.mockResolvedValue({ subscriptionStatus: "TRIALING" });
  txUserUpdate.mockResolvedValue({});
  // Default: approved.
  chargeTokenMock.mockResolvedValue({
    responseCode: "0",
    transactionId: "cardcom-tx-99",
    approvalNumber: "APPROVAL-1",
  });
});

// ─── Tests ────────────────────────────────────────────────────────────────

describe("POST /api/admin/cardcom/charge-token — auth + validation", () => {
  it("returns the auth error response when permission denied", async () => {
    const errorResponse = new Response("forbidden", { status: 403 });
    requirePermissionMock.mockResolvedValue({ error: errorResponse });
    const res = await callPOST(makeRequest({ subscriptionPaymentId: "sp", savedCardTokenId: "tok" }));
    expect(res.status).toBe(403);
  });

  it("rejects empty body with 400", async () => {
    const res = await callPOST(makeRequest({}));
    expect(res.status).toBe(400);
  });

  it("returns 404 when subscriptionPayment not found", async () => {
    subscriptionPaymentFind.mockResolvedValue(null);
    const res = await callPOST(makeRequest({ subscriptionPaymentId: "sp-missing", savedCardTokenId: "tok-1" }));
    expect(res.status).toBe(404);
  });

  it("returns 409 when payment already PAID (don't double-charge)", async () => {
    subscriptionPaymentFind.mockResolvedValue({ ...sub, status: "PAID" });
    const res = await callPOST(makeRequest({ subscriptionPaymentId: "sp-1", savedCardTokenId: "tok-1" }));
    expect(res.status).toBe(409);
    expect(chargeTokenMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/admin/cardcom/charge-token — token guards", () => {
  it("returns 404 when token inactive", async () => {
    savedCardTokenFind.mockResolvedValue({ ...token, isActive: false });
    const res = await callPOST(makeRequest({ subscriptionPaymentId: "sp-1", savedCardTokenId: "tok-1" }));
    expect(res.status).toBe(404);
  });

  it("returns 404 when token soft-deleted", async () => {
    savedCardTokenFind.mockResolvedValue({ ...token, deletedAt: new Date() });
    const res = await callPOST(makeRequest({ subscriptionPaymentId: "sp-1", savedCardTokenId: "tok-1" }));
    expect(res.status).toBe(404);
  });

  it("returns 403 when token tenant != ADMIN", async () => {
    savedCardTokenFind.mockResolvedValue({ ...token, tenant: "USER" });
    const res = await callPOST(makeRequest({ subscriptionPaymentId: "sp-1", savedCardTokenId: "tok-1" }));
    expect(res.status).toBe(403);
  });

  it("returns 403 when token subscriberId != payment.userId (don't charge wrong customer)", async () => {
    savedCardTokenFind.mockResolvedValue({ ...token, subscriberId: "different-user" });
    const res = await callPOST(makeRequest({ subscriptionPaymentId: "sp-1", savedCardTokenId: "tok-1" }));
    expect(res.status).toBe(403);
  });
});

describe("POST /api/admin/cardcom/charge-token — happy path", () => {
  it("returns success with transactionId on responseCode=0", async () => {
    const res = await callPOST(makeRequest({ subscriptionPaymentId: "sp-1", savedCardTokenId: "tok-1" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.transactionId).toBe("ctx-1");
    // CardcomTransaction.update inside withAudit → APPROVED.
    expect(txCardcomTransactionUpdate).toHaveBeenCalledTimes(1);
    const call = txCardcomTransactionUpdate.mock.calls[0][0] as {
      data: { status: string };
    };
    expect(call.data.status).toBe("APPROVED");
    // SubscriptionPayment.update → PAID.
    expect(txSubscriptionPaymentUpdate).toHaveBeenCalledTimes(1);
    const subCall = txSubscriptionPaymentUpdate.mock.calls[0][0] as {
      data: { status: string };
    };
    expect(subCall.data.status).toBe("PAID");
  });

  it("uses transaction.id as Cardcom uniqueAsmachta (idempotency)", async () => {
    await callPOST(makeRequest({ subscriptionPaymentId: "sp-1", savedCardTokenId: "tok-1" }));
    const arg = chargeTokenMock.mock.calls[0][0] as { uniqueAsmachta: string };
    expect(arg.uniqueAsmachta).toBe("ctx-1");
  });
});

describe("POST /api/admin/cardcom/charge-token — declined card scrubbing", () => {
  it("scrubs PAN fragments out of errorMessage stored in DB", async () => {
    chargeTokenMock.mockResolvedValue({
      responseCode: "5",
      errorMessage: "card 4580458045804580 declined",
    });
    const res = await callPOST(makeRequest({ subscriptionPaymentId: "sp-1", savedCardTokenId: "tok-1" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(false);
    // Returned errorMessage must NOT contain the raw PAN.
    expect(body.errorMessage).not.toContain("4580458045804580");
    // CardcomTransaction.update inside withAudit → DECLINED with scrubbed errorMessage.
    expect(txCardcomTransactionUpdate).toHaveBeenCalledTimes(1);
    const updateCall = txCardcomTransactionUpdate.mock.calls[0][0] as {
      data: { status: string; errorMessage: string | null };
    };
    expect(updateCall.data.status).toBe("DECLINED");
    expect(updateCall.data.errorMessage).not.toContain("4580458045804580");
  });

  it("returns Hebrew fallback message when Cardcom errorMessage is null", async () => {
    chargeTokenMock.mockResolvedValue({ responseCode: "5", errorMessage: null });
    const res = await callPOST(makeRequest({ subscriptionPaymentId: "sp-1", savedCardTokenId: "tok-1" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(false);
    expect(body.errorMessage).toContain("נדחה");
  });
});

describe("POST /api/admin/cardcom/charge-token — idempotency-key reuse", () => {
  it("returns the cached response without calling Cardcom or creating a new transaction", async () => {
    findUniqueIdem.mockResolvedValue({
      response: { success: true, transactionId: "cached-tx" },
      statusCode: 200,
    });
    const res = await callPOST(
      makeRequest(
        { subscriptionPaymentId: "sp-1", savedCardTokenId: "tok-1" },
        { "Idempotency-Key": "key-1" }
      )
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.transactionId).toBe("cached-tx");
    expect(chargeTokenMock).not.toHaveBeenCalled();
    expect(cardcomTransactionCreate).not.toHaveBeenCalled();
  });
});
