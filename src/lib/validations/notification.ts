// H12: schemas להתראות. POST/PUT של /api/notifications + sub-endpoints.
//
// Enums תואמים ל-Prisma schema.prisma:780-798:
//   NotificationType:   MORNING_SUMMARY, EVENING_SUMMARY, PENDING_TASKS,
//                       PAYMENT_REMINDER, SESSION_REMINDER, EMAIL_SENT,
//                       EMAIL_RECEIVED, CANCELLATION_REQUEST, BOOKING_REQUEST,
//                       CUSTOM
//   NotificationStatus: PENDING, SENT, READ, DISMISSED

import { z } from "zod";

const MAX_TITLE = 200;
const MAX_CONTENT = 5000;
const MAX_SUBJECT = 500;

const NotificationTypeEnum = z.enum([
  "MORNING_SUMMARY",
  "EVENING_SUMMARY",
  "PENDING_TASKS",
  "PAYMENT_REMINDER",
  "SESSION_REMINDER",
  "EMAIL_SENT",
  "EMAIL_RECEIVED",
  "CANCELLATION_REQUEST",
  "BOOKING_REQUEST",
  "CUSTOM",
]);

const NotificationStatusEnum = z.enum([
  "PENDING",
  "SENT",
  "READ",
  "DISMISSED",
]);

export const createNotificationSchema = z.object({
  type: NotificationTypeEnum.optional(),
  title: z
    .string()
    .trim()
    .min(1, "כותרת חובה")
    .max(MAX_TITLE, `כותרת ארוכה מדי (מקסימום ${MAX_TITLE} תווים)`),
  content: z
    .string()
    .min(1, "תוכן חובה")
    .max(MAX_CONTENT, `תוכן ארוך מדי (מקסימום ${MAX_CONTENT} תווים)`),
});
export type CreateNotificationInput = z.infer<typeof createNotificationSchema>;

// PUT — או markAllAsRead בלבד, או id+status.
export const updateNotificationSchema = z.object({
  id: z.string().max(64).optional(),
  status: NotificationStatusEnum.optional(),
  markAllAsRead: z.boolean().optional(),
});
export type UpdateNotificationInput = z.infer<typeof updateNotificationSchema>;

// mark-read-by-subject — subject חובה, cap על אורך.
export const markBySubjectSchema = z.object({
  subject: z
    .string()
    .trim()
    .min(1, "חסר נושא")
    .max(MAX_SUBJECT, "נושא ארוך מדי"),
});
export type MarkBySubjectInput = z.infer<typeof markBySubjectSchema>;
