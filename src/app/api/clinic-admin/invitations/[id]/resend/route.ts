import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/api-auth";
import { withAudit } from "@/lib/audit";
import { sendEmail } from "@/lib/resend";
import { sendSMS } from "@/lib/sms";
import { generateOtp, hashOtp, isExpired } from "@/lib/clinic-invitations";
import {
  createClinicInviteEmail,
  createClinicInviteSmsText,
} from "@/lib/email-templates";

export const dynamic = "force-dynamic";

const RESEND_COOLDOWN_MS = 60 * 1000; // דקה אחת

async function requireClinicOwner() {
  const auth = await requireAuth();
  if ("error" in auth) return { error: auth.error };
  const { userId, session } = auth;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      role: true,
      clinicRole: true,
      organizationId: true,
      name: true,
    },
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
  return {
    userId,
    session,
    organizationId: user.organizationId,
    inviterName: user.name,
  };
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireClinicOwner();
    if ("error" in auth) return auth.error;
    const { organizationId, userId, session, inviterName } = auth;

    const { id } = await params;

    const invitation = await prisma.clinicInvitation.findUnique({
      where: { id },
      include: { organization: { select: { name: true } } },
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
        { message: "ניתן לשלוח שוב רק הזמנות בהמתנה" },
        { status: 400 }
      );
    }
    if (isExpired(invitation.expiresAt)) {
      return NextResponse.json(
        { message: "ההזמנה פגה. צרו הזמנה חדשה." },
        { status: 410 }
      );
    }
    if (
      invitation.lastResentAt &&
      Date.now() - invitation.lastResentAt.getTime() < RESEND_COOLDOWN_MS
    ) {
      return NextResponse.json(
        { message: "אפשר לשלוח שוב רק פעם בדקה. נסה/י שוב מעט מאוחר יותר." },
        { status: 429 }
      );
    }

    // אם יש phone — מחדשים OTP (חדש כל פעם, מבטל ישנים).
    let otpPlain: string | null = null;
    let newOtpHash: string | null = invitation.smsOtpHash;
    if (invitation.phone) {
      otpPlain = generateOtp();
      newOtpHash = await hashOtp(otpPlain);
    }

    // חידוש expiresAt — שליחה חוזרת מאריכה ב-48 שעות נוספות (UX סטנדרטי
    // לכל מערכות הזמנה דומות). אם המשתמש בקש resend בכוונה, סביר שהוא רוצה
    // שיהיה לו זמן.
    const refreshedExpiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);

    await withAudit(
      { kind: "user", session },
      {
        action: "invitation_resent",
        targetType: "ClinicInvitation",
        targetId: id,
        details: {
          organizationId,
          email: invitation.email,
          newOtp: !!otpPlain,
        },
      },
      async (tx) => {
        return tx.clinicInvitation.update({
          where: { id },
          data: {
            lastResentAt: new Date(),
            smsOtpHash: newOtpHash,
            smsOtpAttempts: 0,
            expiresAt: refreshedExpiresAt,
          },
        });
      }
    );

    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    const inviteUrl = `${baseUrl}/invite/${invitation.token}`;

    // invitation.clinicRole צר ל-THERAPIST/SECRETARY (POST validates), אבל ה-DB
    // מחזיר את ה-enum המלא שכולל OWNER. narrowing מפורש למניעת TS error.
    if (
      invitation.clinicRole !== "THERAPIST" &&
      invitation.clinicRole !== "SECRETARY"
    ) {
      logger.error(
        "[clinic-invitations/[id]/resend] unexpected OWNER role on invitation",
        { invitationId: invitation.id }
      );
      return NextResponse.json(
        { message: "תפקיד הזמנה לא תקין" },
        { status: 500 }
      );
    }
    const inviteRole: "THERAPIST" | "SECRETARY" = invitation.clinicRole;

    const emailContent = createClinicInviteEmail({
      organizationName: invitation.organization.name,
      inviterName: inviterName ?? "בעל/ת הקליניקה",
      intendedName: invitation.intendedName,
      clinicRole: inviteRole,
      inviteUrl,
      otpRequired: !!otpPlain,
      expiresAt: refreshedExpiresAt,
    });

    const emailResult = await sendEmail({
      to: invitation.email,
      subject: emailContent.subject,
      html: emailContent.html,
    });

    let otpSent = false;
    if (invitation.phone && otpPlain) {
      const smsText = createClinicInviteSmsText({
        organizationName: invitation.organization.name,
        otp: otpPlain,
      });
      const smsResult = await sendSMS(invitation.phone, smsText, userId, {
        skipQuotaCheck: true,
      });
      otpSent = smsResult.success;
    }

    return NextResponse.json({
      ok: true,
      emailSent: emailResult.success,
      otpSent,
    });
  } catch (error) {
    logger.error("[clinic-invitations/[id]/resend] error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה בשליחה החוזרת" },
      { status: 500 }
    );
  }
}
