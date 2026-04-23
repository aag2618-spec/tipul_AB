import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "node:crypto";
import prisma from "@/lib/prisma";
import { sendEmail } from "@/lib/resend";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { isShabbatOrYomTov } from "@/lib/shabbat";
import {
  TRIAL_DAYS,
  TRIAL_AI_TIER,
  RESEND_VERIFICATION_RATE_LIMIT,
  RESEND_VERIFICATION_PER_EMAIL_RATE_LIMIT,
} from "@/lib/constants";
import { createVerificationEmailHtml } from "@/lib/email-templates";

export const dynamic = "force-dynamic";

const GENERIC_MESSAGE =
  "אם החשבון קיים ועדיין לא אומת, נשלח אליו קישור אימות חדש. בדוק את תיבת הדואר.";

export async function POST(request: NextRequest) {
  try {
    // בדיקת שבת בתחילת הendpoint — מונע email enumeration דרך הבדל בתשובה
    if (isShabbatOrYomTov()) {
      return NextResponse.json({
        message:
          "המערכת לא שולחת הודעות בשבת ובחג. נסה שוב במוצאי השבת.",
        shabbatBlocked: true,
      });
    }

    const ip =
      request.headers.get("x-forwarded-for") ||
      request.headers.get("x-real-ip") ||
      "unknown";
    const ipRateLimit = checkRateLimit(
      `resend-verification:ip:${ip}`,
      RESEND_VERIFICATION_RATE_LIMIT
    );
    if (!ipRateLimit.allowed) {
      logger.warn("Resend verification rate limit exceeded (IP)", { ip });
      return rateLimitResponse(ipRateLimit);
    }

    const body = (await request.json().catch(() => null)) as { email?: string } | null;
    const rawEmail = body?.email;

    if (
      !rawEmail ||
      typeof rawEmail !== "string" ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail.trim())
    ) {
      return NextResponse.json(
        { message: "נא להזין כתובת אימייל תקינה" },
        { status: 400 }
      );
    }

    const email = rawEmail.toLowerCase().trim();

    // הגנה נוספת — limit לפי כתובת אימייל בנפרד מ-IP, מונע email flooding מצולב
    const emailRateLimit = checkRateLimit(
      `resend-verification:email:${email}`,
      RESEND_VERIFICATION_PER_EMAIL_RATE_LIMIT
    );
    if (!emailRateLimit.allowed) {
      // לא לרשום את האימייל המלא בלוג — רק חלק הדומיין לאבחון מגמות
      const domain = email.split("@")[1] || "unknown";
      logger.warn("Resend verification rate limit exceeded (email)", { domain });
      // החזרת אותה תשובה גנרית — אין לחשוף שהאימייל קיים במערכת
      return NextResponse.json({ message: GENERIC_MESSAGE });
    }

    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      select: {
        id: true,
        email: true,
        name: true,
        emailVerified: true,
      },
    });

    // Email enumeration prevention — תמיד אותה תשובה
    if (!user || user.emailVerified) {
      return NextResponse.json({ message: GENERIC_MESSAGE });
    }

    const verificationToken = randomBytes(32).toString("hex");
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerificationToken: verificationToken,
        emailVerificationExpires: verificationExpires,
      },
    });

    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    const verifyUrl = `${baseUrl}/verify-email?token=${verificationToken}`;

    const verificationEmail = createVerificationEmailHtml({
      name: user.name || "",
      verifyUrl,
      trialDays: TRIAL_DAYS,
      trialTier: TRIAL_AI_TIER,
    });

    const emailResult = await sendEmail({
      to: user.email!,
      subject: verificationEmail.subject,
      html: verificationEmail.html,
    });

    if (!emailResult?.success) {
      logger.error("Resend verification email failed", {
        userId: user.id,
        error: emailResult?.error || "unknown",
        shabbatBlocked: emailResult?.shabbatBlocked || false,
      });
    }

    return NextResponse.json({ message: GENERIC_MESSAGE });
  } catch (error) {
    logger.error("Resend verification error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "אירעה שגיאה בשליחת הקישור" },
      { status: 500 }
    );
  }
}
