import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { withAudit } from "@/lib/audit";
import { parseBody } from "@/lib/validations/helpers";
import { sendEmail } from "@/lib/resend";
import { sendSMS } from "@/lib/sms";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import {
  computeExpiresAt,
  generateOtp,
  generateSecureToken,
  hashOtp,
  normalizeE164,
} from "@/lib/clinic-invitations";
import {
  createClinicInviteEmail,
  createClinicInviteSmsText,
} from "@/lib/email-templates";
import { checkLimitInTx, ClinicLimitExceededError } from "@/lib/clinic/limits";
import { requireClinicOwner } from "@/lib/clinic/require-clinic-owner";
// D6 follow-up: סכמת הרשאות מזכירה אחת ומשותפת (כוללת canTransferClient) —
// במקום כפילות מקומית שהשמיטה אותה וגרמה ל-drift. כך אפשר להעניק הרשאת
// העברת מטופלים כבר בשלב ההזמנה, ולא רק בעריכת חבר אחרי הצטרפות.
import { secretaryPermissionsSchema } from "@/lib/validations/clinic-admin";
import { DEFAULT_SECRETARY_PERMISSIONS } from "@/lib/clinic/secretary-permissions-ui";

export const dynamic = "force-dynamic";

// 30 הזמנות לשעה לכל ארגון — מונע ספאם של email/SMS גם אם CLINIC_OWNER session
// נפרץ. אדמינים רגילים יוצרים 1-5 הזמנות בסשן.
const ADMIN_INVITE_RATE_LIMIT = { maxRequests: 30, windowMs: 60 * 60 * 1000 };

// ─── Validation ───
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
    const { organizationId, userId, session, name: inviterName } = auth;

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
    const token = generateSecureToken();
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

    // race-safe limit check + create בתוך אותו Serializable tx —
    // מונע TOCTOU כששני OWNERs יוצרים הזמנות במקביל.
    // withAudit פנימית עוטף ב-Serializable (default) + retry על 40001.
    let created;
    try {
      created = await withAudit(
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
          // limit check בתוך tx — לא סופר invitation חדשה (עוד לא קיימת),
          // אז excludeInvitationId="" — נספר את כל ה-PENDING הקיימים.
          const limit = await checkLimitInTx({
            tx,
            organizationId,
            clinicRole: data.clinicRole,
            excludeInvitationId: "",
          });
          if (!limit.allowed) {
            throw new ClinicLimitExceededError(
              limit.message ?? "הגעת לתקרת המקומות בתוכנית",
              limit.current,
              limit.max
            );
          }

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
                  ? data.secretaryPermissions ?? DEFAULT_SECRETARY_PERMISSIONS
                  : undefined,
              token,
              smsOtpHash,
              expiresAt,
              createdById: userId,
            },
          });
        }
      );
    } catch (err) {
      if (err instanceof ClinicLimitExceededError) {
        return NextResponse.json(
          { message: err.message, limit: { current: err.current, max: err.max } },
          { status: 403 }
        );
      }
      throw err;
    }

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

// מחולל ה-token חולץ ל-@/lib/clinic-invitations.ts כ-generateSecureToken
// (שימוש חוזר משותף עם BookingLink). ראה שם.

