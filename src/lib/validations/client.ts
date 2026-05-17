import { z } from "zod";
import { ClientStatus } from "@prisma/client";

// H12: caps על כל שדות free-text. address ו-notes נכנסים ל-UI ולמיילים — חשוב cap.

const MAX_FIRST_NAME = 80;
const MAX_LAST_NAME = 80;
const MAX_PHONE = 30;
const MAX_ADDRESS = 500;
const MAX_NOTES = 5_000;

export const createClientSchema = z.object({
  firstName: z.string().trim().min(1, "שם פרטי הוא שדה חובה").max(MAX_FIRST_NAME, "שם פרטי ארוך מדי"),
  lastName: z.string().trim().min(1, "שם משפחה הוא שדה חובה").max(MAX_LAST_NAME, "שם משפחה ארוך מדי"),
  phone: z.string().max(MAX_PHONE, "טלפון ארוך מדי").optional(),
  email: z.string().max(254, "מייל ארוך מדי").email("כתובת מייל לא תקינה").optional().or(z.literal("")),
  birthDate: z.string().max(40).optional(),
  address: z.string().max(MAX_ADDRESS, "כתובת ארוכה מדי").optional(),
  notes: z.string().max(MAX_NOTES, "הערות ארוכות מדי").optional(),
  status: z.nativeEnum(ClientStatus).optional(),
  defaultSessionPrice: z.union([z.number().min(0).max(100_000), z.string().max(20)]).optional(),
  // M1 — הסכמה לעיבוד AI בזמן יצירת המטופל. אם לא נשלח, ה-default ב-DB הוא true.
  consentToAI: z.boolean().optional(),
});

export type CreateClientInput = z.infer<typeof createClientSchema>;

// סכמה ליצירת פונה מהיר (פגישת ייעוץ) — מינימום שדות
export const createQuickClientSchema = z.object({
  name: z.string().trim().min(1, "שם הוא שדה חובה").max(MAX_FIRST_NAME + MAX_LAST_NAME + 1, "שם ארוך מדי"),
  phone: z.string().max(MAX_PHONE, "טלפון ארוך מדי").optional(),
  email: z.string().max(254, "מייל ארוך מדי").email("כתובת מייל לא תקינה").optional().or(z.literal("")),
  defaultSessionPrice: z.union([z.number().min(0).max(100_000), z.string().max(20)]).optional(),
}).refine(
  (data) => data.phone || data.email,
  { message: "נדרש טלפון או מייל", path: ["phone"] }
);

export type CreateQuickClientInput = z.infer<typeof createQuickClientSchema>;

// PUT של [id]/route.ts — partial update.
export const updateClientSchema = z.object({
  firstName: z.string().trim().min(1).max(MAX_FIRST_NAME, "שם פרטי ארוך מדי").optional(),
  lastName: z.string().trim().min(1).max(MAX_LAST_NAME, "שם משפחה ארוך מדי").optional(),
  phone: z.string().max(MAX_PHONE, "טלפון ארוך מדי").optional().nullable(),
  email: z.string().max(254).email("כתובת מייל לא תקינה").optional().or(z.literal("")).nullable(),
  birthDate: z.string().max(40).optional().nullable(),
  address: z.string().max(MAX_ADDRESS, "כתובת ארוכה מדי").optional().nullable(),
  notes: z.string().max(MAX_NOTES, "הערות ארוכות מדי").optional().nullable(),
  status: z.nativeEnum(ClientStatus).optional(),
  defaultSessionPrice: z
    .union([z.number().min(0).max(100_000), z.string().max(20), z.null()])
    .optional(),
});
export type UpdateClientInput = z.infer<typeof updateClientSchema>;

// add-credit endpoint — סכום חיובי בלבד, עם הערה אופציונלית.
// השדה ב-route הוא `notes` (תואם לסכמת payment.notes ב-DB).
export const addCreditSchema = z.object({
  amount: z
    .union([z.number(), z.string()])
    .refine((v) => {
      const n = typeof v === "number" ? v : parseFloat(String(v));
      return Number.isFinite(n) && n > 0 && n <= 1_000_000;
    }, { message: "סכום לא תקין" }),
  notes: z.string().max(500, "הערה ארוכה מדי").optional().or(z.literal("")),
});
export type AddCreditInput = z.infer<typeof addCreditSchema>;

// contact endpoint — איש קשר משני (אופציונלי).
export const updateContactSchema = z.object({
  contactName: z.string().max(80, "שם איש קשר ארוך מדי").optional().nullable(),
  contactPhone: z.string().max(MAX_PHONE, "טלפון ארוך מדי").optional().nullable(),
  contactEmail: z.string().max(254).email("מייל לא תקין").optional().or(z.literal("")).nullable(),
  contactRelationship: z.string().max(80).optional().nullable(),
});
export type UpdateContactInput = z.infer<typeof updateContactSchema>;
