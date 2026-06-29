import { type PaymentStatus, type Prisma } from "@prisma/client";

// ================================================================
// Types
// ================================================================

export type PaymentMethod =
  | "CASH"
  | "CREDIT_CARD"
  | "BANK_TRANSFER"
  | "CHECK"
  | "CREDIT"
  | "OTHER";

export type PaymentType = "FULL" | "PARTIAL" | "ADVANCE";

// ================================================================
// Bulk Cardcom Umbrella marker
// ================================================================
// Payment שנוצר במסלול charge-cardcom-bulk הוא "מטה" שמאחסן את החיוב הכולל
// + הקבלה. אסור להציג אותו ב-totals/exports/history כי הסכום שלו כבר נספר
// דרך ה-children שתחת ה-Payments האמיתיים. הסימון נשמר ב-notes עם הקידומת
// הזאת — תוסיף לו כל מי שמחשב סכומים או מציג רשימת תשלומים.
export const BULK_UMBRELLA_NOTES_PREFIX = "[BULK_UMBRELLA]";

/**
 * Prisma where clause שמסנן Umbrella payments מתצוגות/חישובים.
 *
 * CRITICAL — Postgres NULL handling: `NOT (notes LIKE 'x%')` כש-notes הוא NULL
 * מחזיר NULL, ו-Postgres מסנן NULL ב-WHERE כאילו זה FALSE. זה היה גורם לכל
 * Payment עם notes ריק (= רוב התשלומים הישנים שלא דרך bulk) להיעלם מתצוגות
 * הקבלות, הדוחות והסיכומים. הפתרון: OR מפורש שמתיר notes=null וגם notes
 * שלא מתחיל ב-prefix. בלי NOT מסביב, רק תנאים חיוביים — אין שום NULL trap.
 */
export const EXCLUDE_BULK_UMBRELLA_WHERE: Prisma.PaymentWhereInput = {
  OR: [
    { notes: null },
    { notes: { not: { startsWith: BULK_UMBRELLA_NOTES_PREFIX } } },
  ],
};

export interface PaymentResult {
  success: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma model with many fields
  payment?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Prisma model with many fields
  childPayment?: any;
  receiptNumber?: string | null;
  receiptUrl?: string | null;
  receiptError?: string;
  error?: string;
}

// קבלה בודדת שהופקה בתשלום מצרפי — מוחזרת ל-UI כדי להציג/להדפיס אותה מיד
// אחרי התשלום (כמו בתשלום פגישה בודדת). paymentId הוא ה-child שעליו נשמרה
// הקבלה (קבלה לכל פגישה) או ה-umbrella (קבלה אחת מאוחדת).
export interface BulkReceiptItem {
  paymentId: string;
  receiptNumber: string | null;
  receiptUrl: string | null;
}

export interface BulkPaymentResult {
  success: boolean;
  updatedPayments: number;
  totalPaid: number;
  remainingAmount: number;
  message: string;
  error?: string;
  // קבלות שהופקו בפועל (ריק כשלא הופקה קבלה — businessType NONE / לא נבחרה
  // קבלה). ה-UI מציג קבלה אחת ישירות, וכמה קבלות בדיאלוג ריבוי-קבלות.
  receipts?: BulkReceiptItem[];
}

export interface ReceiptResult {
  receiptNumber: string | null;
  receiptUrl: string | null;
  hasReceipt: boolean;
  error?: string;
}

export interface ClientDebtSummary {
  id: string;
  name: string;
  email?: string | null;
  creditBalance: number;
  totalDebt: number;
  unpaidSessions: Array<{
    paymentId: string;
    sessionId: string | null;
    date: Date;
    amount: number;
    expectedAmount: number;
    paidAmount: number;
    status: string;
    partialPaymentDate?: Date | null;
  }>;
}

export interface AllClientsDebtItem {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  // יומן רב-מטפלים: המטפל/ת של המטופל/ת — להצגת נקודת-צבע + שם במצב "כל הקליניקה".
  therapistId: string | null;
  therapistName: string | null;
  totalDebt: number;
  creditBalance: number;
  unpaidSessionsCount: number;
  unpaidSessions: Array<{
    paymentId: string;
    amount: number;
    paidAmount: number;
    date: Date;
    sessionId: string | null;
    partialPaymentDate: Date | null;
  }>;
}

// Re-used in createPaymentForSession params
export type { PaymentStatus };
