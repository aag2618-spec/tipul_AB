/**
 * issueReceipt — עוסק פטור (EXEMPT) עם מסוף Cardcom משלו → קבלה פנימית.
 *
 * נועל את ההתנהגות שתוקנה: עוסק פטור שה-Cardcom שנפתר עבורו הוא *שלו עצמו*
 * (ownerUserId === userId) מקבל קבלה פנימית עם מספור רץ, ולא קורא ל-Cardcom
 * Documents/Create. לעומת זאת, עוסק פטור שמסתמך על מסוף בעל קליניקה (fallback,
 * ownerUserId !== userId) ממשיך להתנתב ל-Cardcom — כדי לא לשבור קליניקות.
 *
 * (זרימת האשראי, charge-cardcom, לא עוברת ב-issueReceipt כלל ולכן לא נבדקת כאן.)
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

// ─── Mocks ──────────────────────────────────────────────────────────────
const paymentFindUniqueMock = vi.fn();
const paymentUpdateManyMock = vi.fn();
const paymentUpdateMock = vi.fn();
const userFindUniqueMock = vi.fn();
const userUpdateMock = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    payment: {
      findUnique: (...a: unknown[]) => paymentFindUniqueMock(...a),
      updateMany: (...a: unknown[]) => paymentUpdateManyMock(...a),
      update: (...a: unknown[]) => paymentUpdateMock(...a),
    },
    user: {
      findUnique: (...a: unknown[]) => userFindUniqueMock(...a),
      update: (...a: unknown[]) => userUpdateMock(...a),
    },
  },
}));

const resolveCardcomBillingMock = vi.fn();
vi.mock("@/lib/cardcom/billing-resolver", () => ({
  resolveCardcomBilling: (...a: unknown[]) => resolveCardcomBillingMock(...a),
}));

const createReceiptMock = vi.fn();
const createBillingServiceMock = vi.fn(() => ({ createReceipt: createReceiptMock }));
vi.mock("@/lib/billing", () => ({
  createBillingService: (...a: unknown[]) => createBillingServiceMock(...a),
}));

vi.mock("@/lib/receipt-token", () => ({
  getReceiptPageUrl: (id: string) => `https://mytipul.com/receipt/${id}`,
}));
vi.mock("@/lib/date-utils", () => ({ getIsraelYear: () => 2026 }));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
// נצרכים רק ב-sendPaymentReceiptEmail / helpers — לא ב-issueReceipt — אבל
// מיובאים בראש המודול, אז מוקאים כדי לשמור על בדיקה הרמטית.
vi.mock("@/lib/resend", () => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/email-templates/payment-receipt", () => ({
  createPaymentReceiptEmail: () => ({ subject: "", html: "" }),
}));
vi.mock("@/lib/email-utils", () => ({ mapPaymentMethod: (m: string) => m }));
vi.mock("@/lib/payment-utils", () => ({ calculateDebtFromPayments: () => 0 }));

import { issueReceipt } from "../receipt-service";

beforeEach(() => {
  vi.clearAllMocks();
  // ברירת מחדל: התשלום לא הופקה לו קבלה (לא stale), ה-claim נתפס בהצלחה.
  paymentFindUniqueMock.mockImplementation(({ select, where }: { select?: Record<string, unknown>; where: { id: string } }) => {
    if (select?.organizationId) {
      // טעינת organizationId של ה-Payment לצורך resolveCardcomReceiptOwner.
      return Promise.resolve({ organizationId: where.id === "pay-2" ? "org-2" : null });
    }
    // בדיקת stale-claim בראש הפונקציה.
    return Promise.resolve({ hasReceipt: false, receiptNumber: null });
  });
  paymentUpdateManyMock.mockResolvedValue({ count: 1 }); // claim נתפס
  paymentUpdateMock.mockResolvedValue({});
  userUpdateMock.mockResolvedValue({ nextReceiptNumber: 6 }); // → reserved = 5
});

describe("issueReceipt — EXEMPT self-issuer", () => {
  it("עוסק פטור עם מסוף משלו + מזומן → קבלה פנימית, בלי קריאה ל-Cardcom", async () => {
    userFindUniqueMock.mockResolvedValue({ businessType: "EXEMPT" });
    // ה-Cardcom שנפתר הוא של המטפל עצמו.
    resolveCardcomBillingMock.mockResolvedValue({
      cardcomOwnerUserId: "user-1",
      fellbackToOrgOwner: false,
    });

    const result = await issueReceipt({
      userId: "user-1",
      paymentId: "pay-1",
      amount: 299,
      clientName: "אברהם שפירא",
      description: "תשלום עבור טיפול",
      method: "CASH",
    });

    expect(result.hasReceipt).toBe(true);
    expect(result.receiptNumber).toBe("2026-0005");
    expect(result.receiptUrl).toBe("https://mytipul.com/receipt/pay-1");
    // לב העניין: לא נקראה הפקת קבלת Cardcom.
    expect(createBillingServiceMock).not.toHaveBeenCalled();
    expect(createReceiptMock).not.toHaveBeenCalled();
    // מספר הקבלה נשמר על ה-Payment.
    expect(paymentUpdateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "pay-1" },
        data: expect.objectContaining({ receiptNumber: "2026-0005", hasReceipt: true }),
      }),
    );
  });

  it("עוסק פטור בלי מסוף משלו (fallback למסוף בעל הקליניקה) → עדיין דרך Cardcom", async () => {
    // therapist = user-2 (EXEMPT), אבל ה-Cardcom שנפתר שייך ל-owner-2.
    userFindUniqueMock.mockImplementation(({ where }: { where: { id: string } }) =>
      Promise.resolve({ businessType: "EXEMPT", id: where.id }),
    );
    resolveCardcomBillingMock.mockResolvedValue({
      cardcomOwnerUserId: "owner-2",
      fellbackToOrgOwner: true,
    });
    createReceiptMock.mockResolvedValue({
      success: true,
      receiptNumber: "CC-777",
      receiptUrl: "https://cardcom/doc/777",
    });

    const result = await issueReceipt({
      userId: "user-2",
      paymentId: "pay-2",
      amount: 299,
      clientName: "אברהם שפירא",
      description: "תשלום עבור טיפול",
      method: "CASH",
    });

    expect(result.hasReceipt).toBe(true);
    expect(result.receiptNumber).toBe("CC-777");
    // מסלול ה-fallback של הקליניקה נשמר: הקבלה הופקה דרך מסוף הבעלים.
    expect(createBillingServiceMock).toHaveBeenCalledWith("owner-2");
    expect(createReceiptMock).toHaveBeenCalledTimes(1);
    // לא הוקצה מספר פנימי.
    expect(userUpdateMock).not.toHaveBeenCalled();
  });
});
