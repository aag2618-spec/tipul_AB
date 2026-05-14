// H12: zod schemas ל-documents.
// POST של documents הוא multipart/form-data (file + שדות) — לא JSON.
// formData fields מתאמתים ב-route דרך documentFormFieldsSchema.

import { z } from "zod";

const MAX_DOC_NAME = 255;

const DOCUMENT_TYPE = z.enum([
  "CONSENT_FORM",
  "INTAKE_FORM",
  "TREATMENT_PLAN",
  "REPORT",
  "OTHER",
]);

// השדות הטקסטואליים מ-FormData (POST /api/documents).
// file עצמו נבדק ב-validateFileBuffer בנפרד.
export const documentFormFieldsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "שם המסמך הוא שדה חובה")
    .max(MAX_DOC_NAME, `שם ארוך מדי (מקסימום ${MAX_DOC_NAME} תווים)`),
  type: DOCUMENT_TYPE,
  clientId: z.string().max(64).optional().nullable(),
});
export type DocumentFormFieldsInput = z.infer<typeof documentFormFieldsSchema>;

// PUT /api/documents/[id] — partial update.
export const updateDocumentSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "שם לא יכול להיות ריק")
    .max(MAX_DOC_NAME, `שם ארוך מדי (מקסימום ${MAX_DOC_NAME} תווים)`)
    .optional(),
  type: DOCUMENT_TYPE.optional(),
  signed: z.boolean().optional(),
});
export type UpdateDocumentInput = z.infer<typeof updateDocumentSchema>;
