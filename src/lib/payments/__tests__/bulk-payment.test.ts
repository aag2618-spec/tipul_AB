/**
 * distributeBulkCardcomPayment — children must inherit the umbrella's receipt
 * info (hasReceipt + receiptNumber + receiptUrl). Without that, the receipts
 * page filters out the umbrella via EXCLUDE_BULK_UMBRELLA_WHERE and the
 * children show no receipt — even though Cardcom DID issue one for the bulk
 * sum. The therapist sees "both paid" but no receipt → real bug reported in
 * production after commit 781b069.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ─── Mocks ──────────────────────────────────────────────────────────────
const findUniqueMock = vi.fn();
const findFirstMock = vi.fn();
const findManyMock = vi.fn();
const createMock = vi.fn();
const updatePaymentMock = vi.fn();
const updateManyTaskMock = vi.fn();
// snapshot helper קורא ל-prisma.payment.findMany מחוץ ל-tx; שומרים מימוש
// ברירת-מחדל שמחזיר [] כך שהוא לא יזרוק או יזיק לטענות הבדיקה הקיימת.
const snapshotFindManyMock = vi.fn<(args?: unknown) => Promise<unknown[]>>(
  async () => []
);

type TxClient = {
  payment: {
    findUnique: (...a: unknown[]) => unknown;
    findFirst: (...a: unknown[]) => unknown;
    findMany: (...a: unknown[]) => unknown;
    create: (...a: unknown[]) => unknown;
    update: (...a: unknown[]) => unknown;
  };
  task: { updateMany: (...a: unknown[]) => unknown };
};

vi.mock("@/lib/prisma", () => ({
  default: {
    $transaction: async (fn: (tx: TxClient) => Promise<unknown>) =>
      fn({
        payment: {
          findUnique: (...a: unknown[]) => findUniqueMock(...a),
          findFirst: (...a: unknown[]) => findFirstMock(...a),
          findMany: (...a: unknown[]) => findManyMock(...a),
          create: (...a: unknown[]) => createMock(...a),
          update: (...a: unknown[]) => updatePaymentMock(...a),
        },
        task: { updateMany: (...a: unknown[]) => updateManyTaskMock(...a) },
      }),
    payment: {
      findMany: (...a: unknown[]) => snapshotFindManyMock(...a),
    },
  },
}));

// snapshot helper (קומיט B של G3): קוראים ל-prisma מחוץ ל-tx. מאחר ש-snapshot
// אינו רלוונטי לטענות הקיימות (receipt inheritance), משבית את ה-helper כדי
// שלא יחפש session/therapist/organization במוק.
vi.mock("@/lib/clinic/revenue-snapshot", () => ({
  applyRevenueShareSnapshot: vi.fn(async () => {}),
}));

vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { distributeBulkCardcomPayment } from "../bulk-payment";

// ─── Helpers ────────────────────────────────────────────────────────────
function setupTwoPendingParents() {
  // Idempotency check returns null = nothing distributed yet.
  findFirstMock.mockResolvedValue(null);
  // Two PENDING parents, 350 each.
  findManyMock.mockResolvedValue([
    {
      id: "parent-1",
      clientId: "client-A",
      organizationId: null,
      amount: 0,
      expectedAmount: 350,
      status: "PENDING",
    },
    {
      id: "parent-2",
      clientId: "client-A",
      organizationId: null,
      amount: 0,
      expectedAmount: 350,
      status: "PENDING",
    },
  ]);
  // create + update return shapes that distribute does not introspect.
  createMock.mockImplementation(
    ({ data }: { data: Record<string, unknown> }) => ({
      id: `child-of-${String(data.parentPaymentId)}`,
      ...data,
    }),
  );
  updatePaymentMock.mockResolvedValue({});
  updateManyTaskMock.mockResolvedValue({ count: 0 });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("distributeBulkCardcomPayment — child receipt inheritance", () => {
  it("copies hasReceipt + receiptNumber + receiptUrl from umbrella to each child", async () => {
    setupTwoPendingParents();
    // Umbrella lookup (the new query the fix adds).
    findUniqueMock.mockResolvedValueOnce({
      id: "umbrella-1",
      hasReceipt: true,
      receiptNumber: "639145",
      receiptUrl: "https://cardcom.example/doc/639145",
    });

    const result = await distributeBulkCardcomPayment({
      umbrellaPaymentId: "umbrella-1",
      bulkPaymentIds: ["parent-1", "parent-2"],
      amountPaid: 700,
      cardcomTransactionId: "tx-1",
    });

    expect(result.success).toBe(true);
    expect(result.processed).toHaveLength(2);

    const created = createMock.mock.calls.map(([args]) => args.data);
    expect(created).toHaveLength(2);
    for (const childData of created) {
      expect(childData.hasReceipt).toBe(true);
      expect(childData.receiptNumber).toBe("639145");
      expect(childData.receiptUrl).toBe("https://cardcom.example/doc/639145");
      expect(childData.status).toBe("PAID");
    }
  });

  it("does NOT mark hasReceipt on children when the umbrella has no receipt yet", async () => {
    // Edge case: Cardcom approved the charge but did NOT return a
    // DocumentNumber (rare, e.g. ChargeOnly without Document block). The
    // umbrella would have hasReceipt=false. Children must NOT pretend to
    // have a receipt — that would be a fake legal document.
    setupTwoPendingParents();
    findUniqueMock.mockResolvedValueOnce({
      id: "umbrella-1",
      hasReceipt: false,
      receiptNumber: null,
      receiptUrl: null,
    });

    const result = await distributeBulkCardcomPayment({
      umbrellaPaymentId: "umbrella-1",
      bulkPaymentIds: ["parent-1", "parent-2"],
      amountPaid: 700,
      cardcomTransactionId: "tx-2",
    });

    expect(result.success).toBe(true);
    const created = createMock.mock.calls.map(([args]) => args.data);
    for (const childData of created) {
      expect(childData.hasReceipt).toBeFalsy();
      expect(childData.receiptNumber == null).toBe(true);
      expect(childData.receiptUrl == null).toBe(true);
    }
  });

  it("is idempotent — second call after children exist creates none", async () => {
    // Idempotency guard: existingChildren found → return early.
    findFirstMock.mockResolvedValue({ id: "existing-child" });

    const result = await distributeBulkCardcomPayment({
      umbrellaPaymentId: "umbrella-1",
      bulkPaymentIds: ["parent-1", "parent-2"],
      amountPaid: 700,
      cardcomTransactionId: "tx-1",
    });

    expect(result.success).toBe(true);
    expect(result.processed).toHaveLength(0);
    expect(createMock).not.toHaveBeenCalled();
  });
});
