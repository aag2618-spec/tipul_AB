// Zod schemas לקישור מילוי ציבורי של שאלון קליני מתוקנן (BDI2, GAD-7, AQ וכו').
//
// מקביל ל-intake-invite אך עבור QuestionnaireResponse (שאלונים עם ניקוד).
// מטרה: (א) למנוע DoS דרך JSON ענק, (ב) data corruption מטיפוסים לא צפויים,
// (ג) להגביל את הערוצים המותרים לשליחה.

import { z } from "zod";

export const QUESTIONNAIRE_CHANNELS = ["sms", "email", "both", "link"] as const;

// POST /api/questionnaire-invites — המטפל יוצר קישור מילוי לשאלון עבור מטופל.
// channel="link" → רק יוצר ומחזיר URL להעתקה (לא שולח הודעה).
// השאלון מזוהה לפי code (למשל "BDI2"); השרת מאמת שהוא testType=SELF_REPORT.
export const createQuestionnaireInviteSchema = z.object({
  clientId: z.string().min(1, "מזהה מטופל חובה").max(64, "מזהה מטופל לא תקין"),
  code: z.string().min(1, "מזהה שאלון חובה").max(64, "מזהה שאלון לא תקין"),
  channel: z.enum(QUESTIONNAIRE_CHANNELS),
});
export type CreateQuestionnaireInviteInput = z.infer<
  typeof createQuestionnaireInviteSchema
>;

// POST /api/p/questionnaire/[id] — המטופל/ההורה שולח/ת את התשובות.
// answers = map של אינדקס-שאלה (כמחרוזת) → { value? } לבחירה רב-ברירתית
// או { text? } לשאלה פתוחה. *הניקוד מחושב בשרת מתוך התבנית* — לא סומכים על
// ערכי score מהדפדפן. cap על גודל וכמות למניעת DoS.
export const submitPublicQuestionnaireSchema = z.object({
  answers: z
    .record(
      z.object({
        value: z.number().int().min(-100000).max(100000).optional(),
        text: z.string().max(10000, "תשובה ארוכה מדי").optional(),
      })
    )
    .refine((v) => Object.keys(v).length <= 1000, {
      message: "יותר מדי תשובות",
    })
    .refine(
      (v) => {
        try {
          return JSON.stringify(v).length <= 300_000;
        } catch {
          return false;
        }
      },
      { message: "תשובות גדולות מדי" }
    ),
});
export type SubmitPublicQuestionnaireInput = z.infer<
  typeof submitPublicQuestionnaireSchema
>;
