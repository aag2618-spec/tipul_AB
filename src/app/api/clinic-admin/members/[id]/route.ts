import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/api-auth";
import { withAudit } from "@/lib/audit";
import { computeBillingRestore } from "@/lib/clinic-invitations";

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
    return { error: NextResponse.json({ message: "המשתמש לא נמצא" }, { status: 404 }) };
  }
  const isOwner = user.role === "CLINIC_OWNER" || user.clinicRole === "OWNER";
  if (!isOwner && user.role !== "ADMIN") {
    return {
      error: NextResponse.json({ message: "אין הרשאה" }, { status: 403 }),
    };
  }
  if (!user.organizationId) {
    return {
      error: NextResponse.json({ message: "אינך משויך/ת לקליניקה" }, { status: 400 }),
    };
  }
  return { userId, session, organizationId: user.organizationId };
}

// PATCH — עדכון הרשאות מזכירה / שינוי clinicRole בתוך הקליניקה.
// אסור לשנות את ה-OWNER דרך כאן (זה דרך admin: העברת בעלות).
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireClinicOwner();
    if ("error" in auth) return auth.error;
    const { organizationId, session } = auth;

    const { id } = await params;
    const body = await request.json();

    const member = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        organizationId: true,
        clinicRole: true,
        role: true,
        email: true,
      },
    });
    if (!member) {
      return NextResponse.json({ message: "החבר לא נמצא" }, { status: 404 });
    }
    if (member.organizationId !== organizationId) {
      return NextResponse.json(
        { message: "החבר לא שייך לקליניקה שלך" },
        { status: 403 }
      );
    }
    if (member.clinicRole === "OWNER") {
      return NextResponse.json(
        { message: "לא ניתן לערוך את הבעלים מכאן — פנה/י לאדמין להעברת בעלות" },
        { status: 400 }
      );
    }

    const updates: { clinicRole?: "THERAPIST" | "SECRETARY"; secretaryPermissions?: unknown; role?: string } = {};

    if (body.clinicRole !== undefined) {
      if (body.clinicRole !== "THERAPIST" && body.clinicRole !== "SECRETARY") {
        return NextResponse.json(
          { message: "תפקיד חייב להיות THERAPIST או SECRETARY" },
          { status: 400 }
        );
      }
      updates.clinicRole = body.clinicRole;
      // עדכון role גלובלי
      if (body.clinicRole === "SECRETARY") {
        updates.role = "CLINIC_SECRETARY";
      } else if (member.role === "CLINIC_SECRETARY") {
        updates.role = "USER";
      }
    }

    // עדכון secretaryPermissions — רק אם המשתמש הוא או יהיה SECRETARY
    const finalRole = updates.clinicRole ?? member.clinicRole;
    if (body.secretaryPermissions !== undefined) {
      if (finalRole !== "SECRETARY") {
        return NextResponse.json(
          { message: "ניתן להגדיר הרשאות רק למזכירות" },
          { status: 400 }
        );
      }
      updates.secretaryPermissions = body.secretaryPermissions;
    } else if (updates.clinicRole === "THERAPIST") {
      // המעבר ל-THERAPIST — מאפסים secretaryPermissions
      updates.secretaryPermissions = null;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json(
        { message: "לא הועברו שינויים" },
        { status: 400 }
      );
    }

    const updated = await withAudit(
      { kind: "user", session },
      {
        action: "update_clinic_member",
        targetType: "User",
        targetId: id,
        details: {
          organizationId,
          memberEmail: member.email,
          changes: Object.keys(updates),
        },
      },
      async (tx) => {
        return tx.user.update({
          where: { id },
          data: updates as Parameters<typeof tx.user.update>[0]["data"],
        });
      }
    );

    return NextResponse.json(JSON.parse(JSON.stringify(updated)));
  } catch (error) {
    logger.error("[clinic-admin/members/[id]] PATCH error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה בעדכון החבר" },
      { status: 500 }
    );
  }
}

// DELETE — הסרת חבר מהקליניקה. מנתק organizationId+clinicRole; משאיר את ה-User עצמו.
// חוסם:
// - הסרת OWNER
// - הסרת עצמך
// - חבר עם מטופלים — דורש העברת מטופלים תחילה
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireClinicOwner();
    if ("error" in auth) return auth.error;
    const { organizationId, userId: actorId, session } = auth;

    const { id } = await params;

    if (id === actorId) {
      return NextResponse.json(
        { message: "לא ניתן להסיר את עצמך מהקליניקה" },
        { status: 400 }
      );
    }

    const member = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        organizationId: true,
        clinicRole: true,
        role: true,
        // נדרש ל-MyTipul-B כדי לשחרר מנוי שהושעה ע"י הקליניקה.
        billingPaidByClinic: true,
        subscriptionPausedReason: true,
        subscriptionStatusBeforeClinic: true,
        trialEndsAt: true,
        _count: { select: { clients: true } },
      },
    });
    if (!member) {
      return NextResponse.json({ message: "החבר לא נמצא" }, { status: 404 });
    }
    if (member.organizationId !== organizationId) {
      return NextResponse.json(
        { message: "החבר לא שייך לקליניקה שלך" },
        { status: 403 }
      );
    }
    if (member.clinicRole === "OWNER") {
      return NextResponse.json(
        { message: "לא ניתן להסיר את הבעלים — נדרש להעביר בעלות באמצעות אדמין" },
        { status: 400 }
      );
    }
    if (member._count.clients > 0) {
      return NextResponse.json(
        {
          message: `לא ניתן להסיר — לחבר יש ${member._count.clients} מטופלים. תחילה העבר/י את המטופלים למטפל אחר.`,
        },
        { status: 400 }
      );
    }

    // MyTipul-B: שחרור מנוי שהושעה ע"י הקליניקה.
    // הלוגיקה ב-computeBillingRestore (lib/clinic-invitations.ts) — pure, מכוסה בטסטים.
    let billingReleased = false;
    let restoreTo: string | null = null;
    let grantedFreshTrial = false;
    let appliedGrace = false;
    const billingFields: Record<string, unknown> = {};

    if (
      member.billingPaidByClinic &&
      member.subscriptionPausedReason === "PAID_BY_CLINIC"
    ) {
      billingReleased = true;
      const plan = computeBillingRestore({
        subscriptionStatusBeforeClinic: member.subscriptionStatusBeforeClinic,
        trialEndsAt: member.trialEndsAt,
      });
      restoreTo = plan.newStatus;
      grantedFreshTrial = plan.grantedFreshTrial;
      appliedGrace = plan.appliedGrace;

      billingFields.subscriptionStatus = plan.newStatus;
      billingFields.trialEndsAt = plan.newTrialEndsAt;
      billingFields.subscriptionStatusBeforeClinic = null;
      billingFields.subscriptionPausedReason = null;
      billingFields.subscriptionPausedAt = null;
      billingFields.billingPaidByClinic = false;
    }

    await withAudit(
      { kind: "user", session },
      {
        action: "remove_clinic_member",
        targetType: "User",
        targetId: id,
        details: {
          organizationId,
          memberEmail: member.email,
          previousClinicRole: member.clinicRole,
          // forensics לסקירה: האם DELETE שחרר מנוי, ואם כן — לאיזה סטטוס.
          billingReleased,
          restoreTo,
          grantedFreshTrial,
          appliedGrace,
        },
      },
      async (tx) => {
        // guard: organizationId === current org (race-safe על concurrent transfers).
        const result = await tx.user.updateMany({
          where: { id, organizationId },
          data: {
            organizationId: null,
            clinicRole: null,
            secretaryPermissions: undefined,
            ...billingFields,
            // אם היה CLINIC_SECRETARY — מחזירים ל-USER
            ...(member.role === "CLINIC_SECRETARY" && { role: "USER" }),
          },
        });
        if (result.count === 0) {
          throw new Error("Member is no longer in this organization");
        }
        return result;
      }
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error("[clinic-admin/members/[id]] DELETE error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה בהסרת החבר" },
      { status: 500 }
    );
  }
}
