// H12: zod schemas ל-questionnaireResponse (שונה מ-intakeResponse — שאלוני
// הערכה רפואיים-קליניים תקניים).

import { z } from "zod";

const zId = z.string().min(1).max(64);

const RESPONSE_STATUS = z.enum(["IN_PROGRESS", "COMPLETED", "ANALYZED"]);

const MAX_JSON_SIZE = 200_000;

const jsonCap = (label: string) =>
  z
    .union([z.record(z.unknown()), z.array(z.unknown())])
    .refine(
      (v) => {
        try {
          return JSON.stringify(v).length <= MAX_JSON_SIZE;
        } catch {
          return false;
        }
      },
      { message: `${label} גדולים מדי` }
    );

// POST /api/questionnaires/responses — יצירת תגובה חדשה לשאלון תקני.
export const createQuestionnaireResponseSchema = z.object({
  templateId: zId,
  clientId: zId,
});
export type CreateQuestionnaireResponseInput = z.infer<
  typeof createQuestionnaireResponseSchema
>;

// PATCH /api/questionnaires/responses/[id] — partial update.
export const updateQuestionnaireResponseSchema = z.object({
  answers: jsonCap("תשובות").optional(),
  status: RESPONSE_STATUS.optional(),
  totalScore: z.number().min(-10_000).max(10_000).optional().nullable(),
  subscores: jsonCap("ציוני משנה").optional(),
});
export type UpdateQuestionnaireResponseInput = z.infer<
  typeof updateQuestionnaireResponseSchema
>;
