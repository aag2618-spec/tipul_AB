import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { parseBody } from "@/lib/validations/helpers";
import { startConversationSchema } from "@/lib/validations/chat";
import { requireChatAccess } from "@/lib/chat/require-chat-access";
import {
  ensureTeamChannel,
  ensureBroadcastChannel,
  getChatMembers,
  countUnreadForParticipant,
  chatRoleLabel,
  getOrgChatSettings,
  memberKind,
  canPairChat,
  isTherapistOnly,
} from "@/lib/chat/chat-service";

export const dynamic = "force-dynamic";

// GET /api/chat/conversations — רשימת השיחות שלי + הודעה אחרונה + מספר לא-נקראות.
export async function GET() {
  try {
    const auth = await requireChatAccess();
    if ("error" in auth) return auth.error;
    const { userId, organizationId, isOwner, isSecretary } = auth;

    // ערוץ "כל הצוות" הוא ערוץ הנהלה (מנהלת + מזכירות) — מסנכרנים אותו רק עבורן.
    // מטפלים אינם משתתפים בו, ולכן אין צורך (וגם לא רצוי) להריץ עבורם sync.
    if (isOwner || isSecretary) {
      await ensureTeamChannel(organizationId, userId);
    }

    // ערוץ "הודעות לצוות" — כולל את כל הצוות (גם מטפלים), אז מסנכרנים לכולם.
    await ensureBroadcastChannel(organizationId, userId);

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
            isBroadcast: true,
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
            : c.title ||
              (c.isTeamChannel
                ? "כל הצוות"
                : c.isBroadcast
                ? "הודעות לצוות"
                : "קבוצה");

        const lastMsg = c.messages[0] ?? null;
        const unreadCount = await countUnreadForParticipant(
          c.id,
          userId,
          p.lastReadAt
        );

        // "גלוי למנהלת" — שיחה בין מטפלים בלבד; הבסיס להודעת השקיפות בצד הלקוח.
        // הגנה: ערוצי צוות/הודעות לעולם אינם "בין מטפלים בלבד".
        const visibleToManager =
          !c.isTeamChannel &&
          !c.isBroadcast &&
          isTherapistOnly(
            c.participants.map((pp) => ({
              clinicRole: pp.user.clinicRole,
              role: pp.user.role,
            }))
          );

        return {
          id: c.id,
          type: c.type,
          isTeamChannel: c.isTeamChannel,
          isBroadcast: c.isBroadcast,
          // ערוץ broadcast: רק מנהלת/מזכירה כותבות; אחרת כולם. נאכף גם בשרת.
          canPost: !c.isBroadcast || isOwner || isSecretary,
          visibleToManager,
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
      // ערוצים קבועים ראשונים בשוויון: כל הצוות, ואז הודעות לצוות.
      if (a.isTeamChannel) return -1;
      if (b.isTeamChannel) return 1;
      if (a.isBroadcast) return -1;
      if (b.isBroadcast) return 1;
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
    const { userId, organizationId, isOwner, isSecretary } = auth;

    const parsed = await parseBody(request, startConversationSchema);
    if ("error" in parsed) return parsed.error;
    const { recipientId } = parsed.data;

    if (recipientId === userId) {
      return NextResponse.json(
        { message: "לא ניתן לפתוח שיחה עם עצמך" },
        { status: 400 }
      );
    }

    // ולידציה: הנמען חייב להיות חבר צ׳אט באותו ארגון, לא חסום.
    const members = await getChatMembers(organizationId);
    const recipient = members.find((m) => m.id === recipientId);
    if (!recipient) {
      return NextResponse.json(
        { message: "הנמען אינו זמין לצ׳אט" },
        { status: 404 }
      );
    }

    // אכיפת הרשאה: ניהול↔כל אחד תמיד; מטפל↔מטפל רק אם המנהלת אישרה
    // (allowTherapistChat). אכיפת שרת — ה-UI כבר מסנן אנשי קשר, זו שכבה שנייה.
    const viewerKind = isOwner || isSecretary ? "MANAGEMENT" : "THERAPIST";
    const { allowTherapistChat } = await getOrgChatSettings(organizationId);
    if (
      !canPairChat(
        viewerKind,
        memberKind(recipient.clinicRole, recipient.role),
        allowTherapistChat
      )
    ) {
      return NextResponse.json(
        { message: "אין הרשאה לפתוח שיחה זו" },
        { status: 403 }
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
