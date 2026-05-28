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
import type { AITier, SubscriptionStatus } from "@prisma/client";
import { TRIAL_DAYS, TRIAL_AI_TIER } from "@/lib/constants";
import { checkLimitInTx } from "@/lib/clinic/limits";
import { getClientIp } from "@/lib/get-client-ip";
import {
  isOrgTierUpgrade,
  resolveOrgAiTier,
} from "@/lib/clinic/ai-tier-inheritance";

export const dynamic = "force-dynamic";

// 10 attempts/min per IP — יותר מחמיר מ-GET כי כאן יש OTP brute-force surface.
const ACCEPT_RATE_LIMIT = { maxRequests: 10, windowMs: 60 * 1000 };

// M11.A6: per-invitation password limit (in-memory). שכבה ראשונה — מגביל
// brute-force ב-window קצר גם אם תוקף מתפצל בין IPs. ה-DB counter למטה
// אוכף את ה-cap הסופי וגם נשמר אחרי restart.
const ACCEPT_PWD_RATE_LIMIT = { maxRequests: 5, windowMs: 15 * 60 * 1000 };

// M11.A6: לאחר N כשלי סיסמה רצופים — REVOKE על ההזמנה (זהה ל-OTP).
// 5 ניסיונות סבירים למשתמש לגיטימי ששכח/הקליד פעמיים-שלוש.
const INVITATION_PASSWORD_MAX_ATTEMPTS = 5;

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
    // B4: getClientIp — proxy מהימן (ימני), מונע XFF spoofing.
    const ip = getClientIp(request);
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

    // Defensive: invitations נוצרות עם clinicRole ∈ {THERAPIST, SECRETARY} בלבד
    // (z.enum ב-POST invitations), אבל ה-DB schema מאפשר OWNER. אם כן הגיע OWNER
    // — שגיאה ברורה ולא חולש ל-checkLimit שמצפה ל-2 ערכים.
    if (invitation.clinicRole !== "THERAPIST" && invitation.clinicRole !== "SECRETARY") {
      return NextResponse.json(
        { message: "תפקיד הזמנה לא תקין" },
        { status: 400 }
      );
    }
    const invitedRole: "THERAPIST" | "SECRETARY" = invitation.clinicRole;

    // ─── זיהוי משתמש: קיים או חדש ───
    const existingUser = await prisma.user.findUnique({
      where: { email: invitation.email },
    });

    let userId: string;
    let userBeforeJoin: {
      subscriptionStatus: SubscriptionStatus;
      trialEndsAt: Date | null;
      subscriptionEndsAt: Date | null;
      // M11.E1: aiTier ערב הצטרפות — לחישוב upgrade ולשחזור בעזיבה.
      aiTier: AITier;
    } | null = null;
    let isNewUser = false;

    if (existingUser) {
      // ─── משתמש קיים: re-auth ───
      // השוואה lowercase משני הצדדים — defense-in-depth:
      // POST invitations כבר עושה toLowerCase, אבל אם בעתיד תווסף יצירה ממקום אחר
      // בלי normalization, לא נעקוף את ה-re-auth בלי כוונה.
      const session = await getServerSession(authOptions);
      if (
        !session?.user?.email ||
        session.user.email.toLowerCase() !==
          invitation.email.toLowerCase()
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

      // M11.A6: in-memory rate-limit per-invitation (5 ניסיונות / 15 דקות) —
      // שכבת הגנה ראשונה גם אם תוקף מתפצל בין IPs ועוקף את ACCEPT_RATE_LIMIT.
      const pwdRl = checkRateLimit(
        `clinic-invite-accept-pwd:${invitation.id}`,
        ACCEPT_PWD_RATE_LIMIT
      );
      if (!pwdRl.allowed) return rateLimitResponse(pwdRl);

      // M11.A6: DB-persisted counter — נשמר אחרי restart, מוביל ל-REVOKE
      // לאחר חריגה (זהה לפטרן של OTP).
      const invPwdState = await prisma.clinicInvitation.findUnique({
        where: { id: invitation.id },
        select: { passwordAttempts: true, status: true },
      });
      if (!invPwdState || invPwdState.status !== "PENDING") {
        return NextResponse.json(
          { message: "ההזמנה כבר אינה פעילה" },
          { status: 410 }
        );
      }
      if (invPwdState.passwordAttempts >= INVITATION_PASSWORD_MAX_ATTEMPTS) {
        // defense-in-depth — לא אמור לקרות כי REVOKE קורה במסלול ה-fail למטה.
        await prisma.clinicInvitation.updateMany({
          where: { id: invitation.id, status: "PENDING" },
          data: { status: "REVOKED", revokedAt: new Date() },
        });
        return NextResponse.json(
          { message: "מספר ניסיונות סיסמה חרג מהמותר. בקש/י הזמנה חדשה." },
          { status: 423 }
        );
      }

      const passOk = await bcrypt.compare(
        parsed.data.password,
        existingUser.password
      );
      if (!passOk) {
        // M11.A6: increment passwordAttempts + REVOKE אם הגענו ל-MAX.
        // ה-update עצמו אטומי (auto-commit) — אין צורך ב-Serializable
        // כי `increment: 1` ו-DB-row-lock מספיקים למניעת race counter.
        const updated = await prisma.clinicInvitation.update({
          where: { id: invitation.id },
          data: { passwordAttempts: { increment: 1 } },
          select: { passwordAttempts: true },
        });
        if (updated.passwordAttempts >= INVITATION_PASSWORD_MAX_ATTEMPTS) {
          await prisma.clinicInvitation.updateMany({
            where: { id: invitation.id, status: "PENDING" },
            data: { status: "REVOKED", revokedAt: new Date() },
          });
          logger.warn(
            "[clinic-invite/accept] invitation revoked after password brute-force",
            {
              invitationId: invitation.id,
              email: invitation.email,
              attempts: updated.passwordAttempts,
            }
          );
          return NextResponse.json(
            { message: "מספר ניסיונות סיסמה חרג מהמותר. ההזמנה בוטלה — בקש/י הזמנה חדשה." },
            { status: 423 }
          );
        }
        return NextResponse.json(
          {
            message: "סיסמה שגויה",
            attemptsRemaining:
              INVITATION_PASSWORD_MAX_ATTEMPTS - updated.passwordAttempts,
          },
          { status: 400 }
        );
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
        // M11.E1: snapshot של ה-aiTier ערב הצטרפות (לחישוב upgrade + לוג audit).
        aiTier: existingUser.aiTier,
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
      // M11.M2: unique-by-phone — בעבר בדקנו פעמיים (פעם לפני withAudit ופעם בתוך).
      // ה-pre-check יצר TOCTOU (race window). עכשיו בודקים רק בתוך ה-tx של withAudit
      // (Serializable isolation + retry על 40001 = race-safe). ה-UX זהה: אם
      // טלפון תפוס, ה-tx יזרוק HandledError(400) שיוחזר ל-client כ-400.
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
            billingPaidByClinic: invitation.billingPaidByClinic,
            subscriptionPaused: invitation.billingPaidByClinic,
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

          // M11.E1: ירושת aiTier מהארגון. נקרא בתוך ה-tx ל-snapshot עקבי —
          // מונע TOCTOU בו admin משנה את ה-pricing plan בין הקריאה לכתיבה.
          const orgForTier = await tx.organization.findUnique({
            where: { id: invitation.organizationId },
            select: {
              pricingPlan: { select: { aiTierIncluded: true } },
              customContract: {
                select: {
                  customAiTier: true,
                  startDate: true,
                  endDate: true,
                  autoRenew: true,
                },
              },
            },
          });
          const inheritedAiTier: AITier | null =
            invitation.billingPaidByClinic && orgForTier
              ? resolveOrgAiTier(orgForTier)
              : null;

          // race-safe limit re-check בתוך Serializable tx — מגן מפני
          // 2 invitations מקבילים שעוברים accept בו-זמנית.
          const limit = await checkLimitInTx({
            tx,
            organizationId: invitation.organizationId,
            clinicRole: invitedRole,
            excludeInvitationId: invitation.id,
          });
          if (!limit.allowed) {
            throw new HandledError(
              403,
              limit.message ?? "הגעת לתקרת המקומות בתוכנית הקליניקה"
            );
          }

          const maxResult = await tx.user.aggregate({
            _max: { userNumber: true },
          });
          const nextUserNumber = (maxResult._max.userNumber ?? 1000) + 1;

          // אם הקליניקה משלמת — המשתמש החדש נכנס ישר ל-PAUSED.
          // subscriptionStatusBeforeClinic נשאר null (= "אף פעם לא היה מנוי אישי"),
          // ובהסרה מהקליניקה יקבל TRIALING + 30d חדש (ראה DELETE members/[id]).
          const billingPaused = invitation.billingPaidByClinic;
          // M11.E1: משתמש חדש יורש את ה-tier הארגוני אם קיים; אחרת TRIAL_AI_TIER.
          // אם הירש tier ארגוני — שומרים את ברירת המחדל ב-aiTierBeforeClinic כדי
          // שבעזיבה ה-tier ירד בחזרה ל-TRIAL_AI_TIER (אחרת המשתמש היה נשאר עם
          // ENTERPRISE לצמיתות אחרי שעזב — דליפת entitlement; ראה M11.E1 security audit).
          const effectiveAiTier: AITier =
            inheritedAiTier ?? (TRIAL_AI_TIER as AITier);
          const newUserAiTierBeforeClinic: AITier | null = inheritedAiTier
            ? (TRIAL_AI_TIER as AITier)
            : null;
          const newUser = await tx.user.create({
            data: {
              email: invitation.email,
              name: parsed.data.name!,
              password: passwordHash,
              phone: phoneNormalized,
              aiTier: effectiveAiTier,
              aiTierBeforeClinic: newUserAiTierBeforeClinic,
              subscriptionStatus: billingPaused ? "PAUSED" : "TRIALING",
              trialEndsAt: billingPaused ? null : trialEndsAt,
              userNumber: nextUserNumber,
              organizationId: invitation.organizationId,
              clinicRole: invitation.clinicRole,
              billingPaidByClinic: billingPaused,
              subscriptionPausedReason: billingPaused ? "PAID_BY_CLINIC" : null,
              subscriptionPausedAt: billingPaused ? new Date() : null,
              // subscriptionStatusBeforeClinic נשאר null — מסמן "אף פעם לא היה לו מנוי אישי".
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
        // M11.E1: ה-aiTier שנוצר בפועל (ירש tier ארגוני או נשאר TRIAL_AI_TIER).
        aiTier: created.aiTier,
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
              billingPaidByClinic: invitation.billingPaidByClinic,
              subscriptionPausedFromStatus:
                invitation.billingPaidByClinic
                  ? userBeforeJoin?.subscriptionStatus ?? null
                  : null,
            },
          },
          async (tx) => {
            // M11.E1: ירושת aiTier מהארגון. נקרא בתוך ה-tx ל-snapshot עקבי
            // (TOCTOU prevention).
            const orgForTier = await tx.organization.findUnique({
              where: { id: invitation.organizationId },
              select: {
                pricingPlan: { select: { aiTierIncluded: true } },
                customContract: {
                  select: {
                    customAiTier: true,
                    startDate: true,
                    endDate: true,
                    autoRenew: true,
                  },
                },
              },
            });
            const inheritedAiTier: AITier | null =
              invitation.billingPaidByClinic && orgForTier
                ? resolveOrgAiTier(orgForTier)
                : null;

            // race-safe limit re-check (זהה למסלול user חדש).
            const limit = await checkLimitInTx({
              tx,
              organizationId: invitation.organizationId,
              clinicRole: invitedRole,
              excludeInvitationId: invitation.id,
            });
            if (!limit.allowed) {
              throw new HandledError(
                403,
                limit.message ?? "הגעת לתקרת המקומות בתוכנית הקליניקה"
              );
            }

            // אם הקליניקה משלמת — שומרים את הסטטוס הקודם ב-subscriptionStatusBeforeClinic
            // ומשעים את המנוי. בהסרה מהקליניקה (DELETE members/[id]) זה ישוחזר.
            const billingPaused = invitation.billingPaidByClinic;
            const billingFields = billingPaused
              ? {
                  subscriptionStatusBeforeClinic:
                    userBeforeJoin?.subscriptionStatus ?? null,
                  subscriptionStatus: "PAUSED" as const,
                  subscriptionPausedReason: "PAID_BY_CLINIC",
                  subscriptionPausedAt: new Date(),
                  billingPaidByClinic: true,
                }
              : {};

            // M11.E1: ירושת tier למשתמש קיים — רק אם זה upgrade ולא downgrade.
            // המשתמש לא ירגיש "נפילה" באיכות אם הוא היה ב-ENTERPRISE אישי
            // והצטרף לקליניקה עם PRO. בעזיבה (DELETE/cron) נחזיר מ-aiTierBeforeClinic.
            // userBeforeJoin תמיד מאוכלס במסלול הזה כי הגענו ל-!isNewUser
            // רק אחרי שעברנו ב-if(existingUser).
            const personalAiTier = userBeforeJoin?.aiTier;
            const aiTierFields =
              inheritedAiTier &&
              personalAiTier &&
              isOrgTierUpgrade(personalAiTier, inheritedAiTier)
                ? {
                    aiTierBeforeClinic: personalAiTier,
                    aiTier: inheritedAiTier,
                  }
                : {};

            // guard: organizationId still null (race-safe).
            const userUpdate = await tx.user.updateMany({
              where: { id: userId, organizationId: null },
              data: {
                organizationId: invitation.organizationId,
                clinicRole: invitation.clinicRole,
                ...billingFields,
                ...aiTierFields,
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

