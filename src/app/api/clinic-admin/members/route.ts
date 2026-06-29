import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireClinicOwner } from "@/lib/clinic/require-clinic-owner";

export const dynamic = "force-dynamic";

// GET — רשימת חברי הקליניקה של המשתמש המחובר.
export async function GET() {
  try {
    const auth = await requireClinicOwner();
    if ("error" in auth) return auth.error;
    const { organizationId } = auth;

    const members = await prisma.user.findMany({
      where: { organizationId },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        clinicRole: true,
        secretaryPermissions: true,
        secretaryIsTherapist: true,
        isBlocked: true,
        createdAt: true,
        // MyTipul-B: מציג ב-UI אם הקליניקה משלמת.
        billingPaidByClinic: true,
        subscriptionPausedReason: true,
        _count: {
          select: {
            clients: true,
          },
        },
      },
      orderBy: [{ clinicRole: "asc" }, { name: "asc" }],
    });

    return NextResponse.json(JSON.parse(JSON.stringify(members)));
  } catch (error) {
    logger.error("[clinic-admin/members] GET error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה בטעינת חברי הקליניקה" },
      { status: 500 }
    );
  }
}

// POST handler הוסר ב-סבב אבטחה 12 (M12.1).
// ה-flow המאובטח להוספת חבר חדש הוא דרך clinic-admin/invitations (OTP + email).
// ה-UI הפסיק להשתמש ב-POST הזה בסבב 11 (הסרת "קישור מהיר").
