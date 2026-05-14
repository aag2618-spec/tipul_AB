import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { checkRateLimit, AUTH_RATE_LIMIT, rateLimitResponse } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { invalidateJwtCache } from "@/lib/auth";
import { parseBodyWithErrorField } from "@/lib/validations/helpers";
import { resetPasswordSchema } from "@/lib/validations/auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown";
    const rateLimitResult = checkRateLimit(`reset-password:${ip}`, AUTH_RATE_LIMIT);
    if (!rateLimitResult.allowed) {
      return rateLimitResponse(rateLimitResult);
    }

    // H12: zod schema אוכף — token אלפא-נומרי (16-128) + password 8-128.
    // מחליף את הבדיקות הידניות. הגנת אורך מקסימלי על password מונעת DoS על bcrypt
    // (חישוב hash על 10MB string היה תוקע worker לדקות).
    const parsed = await parseBodyWithErrorField(request, resetPasswordSchema);
    if ("error" in parsed) return parsed.error;
    const { token, password } = parsed.data;

    // Find the reset token
    const resetRecord = await prisma.passwordReset.findUnique({
      where: { token },
      include: { user: true },
    });

    if (!resetRecord) {
      return NextResponse.json(
        { error: "קישור לא תקין או שפג תוקפו" },
        { status: 400 }
      );
    }

    // Check if token is expired
    if (new Date() > resetRecord.expiresAt) {
      await prisma.passwordReset.delete({ where: { id: resetRecord.id } });
      return NextResponse.json(
        { error: "הקישור פג תוקף. נא לבקש קישור חדש" },
        { status: 400 }
      );
    }

    // Check if already used
    if (resetRecord.usedAt) {
      return NextResponse.json(
        { error: "קישור זה כבר נוצל. נא לבקש קישור חדש" },
        { status: 400 }
      );
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(password, 12);

    // C7: עדכון passwordChangedAt — מבטל tokens קיימים שהונפקו לפני שינוי
    // הסיסמה (defense-in-depth מול cookie גנוב שעדיין פעיל בזמן ההחלפה).
    await prisma.$transaction([
      prisma.user.update({
        where: { id: resetRecord.userId },
        data: { password: hashedPassword, passwordChangedAt: new Date() },
      }),
      prisma.passwordReset.update({
        where: { id: resetRecord.id },
        data: { usedAt: new Date() },
      }),
    ]);

    // C7: סגירת חלון 30s של JWT cache — אחרת token גנוב היה ממשיך לעבוד
    // עד שה-cache פג. מסיר את הרשומה מיד כדי שהבקשה הבאה תקרא טרי מ-DB.
    invalidateJwtCache(resetRecord.userId);

    return NextResponse.json({
      message: "הסיסמה עודכנה בהצלחה! ניתן להתחבר עכשיו",
    });
  } catch (error) {
    logger.error("Reset password error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: "שגיאה באיפוס הסיסמה" },
      { status: 500 }
    );
  }
}

// GET - Validate token
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const token = searchParams.get("token");

    if (!token) {
      return NextResponse.json({ valid: false, error: "חסר טוקן" });
    }

    const resetRecord = await prisma.passwordReset.findUnique({
      where: { token },
    });

    if (!resetRecord) {
      return NextResponse.json({ valid: false, error: "קישור לא תקין" });
    }

    if (new Date() > resetRecord.expiresAt) {
      return NextResponse.json({ valid: false, error: "הקישור פג תוקף" });
    }

    if (resetRecord.usedAt) {
      return NextResponse.json({ valid: false, error: "קישור זה כבר נוצל" });
    }

    return NextResponse.json({ valid: true });
  } catch (error) {
    logger.error("Validate token error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json({ valid: false, error: "שגיאה" });
  }
}
