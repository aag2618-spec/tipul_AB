import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import prisma from "@/lib/prisma";
import bcrypt from "bcryptjs";
import { checkRateLimit, AUTH_RATE_LIMIT, rateLimitResponse } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { invalidateJwtCache } from "@/lib/auth";
import { parseBodyWithErrorField } from "@/lib/validations/helpers";
import { resetPasswordSchema } from "@/lib/validations/auth";
import { getClientIp } from "@/lib/get-client-ip";

export const dynamic = "force-dynamic";

// M6: ה-token שמגיע מהמשתמש הוא plaintext; ב-DB שמור רק sha256 hash.
function hashResetToken(plaintext: string): string {
  return crypto.createHash("sha256").update(plaintext).digest("hex");
}

export async function POST(request: NextRequest) {
  try {
    // H10 (סבב אבטחה 14): rightmost XFF.
    const ip = getClientIp(request);
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

    // סבב 8: Timing-attack mitigation — תמיד מחשבים bcrypt.hash גם כש-token לא תקף.
    // לפני התיקון: bcrypt רץ רק אם הרשומה נמצאה ותקפה → הפרש זמן 150-300ms בין
    // token פעיל לטוקן שגוי, ומאפשר לתוקף למפות emails (לבקש reset לאימייל ולמדוד).
    // עכשיו: מריצים את ה-DB lookup ואת ה-bcrypt במקביל ב-Promise.all, כך שגם
    // כשהtoken לא תקף ה-response מגיע אחרי ~bcrypt latency (~250ms קבועים).
    const [hashedPassword, resetRecord] = await Promise.all([
      bcrypt.hash(password, 12),
      prisma.passwordReset.findUnique({
        where: { token: hashResetToken(token) },
        include: { user: true },
      }),
    ]);

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

    // C7: עדכון passwordChangedAt — מבטל tokens קיימים שהונפקו לפני שינוי
    // הסיסמה (defense-in-depth מול cookie גנוב שעדיין פעיל בזמן ההחלפה).
    // M6: אטומיות מול race — updateMany עם תנאי usedAt:null. אם בקשה
    // מקבילה כבר השתמשה בtoken, count=0 ולא נעדכן את ה-password.
    const consumed = await prisma.$transaction(async (tx) => {
      const r = await tx.passwordReset.updateMany({
        where: { id: resetRecord.id, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (r.count === 0) return false; // race: someone consumed the token first
      await tx.user.update({
        where: { id: resetRecord.userId },
        // H6 defense-in-depth (2026-06-29): bump sessionVersion בנוסף ל-passwordChangedAt.
        // passwordChangedAt נשען על השוואת token.iat שמתחדש ב-updateAge (כל שעה) —
        // sessionVersion נקבע פעם אחת ב-login ואינו מתחדש, ולכן אות ביטול חסין יותר.
        data: {
          password: hashedPassword,
          passwordChangedAt: new Date(),
          sessionVersion: { increment: 1 },
        },
      });
      return true;
    });

    if (!consumed) {
      return NextResponse.json(
        { error: "קישור זה כבר נוצל. נא לבקש קישור חדש" },
        { status: 400 }
      );
    }

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
      where: { token: hashResetToken(token) },
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
