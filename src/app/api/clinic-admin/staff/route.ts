import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/api-auth";
import { canManageStaffTasks, loadScopeUser } from "@/lib/scope";

export const dynamic = "force-dynamic";

// GET /api/clinic-admin/staff — רשימת חברי הקליניקה לבורר מטלות צוות.
//
// שונה מ-/api/clinic-admin/members (בעלים בלבד, מחזיר billing/secretaryPermissions):
//   1. select מצומצם (id, name, email, clinicRole) — בלי מידע רגיש.
//   2. כולל גם מזכירות (להבדיל מ-/api/clinic/therapists שמסנן אותן).
//   3. נגיש לבעלים או למזכירה עם canAssignTasks.
export async function GET() {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const scopeUser = await loadScopeUser(userId);
    if (!scopeUser.organizationId || !canManageStaffTasks(scopeUser)) {
      return NextResponse.json(
        { message: "אין הרשאה לנהל מטלות צוות" },
        { status: 403 }
      );
    }

    const staff = await prisma.user.findMany({
      where: {
        organizationId: scopeUser.organizationId,
        isBlocked: false,
        clinicRole: { in: ["OWNER", "THERAPIST", "SECRETARY"] },
      },
      select: { id: true, name: true, email: true, clinicRole: true },
      orderBy: [{ clinicRole: "asc" }, { name: "asc" }],
    });

    return NextResponse.json(staff);
  } catch (error) {
    logger.error("[clinic-admin/staff] GET error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה בטעינת רשימת הצוות" },
      { status: 500 }
    );
  }
}
