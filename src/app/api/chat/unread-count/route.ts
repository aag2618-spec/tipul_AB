import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireChatAccess } from "@/lib/chat/require-chat-access";
import { countUnreadForParticipant } from "@/lib/chat/chat-service";

export const dynamic = "force-dynamic";

// GET /api/chat/unread-count — מספר ההודעות הכולל שלא נקראו (לתג בתפריט הצד).
export async function GET() {
  try {
    const auth = await requireChatAccess();
    if ("error" in auth) return auth.error;
    const { userId, organizationId } = auth;

    const participations = await prisma.chatParticipant.findMany({
      where: {
        userId,
        leftAt: null,
        conversation: { organizationId },
      },
      select: { conversationId: true, lastReadAt: true },
    });

    const counts = await Promise.all(
      participations.map((p) =>
        countUnreadForParticipant(p.conversationId, userId, p.lastReadAt)
      )
    );
    const unreadCount = counts.reduce((sum, n) => sum + n, 0);

    return NextResponse.json({ unreadCount });
  } catch (error) {
    logger.error("[Chat] Unread count error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    // לא חוסם UI — מחזיר 0 בשגיאה.
    return NextResponse.json({ unreadCount: 0 });
  }
}
