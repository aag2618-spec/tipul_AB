// הפעלה/כיבוי של אימות דו-שלבי במייל/SMS (OTP) — בלי אפליקציה/QR.
//
// נועד למשתמשים שאין להם סמארטפון עם סורק QR (טלפון פשוט). המנגנון מאחורי
// הקלעים כבר קיים (sendCode שולח קוד 6-ספרות למייל וגם ל-SMS, verifyCode מאמת
// בזרימת ההתחברות) — אבל מסך ההגדרות חשף עד כה רק הפעלת TOTP. כאן מתווסף
// נתיב הפעלה/כיבוי ל-OTP.
//
// זרימה:
//   POST   — שולח קוד למייל/SMS (אישור שהמשתמש אכן מקבל קוד לפני ההפעלה).
//   PATCH  — מאמת את הקוד ומפעיל 2FA (twoFactorEnabled=true, method="OTP").
//   DELETE — מאמת את הקוד ומכבה את ה-2FA במייל/SMS.
//
// אבטחה: requireAuth + disallowImpersonation (אסור ל-OWNER לשנות 2FA בשם target).
// כל פעולה דורשת קוד שנשלח לערוץ של המשתמש → תוקף עם session בלבד לא יכול
// להפעיל/לכבות בלי גישה למייל/טלפון. bump sessionVersion + invalidateJwtCache
// כדי שהמצב החדש ייאכף בבקשה הבאה.

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { sendCode, confirmTwoFactorCodeForSetup } from "@/lib/two-factor";
import { invalidateJwtCache } from "@/lib/auth";
import { checkRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// rate-limit לפי משתמש — מונע flooding של inbox/SMS ובזבוז קרדיט SMS.
const EMAIL_SETUP_SEND_LIMIT = { maxRequests: 3, windowMs: 15 * 60 * 1000 };

export async function POST() {
  const auth = await requireAuth({ disallowImpersonation: true });
  if ("error" in auth) return auth.error;
  const { userId } = auth;

  const rl = checkRateLimit(`2fa:email-setup:send:${userId}`, EMAIL_SETUP_SEND_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { message: "יותר מדי בקשות. אנא נסה/י שוב בעוד 15 דקות." },
      { status: 429 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, phone: true, name: true },
  });
  if (!user || !user.email) {
    return NextResponse.json({ message: "אין כתובת מייל למשתמש" }, { status: 400 });
  }

  const result = await sendCode(user);
  if (!result.success) {
    return NextResponse.json(
      { message: result.error, shabbatBlocked: result.shabbatBlocked === true },
      { status: result.shabbatBlocked ? 503 : 500 }
    );
  }

  return NextResponse.json({ success: true });
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAuth({ disallowImpersonation: true });
  if ("error" in auth) return auth.error;
  const { userId } = auth;

  let body: { code?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "גוף בקשה לא תקין" }, { status: 400 });
  }
  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!code) {
    return NextResponse.json({ message: "נדרש קוד אימות" }, { status: 400 });
  }

  const ok = await confirmTwoFactorCodeForSetup(userId, code);
  if (!ok) {
    return NextResponse.json(
      { message: "קוד שגוי או שפג תוקפו. אנא בקש/י קוד חדש." },
      { status: 400 }
    );
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      twoFactorEnabled: true,
      twoFactorMethod: "OTP",
      sessionVersion: { increment: 1 },
    },
  });
  invalidateJwtCache(userId);

  logger.info("[2fa/email-setup] OTP (email/SMS) 2FA enabled", { userId });
  return NextResponse.json({ success: true });
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAuth({ disallowImpersonation: true });
  if ("error" in auth) return auth.error;
  const { userId } = auth;

  let body: { code?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "גוף בקשה לא תקין" }, { status: 400 });
  }
  const code = typeof body.code === "string" ? body.code.trim() : "";
  if (!code) {
    return NextResponse.json({ message: "נדרש קוד אימות לכיבוי" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { twoFactorMethod: true, twoFactorEnabled: true },
  });
  // כיבוי דרך נתיב זה הוא רק ל-OTP. TOTP מתבטל בנתיב הייעודי שלו (totp-setup DELETE).
  if (!user || !user.twoFactorEnabled || user.twoFactorMethod === "TOTP") {
    return NextResponse.json(
      { message: "אימות דו-שלבי במייל/SMS אינו פעיל" },
      { status: 400 }
    );
  }

  const ok = await confirmTwoFactorCodeForSetup(userId, code);
  if (!ok) {
    return NextResponse.json(
      { message: "קוד שגוי או שפג תוקפו. אנא בקש/י קוד חדש." },
      { status: 400 }
    );
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      twoFactorEnabled: false,
      twoFactorMethod: null,
      sessionVersion: { increment: 1 },
    },
  });
  invalidateJwtCache(userId);

  logger.info("[2fa/email-setup] OTP (email/SMS) 2FA disabled", { userId });
  return NextResponse.json({ success: true });
}
