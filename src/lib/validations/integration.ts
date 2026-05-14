// H12: zod schemas ל-integrations/billing.
// קונבנציה: apiKey/apiSecret מוצפנים ב-route עצמו דרך lib/encryption.
// כאן רק caps + provider enum + שדות אופציונליים.

import { z } from "zod";

const MAX_API_KEY = 2_000;
const MAX_API_SECRET = 2_000;
const MAX_DISPLAY_NAME = 120;

const PROVIDER_TYPE = z.enum([
  "MESHULAM",
  "ICOUNT",
  "GREEN_INVOICE",
  "SUMIT",
  "PAYPLUS",
  "CARDCOM",
  "TRANZILA",
]);

export const createBillingProviderSchema = z.object({
  provider: PROVIDER_TYPE,
  apiKey: z
    .string()
    .trim()
    .min(1, "מפתח API חובה")
    .max(MAX_API_KEY, "מפתח API ארוך מדי"),
  apiSecret: z
    .string()
    .trim()
    .max(MAX_API_SECRET, "סוד API ארוך מדי")
    .optional()
    .nullable(),
  displayName: z
    .string()
    .trim()
    .max(MAX_DISPLAY_NAME, "שם תצוגה ארוך מדי")
    .optional()
    .nullable(),
});
export type CreateBillingProviderInput = z.infer<typeof createBillingProviderSchema>;

// PATCH של [id]/route.ts — settings הוא Json field חופשי, cap על גודל הסיריאליז.
export const updateBillingProviderSchema = z
  .object({
    isActive: z.boolean().optional(),
    isPrimary: z.boolean().optional(),
    settings: z
      .record(z.unknown())
      .refine(
        (v) => {
          try {
            return JSON.stringify(v).length <= 10_000;
          } catch {
            return false;
          }
        },
        { message: "settings גדול מדי" }
      )
      .optional(),
  })
  .strict();
export type UpdateBillingProviderInput = z.infer<typeof updateBillingProviderSchema>;

// test connection — providerId בלבד.
export const testBillingProviderSchema = z.object({
  providerId: z
    .string()
    .trim()
    .min(1, "חסר מזהה ספק")
    .max(64, "מזהה ספק לא תקין"),
});
export type TestBillingProviderInput = z.infer<typeof testBillingProviderSchema>;
