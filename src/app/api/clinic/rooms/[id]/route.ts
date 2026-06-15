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

    // אימות tenant — החדר חייב להיות של הקליניקה של הבעלים. name נשלף כדי
    // להחליט אם צריך לסנכרן את ה-location בפגישות (רק כששם החדר באמת השתנה).
    const room = await prisma.clinicRoom.findUnique({
      where: { id },
      select: { id: true, organizationId: true, name: true },
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

    // עקביות שם חדר (שלב 2): location בפגישה הוא snapshot של שם החדר בעת היצירה.
    // בשינוי שם — מסנכרנים את location בכל הפגישות המשויכות לחדר (לפי ה-FK roomId),
    // כדי שתזכורות מייל, הודעות חפיפה ("החדר X תפוס") וסנכרון עתידי ליומן יציגו
    // את השם המעודכן. roomId נשאר מקור-האמת — זו רק רענון של ה-cache הדה-נורמלי.
    // מוגבל ל-organizationId להגנת tenant. הערה מודעת: אירועי Google שכבר נדחפו
    // לא מתעדכנים עד העריכה הבאה של הפגישה (re-push המוני אינו פרופורציונלי).
    if (name !== undefined && name !== room.name) {
      try {
        const synced = await prisma.therapySession.updateMany({
          where: { roomId: id, organizationId },
          data: { location: name },
        });
        logger.info("[clinic/rooms/[id]] room renamed — synced session location", {
          organizationId,
          roomId: id,
          updatedSessions: synced.count,
        });
      } catch (propErr) {
        // לא חוסם — שינוי השם עצמו הצליח; סנכרון ה-location הוא best-effort.
        logger.error("[clinic/rooms/[id]] session location sync failed after rename", {
          organizationId,
          roomId: id,
          error: propErr instanceof Error ? propErr.message : String(propErr),
        });
      }
    }

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
