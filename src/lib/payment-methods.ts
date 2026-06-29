// ──────────────────────────────────────────────────────────────────
// payment-methods — מקור אמת אחד לאמצעי התשלום (שלב א' של איחוד מסכי התשלום).
//
// לפני הקובץ הזה כל מסך תשלום החזיק עותק משלו של רשימת אמצעי התשלום ושל
// מילון התרגום לעברית (`METHOD_LABELS`). התוצאה: כשמוסיפים/משנים אמצעי
// במסך אחד הוא לא מתעדכן בשאר (למשל "אשראי" מול "כרטיס אשראי"). מעכשיו —
// כל ה-dropdowns וכל התוויות מיובאים מכאן, ושינוי נעשה במקום אחד בלבד.
//
// הקובץ הוא pure data בלבד (בלי React / Prisma / שרת) ולכן בטוח לייבוא גם
// בקומפוננטות client וגם בקוד שרת.
// ──────────────────────────────────────────────────────────────────

import type { PaymentMethod } from "@/lib/payments/types";

// תווית עברית קנונית לכל אמצעי תשלום. כולל CREDIT (יתרת קרדיט פנימית)
// לתצוגה, גם אם הוא לא נבחר ישירות ב-dropdowns.
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: "מזומן",
  CREDIT_CARD: "כרטיס אשראי",
  BANK_TRANSFER: "העברה בנקאית",
  CHECK: "המחאה",
  CREDIT: "קרדיט",
  OTHER: "אחר",
};

// helper בטוח לתצוגה — מקבל גם string חופשי (נתון מה-DB) ומחזיר תווית או את
// הערך עצמו אם אינו מוכר (כדי לא להציג ריק).
export function getPaymentMethodLabel(method: string | null | undefined): string {
  if (!method) return "";
  return PAYMENT_METHOD_LABELS[method as PaymentMethod] ?? method;
}

// אמצעי התשלום שניתן לבחור ידנית ב-dropdowns של רישום תשלום. CREDIT אינו
// כאן במכוון — יתרת הקרדיט מנוהלת דרך checkbox "השתמש בקרדיט" ולא כאמצעי.
// הסדר כאן הוא הסדר שיוצג בכל המסכים.
export const PAYMENT_METHOD_SELECT_OPTIONS: Array<{
  value: Exclude<PaymentMethod, "CREDIT">;
  label: string;
}> = [
  { value: "CASH", label: PAYMENT_METHOD_LABELS.CASH },
  { value: "CREDIT_CARD", label: PAYMENT_METHOD_LABELS.CREDIT_CARD },
  { value: "BANK_TRANSFER", label: PAYMENT_METHOD_LABELS.BANK_TRANSFER },
  { value: "CHECK", label: PAYMENT_METHOD_LABELS.CHECK },
  { value: "OTHER", label: PAYMENT_METHOD_LABELS.OTHER },
];
