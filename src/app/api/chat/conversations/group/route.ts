// ============================================================================
// POST /api/chat/conversations/group — יצירת קבוצת צ׳אט עם מספר משתתפים
// ============================================================================
// כל חבר צ׳אט יכול ליצור קבוצה. אכיפת ההרשאה זהה לשיחה פרטית: לכל משתתף
// שמצורף נבדק canPairChat(creator, member). מכאן נובע אוטומטית:
//   • ניהול (מנהלת/מזכירה) יכול לצרף כל אחד.
//   • מטפל יכול לצרף מטפלים אחרים רק אם המנהלת הפעילה allowTherapistChat;
//     את ההנהלה הוא תמיד יכול לצרף.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { parseBody } from "@/lib/validations/helpers";
import { createGroupSchema } from "@/lib/validations/chat";
import { requireChatAccess } from "@/lib/chat/require-chat-access";
import {
  getChatMembers,
  getOrgChatSettings,
  memberKind,
  canPairChat,
} from "@/lib/chat/chat-service";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireChatAccess();
    if ("error" in auth) return auth.error;
    const { userId, organizationId, isOwner, isSecretary } = auth;

    const parsed = await parseBody(request, createGroupSchema);
    if ("error" in parsed) return parsed.error;
    const { title, participantIds } = parsed.data;

    // נורמליזציה: ייחודי + ללא היוצר עצמו (הוא יתווסף ממילא).
    const uniqueIds = Array.from(new Set(participantIds)).filter(
      (id) => id !== userId
    );
    if (uniqueIds.length < 2) {
      return NextResponse.json(
        { message: "בחרו לפחות שני אנשי צוות לקבוצה" },
        { status: 400 }
      );
    }

    const viewerKind = isOwner || isSecretary ? "MANAGEMENT" : "THERAPIST";
    const { allowTherapistChat } = await getOrgChatSettings(organizationId);
    const members = await getChatMembers(organizationId);
    const memberById = new Map(members.map((m) => [m.id, m]));

    // אימות כל משתתף: חבר צ׳אט באותו ארגון + מותר לפתוח איתו שיחה.
    for (const id of uniqueIds) {
      const member = memberById.get(id);
      if (!member) {
        return NextResponse.json(
          { message: "אחד המשתתפים אינו זמין לצ׳אט" },
          { status: 404 }
        );
      }
      if (
        !canPairChat(
          viewerKind,
          memberKind(member.clinicRole, member.role),
          allowTherapistChat
        )
      ) {
        return NextResponse.json(
          { message: "אין הרשאה לצרף את אחד המשתתפים" },
          { status: 403 }
        );
      }
    }

    const conversation = await prisma.chatConversation.create({
      data: {
        organizationId,
        type: "GROUP",
        title,
        isTeamChannel: false,
        createdById: userId,
        participants: {
          create: [
            { userId },
            ...uniqueIds.map((id) => ({ userId: id })),
          ],
        },
      },
      select: { id: true },
    });

    return NextResponse.json({ conversationId: conversation.id }, { status: 201 });
  } catch (error) {
    logger.error("[Chat] Create group error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "אירעה שגיאה ביצירת הקבוצה" },
      { status: 500 }
    );
  }
}
