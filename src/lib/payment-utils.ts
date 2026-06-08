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

/**
 * האם רשומת-אב שמגלגלת תחתיה תשלומי-ילדים (parentPaymentId===null ויש לפחות
 * ילד אחד). דוחות הכנסה סופרים כל ילד בנפרד, ולכן עבור הורה כזה אסור לספור
 * את amount המלא שלו (כפילות) — סופרים רק את "חלק-האב" (calculateParentOwnPortion).
 */
export function isRollupParentPayment(payment: {
  parentPaymentId?: string | null;
  childPayments?: Array<unknown> | null;
}): boolean {
  return (
    (payment.parentPaymentId ?? null) === null &&
    (payment.childPayments?.length ?? 0) > 0
  );
}

/**
 * "חלק-האב" בתשלום מפוצל — הסכום ששולם ישירות על רשומת-האב ולא תועד כשורת-ילד.
 * המקרה הקלאסי: אשראי (Cardcom) שחויב על האב לפני שנוספו תשלומי מזומן כ-children;
 * האשראי נבלע ב-amount של האב ואינו מופיע כ-child, ולכן דוחות שסוכמים רק ילדים
 * מאבדים אותו. השווי = amount של האב פחות סכום הילדים ששולמו.
 *   • תשלום רגיל (הילדים מסתכמים ל-amount)        → 0
 *   • תשלום ללא ילדים                              → 0 (נספר ישירות ע"י amount)
 *   • תשלום מפוצל אשראי+מזומן (₪52 על האב)         → 52
 * תמיד אי-שלילי.
 */
export function calculateParentOwnPortion(payment: {
  amount: unknown;
  childPayments?: Array<{ amount: unknown; status?: string }> | null;
}): number {
  const children = payment.childPayments ?? [];
  if (children.length === 0) return 0;
  const amount = Number(payment.amount) || 0;
  // רק ילדים ב-PAID (עקבי עם calculatePaidAmount). זה הנכון מול זרימת ההחזר:
  // החזר ילד-אשראי מקזז את parent.amount (un-bump), והחזר אשראי-על-האב מסמן
  // את ההורה REFUNDED — כך amount תמיד נטו וחלק-האב לא מנופח.
  const childrenPaidSum = children
    .filter((c) => c.status === "PAID")
    .reduce((sum, c) => sum + (Number(c.amount) || 0), 0);
  return Math.max(0, Math.round((amount - childrenPaidSum) * 100) / 100);
}

/**
 * תרומת רשומת תשלום בודדת לסך ההכנסה, כשסוכמים רשימה שכוללת גם ילדים, גם
 * הורים-ללא-ילדים וגם הורים-מגלגלים. לילד / הורה-ללא-ילדים → amount. להורה
 * מגלגל → רק חלק-האב (הילדים נספרים בנפרד). כך אין כפילות ואין החסרה של
 * חלק האשראי בתשלום מפוצל. שימוש: reduce((s,p) => s + paymentRevenueContribution(p), 0).
 */
export function paymentRevenueContribution(payment: {
  amount: unknown;
  parentPaymentId?: string | null;
  childPayments?: Array<{ amount: unknown; status?: string }> | null;
}): number {
  return isRollupParentPayment(payment)
    ? calculateParentOwnPortion(payment)
    : Number(payment.amount) || 0;
}
