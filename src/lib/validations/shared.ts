// H12: zod primitives משותפים — נמצאים בכל endpoint שמקבל body חיצוני.
// המטרה: גם DoS protection (caps על אורך) וגם type-safety אחיד.
//
// Naming convention:
//   - z*Required — חובה, לא ריק.
//   - z*Optional — אופציונלי, מקבל undefined/null/string ריק.
//   - z*Strict   — לא ממיר טיפוסים (לא z.coerce). דורש string אמיתי.
//
// השמות בעברית (ב-message) כדי שיוצגו נכון ב-UI דרך parseBody helper.

import { z } from "zod";

// === Strings & sizes ============================================================
// כללי אגודל לאורכים: name ~80, title ~200, line ~500, paragraph ~2000,
// rich-text/html ~50K. גדלים גבוהים מזה — DoS פוטנציאלי על JSON parser.

export const MAX_NAME_LENGTH = 80;
export const MAX_TITLE_LENGTH = 200;
export const MAX_LINE_LENGTH = 500;
export const MAX_NOTES_LENGTH = 2000;
export const MAX_RICHTEXT_LENGTH = 50_000;

// === Common primitives ==========================================================

/** מזהה DB (cuid/uuid). מוודא string לא ריק וגודל סביר. */
export const zId = z
  .string()
  .min(1, "מזהה חובה")
  .max(64, "מזהה לא תקין");

export const zIdOptional = zId.optional().or(z.literal(""));

/** Email — RFC 5321-ish + trim + lowercase. cap 254 (RFC). */
export const zEmail = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "כתובת מייל חובה")
  .max(254, "כתובת מייל ארוכה מדי")
  .email("כתובת מייל לא תקינה");

export const zEmailOptional = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, "כתובת מייל ארוכה מדי")
  .email("כתובת מייל לא תקינה")
  .optional()
  .or(z.literal(""));

/**
 * סיסמה — מינימום 8, מקסימום 128 (גבול bcrypt). NIST: לא לדרוש complexity rules
 * מורכבים מדי. אורך הוא ההגנה החזקה ביותר.
 */
export const zPassword = z
  .string()
  .min(8, "הסיסמה חייבת להכיל לפחות 8 תווים")
  .max(128, "הסיסמה ארוכה מדי");

/** טלפון ישראלי כללי — נורמליזציה ספציפית במקומות שצריך. כאן רק cap על אורך. */
export const zPhone = z
  .string()
  .trim()
  .min(9, "מספר טלפון קצר מדי")
  .max(20, "מספר טלפון ארוך מדי");

export const zPhoneOptional = z
  .string()
  .trim()
  .max(20, "מספר טלפון ארוך מדי")
  .optional()
  .or(z.literal(""));

/** שם — אותיות עברית/אנגלית + רווחים + מקפים + גרשיים. 2-80 תווים. */
const NAME_RE = /^[֐-׿a-zA-Z\s\.\-'"]{2,80}$/;
export const zName = z
  .string()
  .trim()
  .min(2, "שם קצר מדי (מינימום 2 תווים)")
  .max(MAX_NAME_LENGTH, `שם ארוך מדי (מקסימום ${MAX_NAME_LENGTH} תווים)`)
  .regex(NAME_RE, "שם יכול להכיל רק אותיות עברית/אנגלית, רווחים ומקפים");

/** כותרת קצרה. */
export const zTitle = z
  .string()
  .trim()
  .min(1, "כותרת חובה")
  .max(MAX_TITLE_LENGTH, `כותרת ארוכה מדי (מקסימום ${MAX_TITLE_LENGTH} תווים)`);

/** הערות חופשיות — עד 2000 תווים. */
export const zNotes = z
  .string()
  .max(MAX_NOTES_LENGTH, `הערות ארוכות מדי (מקסימום ${MAX_NOTES_LENGTH} תווים)`);

export const zNotesOptional = zNotes.optional().or(z.literal("").transform(() => undefined));

/** Rich-text content (עד 50KB) — לטפסי הסכמה ו-HTML של editor. */
export const zRichText = z
  .string()
  .min(1, "תוכן חובה")
  .max(MAX_RICHTEXT_LENGTH, `תוכן ארוך מדי (מקסימום ${MAX_RICHTEXT_LENGTH} תווים)`);

/** טוקן עם secret-strength — base64url או hex. 16-128 תווים. */
export const zSecretToken = z
  .string()
  .min(16, "טוקן לא תקין")
  .max(128, "טוקן ארוך מדי")
  .regex(/^[A-Za-z0-9_\-]+$/, "טוקן לא תקין");

/** תאריך ISO (YYYY-MM-DD). */
export const zIsoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "תאריך לא תקין (YYYY-MM-DD)")
  .refine((v) => !isNaN(new Date(`${v}T12:00:00Z`).getTime()), "תאריך לא תקין");

/** שעה HH:MM (24h). */
export const zTime = z
  .string()
  .regex(/^([01]?\d|2[0-3]):[0-5]\d$/, "שעה לא תקינה (HH:MM)");

/** מספר חיובי — מקבל גם string וגם number. */
export const zPositiveAmount = z.union([z.number(), z.string()]).refine(
  (val) => {
    const n = Number(val);
    return !isNaN(n) && n > 0 && n < 1_000_000;
  },
  { message: "סכום לא תקין" }
);

/** קוד 2FA — 6 ספרות (TOTP/OTP) או recovery code (עד 32 תווים). */
export const zTwoFactorCode = z
  .string()
  .trim()
  .min(1, "קוד חובה")
  .max(32, "קוד לא תקין");

/** Boolean חובה (לא ממיר). */
export const zBool = z.boolean();
