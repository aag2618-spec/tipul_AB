import { z } from "zod";
import { PaymentMethod, PaymentStatus, PaymentType } from "@prisma/client";

// H2 (2026-05-17): schemas נוקשים ל-payment routes. הכלל: כל schema שמקבל
// body חיצוני חייב להיות `.strict()` כדי לחסום שדות נוספים שעלולים להיות
// NoSQL/Prisma injection (`{ "$ne": null }`) או mass-assignment.

const VALID_PAYMENT_METHODS = [
  "CASH",
  "CREDIT_CARD",
  "BANK_TRANSFER",
  "CHECK",
  "CREDIT",
  "OTHER",
] as const;

const VALID_PAYMENT_MODES = ["FULL", "PARTIAL"] as const;

const idString = () => z.string().trim().min(1).max(100);
const reasonString = () => z.string().trim().max(500).optional();

export const createPaymentSchema = z
  .object({
    clientId: z.string().min(1),
    sessionId: z.string().optional(),
    amount: z
      .union([z.number(), z.string()])
      .refine((val) => Number(val) > 0, { message: "סכום חייב להיות חיובי" }),
    expectedAmount: z.union([z.number(), z.string()]).optional(),
    paymentType: z.nativeEnum(PaymentType).default("FULL"),
    method: z.nativeEnum(PaymentMethod).optional(),
    status: z.nativeEnum(PaymentStatus).optional(),
    notes: z.string().max(2000).optional(),
    creditUsed: z.union([z.number(), z.string()]).optional(),
    issueReceipt: z.boolean().optional(),
    // ה-UI ב-`payments/new/page.tsx` שולח paidAt (ISO string) לסטטוס PAID.
    // ה-route לא משתמש בו ישירות (createPaymentForSession קובע paidAt לפי
    // הסטטוס), אבל strict ידחה אם לא נכלל ב-schema.
    paidAt: z.string().datetime().nullable().optional(),
  })
  .strict();

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>;

// pay-client-debts — תשלום מצרפי ידני (CASH/CHECK/etc., לא CREDIT_CARD).
export const payClientDebtsSchema = z
  .object({
    clientId: idString(),
    paymentIds: z.array(idString()).min(1).max(200),
    totalAmount: z.number().finite().positive(),
    method: z.enum(VALID_PAYMENT_METHODS),
    paymentMode: z.enum(VALID_PAYMENT_MODES).optional(),
    creditUsed: z.number().finite().nonnegative().optional(),
    issueReceipt: z.boolean().optional(),
    // קבלה אחת מאוחדת על כל הפגישות (במקום קבלה לכל פגישה) — opt-in, כבוי
    // כברירת מחדל. combinedReceiptDescription = טקסט חופשי שמופיע על הקבלה;
    // אם ריק, השרת בונה תיאור עם רשימת הפגישות והתאריכים.
    combinedReceipt: z.boolean().optional(),
    combinedReceiptDescription: z.string().max(500).optional(),
  })
  .strict();

// charge-cardcom — סליקת אשראי לתשלום בודד.
export const chargeCardcomSchema = z
  .object({
    numOfPayments: z.number().int().min(1).max(36).optional(),
    createToken: z.boolean().optional(),
    successRedirectUrl: z.string().url().max(2048).optional(),
    failedRedirectUrl: z.string().url().max(2048).optional(),
  })
  .strict();

// charge-cardcom-bulk — סליקה מצרפית.
export const chargeCardcomBulkSchema = z
  .object({
    clientId: idString(),
    paymentIds: z.array(idString()).min(1).max(50),
    totalAmount: z.number().finite().positive(),
    numOfPayments: z.number().int().min(1).max(36).optional(),
    createToken: z.boolean().optional(),
    description: z.string().max(500).optional(),
    successRedirectUrl: z.string().url().max(2048).optional(),
    failedRedirectUrl: z.string().url().max(2048).optional(),
  })
  .strict();

// cancel-link — ביטול קישור תשלום פתוח.
export const cancelCardcomLinkSchema = z
  .object({
    transactionId: idString().optional(),
    reason: reasonString(),
  })
  .strict();

// send-cardcom-link — שליחת לינק תשלום לקליינט.
export const sendCardcomLinkSchema = z
  .object({
    paymentPageUrl: z.string().url().max(2048),
    channels: z.array(z.enum(["sms", "email"])).min(1).max(2),
  })
  .strict();

// cardcom-refund — זיכוי לקוח.
export const cardcomRefundSchema = z
  .object({
    amount: z.number().finite().positive().optional(),
    reason: z.string().trim().min(1).max(500),
  })
  .strict();

// charge-saved-token — חיוב כרטיס שמור.
export const chargeSavedTokenSchema = z
  .object({
    savedCardTokenId: idString(),
  })
  .strict();

// snooze-debt POST — דחיית התראת חוב של מטופל ("אל תזכיר לי עד תאריך X").
export const snoozeDebtSchema = z
  .object({
    clientId: idString(),
    // ISO datetime עתידי. הלקוח מחשב לפי שבוע/חודש/תאריך נבחר; השרת מאמת
    // שהוא בעתיד וחוסם דחייה רחוקה מדי (מקס ~13 חודשים) כדי שחוב לא ייעלם לנצח.
    snoozeUntil: z
      .string()
      .datetime()
      .refine(
        (val) => {
          const t = new Date(val).getTime();
          const now = Date.now();
          return t > now && t <= now + 400 * 24 * 60 * 60 * 1000;
        },
        { message: "תאריך דחייה לא תקין" }
      ),
  })
  .strict();

// snooze-debt DELETE — ביטול דחייה.
export const unsnoozeDebtSchema = z
  .object({
    clientId: idString(),
  })
  .strict();
