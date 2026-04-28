/**
 * Unit tests — POST /api/admin/cardcom/refund
 *
 * The handler is heavy (auth + DB + Cardcom HTTP + audit). These tests mock
 * every external dependency and exercise the handler at the boundary,
 * focusing on the behaviors that actually break in practice:
 *   - Tenant guard (USER refunds must NOT go through ADMIN terminal)
 *   - Cardcom error → release claim (no over-refund)
 *   - Partial→full transition (status flips REFUNDED only at zero remaining)
 *   - Validation (missing fields, invalid amount)
 *
 * Concurrency races are validated separately by the integration suite
 * (Docker Postgres) — too noisy to fake with vi.mock.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { Prisma } from "@prisma/client";

// ─── Mocks ────────────────────────────────────────────────────────────────

const findUniqueTx = vi.fn();
const updateManyTx = vi.fn();
const findUniqueIdem = vi.fn();
const createIdem = vi.fn();
const refundTransaction = vi.fn();
const requirePermissionMock = vi.fn();

const tx = {
  cardcomTransaction: {
    update: vi.fn().mockResolvedValue({}),
  },
  cardcomInvoice: {
    findFirst: vi.fn().mockResolvedValue(null),
    create: vi.fn(),
    update: vi.fn(),
  },
  subscriptionPayment: {
    update: vi.fn().mockResolvedValue({}),
  },
  adminAuditLog: {
    create: vi.fn().mockResolvedValue({}),
  },
};

vi.mock("@/lib/prisma", () => ({
  default: {
    cardcomTransaction: {
      findUnique: (...a: unknown[]) => findUniqueTx(...a),
      updateMany: (...a: unknown[]) => updateManyTx(...a),
    },
    idempotencyKey: {
      findUnique: (...a: unknown[]) => findUniqueIdem(...a),
      create: (...a: unknown[]) => createIdem(...a),
    },
    $transaction: (fn: any) => fn(tx),
  },
}));

vi.mock("@/lib/api-auth", () => ({
  requirePermission: (...a: unknown[]) => requirePermissionMock(...a),
}));

vi.mock("@/lib/cardcom/admin-config", () => ({
  getAdminCardcomClient: () =>
    Promise.resolve({
      refundTransaction: (...a: unknown[]) => refundTransaction(...a),
    }),
}));

vi.mock("@/lib/audit", () => ({
  // Forward to the tx callback so we can assert on its writes; the audit row
  // itself is not the focus of these tests.
  withAudit: async (_actor: unknown, _opts: unknown, fn: any) => fn(tx),
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
  return new Request("https://test.local/api/admin/cardcom/refund", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  }) as unknown as import("next/server").NextRequest;
}

const session = {
  user: { id: "admin-1", email: "admin@x.com", name: "Admin", role: "ADMIN" },
};

const baseTx = {
  id: "tx-1",
  tenant: "ADMIN",
  status: "APPROVED",
  amount: new Prisma.Decimal(100),
  refundedAmount: new Prisma.Decimal(0),
  transactionId: "cardcom-tx-99",
  subscriptionPaymentId: null,
  userId: "u-1",
  paymentId: null,
};

beforeEach(() => {
  vi.resetAllMocks();
  requirePermissionMock.mockResolvedValue({ session, userId: session.user.id });
  findUniqueIdem.mockResolvedValue(null);
  createIdem.mockResolvedValue({});
  updateManyTx.mockResolvedValue({ count: 1 });
  refundTransaction.mockResolvedValue({ responseCode: "0", refundId: "ref-99" });
});

// ─── Tests ────────────────────────────────────────────────────────────────

describe("POST /api/admin/cardcom/refund — auth + validation", () => {
  it("returns 403 with NextResponse from requirePermission when permission missing", async () => {
    const errorResponse = new Response("forbidden", { status: 403 });
    requirePermissionMock.mockResolvedValue({ error: errorResponse });
    const res = await callPOST(makeRequest({ cardcomTransactionId: "x", reason: "x" }));
    expect(res.status).toBe(403);
  });

  it("rejects empty body with 400", async () => {
    findUniqueTx.mockResolvedValue(baseTx);
    const res = await callPOST(makeRequest({}));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/חובה/);
  });

  it("rejects negative amount with 400", async () => {
    findUniqueTx.mockResolvedValue(baseTx);
    const res = await callPOST(
      makeRequest({ cardcomTransactionId: "tx-1", reason: "test", amount: -5 })
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.message).toMatch(/לא חוקי/);
  });
});

describe("POST /api/admin/cardcom/refund — tenant guard", () => {
  it("blocks USER-tenant transactions with 403", async () => {
    findUniqueTx.mockResolvedValue({ ...baseTx, tenant: "USER" });
    const res = await callPOST(
      makeRequest({ cardcomTransactionId: "tx-1", reason: "wrong route" })
    );
    expect(res.status).toBe(403);
    expect(refundTransaction).not.toHaveBeenCalled();
    expect(updateManyTx).not.toHaveBeenCalled();
  });

  it("allows ADMIN-tenant transactions through", async () => {
    findUniqueTx.mockResolvedValue(baseTx);
    const res = await callPOST(makeRequest({ cardcomTransactionId: "tx-1", reason: "ok" }));
    expect(res.status).toBe(200);
    expect(refundTransaction).toHaveBeenCalledTimes(1);
  });
});

describe("POST /api/admin/cardcom/refund — claim release on Cardcom error", () => {
  it("releases the claimed slice when Cardcom returns non-zero responseCode", async () => {
    findUniqueTx.mockResolvedValue(baseTx);
    refundTransaction.mockResolvedValue({
      responseCode: "5",
      errorMessage: "card 4580458045804580 declined",
    });

    const res = await callPOST(makeRequest({ cardcomTransactionId: "tx-1", reason: "test" }));
    expect(res.status).toBe(502);

    // Two updateMany calls: claim + release. The release reverts to original
    // refundedAmount (0).
    expect(updateManyTx).toHaveBeenCalledTimes(2);
    const releaseCall = updateManyTx.mock.calls[1][0] as {
      where: { refundedAmount: Prisma.Decimal };
      data: { refundedAmount: Prisma.Decimal };
    };
    expect(releaseCall.data.refundedAmount.toString()).toBe("0");
  });

  it("releases the claimed slice when the Cardcom HTTP call throws", async () => {
    findUniqueTx.mockResolvedValue(baseTx);
    refundTransaction.mockRejectedValue(new Error("network timeout"));

    const res = await callPOST(makeRequest({ cardcomTransactionId: "tx-1", reason: "test" }));
    expect(res.status).toBe(502);
    expect(updateManyTx).toHaveBeenCalledTimes(2);
  });
});

describe("POST /api/admin/cardcom/refund — partial vs full", () => {
  it("marks transaction REFUNDED on full refund", async () => {
    findUniqueTx.mockResolvedValue(baseTx);
    await callPOST(makeRequest({ cardcomTransactionId: "tx-1", reason: "full" }));
    const updateCall = (tx.cardcomTransaction.update as any).mock.calls[0][0];
    expect(updateCall.data.status).toBe("REFUNDED");
  });

  it("keeps transaction APPROVED on partial refund", async () => {
    findUniqueTx.mockResolvedValue(baseTx);
    await callPOST(
      makeRequest({ cardcomTransactionId: "tx-1", reason: "partial", amount: 30 })
    );
    const updateCall = (tx.cardcomTransaction.update as any).mock.calls[0][0];
    expect(updateCall.data.status).toBe("APPROVED");
  });

  it("rejects refund attempt when transaction status is not APPROVED", async () => {
    findUniqueTx.mockResolvedValue({ ...baseTx, status: "DECLINED" });
    const res = await callPOST(
      makeRequest({ cardcomTransactionId: "tx-1", reason: "won't work" })
    );
    expect(res.status).toBe(409);
  });

  it("rejects refund attempt when full amount already refunded", async () => {
    findUniqueTx.mockResolvedValue({
      ...baseTx,
      refundedAmount: new Prisma.Decimal(100),
    });
    const res = await callPOST(makeRequest({ cardcomTransactionId: "tx-1", reason: "no remainder" }));
    expect(res.status).toBe(409);
    expect(refundTransaction).not.toHaveBeenCalled();
  });

  it("rejects refund when atomic claim fails (concurrent refund won)", async () => {
    findUniqueTx.mockResolvedValue(baseTx);
    updateManyTx.mockResolvedValueOnce({ count: 0 }); // claim race-lost
    const res = await callPOST(makeRequest({ cardcomTransactionId: "tx-1", reason: "race" }));
    expect(res.status).toBe(409);
    expect(refundTransaction).not.toHaveBeenCalled();
  });
});

describe("POST /api/admin/cardcom/refund — idempotency", () => {
  it("returns the cached response when the same Idempotency-Key was already used", async () => {
    findUniqueIdem.mockResolvedValue({
      response: { success: true, refundId: "cached" },
      statusCode: 200,
    });
    const res = await callPOST(
      makeRequest(
        { cardcomTransactionId: "tx-1", reason: "x" },
        { "Idempotency-Key": "key-1" }
      )
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.refundId).toBe("cached");
    // Crucially: NO Cardcom call, NO claim, NO new write.
    expect(refundTransaction).not.toHaveBeenCalled();
    expect(updateManyTx).not.toHaveBeenCalled();
  });
});
