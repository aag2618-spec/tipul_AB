// H4: TOTP setup endpoint.
//
// 2 שלבים:
//   POST   /api/auth/2fa/totp-setup           — יוצר secret חדש (לא מוסיף עדיין
//                                                ל-DB; מוחזר ל-frontend כדי
//                                                להראות QR code). ה-secret חוזר
//                                                ב-response כדי שהמשתמש יוכל
//                                                לסרוק. עוטף בbase32.
//   PATCH  /api/auth/2fa/totp-setup           — מאמת קוד ראשון, ושומר ב-DB.
//                                                שינוי twoFactorMethod ל-"TOTP"
//                                                ושמירת secret מוצפן.
//
// אבטחה:
//   • requireAuth() מאמת שהמשתמש מחובר
//   • אחרי PATCH מוצלח — invalidateJwtCache כדי שהטוקן יקבל את המצב החדש
//   • disallowImpersonation=true — אסור ל-OWNER להפעיל TOTP בשם target

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import {
  buildTotpUri,
  generateTotpSecret,
  verifyTotpCode,
  generateRecoveryCodes,
  hashRecoveryCodes,
} from "@/lib/two-factor";
import { invalidateJwtCache } from "@/lib/auth";
import QRCode from "qrcode";

export const dynamic = "force-dynamic";

// POST — מתחיל את ה-setup. מחזיר secret + QR data URL.
// ה-secret חוזר ב-response (לפעם הזו בלבד) כדי שה-frontend יציג גם
// אופציה ידנית של "הכנס secret" לאפליקציות שלא תומכות ב-QR.
export async function POST() {
  const auth = await requireAuth({ disallowImpersonation: true });
  if ("error" in auth) return auth.error;
  const { userId } = auth;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, twoFactorMethod: true },
  });
  if (!user || !user.email) {
    return NextResponse.json(
      { message: "אין כתובת מייל למשתמש" },
      { status: 400 }
    );
  }

  const secret = generateTotpSecret();
  const uri = buildTotpUri(user.email, secret);

  let qrDataUrl: string;
  try {
    qrDataUrl = await QRCode.toDataURL(uri, { margin: 1, width: 240 });
  } catch (err) {
    logger.error("[2fa/totp-setup] QR generation failed", {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { message: "שגיאה ביצירת קוד QR" },
      { status: 500 }
    );
  }

  // ה-secret עצמו מוחזר רק כעת — frontend אמור לאחסן אותו זמנית עד שהמשתמש
  // מאשר קוד תקין דרך PATCH. לא נשמר ב-DB עד שיש אישור.
  return NextResponse.json({
    secret,
    qrDataUrl,
    issuer: "MyTipul",
    label: user.email,
  });
}

// PATCH — מסיים את ה-setup. body = { secret, code }.
// מאמת ש-code תקף עם ה-secret, ואז שומר ב-DB.
export async function PATCH(request: NextRequest) {
  const auth = await requireAuth({ disallowImpersonation: true });
  if ("error" in auth) return auth.error;
  const { userId } = auth;

  let body: { secret?: unknown; code?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ message: "גוף בקשה לא תקין" }, { status: 400 });
  }

  const secret = typeof body.secret === "string" ? body.secret.trim() : "";
  const code = typeof body.code === "string" ? body.code.trim() : "";

  if (!secret || !code) {
    return NextResponse.json(
      { message: "חסר secret או קוד" },
      { status: 400 }
    );
  }

  // אימות הקוד הראשון מול ה-secret. אם נכשל — אין שמירה ב-DB.
  if (!verifyTotpCode(secret, code)) {
    return NextResponse.json(
      { message: "קוד שגוי. נסה/י שוב או סרוק/י מחדש את ה-QR." },
      { status: 400 }
    );
  }

  // H18: יצירת 10 קודי שחזור. הקודים עצמם מוחזרים פעם אחת בלבד —
  // frontend אחראי להציג למשתמש להורדה/הדפסה לפני סגירת הדיאלוג.
  // ב-DB נשמרים רק bcrypt hashes.
  const recoveryCodes = generateRecoveryCodes();
  const recoveryHashes = await hashRecoveryCodes(recoveryCodes);

  // שמירה — ה-secret מוצפן אוטומטית דרך ENCRYPTED_FIELDS.user.twoFactorSecret
  // (ראה src/lib/encrypted-fields.ts).
  await prisma.user.update({
    where: { id: userId },
    data: {
      twoFactorEnabled: true,
      twoFactorMethod: "TOTP",
      twoFactorSecret: secret,
      twoFactorRecoveryCodes: JSON.stringify(recoveryHashes),
    },
  });

  // מנקה את ה-JWT cache כדי שהבקשה הבאה תראה את המצב החדש.
  invalidateJwtCache(userId);

  logger.info("[2fa/totp-setup] TOTP enabled with recovery codes", {
    userId,
    recoveryCodesCount: recoveryCodes.length,
  });

  return NextResponse.json({ success: true, recoveryCodes });
}

// DELETE — מבטל TOTP וחוזר ל-OTP-by-email. דורש קוד תקף תחילה.
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
    return NextResponse.json(
      { message: "נדרש קוד אימות לכיבוי TOTP" },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { twoFactorMethod: true, twoFactorSecret: true },
  });
  if (!user || user.twoFactorMethod !== "TOTP" || !user.twoFactorSecret) {
    return NextResponse.json(
      { message: "TOTP לא הוגדר" },
      { status: 400 }
    );
  }

  if (!verifyTotpCode(user.twoFactorSecret, code)) {
    return NextResponse.json(
      { message: "קוד שגוי. נסה/י שוב." },
      { status: 400 }
    );
  }

  await prisma.user.update({
    where: { id: userId },
    data: {
      twoFactorMethod: null,
      twoFactorSecret: null,
      // H18: מנקים גם את קודי השחזור — לא רלוונטיים ל-OTP במייל.
      twoFactorRecoveryCodes: null,
      // twoFactorEnabled נשאר true — המשתמש עדיין רוצה 2FA, חוזר ל-OTP-email.
    },
  });
  invalidateJwtCache(userId);

  logger.info("[2fa/totp-setup] TOTP disabled", { userId });
  return NextResponse.json({ success: true });
}
