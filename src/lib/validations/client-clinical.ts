// H12: zod schemas ל-clinical endpoints על Client (גישות + הקשר תרבותי).
// תוכן קליני — caps כדי למנוע XSS payloads + DoS דרך טקסטים ענקיים.

import { z } from "zod";

const MAX_APPROACHES = 20;
const MAX_APPROACH_ID = 64;
const MAX_APPROACH_NOTES = 5_000;
const MAX_CULTURAL_CONTEXT = 5_000;

export const updateClientApproachesSchema = z.object({
  therapeuticApproaches: z
    .array(z.string().min(1).max(MAX_APPROACH_ID))
    .max(MAX_APPROACHES, `יותר מדי גישות (מקסימום ${MAX_APPROACHES})`)
    .optional(),
  approachNotes: z
    .string()
    .max(
      MAX_APPROACH_NOTES,
      `הערות על גישה ארוכות מדי (מקסימום ${MAX_APPROACH_NOTES} תווים)`
    )
    .optional()
    .nullable(),
  culturalContext: z
    .string()
    .max(
      MAX_CULTURAL_CONTEXT,
      `הקשר תרבותי ארוך מדי (מקסימום ${MAX_CULTURAL_CONTEXT} תווים)`
    )
    .optional()
    .nullable(),
});
export type UpdateClientApproachesInput = z.infer<typeof updateClientApproachesSchema>;
