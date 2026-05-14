// H12: zod schemas ל-intake questionnaires. מחליף את הוולידציה הידנית
// ב-lib/validation/intake-questionnaire.ts (יישאר עד שהרוטים יעברו).
//
// מטרה: למנוע (א) DoS דרך JSON ענק, (ב) data corruption דרך טיפוסים
// לא צפויים, (ג) injection דרך שדות text שיוצגו בעתיד.

import { z } from "zod";

const MAX_NAME = 200;
const MAX_DESCRIPTION = 2_000;
const MAX_QUESTIONS = 100;
const MAX_QUESTION_LABEL = 500;
const MAX_QUESTION_OPTIONS = 50;
const MAX_OPTION_TEXT = 200;

const QUESTION_TYPE = z.enum([
  "TEXT",
  "TEXTAREA",
  "RADIO",
  "CHECKBOX",
  "SELECT",
  "NUMBER",
  "DATE",
  "EMAIL",
  "PHONE",
]);

const labelField = z
  .string()
  .max(MAX_QUESTION_LABEL, `טקסט ארוך מדי (מקסימום ${MAX_QUESTION_LABEL})`)
  .optional();

const optionItem = z.union([
  z.string().max(MAX_OPTION_TEXT, "אופציה ארוכה מדי"),
  z
    .object({
      value: z.string().max(MAX_OPTION_TEXT, "ערך ארוך מדי").optional(),
      label: z.string().max(MAX_OPTION_TEXT, "תווית ארוכה מדי").optional(),
      text: z.string().max(MAX_OPTION_TEXT, "טקסט ארוך מדי").optional(),
    })
    .passthrough(),
]);

const questionItem = z
  .object({
    type: QUESTION_TYPE.optional(),
    label: labelField,
    text: labelField,
    title: labelField,
    question: labelField,
    options: z
      .array(optionItem)
      .max(MAX_QUESTION_OPTIONS, `יותר מדי אפשרויות (מקסימום ${MAX_QUESTION_OPTIONS})`)
      .optional(),
  })
  .passthrough();

const nameField = z
  .string()
  .trim()
  .min(1, "שם השאלון חובה")
  .max(MAX_NAME, `שם ארוך מדי (מקסימום ${MAX_NAME} תווים)`);

const descriptionField = z
  .string()
  .max(MAX_DESCRIPTION, `תיאור ארוך מדי (מקסימום ${MAX_DESCRIPTION} תווים)`);

const questionsField = z
  .array(questionItem)
  .max(MAX_QUESTIONS, `יותר מדי שאלות (מקסימום ${MAX_QUESTIONS})`);

export const createQuestionnaireSchema = z.object({
  name: nameField,
  description: descriptionField.optional().nullable(),
  questions: questionsField.optional(),
  isDefault: z.boolean().optional(),
});
export type CreateQuestionnaireInput = z.infer<typeof createQuestionnaireSchema>;

// PUT — partial; כל שדה אופציונלי (כולל name).
export const updateQuestionnaireSchema = z.object({
  name: nameField.optional(),
  description: descriptionField.optional().nullable(),
  questions: questionsField.optional(),
  isDefault: z.boolean().optional(),
});
export type UpdateQuestionnaireInput = z.infer<typeof updateQuestionnaireSchema>;

// POST /api/intake-questionnaires/responses — תשובות מטופל לשאלון.
// responses הוא Json field חופשי — cap על גודל סיריאליז כדי למנוע DoS.
export const createIntakeResponseSchema = z.object({
  clientId: z.string().min(1, "מזהה מטופל חובה").max(64, "מזהה מטופל לא תקין"),
  templateId: z.string().min(1, "מזהה שאלון חובה").max(64, "מזהה שאלון לא תקין"),
  responses: z
    .union([z.record(z.unknown()), z.array(z.unknown())])
    .refine(
      (v) => {
        try {
          return JSON.stringify(v).length <= 200_000;
        } catch {
          return false;
        }
      },
      { message: "תשובות גדולות מדי" }
    ),
});
export type CreateIntakeResponseInput = z.infer<typeof createIntakeResponseSchema>;
