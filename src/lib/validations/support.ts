// H12: zod schemas ל-support tickets.
// תומך גם ב-JSON וגם ב-multipart/form-data — הרוט פולט את השדות הטקסטואליים
// אחרי ההפרדה ומאמת דרך הסכמות האלו.

import { z } from "zod";

const MAX_SUBJECT = 200;
const MAX_MESSAGE = 10_000;

const SUPPORT_CATEGORY = z.enum([
  "general",
  "technical",
  "billing",
  "feature",
  "bug",
  "other",
]);

export const createTicketSchema = z.object({
  subject: z
    .string()
    .trim()
    .min(1, "יש למלא נושא")
    .max(MAX_SUBJECT, `נושא ארוך מדי (מקסימום ${MAX_SUBJECT} תווים)`),
  message: z
    .string()
    .trim()
    .min(1, "יש למלא הודעה")
    .max(MAX_MESSAGE, `הודעה ארוכה מדי (מקסימום ${MAX_MESSAGE} תווים)`),
  category: SUPPORT_CATEGORY.optional().default("general"),
});
export type CreateTicketInput = z.infer<typeof createTicketSchema>;

export const ticketResponseSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, "יש לכתוב הודעה")
    .max(MAX_MESSAGE, `הודעה ארוכה מדי (מקסימום ${MAX_MESSAGE} תווים)`),
});
export type TicketResponseInput = z.infer<typeof ticketResponseSchema>;
