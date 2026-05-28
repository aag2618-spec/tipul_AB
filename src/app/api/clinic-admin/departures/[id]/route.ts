import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/api-auth";
import { withAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// D1: DELETE — ביטול תהליך עזיבה ע"י בעל/ת הקליניקה. עד עכשיו רק
// המטפל/ת היוזם/ת יכל/ה לבטל (דרך /api/dashboard/clinic/leave).
// כעת בעל/ת הקליניקה יכול/ה לעצור תהליך עזיבה בכל שלב לפני סיומו
// (לדוגמה: המטפלת חזרה בה, או נחתם הסכם הסכמה חדש). פעולה ניהולית
// — לא ניתנת למזכירה.
//
// הגייט (M10.5): רק CLINIC_OWNER / clinicRole=OWNER מאותו ארגון.
// ADMIN גלובלי לא מתערב כאן — להם /api/admin/*.
//
// ביטול מסמן status=CANCELLED + completedAt=now. ה-choices נשארים
// (לצורך audit/היסטוריה). הטוקנים הפומביים של המטופלים יהפכו לא-תקפים
// כי ה-public route בודק status=PENDING.

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const { id } = await params;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, clinicRole: true, organizationId: true },
    });

    if (!user) {
      return NextResponse.json({ message: "המשתמש לא נמצא" }, { status: 404 });
    }

    const isOwner = user.role === "CLINIC_OWNER" || user.clinicRole === "OWNER";
    if (!isOwner) {
      return NextResponse.json({ message: "אין הרשאה" }, { status: 403 });
    }
    if (!user.organizationId) {
      return NextResponse.json(
        { message: "אינך משויך/ת לקליניקה" },
        { status: 404 }
      );
    }

    // טוענים את ה-departure ומוודאים שהוא של אותו ארגון + PENDING.
    const departure = await prisma.therapistDeparture.findFirst({
      where: { id, organizationId: user.organizationId },
      select: {
        id: true,
        status: true,
        departingTherapistId: true,
      },
    });

    if (!departure) {
      return NextResponse.json(
        { message: "תהליך עזיבה לא נמצא בקליניקה" },
        { status: 404 }
      );
    }
    if (departure.status !== "PENDING") {
      return NextResponse.json(
        { message: "ניתן לבטל רק תהליכי עזיבה פעילים" },
        { status: 400 }
      );
    }

    // updateMany עם guard נוסף — race-safe אם cron departure-deadlines
    // משנה במקביל את הסטטוס ל-COMPLETED ברגע ה-deadline.
    await withAudit(
      { kind: "user", session },
      {
        action: "owner_cancel_therapist_departure",
        targetType: "TherapistDeparture",
        targetId: departure.id,
        details: {
          organizationId: user.organizationId,
          departingTherapistId: departure.departingTherapistId,
          cancelledByOwner: userId,
        },
      },
      async (tx) => {
        const result = await tx.therapistDeparture.updateMany({
          where: {
            id: departure.id,
            organizationId: user.organizationId!,
            status: "PENDING",
          },
          data: { status: "CANCELLED", completedAt: new Date() },
        });
        if (result.count === 0) {
          throw new Error("DEPARTURE_NOT_PENDING_OR_GONE");
        }
        return result;
      }
    );

    logger.info("[clinic-admin/departures] owner cancelled departure", {
      ownerId: userId,
      departureId: departure.id,
      departingTherapistId: departure.departingTherapistId,
      organizationId: user.organizationId,
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "DEPARTURE_NOT_PENDING_OR_GONE") {
      return NextResponse.json(
        { message: "תהליך העזיבה כבר הושלם או בוטל במקביל" },
        { status: 409 }
      );
    }
    logger.error("[clinic-admin/departures] DELETE error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה בביטול תהליך העזיבה" },
      { status: 500 }
    );
  }
}
