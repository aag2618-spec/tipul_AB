// ============================================================================
// GET /api/clinic-admin/chat-oversight — רשימת שיחות "בין מטפלים בלבד" בארגון
// ============================================================================
// מעקב המנהלת: בעלת קליניקה בלבד (requireClinicOwner) רואה את כל השיחות שבהן
// כל המשתתפים מטפלים (DIRECT או קבוצה). קריאה בלבד. בידוד ארגוני מלא.
// שיחות שיש בהן צד ניהולי (מנהלת/מזכירה) — כולל ערוץ "כל הצוות" — לא נכללות
// (אלה אינן "בין מטפלים", והמנהלת ממילא משתתפת בשלה).
// ============================================================================

import { NextResponse, type NextRequest } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireClinicOwner } from "@/lib/clinic/require-clinic-owner";
import { chatRoleLabel, isTherapistOnly } from "@/lib/chat/chat-service";
import { logDataAccess } from "@/lib/audit-logger";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireClinicOwner();
    if ("error" in auth) return auth.error;
    const { organizationId, userId } = auth;

    const convos = await prisma.chatConversation.findMany({
      // מחריגים ערוצי צוות/הודעות מפורשות — המעקב הוא רק על שיחות בין מטפלים.
      where: { organizationId, isTeamChannel: false, isBroadcast: false },
      orderBy: { lastMessageAt: "desc" },
      select: {
        id: true,
        type: true,
        title: true,
        lastMessageAt: true,
        participants: {
          select: {
            user: {
              select: { id: true, name: true, clinicRole: true, role: true },
            },
          },
        },
        messages: {
          where: { deletedAt: null },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { body: true, senderId: true, createdAt: true },
        },
      },
    });

    const conversations = convos
      .filter((c) =>
        isTherapistOnly(
          c.participants.map((p) => ({
            clinicRole: p.user.clinicRole,
            role: p.user.role,
          }))
        )
      )
      .map((c) => {
        const last = c.messages[0] ?? null;
        return {
          id: c.id,
          type: c.type,
          title:
            c.type === "GROUP"
              ? c.title || "קבוצת מטפלים"
              : c.participants
                  .map((p) => p.user.name || "מטפל/ת")
                  .join(" · "),
          participants: c.participants.map((p) => ({
            id: p.user.id,
            name: p.user.name,
            role: chatRoleLabel(p.user.clinicRole, p.user.role),
          })),
          lastMessage: last
            ? {
                body: last.body,
                senderId: last.senderId,
                createdAt: last.createdAt.toISOString(),
              }
            : null,
          lastMessageAt: c.lastMessageAt ? c.lastMessageAt.toISOString() : null,
        };
      });

    // תיעוד audit — רשימת המעקב חושפת תצוגה מקדימה של ההודעה האחרונה בכל שיחה.
    logDataAccess({
      userId,
      recordType: "THERAPIST_CHAT",
      recordId: organizationId,
      action: "READ",
      request,
      meta: {
        feature: "chat-oversight-list",
        conversationCount: conversations.length,
      },
    });

    return NextResponse.json({ conversations });
  } catch (error) {
    logger.error("[clinic-admin/chat-oversight] list error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה בטעינת שיחות המטפלים" },
      { status: 500 }
    );
  }
}
