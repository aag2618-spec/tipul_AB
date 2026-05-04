import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/api-auth";
import { withAudit } from "@/lib/audit";
import { parseBody } from "@/lib/validations/helpers";
import { sendEmail } from "@/lib/resend";
import { sendSMS } from "@/lib/sms";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import {
  computeExpiresAt,
  generateOtp,
  hashOtp,
  normalizeE164,
} from "@/lib/clinic-invitations";
import {
  createClinicInviteEmail,
  createClinicInviteSmsText,
} from "@/lib/email-templates";

export const dynamic = "force-dynamic";

// 30 הזמנות לשעה לכל ארגון — מונע ספאם של email/SMS גם אם CLINIC_OWNER session
// נפרץ. אדמינים רגילים יוצרים 1-5 הזמנות בסשן.
const ADMIN_INVITE_RATE_LIMIT = { maxRequests: 30, windowMs: 60 * 60 * 1000 };

// ─── Auth gate (משותף ל-routes של invitations) ───
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
  return {
    userId,
    session,
    organizationId: user.organizationId,
    inviterName: user.name,
  };
}

// ─── Validation ───
const secretaryPermissionsSchema = z
  .object({
    canViewPayments: z.boolean().optional(),
    canIssueReceipts: z.boolean().optional(),
    canSendReminders: z.boolean().optional(),
    canCreateClient: z.boolean().optional(),
    canViewDebts: z.boolean().optional(),
    canViewStats: z.boolean().optional(),
    canViewConsentForms: z.boolean().optional(),
  })
  .strict()
  .partial();

const createInvitationSchema = z.object({
  email: z.string().email("כתובת מייל לא תקינה"),
  phone: z.string().optional(),
  intendedName: z.string().max(120).optional(),
  clinicRole: z.enum(["THERAPIST", "SECRETARY"]),
  billingPaidByClinic: z.boolean().default(true),
  secretaryPermissions: secretaryPermissionsSchema.optional(),
});

// ─── POST — יצירת הזמנה חדשה ───
export async function POST(request: NextRequest) {
  try {
    const auth = await requireClinicOwner();
    if ("error" in auth) return auth.error;
    const { organizationId, userId, session, inviterName } = auth;

    // Rate limit per organization — מונע ספאם של מיילים/SMS אם session נחטף.
    const rl = checkRateLimit(
      `clinic-invite-create:${organizationId}`,
      ADMIN_INVITE_RATE_LIMIT
    );
    if (!rl.allowed) return rateLimitResponse(rl);

    const parsed = await parseBody(request, createInvitationSchema);
    if ("error" in parsed) return parsed.error;
    const data = parsed.data;

    const email = data.email.toLowerCase().trim();
    const phoneNormalized = data.phone ? normalizeE164(data.phone) : null;
    if (data.phone && !phoneNormalized) {
      return NextResponse.json(
        { message: "מספר טלפון לא תקין (פורמט E.164 או 05XXXXXXXX)" },
        { status: 400 }
      );
    }

    // אסור להזמין משתמש ששייך כבר לארגון אחר.
    const existingUser = await prisma.user.findUnique({
      where: { email },
      select: { id: true, organizationId: true, isBlocked: true },
    });
    if (existingUser?.organizationId && existingUser.organizationId !== organizationId) {
      return NextResponse.json(
        { message: "המשתמש כבר משויך לקליניקה אחרת" },
        { status: 409 }
      );
    }
    if (existingUser?.organizationId === organizationId) {
      return NextResponse.json(
        { message: "המשתמש כבר חבר/ה בקליניקה שלך" },
        { status: 409 }
      );
    }
    if (existingUser?.isBlocked) {
      return NextResponse.json(
        { message: "לא ניתן להזמין משתמש חסום" },
        { status: 400 }
      );
    }

    // אסור להחזיק יותר מהזמנה PENDING אחת לאותו email בארגון.
    const duplicate = await prisma.clinicInvitation.findFirst({
      where: { email, organizationId, status: "PENDING" },
      select: { id: true, expiresAt: true },
    });
    if (duplicate && duplicate.expiresAt.getTime() > Date.now()) {
      return NextResponse.json(
        {
          message:
            "כבר קיימת הזמנה פעילה לכתובת זו. ביטל/י אותה לפני יצירת חדשה או לחצ/י על 'שלח שוב'.",
          existingInvitationId: duplicate.id,
        },
        { status: 409 }
      );
    }

    // הכנת token + OTP אם יש phone.
    const token = await generateInvitationToken();
    let otpPlain: string | null = null;
    let smsOtpHash: string | null = null;
    if (phoneNormalized) {
      otpPlain = generateOtp();
      smsOtpHash = await hashOtp(otpPlain);
    }

    const expiresAt = computeExpiresAt();

    const orgRow = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { name: true },
    });
    const organizationName = orgRow?.name ?? "הקליניקה";

    const created = await withAudit(
      { kind: "user", session },
      {
        action: "invitation_created",
        targetType: "ClinicInvitation",
        details: {
          organizationId,
          email,
          clinicRole: data.clinicRole,
          billingPaidByClinic: data.billingPaidByClinic,
          otpRequired: !!smsOtpHash,
        },
      },
      async (tx) => {
        return tx.clinicInvitation.create({
          data: {
            organizationId,
            email,
            phone: phoneNormalized,
            intendedName: data.intendedName?.trim() || null,
            clinicRole: data.clinicRole,
            billingPaidByClinic: data.billingPaidByClinic,
            secretaryPermissions:
              data.clinicRole === "SECRETARY"
                ? data.secretaryPermissions ?? {
                    canViewPayments: false,
                    canIssueReceipts: false,
                    canSendReminders: true,
                    canCreateClient: true,
                    canViewDebts: false,
                    canViewStats: false,
                    canViewConsentForms: false,
                  }
                : undefined,
            token,
            smsOtpHash,
            expiresAt,
            createdById: userId,
          },
        });
      }
    );

    // שליחות תקשורת — fire-and-forget מבחינת ה-response, אבל ממתינים כדי לדווח על הצלחה.
    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    const inviteUrl = `${baseUrl}/invite/${token}`;
    const emailContent = createClinicInviteEmail({
      organizationName,
      inviterName: inviterName ?? "בעל/ת הקליניקה",
      intendedName: data.intendedName?.trim() || null,
      clinicRole: data.clinicRole,
      inviteUrl,
      otpRequired: !!otpPlain,
      expiresAt,
    });

    const emailResult = await sendEmail({
      to: email,
      subject: emailContent.subject,
      html: emailContent.html,
    });
    if (!emailResult.success) {
      logger.error("[clinic-invitations] email failed", {
        invitationId: created.id,
        error: emailResult.error,
      });
    }

    let otpSent = false;
    if (phoneNormalized && otpPlain) {
      const smsText = createClinicInviteSmsText({
        organizationName,
        otp: otpPlain,
      });
      // type נשאר default ("CUSTOM") כדי לא לדרוש הרחבת enum CommunicationType.
      const smsResult = await sendSMS(phoneNormalized, smsText, userId, {
        skipQuotaCheck: true,
      });
      otpSent = smsResult.success;
      if (!smsResult.success) {
        logger.warn("[clinic-invitations] SMS OTP failed", {
          invitationId: created.id,
          error: smsResult.error,
        });
      }
    }

    return NextResponse.json({
      id: created.id,
      expiresAt: created.expiresAt.toISOString(),
      otpRequired: !!smsOtpHash,
      otpSent,
      emailSent: emailResult.success,
    });
  } catch (error) {
    logger.error("[clinic-invitations] POST error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה ביצירת ההזמנה" },
      { status: 500 }
    );
  }
}

// ─── GET — רשימת הזמנות (PENDING + 30 ימים אחרונים) ───
export async function GET() {
  try {
    const auth = await requireClinicOwner();
    if ("error" in auth) return auth.error;
    const { organizationId } = auth;

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const invitations = await prisma.clinicInvitation.findMany({
      where: {
        organizationId,
        OR: [
          { status: "PENDING" },
          { createdAt: { gte: thirtyDaysAgo } },
        ],
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      select: {
        id: true,
        email: true,
        phone: true,
        intendedName: true,
        clinicRole: true,
        billingPaidByClinic: true,
        status: true,
        createdAt: true,
        expiresAt: true,
        acceptedAt: true,
        revokedAt: true,
        lastResentAt: true,
      },
    });

    return NextResponse.json(JSON.parse(JSON.stringify(invitations)));
  } catch (error) {
    logger.error("[clinic-invitations] GET error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה בטעינת ההזמנות" },
      { status: 500 }
    );
  }
}

// ─── Helpers ───

/**
 * Generates an invitation token.
 *
 * Format: 32 random bytes encoded as base64url = 43 chars, 256 bits of entropy.
 * Cryptographically unguessable — no DB uniqueness check needed (collision
 * probability is astronomical). The `@unique` constraint provides a final safety
 * net; if a collision did occur, Prisma would throw P2002 → 500 to client.
 */
async function generateInvitationToken(): Promise<string> {
  const { randomBytes } = await import("node:crypto");
  return randomBytes(32).toString("base64url");
}
