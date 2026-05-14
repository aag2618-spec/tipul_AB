import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { withAudit } from "@/lib/audit";
import { requireClinicOwner } from "@/lib/clinic/require-clinic-owner";

export const dynamic = "force-dynamic";

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
