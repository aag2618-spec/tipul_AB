// ============================================================================
// GET + PUT /api/clinic-admin/chat-settings
// ============================================================================
// הגדרת "צ׳אט בין מטפלים" (Organization.allowTherapistChat) — אישור המנהלת.
//
// אבטחה: requireClinicOwner (בעל/ת קליניקה בלבד; אין ADMIN bypass, אין מזכירה).
// PUT הוא טרנזקציוני: עדכון הדגל + אכיפת המדיניות על שיחות קיימות
// (applyTherapistChatPolicy) קורים יחד — כיבוי סוגר שיחות מטפל↔מטפל קיימות,
// הפעלה משחזרת אותן. שינוי לאותו ערך = no-op.
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireClinicOwner } from "@/lib/clinic/require-clinic-owner";
import { applyTherapistChatPolicy } from "@/lib/chat/chat-service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requireClinicOwner();
    if ("error" in auth) return auth.error;
    const { organizationId } = auth;

    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { allowTherapistChat: true },
    });

    return NextResponse.json({
      allowTherapistChat: org?.allowTherapistChat ?? false,
    });
  } catch (error) {
    logger.error("[clinic-admin/chat-settings] GET error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה בטעינת הגדרות הצ׳אט" },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  try {
    const auth = await requireClinicOwner();
    if ("error" in auth) return auth.error;
    const { organizationId, userId } = auth;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { message: "גוף הבקשה אינו JSON תקין" },
        { status: 400 }
      );
    }

    const allowTherapistChat = (body as { allowTherapistChat?: unknown })
      ?.allowTherapistChat;
    if (typeof allowTherapistChat !== "boolean") {
      return NextResponse.json(
        { message: "allowTherapistChat חייב להיות true או false" },
        { status: 400 }
      );
    }

    // טרנזקציה: עדכון הדגל + אכיפת המדיניות על שיחות קיימות יחד (אטומי).
    await prisma.$transaction(async (tx) => {
      const org = await tx.organization.findUnique({
        where: { id: organizationId },
        select: { allowTherapistChat: true },
      });
      const current = org?.allowTherapistChat ?? false;
      if (current === allowTherapistChat) return; // אין שינוי — לא נוגעים בשיחות

      await tx.organization.update({
        where: { id: organizationId },
        data: { allowTherapistChat },
      });
      await applyTherapistChatPolicy(tx, organizationId, allowTherapistChat);
    });

    logger.info("[clinic-admin/chat-settings] updated", {
      organizationId,
      ownerUserId: userId,
      allowTherapistChat,
    });

    return NextResponse.json({ success: true, allowTherapistChat });
  } catch (error) {
    logger.error("[clinic-admin/chat-settings] PUT error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה בשמירת הגדרות הצ׳אט" },
      { status: 500 }
    );
  }
}
