// H12: zod schema לעדכון הגדרות AI. ה-customAIInstructions נשמר ב-DB ונשלח
// כ-system prompt ל-LLM — חייב cap כדי למנוע prompt injection ענק ועלות מיותרת
// על tokens.

import { z } from "zod";

const MAX_FREE_TEXT = 2000;
const MAX_APPROACHES = 20;

// approach: short slug — DBT/CBT/ACT/MINDFULNESS/וכו'. cap 50 כדי לא לאפשר
// strings ענקיים גם שם.
const APPROACH_MAX = 50;

export const updateAiSettingsSchema = z.object({
  // optional + default [] — שומר על תאימות עם partial updates שלא שולחים את השדה.
  therapeuticApproaches: z
    .array(z.string().min(1).max(APPROACH_MAX))
    .max(MAX_APPROACHES, "יותר מדי גישות (מקסימום 20)")
    .optional()
    .default([]),
  approachDescription: z
    .string()
    .max(MAX_FREE_TEXT, `תיאור גישה ארוך מדי (מקסימום ${MAX_FREE_TEXT} תווים)`)
    .optional()
    .or(z.literal("")),
  analysisStyle: z
    .string()
    .max(50)
    .optional()
    .or(z.literal("")),
  aiTone: z.string().max(50).optional().or(z.literal("")),
  customAIInstructions: z
    .string()
    .max(MAX_FREE_TEXT, `הוראות AI ארוכות מדי (מקסימום ${MAX_FREE_TEXT} תווים)`)
    .optional()
    .or(z.literal("")),
});

export type UpdateAiSettingsInput = z.infer<typeof updateAiSettingsSchema>;
