import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { parseBody, parseSearchParams } from "@/lib/validations/helpers";
import { sendMessageSchema, messagesQuerySchema } from "@/lib/validations/chat";
import { requireChatAccess } from "@/lib/chat/require-chat-access";
import { checkRateLimit, CHAT_MESSAGE_RATE_LIMIT } from "@/lib/rate-limit";
import {
  MESSAGE_SELECT,
  serializeMessage,
  type RawMessage,
} from "@/lib/chat/message-serialize";

export const dynamic = "force-dynamic";

// בדיקת השתתפות: השיחה שייכת לארגון שלי ואני משתתף פעיל בה. ה-IDOR guard.
async function findActiveParticipant(
  conversationId: string,
  userId: string,
  organizationId: string
) {
  return prisma.chatParticipant.findFirst({
    where: {
      conversationId,
      userId,
      leftAt: null,
      conversation: { organizationId },
    },
    select: { id: true, conversation: { select: { isBroadcast: true } } },
  });
}

// GET /api/chat/conversations/[id]/messages?since=ISO — הודעות (polling לפי since).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireChatAccess();
    if ("error" in auth) return auth.error;
    const { userId, organizationId } = auth;
    const { id } = await params;

    const participant = await findActiveParticipant(id, userId, organizationId);
    if (!participant) {
      return NextResponse.json({ message: "השיחה לא נמצאה" }, { status: 404 });
    }

    const parsed = parseSearchParams(request.url, messagesQuerySchema);
    if ("error" in parsed) return parsed.error;
    const { since } = parsed.data;

    let messages: RawMessage[];
    if (since) {
      // gte (לא gt) — מונע אובדן הודעות שחולקות את אותה מילישנייה עם ה-cursor.
      // ההודעה שב-cursor עצמו תוחזר שוב, אך ה-client מסנן כפילויות לפי id.
      messages = await prisma.chatMessage.findMany({
        where: {
          conversationId: id,
          deletedAt: null,
          createdAt: { gte: new Date(since) },
        },
        orderBy: { createdAt: "asc" },
        take: 200,
        select: MESSAGE_SELECT,
      });
    } else {
      const recent = await prisma.chatMessage.findMany({
        where: { conversationId: id, deletedAt: null },
        orderBy: { createdAt: "desc" },
        take: 100,
        select: MESSAGE_SELECT,
      });
      messages = recent.reverse();
    }

    return NextResponse.json({ messages: messages.map(serializeMessage) });
  } catch (error) {
    logger.error("[Chat] Get messages error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "אירעה שגיאה בטעינת ההודעות" },
      { status: 500 }
    );
  }
}

// POST /api/chat/conversations/[id]/messages — שליחת הודעה.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireChatAccess();
    if ("error" in auth) return auth.error;
    const { userId, organizationId, isOwner, isSecretary } = auth;
    const { id } = await params;

    // Rate limit — מונע spam / לולאת שליחה.
    const rl = checkRateLimit(`chat:msg:${userId}`, CHAT_MESSAGE_RATE_LIMIT);
    if (!rl.allowed) {
      return NextResponse.json(
        { message: "יותר מדי הודעות — נסה/י שוב בעוד רגע" },
        { status: 429 }
      );
    }

    const participant = await findActiveParticipant(id, userId, organizationId);
    if (!participant) {
      return NextResponse.json({ message: "השיחה לא נמצאה" }, { status: 404 });
    }

    // ערוץ "הודעות לצוות" חד-כיווני — רק מנהלת/מזכירה כותבות; מטפל קורא בלבד.
    if (participant.conversation.isBroadcast && !isOwner && !isSecretary) {
      return NextResponse.json(
        { message: "רק המנהלת והמזכירות יכולות לכתוב בערוץ ההודעות" },
        { status: 403 }
      );
    }

    const parsed = await parseBody(request, sendMessageSchema);
    if ("error" in parsed) return parsed.error;
    const { body } = parsed.data;

    const message = await prisma.chatMessage.create({
      data: { conversationId: id, senderId: userId, body },
      select: MESSAGE_SELECT,
    });

    // עדכון זמן הודעה אחרונה בשיחה + סימון השולח כקרא (קרא את הודעתו).
    await prisma.$transaction([
      prisma.chatConversation.update({
        where: { id },
        data: { lastMessageAt: message.createdAt },
      }),
      prisma.chatParticipant.updateMany({
        where: { conversationId: id, userId },
        data: { lastReadAt: message.createdAt },
      }),
    ]);

    return NextResponse.json(
      { message: serializeMessage(message) },
      { status: 201 }
    );
  } catch (error) {
    logger.error("[Chat] Send message error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "אירעה שגיאה בשליחת ההודעה" },
      { status: 500 }
    );
  }
}
