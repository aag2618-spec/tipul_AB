/**
 * processMultiSessionPayment — combined receipt (קבלה אחת מאוחדת).
 *
 * Feature: opt-in flag `combinedReceipt`. When ON (and a receipt is actually
 * being issued) the per-child receipt loop is skipped and a single umbrella
 * receipt is issued for the total, then propagated to every child — mirroring
 * the proven distributeBulkCardcomPayment pattern. When OFF (default) the
 * existing per-child behavior must be byte-for-byte unchanged.
 *
 * These tests lock both promises: the OFF regression (N receipts, N emails,
 * no umbrella) and the ON behavior (1 issueReceipt on the umbrella for the
 * total, 1 email, inheritance to children, tolerance of receipt failure).
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ─── Mocks ──────────────────────────────────────────────────────────────
const clientFindFirstMock = vi.fn();
const txFindManyMock = vi.fn();
const txCreateMock = vi.fn();
const txUpdateMock = vi.fn();
const txClientUpdateManyMock = vi.fn();
const txClientFindUniqueMock = vi.fn();
const paymentFindManyMock = vi.fn();
const paymentFindUniqueMock = vi.fn();
const paymentCreateMock = vi.fn();
const paymentUpdateManyMock = vi.fn();
const taskUpdateManyMock = vi.fn();

type TxClient = {
  payment: {
    findMany: (...a: unknown[]) => unknown;
    create: (...a: unknown[]) => unknown;
    update: (...a: unknown[]) => unknown;
  };
  client: {
    findUnique: (...a: unknown[]) => unknown;
    updateMany: (...a: unknown[]) => unknown;
  };
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
        client: {
          findUnique: (...a: unknown[]) => txClientFindUniqueMock(...a),
          updateMany: (...a: unknown[]) => txClientUpdateManyMock(...a),
        },
      }),
    payment: {
      findMany: (...a: unknown[]) => paymentFindManyMock(...a),
      findUnique: (...a: unknown[]) => paymentFindUniqueMock(...a),
      create: (...a: unknown[]) => paymentCreateMock(...a),
      updateMany: (...a: unknown[]) => paymentUpdateManyMock(...a),
    },
    task: {
      updateMany: (...a: unknown[]) => taskUpdateManyMock(...a),
    },
  },
}));

// issueReceipt / sendPaymentReceiptEmail / resolveCardcomReceiptOwner are the
// integration points we assert on. buildReceiptDescription /
// buildCombinedReceiptDescription are pure string helpers — stubbed.
const issueReceiptMock = vi.fn();
const sendPaymentReceiptEmailMock = vi.fn();
const resolveCardcomReceiptOwnerMock = vi.fn();

vi.mock("../receipt-service", () => ({
  issueReceipt: (...a: unknown[]) => issueReceiptMock(...a),
  sendPaymentReceiptEmail: (...a: unknown[]) => sendPaymentReceiptEmailMock(...a),
  resolveCardcomReceiptOwner: (...a: unknown[]) => resolveCardcomReceiptOwnerMock(...a),
  buildReceiptDescription: () => "תיאור פגישה",
  buildCombinedReceiptDescription: () => "תיאור מצרפי ברירת מחדל",
}));

vi.mock("@/lib/clinic/revenue-snapshot", () => ({
  applyRevenueShareSnapshot: vi.fn(async () => {}),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { processMultiSessionPayment } from "../bulk-payment";

// ─── Helpers ────────────────────────────────────────────────────────────
// שני parents PENDING, 300 כל אחד (סה"כ 600), מטופל אחד.
function setupTwoSessions() {
  clientFindFirstMock.mockResolvedValue({
    id: "client-A",
    name: "לקוח בדיקה",
    email: "a@b.com",
    phone: "050-0000000",
  });
  txFindManyMock.mockResolvedValue([
    { id: "parent-1", clientId: "client-A", organizationId: null, amount: 0, expectedAmount: 300 },
    { id: "parent-2", clientId: "client-A", organizationId: null, amount: 0, expectedAmount: 300 },
  ]);
  txCreateMock.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
    id: `child-of-${String(data.parentPaymentId)}`,
    ...data,
  }));
  txUpdateMock.mockResolvedValue({});
  txClientUpdateManyMock.mockResolvedValue({ count: 1 });
  txClientFindUniqueMock.mockResolvedValue({ creditBalance: 0 });
  // top-level findMany: משמש גם ל-issueCombinedReceipt (parents עם session)
  // וגם ל-snapshotForParentPayments (קורא sessionId).
  paymentFindManyMock.mockResolvedValue([
    { id: "parent-1", sessionId: "s1", session: { startTime: new Date("2026-06-01T10:00:00Z") } },
    { id: "parent-2", sessionId: "s2", session: { startTime: new Date("2026-06-08T10:00:00Z") } },
  ]);
  // per-child loop (OFF path): טוען parentWithSession.
  paymentFindUniqueMock.mockImplementation(({ where }: { where: { id: string } }) => ({
    id: where.id,
    amount: 300,
    expectedAmount: 300,
    organizationId: null,
    session: { startTime: new Date("2026-06-01T10:00:00Z"), type: "THERAPY" },
  }));
  // umbrella creation (combined path).
  paymentCreateMock.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
    id: "umbrella-1",
    ...data,
  }));
  paymentUpdateManyMock.mockResolvedValue({ count: 2 });
  taskUpdateManyMock.mockResolvedValue({ count: 0 });
}

const baseParams = {
  userId: "u1",
  clientId: "client-A",
  paymentIds: ["parent-1", "parent-2"],
  totalAmount: 600,
  method: "CASH" as const,
  paymentMode: "FULL" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  resolveCardcomReceiptOwnerMock.mockResolvedValue(null);
});

describe("processMultiSessionPayment — combined receipt", () => {
  it("OFF (default): issues one receipt PER child and one email per child, no umbrella", async () => {
    setupTwoSessions();
    issueReceiptMock.mockResolvedValue({
      hasReceipt: true,
      receiptNumber: "2026-0001",
      receiptUrl: "/receipt/1",
    });

    const res = await processMultiSessionPayment({ ...baseParams });

    expect(res.success).toBe(true);
    // קבלה לכל פגישה — ההתנהגות הקיימת, ללא שינוי.
    expect(issueReceiptMock).toHaveBeenCalledTimes(2);
    expect(sendPaymentReceiptEmailMock).toHaveBeenCalledTimes(2);
    // אין umbrella ואין ירושה.
    expect(paymentCreateMock).not.toHaveBeenCalled();
    expect(paymentUpdateManyMock).not.toHaveBeenCalled();
  });

  it("ON: issues exactly ONE combined receipt on the umbrella for the total", async () => {
    setupTwoSessions();
    issueReceiptMock.mockResolvedValue({
      hasReceipt: true,
      receiptNumber: "2026-0007",
      receiptUrl: "/receipt/7",
    });

    const res = await processMultiSessionPayment({ ...baseParams, combinedReceipt: true });

    expect(res.success).toBe(true);
    expect(issueReceiptMock).toHaveBeenCalledTimes(1);
    const arg = issueReceiptMock.mock.calls[0][0] as { amount: number; paymentId: string };
    expect(arg.amount).toBe(600);
    expect(arg.paymentId).toBe("umbrella-1");

    // umbrella אחד, מסומן [BULK_UMBRELLA], amount=total, ללא sessionId.
    expect(paymentCreateMock).toHaveBeenCalledTimes(1);
    const umbrellaData = paymentCreateMock.mock.calls[0][0].data as Record<string, unknown>;
    expect(String(umbrellaData.notes)).toContain("[BULK_UMBRELLA]");
    expect(Number(umbrellaData.amount)).toBe(600);
    expect(umbrellaData.sessionId).toBeUndefined();
  });

  it("ON: propagates the receipt number to ALL children (one merged row)", async () => {
    setupTwoSessions();
    issueReceiptMock.mockResolvedValue({
      hasReceipt: true,
      receiptNumber: "2026-0007",
      receiptUrl: "/receipt/7",
    });

    await processMultiSessionPayment({ ...baseParams, combinedReceipt: true });

    expect(paymentUpdateManyMock).toHaveBeenCalledTimes(1);
    const upd = paymentUpdateManyMock.mock.calls[0][0] as {
      where: { id: { in: string[] } };
      data: Record<string, unknown>;
    };
    expect(upd.data.receiptNumber).toBe("2026-0007");
    expect(upd.data.hasReceipt).toBe(true);
    expect(String(upd.data.notes)).toContain("Bulk combined distribution");
    expect(upd.where.id.in).toEqual(["child-of-parent-1", "child-of-parent-2"]);
  });

  it("ON: sends exactly ONE combined email for the total", async () => {
    setupTwoSessions();
    issueReceiptMock.mockResolvedValue({
      hasReceipt: true,
      receiptNumber: "2026-0007",
      receiptUrl: "/receipt/7",
    });

    await processMultiSessionPayment({ ...baseParams, combinedReceipt: true });

    expect(sendPaymentReceiptEmailMock).toHaveBeenCalledTimes(1);
    const emailArg = sendPaymentReceiptEmailMock.mock.calls[0][0] as {
      amountPaid: number;
      paymentId: string;
    };
    expect(emailArg.amountPaid).toBe(600);
    expect(emailArg.paymentId).toBe("umbrella-1");
  });

  it("ON: uses the typed description verbatim when provided", async () => {
    setupTwoSessions();
    issueReceiptMock.mockResolvedValue({
      hasReceipt: true,
      receiptNumber: "2026-0007",
      receiptUrl: "/receipt/7",
    });

    await processMultiSessionPayment({
      ...baseParams,
      combinedReceipt: true,
      combinedReceiptDescription: "  קבלה לקופת חולים  ",
    });

    const arg = issueReceiptMock.mock.calls[0][0] as { description: string };
    expect(arg.description).toBe("קבלה לקופת חולים"); // trimmed
    const umbrellaData = paymentCreateMock.mock.calls[0][0].data as Record<string, unknown>;
    expect(String(umbrellaData.notes)).toContain("קבלה לקופת חולים");
  });

  it("ON: tolerates a receipt failure — no inheritance, payment still succeeds", async () => {
    setupTwoSessions();
    issueReceiptMock.mockResolvedValue({
      hasReceipt: false,
      receiptNumber: null,
      receiptUrl: null,
      error: "הקבלה כבר בהפקה",
    });

    const res = await processMultiSessionPayment({ ...baseParams, combinedReceipt: true });

    expect(res.success).toBe(true);
    expect(issueReceiptMock).toHaveBeenCalledTimes(1);
    expect(paymentUpdateManyMock).not.toHaveBeenCalled(); // אין ירושה כשאין קבלה
    expect(sendPaymentReceiptEmailMock).toHaveBeenCalledTimes(1); // מייל בכל זאת
  });

  it("ON but no receipt wanted (issueReceipt=false, no Cardcom): falls back to per-child path, no umbrella", async () => {
    setupTwoSessions();

    const res = await processMultiSessionPayment({
      ...baseParams,
      combinedReceipt: true,
      issueReceipt: false,
    });

    expect(res.success).toBe(true);
    expect(paymentCreateMock).not.toHaveBeenCalled(); // אין umbrella
    expect(issueReceiptMock).not.toHaveBeenCalled(); // לא מפיקים קבלה בכלל
    expect(sendPaymentReceiptEmailMock).toHaveBeenCalledTimes(2); // אבל כן שולחים מיילים
  });
});
