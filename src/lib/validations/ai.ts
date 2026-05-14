// H12: zod schemas ל-AI endpoints (transcribe + ai/* clinical analysis).
// כל ה-endpoints כבר מטפלים ב-rate limits וב-scope; כאן רק caps + טיפוסים.

import { z } from "zod";

const zId = z.string().min(1).max(64);

// POST /api/transcribe — תמלול הקלטה.
export const transcribeRecordingSchema = z.object({
  recordingId: zId,
  force: z.boolean().optional(),
});
export type TranscribeRecordingInput = z.infer<typeof transcribeRecordingSchema>;

// PATCH /api/transcribe/[id] — עדכון תוכן תמלול. cap על תוכן.
export const updateTranscriptionSchema = z.object({
  content: z
    .string()
    .min(1, "תוכן התמלול חסר")
    .max(500_000, "תוכן התמלול ארוך מדי"),
});
export type UpdateTranscriptionInput = z.infer<typeof updateTranscriptionSchema>;

// POST /api/ai/session-prep — הכנה לפגישה.
export const aiSessionPrepSchema = z.object({
  clientId: zId,
  sessionDate: z.string().max(64).optional(),
});
export type AiSessionPrepInput = z.infer<typeof aiSessionPrepSchema>;

// POST /api/ai/session/analyze — ניתוח פגישה.
export const aiSessionAnalyzeSchema = z.object({
  sessionId: zId,
  analysisType: z.enum(["CONCISE", "DETAILED"], {
    errorMap: () => ({ message: "סוג ניתוח לא תקין" }),
  }),
  force: z.boolean().optional(),
});
export type AiSessionAnalyzeInput = z.infer<typeof aiSessionAnalyzeSchema>;

// POST /api/ai/questionnaire/analyze-single — ניתוח שאלון בודד.
export const aiAnalyzeSingleQuestionnaireSchema = z.object({
  responseId: zId,
});
export type AiAnalyzeSingleQuestionnaireInput = z.infer<
  typeof aiAnalyzeSingleQuestionnaireSchema
>;

// POST /api/ai/questionnaire/analyze-combined — ניתוח שאלונים משולב.
export const aiAnalyzeCombinedQuestionnaireSchema = z.object({
  clientId: zId,
});
export type AiAnalyzeCombinedQuestionnaireInput = z.infer<
  typeof aiAnalyzeCombinedQuestionnaireSchema
>;

// POST /api/ai/questionnaire/progress-report — דוח התקדמות.
// dateFrom/dateTo חובה — ה-route משתמש בהם ל-new Date() ללא fallback.
export const aiProgressReportSchema = z.object({
  clientId: zId,
  dateFrom: z.string().min(1, "תאריך התחלה חובה").max(64),
  dateTo: z.string().min(1, "תאריך סיום חובה").max(64),
});
export type AiProgressReportInput = z.infer<typeof aiProgressReportSchema>;
