/**
 * processMultiSessionPayment — must return the receipts it actually issued, so
 * the UI can show/print them right after a cash/transfer/check bulk payment
 * (same as a single-session payment). Before this, the bulk endpoint produced
 * receipts but never returned them, so the therapist saw no receipt on screen.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ─── Mocks ──────────────────────────────────────────────────────────────
const clientFindFirstMock = vi.fn();
const txFindManyMock = vi.fn();
const txCreateMock = vi.fn();
const txUpdateMock = vi.fn();
const txClientUpdateManyMock = vi.fn();
const findUniqueMock = vi.fn();
const taskUpdateManyMock = vi.fn();
// snapshot helper קורא ל-prisma.payment.findMany מחוץ ל-tx — מחזיר [] כדי
// שלא יזיק לטענות הבדיקה.
const snapshotFindManyMock = vi.fn<(args?: unknown) => Promise<unknown[]>>(
  async () => [],
);

const issueReceiptMock = vi.fn();
const sendEmailMock = vi.fn(async (..._a: unknown[]) => {});

type TxClient = {
  payment: {
    findMany: (...a: unknown[]) => unknown;
    create: (...a: unknown[]) => unknown;
    update: (...a: unknown[]) => unknown;
  };
  client: { updateMany: (...a: unknown[]) => unknown };
};

vi.mock("@/lib/prisma", () => ({
  default: {
    client: {
      findFirst: (...a: unknown[]) => clientFindFirstMock(...a),
    },
    $transaction: async (fn: (tx: TxClient) => Promise<unknown>) =>
      fn({
        payment: {
          findMany: (...a: unknown[]) => txFindManyMock(...a),
          create: (...a: unknown[]) => txCreateMock(...a),
          update: (...a: unknown[]) => txUpdateMock(...a),
        },
        client: { updateMany: (...a: unknown[]) => txClientUpdateManyMock(...a) },
      }),
    payment: {
      findUnique: (...a: unknown[]) => findUniqueMock(...a),
      findMany: (...a: unknown[]) => snapshotFindManyMock(...a),
    },
    task: { updateMany: (...a: unknown[]) => taskUpdateManyMock(...a) },
  },
}));

vi.mock("../receipt-service", () => ({
  issueReceipt: (...a: unknown[]) => issueReceiptMock(...a),
  sendPaymentReceiptEmail: (...a: unknown[]) => sendEmailMock(...a),
  buildReceiptDescription: () => "desc",
  buildCombinedReceiptDescription: () => "combined desc",
}));

vi.mock("@/lib/clinic/revenue-snapshot", () => ({
  applyRevenueShareSnapshot: vi.fn(async () => {}),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { processMultiSessionPayment } from "../bulk-payment";

// ─── Helpers ────────────────────────────────────────────────────────────
function setupTwoPending() {
  clientFindFirstMock.mockResolvedValue({
    id: "client-A",
    name: "בדיקה",
    email: "t@example.com",
    phone: null,
  });
  // Two PENDING parents, 300 each.
  txFindManyMock.mockResolvedValue([
    { id: "parent-1", clientId: "client-A", organizationId: null, amount: 0, expectedAmount: 300 },
    { id: "parent-2", clientId: "client-A", organizationId: null, amount: 0, expectedAmount: 300 },
  ]);
  txCreateMock.mockImplementation(
    ({ data }: { data: Record<string, unknown> }) => ({
      id: `child-of-${String(data.parentPaymentId)}`,
      ...data,
    }),
  );
  txUpdateMock.mockResolvedValue({});
  taskUpdateManyMock.mockResolvedValue({ count: 0 });
  // parentWithSession lookup (one per processed item).
  findUniqueMock.mockImplementation(
    ({ where }: { where: { id: string } }) => ({
      id: where.id,
      expectedAmount: 300,
      amount: 300,
      session: { startTime: new Date("2026-06-01T10:00:00Z") },
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("processMultiSessionPayment — receipts returned to UI", () => {
  it("returns one receipt per child (childId + number + url) when receipts are issued", async () => {
    setupTwoPending();
    issueReceiptMock.mockImplementation(
      ({ paymentId }: { paymentId: string }) => ({
        hasReceipt: true,
        receiptNumber: `RCPT-${paymentId}`,
        receiptUrl: `/receipt/${paymentId}#t=abc`,
      }),
    );

    const result = await processMultiSessionPayment({
      userId: "user-1",
      clientId: "client-A",
      paymentIds: ["parent-1", "parent-2"],
      totalAmount: 600,
      method: "CASH",
      paymentMode: "FULL",
      issueReceipt: true,
    });

    expect(result.success).toBe(true);
    expect(result.receipts).toHaveLength(2);
    expect(result.receipts).toEqual(
      expect.arrayContaining([
        {
          paymentId: "child-of-parent-1",
          receiptNumber: "RCPT-child-of-parent-1",
          receiptUrl: "/receipt/child-of-parent-1#t=abc",
        },
        {
          paymentId: "child-of-parent-2",
          receiptNumber: "RCPT-child-of-parent-2",
          receiptUrl: "/receipt/child-of-parent-2#t=abc",
        },
      ]),
    );
  });

  it("returns empty receipts when issueReceipt=false (no receipt produced)", async () => {
    setupTwoPending();

    const result = await processMultiSessionPayment({
      userId: "user-1",
      clientId: "client-A",
      paymentIds: ["parent-1", "parent-2"],
      totalAmount: 600,
      method: "CASH",
      paymentMode: "FULL",
      issueReceipt: false,
    });

    expect(result.success).toBe(true);
    expect(result.receipts).toEqual([]);
    expect(issueReceiptMock).not.toHaveBeenCalled();
  });

  it("omits a child whose receipt failed (hasReceipt=false) but keeps the others", async () => {
    setupTwoPending();
    // First child gets a receipt; second provider call returns no document.
    issueReceiptMock
      .mockImplementationOnce(({ paymentId }: { paymentId: string }) => ({
        hasReceipt: true,
        receiptNumber: `RCPT-${paymentId}`,
        receiptUrl: `/receipt/${paymentId}#t=abc`,
      }))
      .mockImplementationOnce(() => ({
        hasReceipt: false,
        receiptNumber: null,
        receiptUrl: null,
      }));

    const result = await processMultiSessionPayment({
      userId: "user-1",
      clientId: "client-A",
      paymentIds: ["parent-1", "parent-2"],
      totalAmount: 600,
      method: "CASH",
      paymentMode: "FULL",
      issueReceipt: true,
    });

    expect(result.success).toBe(true);
    expect(result.receipts).toHaveLength(1);
    expect(result.receipts?.[0]?.paymentId).toBe("child-of-parent-1");
  });
});
