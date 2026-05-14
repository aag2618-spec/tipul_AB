// H12: zod schemas ל-recurring patterns.
// בדיקת scope של clientId נשארת ב-route (דורש שאילתת DB).

import { z } from "zod";

const TIME_RE = /^([01]?\d|2[0-3]):[0-5]\d$/;

const dayOfWeek = z
  .number()
  .int("יום בשבוע חייב להיות מספר שלם")
  .min(0, "יום בשבוע חייב להיות בין 0 ל-6")
  .max(6, "יום בשבוע חייב להיות בין 0 ל-6");

const time = z
  .string()
  .regex(TIME_RE, "שעה חייבת להיות בפורמט HH:MM (00:00-23:59)");

const duration = z
  .number()
  .int()
  .min(5, "משך חייב להיות בין 5 ל-720 דקות")
  .max(720, "משך חייב להיות בין 5 ל-720 דקות");

const clientIdField = z
  .string()
  .min(1, "מזהה מטופל לא תקין")
  .max(64, "מזהה מטופל לא תקין");

export const createRecurringPatternSchema = z.object({
  dayOfWeek,
  time,
  duration: duration.optional(),
  clientId: clientIdField.optional().nullable(),
});
export type CreateRecurringPatternInput = z.infer<typeof createRecurringPatternSchema>;

// PUT — partial; route ממזג עם existing לפני אכיפה.
export const updateRecurringPatternSchema = z.object({
  dayOfWeek: dayOfWeek.optional(),
  time: time.optional(),
  duration: duration.optional(),
  clientId: clientIdField.optional().nullable(),
  isActive: z.boolean().optional(),
});
export type UpdateRecurringPatternInput = z.infer<typeof updateRecurringPatternSchema>;

// /apply route — dryRun + weeksAhead + resolutions[].
const conflictResolution = z.object({
  key: z.string().min(1).max(200),
  action: z.enum(["skip", "replace", "create"]),
});

export const applyRecurringPatternsSchema = z.object({
  weeksAhead: z.number().int().min(1).max(52).optional(),
  dryRun: z.boolean().optional(),
  resolutions: z.array(conflictResolution).max(2000).optional(),
});
export type ApplyRecurringPatternsInput = z.infer<typeof applyRecurringPatternsSchema>;
