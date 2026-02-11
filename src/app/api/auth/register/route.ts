import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import prisma from "@/lib/prisma";
import { randomBytes } from "node:crypto";
import { sendEmail } from "@/lib/resend";

const TRIAL_DAYS = 14;
const TRIAL_AI_TIER = "PRO"; // מסלול ניסיון

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, password, phone, license, couponCode } = body;

    if (!name || !email || !password) {
      return NextResponse.json(
        { message: "נא למלא את כל השדות הנדרשים" },
        { status: 400 }
      );
    }

    if (password.length < 8) {
      return NextResponse.json(
        { message: "הסיסמה חייבת להכיל לפחות 8 תווים" },
        { status: 400 }
      );
    }

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
    const verifyUrl = `${baseUrl}/api/auth/verify-email?token=${verificationToken}`;

    await sendEmail({
      to: email.toLowerCase().trim(),
      subject: "אימות חשבון - Tipul",
      html: `
        <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #16a34a; font-size: 28px; margin: 0;">Tipul</h1>
            <p style="color: #64748b; margin-top: 4px;">ברוכים הבאים!</p>
          </div>
          
          <div style="background: #f8fafc; border-radius: 12px; padding: 30px; border: 1px solid #e2e8f0;">
            <h2 style="color: #1e293b; font-size: 20px; margin-top: 0;">שלום ${name},</h2>
            <p style="color: #475569; line-height: 1.6;">
              תודה שנרשמת ל-Tipul! כדי להשלים את ההרשמה ולהתחיל את 
              <strong>תקופת הניסיון של ${TRIAL_DAYS} ימים</strong> במסלול <strong>${TRIAL_AI_TIER}</strong>, 
              נא לאמת את כתובת המייל שלך:
            </p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${verifyUrl}" 
                 style="display: inline-block; background: linear-gradient(135deg, #2563eb, #7c3aed); color: white; 
                        padding: 14px 40px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px;">
                אמת את החשבון שלי
              </a>
            </div>
            
            <p style="color: #64748b; font-size: 13px;">
              הקישור תקף ל-24 שעות. אם לא נרשמת, התעלם מהודעה זו.
            </p>
          </div>
          
          <div style="text-align: center; margin-top: 20px; color: #94a3b8; font-size: 12px;">
            <p>© Tipul ${new Date().getFullYear()}</p>
          </div>
        </div>
      `,
    });

    // Notify admin about new registration
    const adminEmail = process.env.ADMIN_EMAIL;
    if (adminEmail) {
      await sendEmail({
        to: adminEmail,
        subject: `משתמש חדש נרשם לניסיון: ${name}`,
        html: `
          <div dir="rtl" style="font-family: Arial, sans-serif; padding: 20px;">
            <h2>משתמש חדש נרשם לתקופת ניסיון</h2>
            <table style="border-collapse: collapse; width: 100%;">
              <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">שם</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${name}</td></tr>
              <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">מייל</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${email}</td></tr>
              <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">טלפון</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${phone || "-"}</td></tr>
              <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">מסלול</td><td style="padding: 8px; border-bottom: 1px solid #eee;">Pro Trial (${TRIAL_DAYS} ימים)</td></tr>
              <tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">סיום ניסיון</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${trialEndsAt.toLocaleDateString("he-IL")}</td></tr>
              ${coupon ? `<tr><td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">קופון</td><td style="padding: 8px; border-bottom: 1px solid #eee;">${coupon.code}</td></tr>` : ""}
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
    console.error("Registration error:", error);
    return NextResponse.json(
      { message: "אירעה שגיאה בהרשמה" },
      { status: 500 }
    );
  }
}
