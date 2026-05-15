// H12: zod schemas ל-communications + announcements + send-payment-history.

import { z } from "zod";
import { zId } from "./shared";

// POST /api/communications/logs/delete — מחיקה בודדת/מרוכזת של לוגים.
// cap על מספר ids כדי להגביל delete יחיד; מתחת ל-1000 פעם אחת.
export const deleteCommunicationLogsSchema = z.object({
  ids: z
    .array(zId)
    .min(1, "חסרים מזהי הודעות")
    .max(1000, "יותר מדי הודעות למחיקה בקריאה אחת"),
});
export type DeleteCommunicationLogsInput = z.infer<typeof deleteCommunicationLogsSchema>;

// POST /api/announcements/dismiss — סגירת הודעת מערכת.
export const dismissAnnouncementSchema = z.object({
  announcementId: z.string().min(1, "מזהה הודעה חסר").max(64),
});
export type DismissAnnouncementInput = z.infer<typeof dismissAnnouncementSchema>;

// POST /api/clients/[id]/send-payment-history — period enum סגור.
export const sendPaymentHistorySchema = z.object({
  period: z.enum(["all", "month", "3months", "year"]).optional().default("all"),
});
export type SendPaymentHistoryInput = z.infer<typeof sendPaymentHistorySchema>;

// === GET /api/communications/attachments ====================================
// query params: logId (חובה) + attachmentId/filename (לפחות אחד נדרש בפועל).
const MAX_FILENAME_LEN = 255;
export const attachmentDownloadQuerySchema = z.object({
  logId: zId,
  attachmentId: z.string().max(64).optional().nullable(),
  filename: z.string().max(MAX_FILENAME_LEN).optional().nullable(),
});
export type AttachmentDownloadQuery = z.infer<typeof attachmentDownloadQuerySchema>;

// === POST /api/communications/attachments ===================================
// שמירת קובץ לתיקיית מטופל. logId + clientId חובה; attachmentId/filename
// לזיהוי הקובץ הספציפי בלוג עם attachments[].
export const saveAttachmentSchema = z.object({
  logId: zId,
  clientId: zId,
  attachmentId: z.string().max(64).optional().nullable(),
  filename: z.string().max(MAX_FILENAME_LEN).optional().nullable(),
});
export type SaveAttachmentInput = z.infer<typeof saveAttachmentSchema>;
