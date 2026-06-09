// H12: zod schema לעדכון פרופיל — שדות אופציונליים כולם (PATCH-style).
//
// השדות נכנסים לקבלות מס ולאימיילים — חשוב cap על אורך וטיפוס אחיד.
// Phone נשאר עם בדיקה ידנית ב-route כי נדרש pre-clean של רווחים/מקפים
// לפני regex (PHONE_RE_IL).

import { z } from "zod";

const MAX_NAME = 100;
const MAX_LICENSE = 50;

// duration: 5-720 דקות. price: 0-100,000 ש"ח. שני השדות מקבלים גם string
// (form submission) וגם number — נורמלזציה למספר ב-coerce.
const durationField = z
  .union([z.number(), z.string()])
  .optional()
  .refine(
    (v) => {
      if (v === undefined || v === null || v === "") return true;
      const n = typeof v === "number" ? v : parseInt(String(v), 10);
      return Number.isFinite(n) && Number.isInteger(n) && n >= 5 && n <= 720;
    },
    { message: "משך פגישה חייב להיות בין 5 ל-720 דקות" }
  );

const priceField = z
  .union([z.number(), z.string(), z.null()])
  .optional()
  .refine(
    (v) => {
      if (v === undefined || v === null || v === "") return true;
      const n = typeof v === "number" ? v : parseFloat(String(v));
      return Number.isFinite(n) && n >= 0 && n <= 100000;
    },
    { message: "מחיר ברירת מחדל חייב להיות בין 0 ל-100,000" }
  );

export const updateProfileSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "שם לא יכול להיות ריק")
    .max(MAX_NAME, `שם ארוך מדי (מקסימום ${MAX_NAME} תווים)`)
    .optional(),
  // phone — שומרים string או null. הregex/normalize ב-route עצמו.
  phone: z
    .union([z.string().max(30, "טלפון ארוך מדי"), z.null()])
    .optional(),
  license: z
    .union([
      z.string().max(MAX_LICENSE, `רישיון ארוך מדי (מקסימום ${MAX_LICENSE} תווים)`),
      z.null(),
    ])
    .optional(),
  defaultSessionDuration: durationField,
  defaultSessionPrice: priceField,
  // כלי "שחרור תיק חסום" — טוגל אישי (נטפרי/אתרוג).
  usesContentFilter: z.boolean().optional(),
});

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
