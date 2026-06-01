import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { parseBody } from "@/lib/validations/helpers";
import { startConversationSchema } from "@/lib/validations/chat";
import { requireChatAccess } from "@/lib/chat/require-chat-access";
import {
  ensureTeamChannel,
  getChatMembers,
  countUnreadForParticipant,
  chatRoleLabel,
} from "@/lib/chat/chat-service";

export const dynamic = "force-dynamic";

// GET /api/chat/conversations — רשימת השיחות שלי + הודעה אחרונה + מספר לא-נקראות.
export async function GET() {
  try {
    const auth = await requireChatAccess();
    if ("error" in auth) return auth.error;
    const { userId, organizationId } = auth;

    // מבטיח שערוץ "כל הצוות" קיים ושאני משתתף בו.
    await ensureTeamChannel(organizationId, userId);

    const participations = await prisma.chatParticipant.findMany({
      where: {
        userId,
        leftAt: null,
        conversation: { organizationId },
      },
      select: {
        lastReadAt: true,
        conversation: {
          select: {
            id: true,
            type: true,
            title: true,
            isTeamChannel: true,
            lastMessageAt: true,
            createdAt: true,
            participants: {
              where: { leftAt: null },
              select: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    clinicRole: true,
                    role: true,
                  },
                },
              },
            },
            messages: {
              where: { deletedAt: null },
              orderBy: { createdAt: "desc" },
              take: 1,
              select: { id: true, body: true, senderId: true, createdAt: true },
            },
          },
        },
      },
    });

    const conversations = await Promise.all(
      participations.map(async (p) => {
        const c = p.conversation;
        const others = c.participants
          .map((pp) => pp.user)
          .filter((u) => u.id !== userId);

        // שם לתצוגה: לשיחה פרטית — שם הצד השני; לקבוצה — הכותרת.
        const displayTitle =
          c.type === "DIRECT"
            ? others[0]?.name || "משתמש"
            : c.title || "כל הצוות";

        const lastMsg = c.messages[0] ?? null;
        const unreadCount = await countUnreadForParticipant(
          c.id,
          userId,
          p.lastReadAt
        );

        return {
          id: c.id,
          type: c.type,
          isTeamChannel: c.isTeamChannel,
          title: displayTitle,
          participants: c.participants.map((pp) => ({
            id: pp.user.id,
            name: pp.user.name,
            role: chatRoleLabel(pp.user.clinicRole, pp.user.role),
          })),
          lastMessage: lastMsg
            ? {
                body: lastMsg.body,
                senderId: lastMsg.senderId,
                createdAt: lastMsg.createdAt.toISOString(),
              }
            : null,
          lastMessageAt: c.lastMessageAt
            ? c.lastMessageAt.toISOString()
            : null,
          unreadCount,
        };
      })
    );

    // מיון: לפי זמן הודעה אחרונה (יורד), עם fallback ל-createdAt. הערוץ הקבוע
    // עולה למעלה כשאין בו עדיין הודעות.
    conversations.sort((a, b) => {
      const at = a.lastMessageAt ? Date.parse(a.lastMessageAt) : 0;
      const bt = b.lastMessageAt ? Date.parse(b.lastMessageAt) : 0;
      if (bt !== at) return bt - at;
      // הערוץ הקבוע ראשון בשוויון
      if (a.isTeamChannel) return -1;
      if (b.isTeamChannel) return 1;
      return 0;
    });

    return NextResponse.json({ conversations });
  } catch (error) {
    logger.error("[Chat] Get conversations error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "אירעה שגיאה בטעינת השיחות" },
      { status: 500 }
    );
  }
}

// POST /api/chat/conversations — פתיחת שיחה פרטית 1-על-1 (או החזרת הקיימת).
export async function POST(request: NextRequest) {
  try {
    const auth = await requireChatAccess();
    if ("error" in auth) return auth.error;
    const { userId, organizationId } = auth;

    const parsed = await parseBody(request, startConversationSchema);
    if ("error" in parsed) return parsed.error;
    const { recipientId } = parsed.data;

    if (recipientId === userId) {
      return NextResponse.json(
        { message: "לא ניתן לפתוח שיחה עם עצמך" },
        { status: 400 }
      );
    }

    // ולידציה: הנמען חייב להיות חבר צ׳אט באותו ארגון (OWNER/SECRETARY, לא חסום).
    const members = await getChatMembers(organizationId);
    const recipient = members.find((m) => m.id === recipientId);
    if (!recipient) {
      return NextResponse.json(
        { message: "הנמען אינו זמין לצ׳אט" },
        { status: 404 }
      );
    }

    // מזהה דטרמיניסטי לשיחה פרטית (זוג ממוין) — מבטיח שיחה אחת לכל זוג, ו-upsert
    // הופך את הפעולה ל-race-safe (double-click / שתי בקשות במקביל לא יוצרים כפילות).
    const pair = [userId, recipientId].sort();
    const conversationId = `direct_${organizationId}_${pair[0]}_${pair[1]}`;

    await prisma.chatConversation.upsert({
      where: { id: conversationId },
      create: {
        id: conversationId,
        organizationId,
        type: "DIRECT",
        createdById: userId,
        participants: {
          create: [{ userId }, { userId: recipientId }],
        },
      },
      update: {},
    });

    return NextResponse.json({ conversationId });
  } catch (error) {
    logger.error("[Chat] Start conversation error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "אירעה שגיאה בפתיחת השיחה" },
      { status: 500 }
    );
  }
}
