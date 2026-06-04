// ============================================================================
// סריאליזציה משותפת של הודעת צ׳אט — נתיב טקסט (messages) ונתיב קובץ (attachment)
// משתמשים באותו select + serializer, כדי שהפורמט אחיד וכולל מטא-דאטה של קובץ.
// ============================================================================

import "server-only";
import { Prisma } from "@prisma/client";

export const MESSAGE_SELECT = {
  id: true,
  body: true,
  senderId: true,
  isAnnouncement: true,
  clientId: true,
  createdAt: true,
  editedAt: true,
  attachmentPath: true,
  attachmentName: true,
  attachmentType: true,
  attachmentSize: true,
  sender: { select: { id: true, name: true, clinicRole: true } },
} satisfies Prisma.ChatMessageSelect;

export type RawMessage = Prisma.ChatMessageGetPayload<{
  select: typeof MESSAGE_SELECT;
}>;

/**
 * ממיר הודעה גולמית מה-DB לפורמט שנשלח ללקוח. attachmentPath (נתיב אחסון פנימי)
 * לעולם אינו נחשף — הלקוח בונה קישור הורדה מ-conversationId+messageId שעובר
 * דרך endpoint מאומת-משתתפים.
 */
export function serializeMessage(m: RawMessage) {
  return {
    id: m.id,
    body: m.body,
    senderId: m.senderId,
    senderName: m.sender.name,
    isAnnouncement: m.isAnnouncement,
    createdAt: m.createdAt.toISOString(),
    editedAt: m.editedAt ? m.editedAt.toISOString() : null,
    attachment: m.attachmentPath
      ? {
          name: m.attachmentName ?? "קובץ",
          type: m.attachmentType ?? "application/octet-stream",
          size: m.attachmentSize ?? 0,
        }
      : null,
  };
}
