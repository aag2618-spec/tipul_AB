import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireClinicOwner } from "@/lib/clinic/require-clinic-owner";
import { parseBody } from "@/lib/validations/helpers";
import { updateRoomSchema } from "@/lib/validations/clinic-room";

export const dynamic = "force-dynamic";

// ============================================================================
// /api/clinic/rooms/[id] — עדכון / מחיקת חדר (בעלים בלבד)
// ============================================================================

// PUT — עדכון שם / פעיל / סדר. כל שדה אופציונלי (refine מוודא שלפחות אחד נשלח).
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireClinicOwner();
    if ("error" in auth) return auth.error;
    const { organizationId } = auth;

    const { id } = await params;
    const parsed = await parseBody(request, updateRoomSchema);
    if ("error" in parsed) return parsed.error;
    const { name, isActive, sortOrder } = parsed.data;

    // אימות tenant — החדר חייב להיות של הקליניקה של הבעלים.
    const room = await prisma.clinicRoom.findUnique({
      where: { id },
      select: { id: true, organizationId: true },
    });
    if (!room || room.organizationId !== organizationId) {
      return NextResponse.json({ message: "החדר לא נמצא" }, { status: 404 });
    }

    // אם משנים שם — לוודא שאין חדר אחר באותה קליניקה עם אותו שם (case-insensitive).
    if (name !== undefined) {
      const dup = await prisma.clinicRoom.findFirst({
        where: {
          organizationId,
          name: { equals: name, mode: "insensitive" },
          id: { not: id },
        },
        select: { id: true },
      });
      if (dup) {
        return NextResponse.json(
          { message: "כבר קיים חדר בשם הזה" },
          { status: 409 }
        );
      }
    }

    // defense-in-depth: updateMany עם organizationId ב-where מונע TOCTOU אם
    // ה-tenant השתנה בין הבדיקה לעדכון.
    await prisma.clinicRoom.updateMany({
      where: { id, organizationId },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(isActive !== undefined ? { isActive } : {}),
        ...(sortOrder !== undefined ? { sortOrder } : {}),
      },
    });

    const updated = await prisma.clinicRoom.findUnique({
      where: { id },
      select: { id: true, name: true, isActive: true, sortOrder: true },
    });
    return NextResponse.json(updated);
  } catch (error) {
    logger.error("[clinic/rooms/[id]] PUT error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה בעדכון החדר" },
      { status: 500 }
    );
  }
}

// DELETE — מחיקה קשיחה רק אם אין פגישות שמשויכות לחדר. אחרת מחזיר 409 ומבקש
// להשבית (isActive=false) כדי לא לאבד שיוך היסטורי של פגישות.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireClinicOwner();
    if ("error" in auth) return auth.error;
    const { organizationId } = auth;

    const { id } = await params;

    const room = await prisma.clinicRoom.findUnique({
      where: { id },
      select: { id: true, organizationId: true },
    });
    if (!room || room.organizationId !== organizationId) {
      return NextResponse.json({ message: "החדר לא נמצא" }, { status: 404 });
    }

    const sessionCount = await prisma.therapySession.count({
      where: { roomId: id },
    });
    if (sessionCount > 0) {
      return NextResponse.json(
        {
          message:
            "לא ניתן למחוק חדר שיש לו פגישות. אפשר להשבית אותו (לא יוצג בבחירה) — ההיסטוריה תישמר.",
        },
        { status: 409 }
      );
    }

    await prisma.clinicRoom.deleteMany({ where: { id, organizationId } });
    logger.info("[clinic/rooms/[id]] deleted", { organizationId, roomId: id });
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("[clinic/rooms/[id]] DELETE error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה במחיקת החדר" },
      { status: 500 }
    );
  }
}
