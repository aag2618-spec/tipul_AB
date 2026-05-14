// H12: zod schemas ל-consent-forms. הולכים מ-validation ידני (M14/M15/M16)
// לזוד אחיד. ה-content הוא rich-text HTML — לא חוסמים HTML, רק caps; sanitization
// נעשית בצד client לפני render.

import { z } from "zod";

const MAX_TITLE_LENGTH = 200;
const MAX_CONTENT_LENGTH = 50_000;

// M16: SVG חסום מכוונה — יכול להריץ JS. רק PNG/JPEG.
const MAX_SIGNATURE_DATA_LENGTH = 200_000;
const SIGNATURE_DATA_PATTERN = /^data:image\/(png|jpeg|jpg);base64,[A-Za-z0-9+/=]+$/;

const FORM_TYPE = z.enum([
  "TREATMENT_AGREEMENT",
  "INFORMED_CONSENT",
  "CONFIDENTIALITY",
  "RECORDING_CONSENT",
  "TELEHEALTH_CONSENT",
  "PARENTAL_CONSENT",
  "CUSTOM",
]);

export const createConsentFormSchema = z.object({
  type: FORM_TYPE,
  title: z
    .string()
    .trim()
    .min(1, "כותרת חובה")
    .max(MAX_TITLE_LENGTH, `כותרת ארוכה מדי (מקסימום ${MAX_TITLE_LENGTH} תווים)`),
  content: z
    .string()
    .min(1, "תוכן חובה")
    .max(MAX_CONTENT_LENGTH, `תוכן ארוך מדי (מקסימום ${MAX_CONTENT_LENGTH} תווים)`),
  isTemplate: z.boolean(),
  clientId: z.string().max(64).optional().nullable(),
});
export type CreateConsentFormInput = z.infer<typeof createConsentFormSchema>;

export const signConsentFormSchema = z.object({
  signatureData: z
    .string()
    .max(
      MAX_SIGNATURE_DATA_LENGTH,
      "פורמט חתימה לא תקין. נדרשת תמונה (PNG/JPEG) בקידוד base64, עד 150KB."
    )
    .regex(
      SIGNATURE_DATA_PATTERN,
      "פורמט חתימה לא תקין. נדרשת תמונה (PNG/JPEG) בקידוד base64, עד 150KB."
    ),
});
export type SignConsentFormInput = z.infer<typeof signConsentFormSchema>;
