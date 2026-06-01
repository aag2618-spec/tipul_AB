import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireChatAccess } from "@/lib/chat/require-chat-access";

export const dynamic = "force-dynamic";

// POST /api/chat/conversations/[id]/read — סימון השיחה כנקראה (עדכון lastReadAt).
export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireChatAccess();
    if ("error" in auth) return auth.error;
    const { userId, organizationId } = auth;
    const { id } = await params;

    // עדכון אטומי עם בידוד ארגוני + בדיקת השתתפות ב-WHERE (IDOR-safe).
    const result = await prisma.chatParticipant.updateMany({
      where: {
        conversationId: id,
        userId,
        leftAt: null,
        conversation: { organizationId },
      },
      data: { lastReadAt: new Date() },
    });

    if (result.count === 0) {
      return NextResponse.json({ message: "השיחה לא נמצאה" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error("[Chat] Mark read error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "אירעה שגיאה בסימון השיחה כנקראה" },
      { status: 500 }
    );
  }
}
