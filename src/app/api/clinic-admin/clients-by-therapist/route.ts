import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireClinicOwner } from "@/lib/clinic/require-clinic-owner";

export const dynamic = "force-dynamic";

// GET — מחזיר מטפלים בקליניקה עם רשימת הלקוחות של כל אחד (לתצוגת
// "מטופלים לפי מטפל"). זמין רק ל-OWNER (ה-RBAC מאוכף ב-requireClinicOwner).
// shape שונה במכוון מ-/api/clinic-admin/clients (שמחזיר flat list) כדי לא
// לשבור את ה-transfer page הקיים.
export async function GET() {
  try {
    const auth = await requireClinicOwner();
    if ("error" in auth) return auth.error;
    const { organizationId } = auth;

    // כולל גם THERAPIST וגם OWNER (הבעלים גם מטפל בלקוחות). מסנן חסומים.
    // ARCHIVED clients מוסתרים — המטרה היא חלוקת תיקים פעילים. אם בעלים
    // ירצה לראות גם ארכיון — אפשר להוסיף flag אחר כך.
    const therapists = await prisma.user.findMany({
      where: {
        organizationId,
        isBlocked: false,
        clinicRole: { in: ["OWNER", "THERAPIST"] },
      },
      select: {
        id: true,
        name: true,
        email: true,
        clinicRole: true,
        clients: {
          where: { status: { not: "ARCHIVED" } },
          select: {
            id: true,
            firstName: true,
            lastName: true,
            name: true,
            phone: true,
            email: true,
            status: true,
            isQuickClient: true,
            _count: { select: { therapySessions: true } },
          },
          orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
        },
      },
      orderBy: [{ clinicRole: "asc" }, { name: "asc" }],
    });

    return NextResponse.json(JSON.parse(JSON.stringify(therapists)));
  } catch (error) {
    logger.error("[clinic-admin/clients-by-therapist] GET error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה בטעינה" },
      { status: 500 }
    );
  }
}
