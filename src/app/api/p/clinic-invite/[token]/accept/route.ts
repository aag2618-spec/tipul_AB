import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { withAudit } from "@/lib/audit";
import {
  isExpired,
  normalizeE164,
  OTP_MAX_ATTEMPTS,
  verifyOtp,
} from "@/lib/clinic-invitations";
import type { Prisma, SubscriptionStatus } from "@prisma/client";
import { TRIAL_DAYS, TRIAL_AI_TIER } from "@/lib/constants";

export const dynamic = "force-dynamic";

// 10 attempts/min per IP — יותר מחמיר מ-GET כי כאן יש OTP brute-force surface.
const ACCEPT_RATE_LIMIT = { maxRequests: 10, windowMs: 60 * 1000 };

const acceptSchema = z.object({
  password: z
    .string()
    .min(8, "הסיסמה חייבת להכיל לפחות 8 תווים")
    .max(200),
  otp: z
    .string()
    .regex(/^\d{6}$/, "קוד אימות חייב להיות 6 ספרות")
    .optional(),
  name: z.string().min(1).max(120).optional(),
  phone: z.string().max(40).optional(),
});

// Token format: 32-byte base64url = 43 chars exactly. Tighten to reject probes early.
const TOKEN_REGEX = /^[A-Za-z0-9_-]{43}$/;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const ip =
      request.headers.get("x-forwarded-for") ||
      request.headers.get("x-real-ip") ||
      "unknown";
    const rl = checkRateLimit(`clinic-invite-accept:${ip}`, ACCEPT_RATE_LIMIT);
    if (!rl.allowed) return rateLimitResponse(rl);

    const { token } = await params;
    if (!TOKEN_REGEX.test(token ?? "")) {
      return NextResponse.json({ message: "טוקן לא תקין" }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const parsed = acceptSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        {
          message: "נתונים לא תקינים",
          errors: parsed.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    // ─── Atomic OTP gate ───
    // קוראים, מאמתים, ומעדכנים את ה-counter בתוך טרנזקציה Serializable —
    // מונע race שבו כמה ניסיונות מקבילים פוסחים על cap של 5 (vulnerability זוהתה
    // בסקירת אבטחה אוטומטית, סבב A1-A4).
    //
    // אם OTP נדרש ולא הופיע: 400.
    // אם attempts >= MAX (לפני האימות): REVOKE + 423.
    // אם OTP שגוי: increment + 400 (ואם הגענו ל-MAX → REVOKE).
    const otpResult = await prisma.$transaction(
      async (tx) => {
        const inv = await tx.clinicInvitation.findUnique({
          where: { token },
        });
        if (!inv) return { kind: "not_found" as const };
        if (inv.status !== "PENDING")
          return { kind: "wrong_status" as const, status: inv.status };
        if (isExpired(inv.expiresAt)) {
          await tx.clinicInvitation.update({
            where: { id: inv.id },
            data: { status: "EXPIRED" },
          });
          return { kind: "expired" as const };
        }
        if (inv.smsOtpAttempts >= OTP_MAX_ATTEMPTS) {
          await tx.clinicInvitation.update({
            where: { id: inv.id },
            data: { status: "REVOKED", revokedAt: new Date() },
          });
          return { kind: "locked" as const };
        }

        if (inv.smsOtpHash) {
          if (!parsed.data.otp) {
            return { kind: "otp_missing" as const };
          }
          const ok = await verifyOtp(parsed.data.otp, inv.smsOtpHash);
          if (!ok) {
            const updated = await tx.clinicInvitation.update({
              where: { id: inv.id },
              data: { smsOtpAttempts: { increment: 1 } },
              select: { smsOtpAttempts: true },
            });
            // אם הגענו ל-MAX אחרי ה-increment — נסמן REVOKED מיידית.
            if (updated.smsOtpAttempts >= OTP_MAX_ATTEMPTS) {
              await tx.clinicInvitation.update({
                where: { id: inv.id },
                data: { status: "REVOKED", revokedAt: new Date() },
              });
              return { kind: "locked" as const };
            }
            return {
              kind: "otp_wrong" as const,
              attemptsRemaining: OTP_MAX_ATTEMPTS - updated.smsOtpAttempts,
            };
          }
        }

        // OTP תקין (או שאינו נדרש) — מחזירים את ההזמנה לעיבוד הבא.
        return { kind: "ok" as const, invitation: inv };
      },
      { isolationLevel: "Serializable", maxWait: 5000, timeout: 10000 }
    );

    if (otpResult.kind === "not_found") {
      return NextResponse.json({ message: "ההזמנה לא נמצאה" }, { status: 404 });
    }
    if (otpResult.kind === "wrong_status") {
      const status =
        otpResult.status === "ACCEPTED"
          ? 409
          : otpResult.status === "REVOKED"
          ? 410
          : otpResult.status === "REJECTED"
          ? 410
          : 410;
      return NextResponse.json(
        { message: "ההזמנה כבר טופלה", invitationStatus: otpResult.status },
        { status }
      );
    }
    if (otpResult.kind === "expired") {
      return NextResponse.json(
        { message: "ההזמנה פגה. בקש/י הזמנה חדשה." },
        { status: 410 }
      );
    }
    if (otpResult.kind === "locked") {
      return NextResponse.json(
        { message: "מספר ניסיונות OTP חרג מהמותר. בקש/י הזמנה חדשה." },
        { status: 423 }
      );
    }
    if (otpResult.kind === "otp_missing") {
      return NextResponse.json(
        { message: "נדרש קוד אימות מ-SMS" },
        { status: 400 }
      );
    }
    if (otpResult.kind === "otp_wrong") {
      return NextResponse.json(
        {
          message: "קוד אימות שגוי",
          attemptsRemaining: otpResult.attemptsRemaining,
        },
        { status: 400 }
      );
    }
    const invitation = otpResult.invitation;

    // ─── זיהוי משתמש: קיים או חדש ───
    const existingUser = await prisma.user.findUnique({
      where: { email: invitation.email },
    });

    let userId: string;
    let userBeforeJoin: {
      subscriptionStatus: SubscriptionStatus;
      trialEndsAt: Date | null;
      subscriptionEndsAt: Date | null;
    } | null = null;
    let isNewUser = false;

    if (existingUser) {
      // ─── משתמש קיים: re-auth ───
      const session = await getServerSession(authOptions);
      if (
        !session?.user?.email ||
        session.user.email.toLowerCase() !== invitation.email
      ) {
        return NextResponse.json(
          {
            message: "כדי להצטרף, יש להתחבר תחילה לחשבון של הכתובת המוזמנת",
            requiresLogin: true,
          },
          { status: 401 }
        );
      }
      if (!existingUser.password) {
        return NextResponse.json(
          { message: "החשבון שלך נוצר דרך Google/Magic — לא ניתן לאשר עם סיסמה" },
          { status: 400 }
        );
      }
      const passOk = await bcrypt.compare(
        parsed.data.password,
        existingUser.password
      );
      if (!passOk) {
        return NextResponse.json({ message: "סיסמה שגויה" }, { status: 400 });
      }
      if (existingUser.organizationId) {
        return NextResponse.json(
          { message: "החשבון שלך כבר משויך לקליניקה אחרת" },
          { status: 409 }
        );
      }
      if (existingUser.isBlocked) {
        return NextResponse.json(
          { message: "החשבון חסום — לא ניתן להצטרף" },
          { status: 403 }
        );
      }
      userId = existingUser.id;
      userBeforeJoin = {
        subscriptionStatus: existingUser.subscriptionStatus,
        trialEndsAt: existingUser.trialEndsAt,
        subscriptionEndsAt: existingUser.subscriptionEndsAt,
      };
    } else {
      // ─── משתמש חדש ───
      isNewUser = true;
      if (!parsed.data.name) {
        return NextResponse.json({ message: "נדרש שם מלא" }, { status: 400 });
      }
      const phoneNormalized = parsed.data.phone
        ? normalizeE164(parsed.data.phone)
        : null;
      if (parsed.data.phone && !phoneNormalized) {
        return NextResponse.json(
          { message: "מספר טלפון לא תקין" },
          { status: 400 }
        );
      }
      // unique-by-phone — אין constraint ב-DB, אז בודקים ידנית. ה-create יורץ
      // בתוך ה-transaction של withAudit למטה (שם נריץ findFirst מחדש כדי למזער race).
      // כדי לאזן בין UX (מסר מוקדם על "טלפון תפוס") ל-correctness, בודקים גם כאן —
      // race שאר אפשרי, אבל החלון מצומצם.
      if (phoneNormalized) {
        const phoneInUse = await prisma.user.findFirst({
          where: { phone: phoneNormalized },
          select: { id: true },
        });
        if (phoneInUse) {
          return NextResponse.json(
            { message: "מספר טלפון זה כבר רשום במערכת" },
            { status: 400 }
          );
        }
      }
      const passwordHash = await bcrypt.hash(parsed.data.password, 12);
      const trialEndsAt = new Date(
        Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000
      );

      // יצירת ה-user + שיוך + עדכון invitation — הכל ב-withAudit אחד.
      // guard ב-update של invitation: status='PENDING' מונע race עם DELETE/concurrent accept.
      const created = await withAudit(
        {
          kind: "system",
          source: "SCRIPT",
          externalRef: `clinic-invite:${invitation.id}`,
        },
        {
          action: "invitation_accepted",
          targetType: "ClinicInvitation",
          targetId: invitation.id,
          details: {
            organizationId: invitation.organizationId,
            email: invitation.email,
            clinicRole: invitation.clinicRole,
            isNewUser: true,
          },
        },
        async (tx) => {
          // race-safe re-check של phone uniqueness בתוך ה-tx Serializable.
          if (phoneNormalized) {
            const phoneInUse = await tx.user.findFirst({
              where: { phone: phoneNormalized },
              select: { id: true },
            });
            if (phoneInUse) {
              throw new HandledError(
                400,
                "מספר טלפון זה כבר רשום במערכת"
              );
            }
          }

          const maxResult = await tx.user.aggregate({
            _max: { userNumber: true },
          });
          const nextUserNumber = (maxResult._max.userNumber ?? 1000) + 1;

          const newUser = await tx.user.create({
            data: {
              email: invitation.email,
              name: parsed.data.name!,
              password: passwordHash,
              phone: phoneNormalized,
              aiTier: TRIAL_AI_TIER as "ESSENTIAL" | "PRO" | "ENTERPRISE",
              subscriptionStatus: "TRIALING",
              trialEndsAt,
              userNumber: nextUserNumber,
              organizationId: invitation.organizationId,
              clinicRole: invitation.clinicRole,
              ...(invitation.clinicRole === "SECRETARY" && {
                role: "CLINIC_SECRETARY",
                secretaryPermissions: invitation.secretaryPermissions ?? undefined,
              }),
            },
          });

          // guard: status='PENDING' מונע race עם DELETE/concurrent accept.
          const updated = await tx.clinicInvitation.updateMany({
            where: { id: invitation.id, status: "PENDING" },
            data: {
              status: "ACCEPTED",
              acceptedAt: new Date(),
              acceptedByUserId: newUser.id,
            },
          });
          if (updated.count === 0) {
            throw new HandledError(
              409,
              "ההזמנה כבר טופלה (ייתכן שבוטלה במקביל)"
            );
          }

          return newUser;
        }
      );
      userId = created.id;
      userBeforeJoin = {
        subscriptionStatus: created.subscriptionStatus,
        trialEndsAt: created.trialEndsAt,
        subscriptionEndsAt: created.subscriptionEndsAt,
      };
    }

    // ─── מסלול משתמש קיים: שיוך + accept ב-tx אחד ───
    if (!isNewUser) {
      try {
        await withAudit(
          {
            kind: "system",
            source: "SCRIPT",
            externalRef: `clinic-invite:${invitation.id}`,
          },
          {
            action: "invitation_accepted",
            targetType: "ClinicInvitation",
            targetId: invitation.id,
            details: {
              organizationId: invitation.organizationId,
              email: invitation.email,
              clinicRole: invitation.clinicRole,
              isNewUser: false,
              acceptedByUserId: userId,
            },
          },
          async (tx) => {
            // guard: organizationId still null (race-safe).
            const userUpdate = await tx.user.updateMany({
              where: { id: userId, organizationId: null },
              data: {
                organizationId: invitation.organizationId,
                clinicRole: invitation.clinicRole,
                ...(invitation.clinicRole === "SECRETARY" && {
                  role: "CLINIC_SECRETARY",
                  secretaryPermissions:
                    invitation.secretaryPermissions ?? undefined,
                }),
              },
            });
            if (userUpdate.count === 0) {
              throw new HandledError(
                409,
                "החשבון שלך כבר משויך לקליניקה אחרת"
              );
            }

            const invUpdate = await tx.clinicInvitation.updateMany({
              where: { id: invitation.id, status: "PENDING" },
              data: {
                status: "ACCEPTED",
                acceptedAt: new Date(),
                acceptedByUserId: userId,
              },
            });
            if (invUpdate.count === 0) {
              throw new HandledError(
                409,
                "ההזמנה כבר טופלה (ייתכן שבוטלה במקביל)"
              );
            }
          }
        );
      } catch (err) {
        if (err instanceof HandledError) {
          return NextResponse.json(
            { message: err.message },
            { status: err.statusCode }
          );
        }
        throw err;
      }
    }

    // התראה לבעל/ת הקליניקה — fire-and-forget.
    void prisma.notification
      .create({
        data: {
          type: "CUSTOM",
          title: "הצטרף/ה חבר/ה חדש/ה לקליניקה",
          content: `${invitation.intendedName ?? invitation.email} קיבל/ה את ההזמנה לקליניקה.`,
          status: "PENDING",
          userId: invitation.createdById,
        },
      })
      .catch(() => {});

    void userBeforeJoin; // נשמר כאן כדי שהשלב B יקרא לו (השעיית מנוי).

    return NextResponse.json({
      ok: true,
      isNewUser,
      redirectTo:
        invitation.clinicRole === "SECRETARY"
          ? "/clinic-admin"
          : "/dashboard",
    });
  } catch (error) {
    if (error instanceof HandledError) {
      return NextResponse.json(
        { message: error.message },
        { status: error.statusCode }
      );
    }
    logger.error("[p/clinic-invite/[token]/accept] error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה באישור ההזמנה" },
      { status: 500 }
    );
  }
}

// HandledError — חריגה פנימית שנושאת status מותאם.
// מאפשרת לזרוק מתוך טרנזקציה withAudit ולהחזיר response מתאים בלי לשנות
// את החתימה של withAudit עצמה.
class HandledError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message);
    this.name = "HandledError";
  }
}

// silence unused imports lint: Prisma type is referenced for future B-stage tx parameter typing.
type _PrismaTx = Prisma.TransactionClient;
void (null as unknown as _PrismaTx);
