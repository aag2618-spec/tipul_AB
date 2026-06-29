import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/api-auth";
import { isClinicOwner, isSecretary, loadScopeUser } from "@/lib/scope";

export const dynamic = "force-dynamic";

// GET /api/clinic/therapists
//
// רשימת מטפלי הקליניקה (THERAPIST + OWNER) — נצרך ע"י ה-picker בטופס
// "מטופל חדש" (Phase 3 / Phase 4). שונה מ-/api/clinic-admin/members כי:
//   1. נגיש למזכירה (לא רק לבעלים) — היא צריכה לבחור מטפל אחראי כשהיא
//      פותחת תיק חדש.
//   2. select מצומצם — רק id, name, email, clinicRole (אין billing, אין
//      _count, אין secretaryPermissions). מתאים ל-UI dropdown.
//   3. מסנן `isBlocked=false`, וכולל THERAPIST + OWNER + מזכיר/ה-מטפל/ת
//      (SECRETARY עם secretaryIsTherapist=true) — תאם ל-validation ב-
//      `resolveTherapistIdForClient` (scope.ts) שמתיר שיוך למזכירה-מטפלת,
//      כך שכל ערך שנבחר ב-picker יעבור גם את בדיקת השרת. מזכירה רגילה
//      (בלי הדגל) עדיין מסוננת החוצה.
//
// גישה: OWNER או SECRETARY בקליניקה (organizationId != null). מטפל רגיל
// בקליניקה ומטפל עצמאי לא מציגים picker, ולכן אינם נדרשים פה — 403.
export async function GET() {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const scopeUser = await loadScopeUser(userId);

    if (!scopeUser.organizationId) {
      return NextResponse.json(
        { message: "אין הרשאה לגשת לרשימת מטפלי הקליניקה" },
        { status: 403 }
      );
    }
    if (!isClinicOwner(scopeUser) && !isSecretary(scopeUser)) {
      return NextResponse.json(
        { message: "אין הרשאה לגשת לרשימת מטפלי הקליניקה" },
        { status: 403 }
      );
    }

    const therapists = await prisma.user.findMany({
      where: {
        organizationId: scopeUser.organizationId,
        isBlocked: false,
        OR: [
          { clinicRole: { in: ["THERAPIST", "OWNER"] } },
          // מזכיר/ה שהוא/היא גם מטפל/ת — מטפל/ת אחראי/ת לכל דבר.
          { clinicRole: "SECRETARY", secretaryIsTherapist: true },
        ],
      },
      select: {
        id: true,
        name: true,
        email: true,
        clinicRole: true,
      },
      orderBy: [{ clinicRole: "asc" }, { name: "asc" }],
    });

    return NextResponse.json(therapists);
  } catch (error) {
    logger.error("[clinic/therapists] GET error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה בטעינת רשימת המטפלים" },
      { status: 500 }
    );
  }
}
