import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { withAudit } from "@/lib/audit";
import { computeBillingRestore } from "@/lib/clinic-invitations";
import { requireClinicOwner } from "@/lib/clinic/require-clinic-owner";
import { parseBody } from "@/lib/validations/helpers";
import { updateMemberSchema } from "@/lib/validations/clinic-admin";

export const dynamic = "force-dynamic";

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
    const parsed = await parseBody(request, updateMemberSchema);
    if ("error" in parsed) return parsed.error;
    const body = parsed.data;

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
    if (body.secretaryPermissions !== undefined && body.secretaryPermissions !== null) {
      if (finalRole !== "SECRETARY") {
        return NextResponse.json(
          { message: "ניתן להגדיר הרשאות רק למזכירות" },
          { status: 400 }
        );
      }
      updates.secretaryPermissions = body.secretaryPermissions;
    } else if (updates.clinicRole === "THERAPIST") {
      // המעבר ל-THERAPIST — מאפסים secretaryPermissions.
      // ל-Json? נדרש Prisma.DbNull (null/undefined ב-data לא מנקים את השדה).
      updates.secretaryPermissions = Prisma.DbNull;
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
        subscriptionEndsAt: true,
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
        subscriptionEndsAt: member.subscriptionEndsAt,
      });
      restoreTo = plan.newStatus;
      grantedFreshTrial = plan.grantedFreshTrial;
      appliedGrace = plan.appliedGrace;

      billingFields.subscriptionStatus = plan.newStatus;
      billingFields.trialEndsAt = plan.newTrialEndsAt;
      billingFields.subscriptionEndsAt = plan.newSubscriptionEndsAt;
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
            // Prisma.DbNull על Json? — undefined/null ב-Prisma data לא מנקים את השדה,
            // והרשאות ישנות יישארו בעת הצטרפות לארגון אחר.
            secretaryPermissions: Prisma.DbNull,
            ...billingFields,
            // אם היה CLINIC_SECRETARY — מחזירים ל-USER
            ...(member.role === "CLINIC_SECRETARY" && { role: "USER" }),
          },
        });
        if (result.count === 0) {
          throw new Error("Member is no longer in this organization");
        }

        // Defense-in-depth: סוגרים כל impersonation פעיל שמכוון/מבוצע ע"י
        // החבר הזה. אם הוא ה-target — אסור שמישהו ימשיך להתחזות לו אחרי
        // שהוסר מהקליניקה. אם הוא impersonator (לא אמור לקרות כי OWNER לא ניתן
        // להסרה כאן, אבל הגנה כפולה) — סוגרים גם.
        await tx.impersonationSession.updateMany({
          where: {
            OR: [{ targetUserId: id }, { impersonatorId: id }],
            endedAt: null,
          },
          data: { endedAt: new Date(), endedReason: "TARGET_REMOVED" },
        });

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
