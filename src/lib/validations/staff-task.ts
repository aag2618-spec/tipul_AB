// zod schemas למטלות צוות (מנהלת/מזכירה מקצה מטלות לעובדים). נפרד מ-task.ts
// (משימות אישיות) — מטלת צוות היא fan-out עם הרשאות ובידוד ארגוני.

import { z } from "zod";

const MAX_TITLE = 200;
const MAX_DESCRIPTION = 5000;
const MAX_ASSIGNEES = 100;

const ALLOWED_PRIORITIES = z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]);

// תואם ל-enum TaskAssignMode ב-prisma/schema.prisma.
const ALLOWED_ASSIGN_MODES = z.enum([
  "SPECIFIC",
  "ALL_THERAPISTS",
  "ALL_SECRETARIES",
  "ALL_STAFF",
]);

// POST /api/clinic-admin/tasks — יצירת מטלת צוות (לעובד אחד או לכמה, fan-out).
// כש-assignMode=SPECIFIC (או חסר) — assigneeIds חייב להכיל לפחות עובד אחד.
export const assignTaskSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "כותרת המטלה היא שדה חובה")
      .max(MAX_TITLE, `כותרת ארוכה מדי (מקסימום ${MAX_TITLE} תווים)`),
    description: z
      .string()
      .max(MAX_DESCRIPTION, `תיאור ארוך מדי (מקסימום ${MAX_DESCRIPTION} תווים)`)
      .optional()
      .nullable(),
    priority: ALLOWED_PRIORITIES.optional(),
    dueDate: z.string().max(64).optional().nullable(),
    assignMode: ALLOWED_ASSIGN_MODES.optional(),
    assigneeIds: z
      .array(z.string().trim().min(1).max(64))
      .max(MAX_ASSIGNEES, "נבחרו יותר מדי עובדים")
      .optional(),
  })
  .refine(
    (d) =>
      d.assignMode && d.assignMode !== "SPECIFIC"
        ? true
        : Array.isArray(d.assigneeIds) && d.assigneeIds.length > 0,
    { message: "יש לבחור לפחות עובד אחד", path: ["assigneeIds"] }
  );
export type AssignTaskInput = z.infer<typeof assignTaskSchema>;

// תואם ל-enum TaskRecurrence ב-prisma/schema.prisma.
const ALLOWED_RECURRENCE = z.enum(["NONE", "DAILY", "WEEKLY", "MONTHLY"]);

// POST/PATCH /api/task-templates — תבנית מטלה (לשליחה חוזרת או מטלה חוזרת).
export const taskTemplateSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "כותרת התבנית היא שדה חובה")
      .max(MAX_TITLE, `כותרת ארוכה מדי (מקסימום ${MAX_TITLE} תווים)`),
    description: z
      .string()
      .max(MAX_DESCRIPTION, `תיאור ארוך מדי (מקסימום ${MAX_DESCRIPTION} תווים)`)
      .optional()
      .nullable(),
    priority: ALLOWED_PRIORITIES.optional(),
    recurrence: ALLOWED_RECURRENCE.optional(),
    recurrenceWeekday: z.number().int().min(0).max(6).optional().nullable(),
    recurrenceMonthday: z.number().int().min(1).max(31).optional().nullable(),
    active: z.boolean().optional(),
    assignMode: ALLOWED_ASSIGN_MODES.optional(),
    assigneeIds: z
      .array(z.string().trim().min(1).max(64))
      .max(MAX_ASSIGNEES, "נבחרו יותר מדי עובדים")
      .optional(),
  })
  .refine(
    (d) => (d.recurrence === "WEEKLY" ? d.recurrenceWeekday != null : true),
    { message: "יש לבחור יום בשבוע לחזרה שבועית", path: ["recurrenceWeekday"] }
  )
  .refine(
    (d) => (d.recurrence === "MONTHLY" ? d.recurrenceMonthday != null : true),
    { message: "יש לבחור יום בחודש לחזרה חודשית", path: ["recurrenceMonthday"] }
  );
export type TaskTemplateInput = z.infer<typeof taskTemplateSchema>;
