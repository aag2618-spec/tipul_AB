// Zod schemas ל-intake invites (קישור מילוי ציבורי לשאלון פנייה ראשונית).
//
// מטרה: (א) למנוע DoS דרך JSON ענק, (ב) data corruption דרך טיפוסים לא צפויים,
// (ג) להגביל את הערוצים המותרים לשליחה.

import { z } from "zod";

export const INTAKE_CHANNELS = ["sms", "email", "both", "link"] as const;

// POST /api/intake-invites — המטפל יוצר קישור לשאלון עבור מטופל/פונה.
// channel="link" → רק יוצר ומחזיר URL להעתקה (לא שולח הודעה).
export const createIntakeInviteSchema = z.object({
  clientId: z.string().min(1, "מזהה מטופל חובה").max(64, "מזהה מטופל לא תקין"),
  templateId: z.string().min(1, "מזהה שאלון חובה").max(64, "מזהה שאלון לא תקין"),
  channel: z.enum(INTAKE_CHANNELS),
});
export type CreateIntakeInviteInput = z.infer<typeof createIntakeInviteSchema>;

// POST /api/p/intake/[id] — הפונה שולח/ת את התשובות.
// responses = map של questionId → תשובה (string). cap על גודל למניעת DoS.
export const submitPublicIntakeSchema = z.object({
  responses: z
    .record(z.string().max(10_000, "תשובה ארוכה מדי"))
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
export type SubmitPublicIntakeInput = z.infer<typeof submitPublicIntakeSchema>;
