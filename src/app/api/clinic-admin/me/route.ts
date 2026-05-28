import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/api-auth";
import type { SecretaryPermissions } from "@/lib/scope";

export const dynamic = "force-dynamic";

// GET — מחזיר את ה-organization וה-clinicRole של המשתמש המחובר.
// משמש את /clinic-admin/* כדי לדעת לאיזה ארגון להציג נתונים.
//
// Phase 4 follow-up: בעבר חסום רק לבעלי/ות קליניקה. עכשיו פתוח גם למזכירות
// עם canTransferClient — הן צריכות גישה ל-/clinic-admin/transfer ול-/members/by-therapist.
// השרת ממילא אוכף הרשאות per-route בנפרד (defense-in-depth).
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
        secretaryPermissions: true,
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

    // M10.5: ADMIN גלובלי משתמש ב-/api/admin/* בלבד; אסור bypass כאן.
    // שמירת חוזה ה-API: isAdmin עדיין נחשף לצרכן (תמיד false עבור OWNER).
    const isClinicOwner =
      user.role === "CLINIC_OWNER" || user.clinicRole === "OWNER";
    const isSecretary =
      user.clinicRole === "SECRETARY" || user.role === "CLINIC_SECRETARY";
    const perms = (user.secretaryPermissions as SecretaryPermissions | null) ?? null;
    const isSecretaryWithTransferAccess = isSecretary && Boolean(perms?.canTransferClient);

    if (!isClinicOwner && !isSecretaryWithTransferAccess) {
      return NextResponse.json(
        { message: "הפעולה זמינה לבעלי/ות קליניקה (או למזכיר/ה עם הרשאת העברה) בלבד" },
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
          isAdmin: false,
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
