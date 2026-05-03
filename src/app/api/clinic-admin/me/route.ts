import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

// GET — מחזיר את ה-organization וה-clinicRole של המשתמש המחובר.
// משמש את /clinic-admin/* כדי לדעת לאיזה ארגון להציג נתונים.
export async function GET() {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        clinicRole: true,
        organizationId: true,
        organization: {
          select: {
            id: true,
            name: true,
            aiTier: true,
            subscriptionStatus: true,
            pricingPlan: { select: { name: true } },
          },
        },
      },
    });

    if (!user) {
      return NextResponse.json({ message: "המשתמש לא נמצא" }, { status: 404 });
    }

    const isAdmin = user.role === "ADMIN";
    const isClinicOwner =
      user.role === "CLINIC_OWNER" || user.clinicRole === "OWNER";

    if (!isAdmin && !isClinicOwner) {
      return NextResponse.json(
        { message: "הפעולה זמינה לבעלי/ות קליניקה בלבד" },
        { status: 403 }
      );
    }

    return NextResponse.json(
      JSON.parse(
        JSON.stringify({
          organization: user.organization,
          user: {
            id: user.id,
            name: user.name,
            email: user.email,
            role: user.role,
            clinicRole: user.clinicRole,
          },
          isAdmin,
        })
      )
    );
  } catch (error) {
    logger.error("[clinic-admin/me] GET error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה בטעינת הקשר הקליניקה" },
      { status: 500 }
    );
  }
}
