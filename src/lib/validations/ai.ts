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
// dateFrom/dateTo חובה ובפורמט נפרס — ה-route משתמש בהם ל-new Date(); אם
// המחרוזת לא ניתנת לפירוש Prisma היה זורק 500. refine מחזיר 400 ידידותי.
const parsableDate = z
  .string()
  .min(1, "תאריך חובה")
  .max(64)
  .refine((s) => !Number.isNaN(Date.parse(s)), "תאריך לא תקין");

export const aiProgressReportSchema = z.object({
  clientId: zId,
  dateFrom: parsableDate,
  dateTo: parsableDate,
});
export type AiProgressReportInput = z.infer<typeof aiProgressReportSchema>;
