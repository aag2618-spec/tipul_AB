// H12: zod schemas ל-tasks. שתי schemas:
//   - createTaskSchema: POST /api/tasks — title חובה, validation מלא.
//   - updateTaskSchema: PATCH /api/tasks/[id] — כל השדות אופציונליים.

import { z } from "zod";

const MAX_TITLE = 200;
const MAX_DESCRIPTION = 5000;

const ALLOWED_TASK_TYPES = z.enum([
  "WRITE_SUMMARY",
  "COLLECT_PAYMENT",
  "SIGN_DOCUMENT",
  "SCHEDULE_SESSION",
  "REVIEW_TRANSCRIPTION",
  "FOLLOW_UP",
  "CUSTOM",
]);

const ALLOWED_PRIORITIES = z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]);

const ALLOWED_RELATED_ENTITIES = z.enum(["CLIENT", "SESSION", "PAYMENT", "DOCUMENT"]);

// תואם לכל ערכי TaskStatus ב-prisma/schema.prisma:828-834
const ALLOWED_STATUSES = z.enum(["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED", "DISMISSED"]);

export const createTaskSchema = z.object({
  type: ALLOWED_TASK_TYPES.optional(),
  title: z
    .string()
    .trim()
    .min(1, "כותרת המשימה היא שדה חובה")
    .max(MAX_TITLE, `כותרת ארוכה מדי (מקסימום ${MAX_TITLE} תווים)`),
  description: z
    .string()
    .max(MAX_DESCRIPTION, `תיאור ארוך מדי (מקסימום ${MAX_DESCRIPTION} תווים)`)
    .optional()
    .nullable(),
  priority: ALLOWED_PRIORITIES.optional(),
  dueDate: z.string().max(64).optional().nullable(),
  reminderAt: z.string().max(64).optional().nullable(),
  relatedEntityId: z.string().max(64).optional().nullable(),
  relatedEntity: ALLOWED_RELATED_ENTITIES.optional().nullable(),
});
export type CreateTaskInput = z.infer<typeof createTaskSchema>;

export const updateTaskSchema = z.object({
  title: z
    .string()
    .trim()
    .min(1, "כותרת לא יכולה להיות ריקה")
    .max(MAX_TITLE, `כותרת ארוכה מדי (מקסימום ${MAX_TITLE} תווים)`)
    .optional(),
  description: z
    .string()
    .max(MAX_DESCRIPTION, `תיאור ארוך מדי (מקסימום ${MAX_DESCRIPTION} תווים)`)
    .optional()
    .nullable(),
  status: ALLOWED_STATUSES.optional(),
  priority: ALLOWED_PRIORITIES.optional(),
  dueDate: z.string().max(64).optional().nullable(),
  reminderAt: z.string().max(64).optional().nullable(),
  // מטלות צוות: הערת ביצוע אופציונלית ("מה ביצעתי ואיך") + סימון "נצפה".
  completionNote: z
    .string()
    .max(MAX_DESCRIPTION, `הערה ארוכה מדי (מקסימום ${MAX_DESCRIPTION} תווים)`)
    .optional()
    .nullable(),
  markSeen: z.boolean().optional(),
});
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
