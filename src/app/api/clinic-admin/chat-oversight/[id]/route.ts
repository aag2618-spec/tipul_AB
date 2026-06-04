// ============================================================================
// GET /api/clinic-admin/chat-oversight/[id] — הודעות שיחת מטפלים (מעקב מנהלת)
// ============================================================================
// בעלת קליניקה בלבד. קריאה בלבד. אבטחה:
//   1. requireClinicOwner — מנהלת בלבד.
//   2. השיחה חייבת להיות באותו ארגון (org-scoped) — אחרת 404.
//   3. השיחה חייבת להיות "בין מטפלים בלבד" — אחרת 403. כך ה-endpoint הזה לא
//      יכול לשמש לקריאת שיחות שיש בהן צד ניהולי (מזכירה↔מזכירה / ערוץ הצוות).
// ============================================================================

import { NextResponse, type NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireClinicOwner } from "@/lib/clinic/require-clinic-owner";
import { chatRoleLabel, isTherapistOnly } from "@/lib/chat/chat-service";
import { logDataAccess } from "@/lib/audit-logger";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireClinicOwner();
    if ("error" in auth) return auth.error;
    const { organizationId, userId } = auth;
    const { id } = await params;

    const convo = await prisma.chatConversation.findFirst({
      // מחריגים ערוצי צוות/הודעות — לא נגישים דרך מסך המעקב.
      where: { id, organizationId, isTeamChannel: false, isBroadcast: false },
      select: {
        id: true,
        type: true,
        title: true,
        participants: {
          select: {
            user: {
              select: { id: true, name: true, clinicRole: true, role: true },
            },
          },
        },
      },
    });
    if (!convo) {
      return NextResponse.json({ message: "השיחה לא נמצאה" }, { status: 404 });
    }

    const therapistOnly = isTherapistOnly(
      convo.participants.map((p) => ({
        clinicRole: p.user.clinicRole,
        role: p.user.role,
      }))
    );
    if (!therapistOnly) {
      return NextResponse.json(
        { message: "השיחה אינה זמינה למעקב" },
        { status: 403 }
      );
    }

    const messages = await prisma.chatMessage.findMany({
      where: { conversationId: id, deletedAt: null },
      orderBy: { createdAt: "asc" },
      take: 500,
      select: {
        id: true,
        body: true,
        senderId: true,
        createdAt: true,
        attachmentPath: true,
        attachmentName: true,
        attachmentType: true,
        attachmentSize: true,
        sender: { select: { name: true } },
      },
    });

    // תיעוד audit עמיד-לשינוי — המנהלת קראה התכתבות פרטית בין מטפלים.
    logDataAccess({
      userId,
      recordType: "THERAPIST_CHAT",
      recordId: id,
      action: "READ",
      request,
      meta: {
        feature: "chat-oversight-view",
        organizationId,
        messageCount: messages.length,
        participantIds: convo.participants.map((p) => p.user.id),
      },
    });

    return NextResponse.json({
      conversation: {
        id: convo.id,
        title:
          convo.type === "GROUP"
            ? convo.title || "קבוצת מטפלים"
            : convo.participants.map((p) => p.user.name || "מטפל/ת").join(" · "),
        participants: convo.participants.map((p) => ({
          id: p.user.id,
          name: p.user.name,
          role: chatRoleLabel(p.user.clinicRole, p.user.role),
        })),
      },
      messages: messages.map((m) => ({
        id: m.id,
        body: m.body,
        senderId: m.senderId,
        senderName: m.sender.name,
        createdAt: m.createdAt.toISOString(),
        attachment: m.attachmentPath
          ? {
              name: m.attachmentName ?? "קובץ",
              type: m.attachmentType ?? "application/octet-stream",
              size: m.attachmentSize ?? 0,
            }
          : null,
      })),
    });
  } catch (error) {
    logger.error("[clinic-admin/chat-oversight] view error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה בטעינת ההתכתבות" },
      { status: 500 }
    );
  }
}
