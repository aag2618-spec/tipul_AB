// H12: zod schemas ל-communications + announcements + send-payment-history.

import { z } from "zod";

const zId = z.string().min(1).max(64);

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
