// Zod schemas לצ׳אט הצוות הפנימי (מנהלת ↔ מזכירות).
// שלב 1: פתיחת שיחה פרטית, שליחת הודעה, ושאילתת הודעות חדשות לפי `since`.
// קישור מטופל (clientId) ו"הודעה חשובה" (isAnnouncement) נוספים בשלב 2.

import { z } from "zod";

const MAX_BODY = 4000;
const MAX_ID = 64;

// POST /api/chat/conversations — פתיחת שיחה פרטית 1-על-1 (או החזרת הקיימת).
// ערוץ "כל הצוות" נוצר אוטומטית בצד השרת ואינו נפתח דרך נתיב זה.
export const startConversationSchema = z.object({
  recipientId: z
    .string()
    .trim()
    .min(1, "חסר נמען לשיחה")
    .max(MAX_ID, "מזהה לא תקין"),
});
export type StartConversationInput = z.infer<typeof startConversationSchema>;

// POST /api/chat/conversations/[id]/messages — שליחת הודעה.
export const sendMessageSchema = z.object({
  body: z
    .string()
    .trim()
    .min(1, "ההודעה ריקה")
    .max(MAX_BODY, `ההודעה ארוכה מדי (מקסימום ${MAX_BODY} תווים)`),
});
export type SendMessageInput = z.infer<typeof sendMessageSchema>;

// GET /api/chat/conversations/[id]/messages?since=ISO — ה-polling מושך רק חדשות.
export const messagesQuerySchema = z.object({
  since: z
    .string()
    .datetime({ message: "since חייב להיות תאריך ISO תקין" })
    .optional(),
});
export type MessagesQueryInput = z.infer<typeof messagesQuerySchema>;
