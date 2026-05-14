// H12: zod schemas ל-recordings.
// קובץ הקלטה עצמו (audioData) מאומת ע"י lib/file-validation עם magic-bytes +
// size caps. כאן רק metadata שמגיע ב-JSON.

import { z } from "zod";

// audioData הוא base64 — cap על אורך כדי למנוע DoS על JSON parser לפני
// שמגיע ל-validateBase64Size. 50MB binary ≈ 67MB base64. נקבע cap על
// 80MB string כדי להשאיר margin.
const MAX_AUDIO_BASE64_LENGTH = 80 * 1024 * 1024;

const MIME_TYPE_REGEX = /^[a-zA-Z0-9!#$&^_+\-]+\/[a-zA-Z0-9!#$&^_.+\-]+$/;

export const createRecordingSchema = z.object({
  audioData: z
    .string()
    .min(1, "לא נשלח קובץ אודיו")
    .max(MAX_AUDIO_BASE64_LENGTH, "הקלטה גדולה מדי"),
  mimeType: z
    .string()
    .trim()
    .max(120, "סוג מדיה לא תקין")
    .regex(MIME_TYPE_REGEX, "סוג מדיה לא תקין")
    .optional(),
  durationSeconds: z.number().int().min(0).max(86_400).optional(),
  type: z.enum(["INTAKE", "SESSION"]).optional(),
  clientId: z.string().max(64).optional().nullable(),
  sessionId: z.string().max(64).optional().nullable(),
});
export type CreateRecordingInput = z.infer<typeof createRecordingSchema>;

// search params של GET — clientId/status אופציונליים.
export const listRecordingsQuerySchema = z.object({
  clientId: z.string().max(64).optional(),
  status: z
    .enum(["PENDING", "TRANSCRIBING", "TRANSCRIBED", "ANALYZED", "ERROR"])
    .optional(),
});
export type ListRecordingsQueryInput = z.infer<typeof listRecordingsQuerySchema>;
