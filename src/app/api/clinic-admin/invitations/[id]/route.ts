import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/api-auth";
import { withAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

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
      error: NextResponse.json({ message: "אין הרשאה" }, { status: 403 }),
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

// ─── DELETE — ביטול הזמנה PENDING ───
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireClinicOwner();
    if ("error" in auth) return auth.error;
    const { organizationId, userId, session } = auth;

    const { id } = await params;

    const invitation = await prisma.clinicInvitation.findUnique({
      where: { id },
      select: { id: true, organizationId: true, status: true, email: true },
    });
    if (!invitation) {
      return NextResponse.json(
        { message: "ההזמנה לא נמצאה" },
        { status: 404 }
      );
    }
    if (invitation.organizationId !== organizationId) {
      return NextResponse.json(
        { message: "ההזמנה לא שייכת לקליניקה שלך" },
        { status: 403 }
      );
    }
    if (invitation.status !== "PENDING") {
      return NextResponse.json(
        { message: "ניתן לבטל רק הזמנות בהמתנה" },
        { status: 400 }
      );
    }

    await withAudit(
      { kind: "user", session },
      {
        action: "invitation_revoked",
        targetType: "ClinicInvitation",
        targetId: id,
        details: { organizationId, email: invitation.email },
      },
      async (tx) => {
        return tx.clinicInvitation.update({
          where: { id },
          data: {
            status: "REVOKED",
            revokedAt: new Date(),
            revokedById: userId,
          },
        });
      }
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error("[clinic-invitations/[id]] DELETE error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה בביטול ההזמנה" },
      { status: 500 }
    );
  }
}
