import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { randomBytes } from "node:crypto";
import { sendEmail } from "@/lib/resend";
import { checkRateLimit, AUTH_RATE_LIMIT, rateLimitResponse } from "@/lib/rate-limit";
import { parseBody } from "@/lib/validations/helpers";
import { registerSchema } from "@/lib/validations/auth";
import { logger } from "@/lib/logger";
import { TRIAL_DAYS, TRIAL_AI_TIER } from "@/lib/constants";
import { createVerificationEmailHtml } from "@/lib/email-templates";
import { escapeHtml } from "@/lib/email-utils";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown";
    const rateLimitResult = checkRateLimit(`register:${ip}`, AUTH_RATE_LIMIT);
    if (!rateLimitResult.allowed) {
      return rateLimitResponse(rateLimitResult);
    }

    const parsed = await parseBody(request, registerSchema);
    if ("error" in parsed) return parsed.error;
    const { name, email, password, phone, license, couponCode } = parsed.data;

    // Check if user already exists by email
    const existingUser = await prisma.user.findUnique({
      where: { email: email.toLowerCase().trim() },
    });

    if (existingUser) {
      return NextResponse.json(
        { message: "משתמש עם אימייל זה כבר קיים במערכת" },
        { status: 400 }
      );
    }

    // Check if phone already used (if provided)
    if (phone) {
      const existingPhone = await prisma.user.findFirst({
        where: { phone: phone.trim() },
      });
      if (existingPhone) {
        return NextResponse.json(
          { message: "מספר טלפון זה כבר רשום במערכת" },
          { status: 400 }
        );
      }
    }

    // Optional coupon handling (backwards compatible)
    let coupon = null;
    if (couponCode && couponCode.trim()) {
      coupon = await prisma.coupon.findUnique({
        where: { code: couponCode.trim().toUpperCase() },
      });

      if (!coupon) {
        return NextResponse.json(
          { message: "קוד קופון לא תקין" },
          { status: 400 }
        );
      }

      if (!coupon.isActive) {
        return NextResponse.json(
          { message: "קוד קופון זה אינו פעיל" },
          { status: 400 }
        );
      }

      const now = new Date();
      if (coupon.validFrom > now) {
        return NextResponse.json(
          { message: "קוד קופון זה עדיין לא בתוקף" },
          { status: 400 }
        );
      }

      if (coupon.validUntil && coupon.validUntil < now) {
        return NextResponse.json(
          { message: "קוד קופון זה פג תוקף" },
          { status: 400 }
        );
      }

      if (coupon.maxUses !== null && coupon.usedCount >= coupon.maxUses) {
        return NextResponse.json(
          { message: "קוד קופון זה מיצה את מספר השימושים המותר" },
          { status: 400 }
        );
      }
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);

    // Generate email verification token
    const verificationToken = randomBytes(32).toString("hex");
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Trial end date
    const trialEndsAt = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

    // Create user with trial status
    const user = await prisma.$transaction(async (tx) => {
      // הקצאת מספר משתמש אוטומטי
      const maxResult = await tx.user.aggregate({ _max: { userNumber: true } });
      const nextUserNumber = (maxResult._max.userNumber ?? 1000) + 1;

      const newUser = await tx.user.create({
        data: {
          name,
          email: email.toLowerCase().trim(),
          password: hashedPassword,
          phone: phone?.trim() || null,
          license: license || null,
          aiTier: TRIAL_AI_TIER as "ESSENTIAL" | "PRO" | "ENTERPRISE",
          subscriptionStatus: "TRIALING",
          trialEndsAt,
          emailVerificationToken: verificationToken,
          emailVerificationExpires: verificationExpires,
          userNumber: nextUserNumber,
        },
      });

      // Record coupon usage if provided
      if (coupon) {
        await tx.couponUsage.create({
          data: {
            couponId: coupon.id,
            userId: newUser.id,
          },
        });

        await tx.coupon.update({
          where: { id: coupon.id },
          data: { usedCount: { increment: 1 } },
        });
      }

      // Create default notification settings
      await tx.notificationSetting.createMany({
        data: [
          {
            userId: newUser.id,
            channel: "email",
            enabled: true,
            eveningTime: "20:00",
            morningTime: "08:00",
          },
          {
            userId: newUser.id,
            channel: "push",
            enabled: true,
            eveningTime: "20:00",
            morningTime: "08:00",
          },
        ],
      });

      return newUser;
    });

    // Send verification email
    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    const verifyUrl = `${baseUrl}/verify-email?token=${verificationToken}`;

    const verificationEmail = createVerificationEmailHtml({
      name,
      verifyUrl,
      trialDays: TRIAL_DAYS,
      trialTier: TRIAL_AI_TIER,
    });

    const emailResult = await sendEmail({
      to: email.toLowerCase().trim(),
      subject: verificationEmail.subject,
      html: verificationEmail.html,
    });

    if (!emailResult?.success) {
      logger.error("Registration verification email failed", {
        userId: user.id,
        error: emailResult?.error || "unknown",
        shabbatBlocked: emailResult?.shabbatBlocked || false,
      });
    }

    // Notify admin about new registration
    const adminEmail = process.env.ADMIN_EMAIL;
    if (adminEmail) {
      const safeName = escapeHtml(name);
      const safeEmail = escapeHtml(email);
      const safePhone = phone ? escapeHtml(phone) : "-";
      const safeCouponCode = coupon ? escapeHtml(coupon.code) : "";
      await sendEmail({
        to: adminEmail,
        subject: `משתמש חדש נרשם לניסיון: ${safeName}`,
        html: `
          <div dir="rtl" style="font-family: Arial, sans-serif; padding: 20px;">
            <h2>משתמש חדש נרשם לתקופת ניסיון</h2>
            <table style="border-collapse: collapse; width: 100%;">
              <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">שם</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${safeName}</td></tr>
              <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">מייל</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${safeEmail}</td></tr>
              <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">טלפון</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${safePhone}</td></tr>
              <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">מסלול</td><td style="padding: 8px; border-bottom: 1px solid #eee;">Pro Trial (${TRIAL_DAYS} ימים)</td></tr>
              <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">סיום ניסיון</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${trialEndsAt.toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" })}</td></tr>
              ${coupon ? `<tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">קופון</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${safeCouponCode}</td></tr>` : ""}
            </table>
          </div>
        `,
      });
    }

    return NextResponse.json(
      { 
        message: "ההרשמה הצליחה! שלחנו מייל אימות - בדוק את תיבת הדואר שלך.", 
        userId: user.id,
        requiresVerification: true,
      },
      { status: 201 }
    );
  } catch (error) {
    logger.error("Registration error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה בהרשמה" },
      { status: 500 }
    );
  }
}
