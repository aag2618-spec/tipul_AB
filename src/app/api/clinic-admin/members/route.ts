import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/api-auth";
import { withAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// בדיקת הרשאה משותפת — מחזיר את ה-userId + organizationId אם מותר.
async function requireClinicOwner() {
  const auth = await requireAuth();
  if ("error" in auth) return { error: auth.error };
  const { userId, session } = auth;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, clinicRole: true, organizationId: true },
  });
  if (!user) {
    return {
      error: NextResponse.json({ message: "המשתמש לא נמצא" }, { status: 404 }),
    };
  }
  const isOwner = user.role === "CLINIC_OWNER" || user.clinicRole === "OWNER";
  if (!isOwner && user.role !== "ADMIN") {
    return {
      error: NextResponse.json(
        { message: "הפעולה זמינה לבעלי קליניקה בלבד" },
        { status: 403 }
      ),
    };
  }
  if (!user.organizationId) {
    return {
      error: NextResponse.json(
        { message: "אינך משויך/ת לקליניקה" },
        { status: 400 }
      ),
    };
  }
  return { userId, session, organizationId: user.organizationId };
}

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

// POST — הוספת חבר חדש לקליניקה (מקשר משתמש קיים שלא משויך לארגון).
// body: { userId, clinicRole: "THERAPIST" | "SECRETARY", secretaryPermissions? }
export async function POST(request: NextRequest) {
  try {
    const auth = await requireClinicOwner();
    if ("error" in auth) return auth.error;
    const { organizationId, session } = auth;

    const body = await request.json();
    const { userId: newMemberId, clinicRole, secretaryPermissions } = body;

    if (!newMemberId) {
      return NextResponse.json({ message: "נדרש בחירת משתמש" }, { status: 400 });
    }
    if (clinicRole !== "THERAPIST" && clinicRole !== "SECRETARY") {
      return NextResponse.json(
        { message: "תפקיד חייב להיות THERAPIST או SECRETARY" },
        { status: 400 }
      );
    }

    const candidate = await prisma.user.findUnique({
      where: { id: newMemberId },
      select: { id: true, isBlocked: true, organizationId: true, role: true, name: true, email: true },
    });
    if (!candidate) {
      return NextResponse.json({ message: "המשתמש לא נמצא" }, { status: 400 });
    }
    if (candidate.isBlocked) {
      return NextResponse.json(
        { message: "המשתמש חסום — לא ניתן להוסיף לקליניקה" },
        { status: 400 }
      );
    }
    if (candidate.organizationId) {
      return NextResponse.json(
        { message: "המשתמש כבר משויך לקליניקה" },
        { status: 400 }
      );
    }
    // לא יכול להוסיף ADMIN/MANAGER גלובליים כחבר קליניקה — הם פועלים ברמת המערכת
    if (candidate.role === "ADMIN" || candidate.role === "MANAGER") {
      return NextResponse.json(
        { message: "לא ניתן לשייך משתמשי מערכת (ADMIN/MANAGER) לקליניקה" },
        { status: 400 }
      );
    }

    const updated = await withAudit(
      { kind: "user", session },
      {
        action: "add_clinic_member",
        targetType: "User",
        targetId: newMemberId,
        details: {
          organizationId,
          clinicRole,
          memberEmail: candidate.email,
        },
      },
      async (tx) => {
        return tx.user.update({
          where: { id: newMemberId },
          data: {
            organizationId,
            clinicRole,
            // role ב-User רמה גלובלית — מעדכנים רק ל-SECRETARY (THERAPIST נשאר USER)
            ...(clinicRole === "SECRETARY" && { role: "CLINIC_SECRETARY" }),
            secretaryPermissions:
              clinicRole === "SECRETARY"
                ? secretaryPermissions ?? {
                    canViewPayments: false,
                    canIssueReceipts: false,
                    canSendReminders: true,
                    canCreateClient: true,
                    canViewDebts: false,
                    canViewStats: false,
                  }
                : Prisma.DbNull, // Prisma.DbNull על Json? — null פשוט לא מנקה.
          },
        });
      }
    );

    return NextResponse.json(JSON.parse(JSON.stringify(updated)));
  } catch (error) {
    logger.error("[clinic-admin/members] POST error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה בהוספת חבר" },
      { status: 500 }
    );
  }
}
