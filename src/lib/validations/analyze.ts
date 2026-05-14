// H12: zod schemas ל-AI analysis endpoints.
// תוכן הניתוח עצמו (note/transcription) יכול להיות גדול — cap נדיב, אבל
// לא בלתי מוגבל (DoS על LLM provider).

import { z } from "zod";

const MAX_NOTE_CONTENT = 100_000;
const MAX_TRANSCRIPTION = 500_000;
const MAX_SUMMARY_ITEM = 100_000;

// POST /api/analyze — תיוג transcription קיים.
export const analyzeTranscriptionSchema = z.object({
  transcriptionId: z
    .string()
    .min(1, "נא לספק מזהה תמלול")
    .max(64, "מזהה תמלול לא תקין"),
  type: z.enum(["INTAKE", "SESSION"]).optional(),
});
export type AnalyzeTranscriptionInput = z.infer<typeof analyzeTranscriptionSchema>;

// POST /api/analyze/note — ניתוח של sessionNote freeform.
export const analyzeNoteSchema = z.object({
  noteContent: z
    .string()
    .min(10, "נא לכתוב סיכום מפורט יותר לפני הניתוח")
    .max(MAX_NOTE_CONTENT, "התוכן ארוך מדי לניתוח"),
  clientId: z.string().max(64).optional().nullable(),
});
export type AnalyzeNoteInput = z.infer<typeof analyzeNoteSchema>;

// POST /api/analyze/summary — שתי תצורות (transcription או summaries[]).
// משאיר את כולן optional עם refine שמוודא שאחת מהן סופקה.
const summaryItem = z.object({
  date: z.string().max(64),
  content: z.string().max(MAX_SUMMARY_ITEM, "סיכום ארוך מדי"),
});

export const analyzeSummarySchema = z
  .object({
    transcription: z
      .string()
      .max(MAX_TRANSCRIPTION, "התמלול ארוך מדי")
      .optional(),
    summaries: z.array(summaryItem).max(200, "יותר מדי סיכומים").optional(),
    clientId: z.string().max(64).optional().nullable(),
    analysisType: z.enum(["comprehensive"]).optional(),
  })
  .refine(
    (data) =>
      (data.transcription && data.transcription.length > 0) ||
      (data.summaries && data.summaries.length > 0),
    { message: "נא לספק תמלול או סיכומים" }
  );
export type AnalyzeSummaryInput = z.infer<typeof analyzeSummarySchema>;
