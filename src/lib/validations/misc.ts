// H12: zod schemas שונים — cancellation, bulk-payment, וכו'.

import { z } from "zod";

const MAX_NOTES = 2_000;
const MAX_REASON = 500;

// POST /api/cancellation-requests/[id]/approve — adminNotes אופציונלי.
export const approveCancellationSchema = z.object({
  adminNotes: z
    .string()
    .max(MAX_NOTES, `הערות ארוכות מדי (מקסימום ${MAX_NOTES} תווים)`)
    .optional()
    .nullable(),
});
export type ApproveCancellationInput = z.infer<typeof approveCancellationSchema>;

// POST /api/cancellation-requests/[id]/reject — reason חובה.
export const rejectCancellationSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, "נא לציין סיבת דחייה")
    .max(MAX_REASON, `סיבה ארוכה מדי (מקסימום ${MAX_REASON} תווים)`),
  adminNotes: z
    .string()
    .max(MAX_NOTES, `הערות ארוכות מדי (מקסימום ${MAX_NOTES} תווים)`)
    .optional()
    .nullable(),
});
export type RejectCancellationInput = z.infer<typeof rejectCancellationSchema>;

// === POST /api/clients/[id]/bulk-payment =======================================
// תשלום מצרפי על מספר פגישות. amount חיובי בלבד, method מ-enum סגור.
// Zod גם דוחה body מעוות (e.g. amount: { $gt: 0 } — NoSQL operator injection).
export const bulkPaymentSchema = z.object({
  amount: z
    .number()
    .positive("הסכום חייב להיות חיובי")
    .max(1_000_000, "סכום לא תקין"),
  method: z.enum(["CASH", "CREDIT_CARD", "BANK_TRANSFER", "CHECK", "CREDIT", "OTHER"], {
    errorMap: () => ({ message: "אמצעי תשלום לא תקין" }),
  }),
});
export type BulkPaymentInput = z.infer<typeof bulkPaymentSchema>;
