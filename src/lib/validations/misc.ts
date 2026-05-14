// H12: zod schemas שונים — cancellation, health insurers, וכו'.

import { z } from "zod";

const MAX_NOTES = 2_000;
const MAX_REASON = 500;
const MAX_API_KEY = 1_000;

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

// PUT /api/health-insurers/settings — מבנה שטוח, חברה לחברה.
// השדות עוברים upsert ב-Prisma ולכן מוגבלים לטיפוסי DB.
const apiKeyField = z
  .string()
  .max(MAX_API_KEY, "מפתח API ארוך מדי")
  .optional()
  .nullable();

export const updateInsurerSettingsSchema = z
  .object({
    enabled: z.boolean().optional(),
    autoSubmit: z.boolean().optional(),
    clalitEnabled: z.boolean().optional(),
    clalitApiKey: apiKeyField,
    clalitFacilityId: z.string().max(200).optional().nullable(),
    maccabiEnabled: z.boolean().optional(),
    maccabiApiKey: apiKeyField,
    maccabiProviderId: z.string().max(200).optional().nullable(),
    meuhedetEnabled: z.boolean().optional(),
    meuhedetUsername: z.string().max(200).optional().nullable(),
    meuhedetPassword: z.string().max(MAX_API_KEY).optional().nullable(),
    leumitEnabled: z.boolean().optional(),
    leumitApiKey: apiKeyField,
    leumitClinicCode: z.string().max(200).optional().nullable(),
  })
  .strict();
export type UpdateInsurerSettingsInput = z.infer<typeof updateInsurerSettingsSchema>;
