/**
 * Pure debt calculation helpers (no DB/server dependencies).
 * Safe to import in both server components and "use client" components.
 * All trunk read functions delegate to these for consistency.
 */

export function calculateDebtFromPayments(
  payments: Array<{ amount: unknown; expectedAmount: unknown }>
): number {
  return payments
    .filter((p) => {
      const paid = Number(p.amount);
      const expected = Number(p.expectedAmount) || 0;
      return expected > 0 && paid < expected;
    })
    .reduce(
      (sum, p) => sum + (Number(p.expectedAmount) - Number(p.amount)),
      0
    );
}

export function calculateSessionDebt(session: {
  price: unknown;
  payment?: { amount: unknown; expectedAmount: unknown } | null;
}): number {
  if (!session.payment) return Number(session.price) || 0;
  const paid = Number(session.payment.amount);
  const expected = Number(session.payment.expectedAmount) || 0;
  if (expected > 0 && paid < expected) return expected - paid;
  return 0;
}

export function calculateDebtFromSessions(
  sessions: Array<{
    price: unknown;
    payment?: { amount: unknown; expectedAmount: unknown } | null;
  }>
): number {
  return sessions.reduce((sum, s) => sum + calculateSessionDebt(s), 0);
}

/**
 * paidAmount הקנוני לתשלום — הסכום ששולם בפועל (לא placeholder לסליקה ממתינה).
 *
 * הפונקציה הזאת היא מקור-האמת היחיד; חובה לקרוא לה בכל מקום שמחשב "כמה
 * שולם" / "כמה נותר" של פגישה. בלעדיה — קוד נופל בתרחישים הבאים:
 *   • PENDING+CC ללא ראיית קבלה: parent.amount הוא placeholder לסליקה
 *     ממתינה, לא משהו ששולם → צריך 0.
 *   • PENDING+CC עם hasReceipt=true: webhook עדכן parent.amount לסכום
 *     הסליקה החלקית ו-Cardcom הנפיק קבלה → צריך amount.
 *   • PENDING+CC עם children PAID: השלמת אשראי חלקי על גבי מזומן קיים
 *     (bumpParentOnChildApproval) → צריך sum(children).
 *   • PAID                                                → amount.
 *   • PENDING+CASH/CHECK/BANK                             → amount.
 *
 * שימי לב: האלגוריתם זהה לזה ב-/api/sessions/route.ts (enriched). אם אחד
 * משניים משתנה, השני חייב להתעדכן באותו זמן.
 */
export function calculatePaidAmount(payment: {
  amount: unknown;
  status: string;
  method?: string | null;
  hasReceipt?: boolean | null;
  childPayments?: Array<{ amount: unknown; status: string }>;
}): number {
  const amount = Number(payment.amount) || 0;
  if (payment.status === "PAID") return amount;
  const childrenPaidSum = (payment.childPayments ?? [])
    .filter((c) => c.status === "PAID")
    .reduce((sum, c) => sum + Number(c.amount || 0), 0);
  if (childrenPaidSum > 0) return childrenPaidSum;
  if (payment.method === "CREDIT_CARD") {
    return payment.hasReceipt ? amount : 0;
  }
  return amount;
}
