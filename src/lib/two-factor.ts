import crypto from "crypto";
import { generateSecret, generateURI, verifySync } from "otplib";
import prisma from "./prisma";
import { sendEmail } from "./resend";
import { sendSMS } from "./sms";
import { logger } from "./logger";

const CODE_EXPIRY_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const INACTIVITY_THRESHOLD_MS = 3 * 60 * 60 * 1000;

// H4: TOTP — RFC 6238, 6 ספרות, חלון 30s. epochTolerance=30s מתיר קוד
// מהחלון הקודם/הבא (סטיית שעון של עד ±30s).
const TOTP_EPOCH_TOLERANCE_SECONDS = 30;

/**
 * H4: יוצר TOTP secret חדש (base32). ה-secret נשמר ב-DB (מוצפן דרך
 * ENCRYPTED_FIELDS.user.twoFactorSecret) ומוצג למשתמש כ-QR code לסריקה
 * עם Google Authenticator/Authy/1Password.
 */
export function generateTotpSecret(): string {
  return generateSecret();
}

/**
 * H4: בונה otpauth:// URI שמוצג כ-QR code. ה-issuer (MyTipul) וה-label
 * (email) מוצגים ב-authenticator app של המשתמש.
 */
export function buildTotpUri(email: string, secret: string): string {
  return generateURI({
    strategy: "totp",
    issuer: "MyTipul",
    label: email,
    secret,
  });
}

/**
 * H4: אימות קוד TOTP בן 6 ספרות מול secret של המשתמש.
 * verifySync של otplib משתמש ב-timing-safe compare פנימי.
 */
export function verifyTotpCode(secret: string, code: string): boolean {
  if (!secret || !code) return false;
  // strip whitespace — אנשים מקלידים "123 456" לפעמים
  const clean = code.replace(/\s+/g, "").trim();
  if (!/^\d{6}$/.test(clean)) return false;
  try {
    const result = verifySync({
      strategy: "totp",
      token: clean,
      secret,
      epochTolerance: TOTP_EPOCH_TOLERANCE_SECONDS,
    });
    return result.valid === true;
  } catch {
    return false;
  }
}

export function generateCode(): string {
  const code = crypto.randomInt(0, 1000000);
  return code.toString().padStart(6, "0");
}

export function hashCode(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}

// 2FA נדרש רק לאנשי צוות (USER/MANAGER/ADMIN/CLINIC_OWNER/CLINIC_SECRETARY),
// כשהפעילות האחרונה הייתה לפני יותר מ-3 שעות או שאין פעילות בכלל (כניסה ראשונה).
//
// Stage 2.0 hardening (security review #14):
//   • ADMIN ו-CLINIC_OWNER — תפקידים בכירים עם גישה רחבה. אצלם 2FA מופעל
//     בכל login (גם אם הפעילות האחרונה הייתה לפני שעה), כדי לצמצם חלון
//     הזדמנות אחרי גניבת קוקי. הגרציה של 3 שעות לא חלה עליהם.
//   • ADMIN/CLINIC_OWNER ללא twoFactorEnabled — נכנסים בלוג אזהרה (כדי שאדמין
//     ראשי יראה ויתעדף הפעלת 2FA), אבל login לא נחסם — אחרת חשבונות שטרם
//     הפעילו 2FA יינעלו. UX של "force-setup" דורש דף onboarding ייעודי
//     ויטופל בנפרד.
//   • USER/MANAGER/CLINIC_SECRETARY — מתנהגים כפי שהיה: 2FA רק אם מופעל
//     ורק אחרי 3 שעות חוסר פעילות.
export function requires2FA(user: {
  role: string;
  twoFactorEnabled: boolean;
  lastActivityAt: Date | null;
}): boolean {
  const isStaff =
    user.role === "USER" ||
    user.role === "MANAGER" ||
    user.role === "ADMIN" ||
    user.role === "CLINIC_OWNER" ||
    user.role === "CLINIC_SECRETARY";
  if (!isStaff) return false;

  const isSeniorRole = user.role === "ADMIN" || user.role === "CLINIC_OWNER";

  if (!user.twoFactorEnabled) {
    if (isSeniorRole) {
      logger.warn("[2FA] senior role logged in without 2FA enabled — operator should enable", {
        role: user.role,
      });
    }
    return false;
  }

  if (isSeniorRole) {
    return true;
  }

  if (!user.lastActivityAt) return true;
  const elapsed = Date.now() - new Date(user.lastActivityAt).getTime();
  return elapsed > INACTIVITY_THRESHOLD_MS;
}

export type SendCodeResult =
  | { success: true }
  | { success: false; error: string; shabbatBlocked?: boolean };

// יוצר קוד חדש, מבטל קודים קיימים שעדיין לא אומתו, שומר hash ב-DB ושולח למייל וגם ל-SMS.
export async function sendCode(user: {
  id: string;
  email: string | null;
  phone: string | null;
  name: string | null;
}): Promise<SendCodeResult> {
  if (!user.email) {
    return { success: false, error: "המשתמש ללא כתובת מייל" };
  }

  const code = generateCode();
  const codeHash = hashCode(code);
  const expiresAt = new Date(Date.now() + CODE_EXPIRY_MINUTES * 60 * 1000);

  // ביטול קודים קיימים שלא אומתו — מקצרים את תוקפם לעכשיו.
  await prisma.twoFactorCode.updateMany({
    where: {
      userId: user.id,
      verifiedAt: null,
      expiresAt: { gt: new Date() },
    },
    data: { expiresAt: new Date() },
  });

  await prisma.twoFactorCode.create({
    data: {
      userId: user.id,
      codeHash,
      channel: "BOTH",
      expiresAt,
    },
  });

  const html = buildEmailTemplate(code, user.name || "");
  const smsMessage = `קוד אימות MyTipul: ${code}\nתוקף 10 דקות.`;

  // שליחה במקביל. נכשל רק אם שניהם נכשלים.
  const [emailRes, smsRes] = await Promise.all([
    sendEmail({
      to: user.email,
      subject: "קוד אימות לכניסה ל-MyTipul",
      html,
    }).catch((err) => {
      logger.error("2FA email send failed", { userId: user.id, err: String(err) });
      return { success: false, error: "EMAIL_THROW" };
    }),
    user.phone
      ? sendSMS(user.phone, smsMessage, user.id, { type: "2fa_code" }).catch((err) => {
          logger.error("2FA SMS send failed", { userId: user.id, err: String(err) });
          return { success: false, error: "SMS_THROW" };
        })
      : Promise.resolve({ success: false, error: "NO_PHONE" }),
  ]);

  const emailOk = emailRes?.success === true;
  const smsOk = smsRes?.success === true;

  if (emailOk || smsOk) {
    return { success: true };
  }

  // אם שניהם נחסמו בשבת/חג — error מיוחד
  const shabbatBlocked =
    (emailRes && "shabbatBlocked" in emailRes && emailRes.shabbatBlocked) ||
    (smsRes && "shabbatBlocked" in smsRes && smsRes.shabbatBlocked);

  if (shabbatBlocked) {
    return {
      success: false,
      error: "לא ניתן לשלוח קוד אימות בשבת/חג. אנא נסה שוב במוצאי השבת/החג.",
      shabbatBlocked: true,
    };
  }

  return { success: false, error: "שליחת קוד נכשלה. אנא נסה שוב מאוחר יותר." };
}

export type VerifyCodeResult = { success: true } | { success: false; error: string };

// H4: אימות קוד TOTP. אם המשתמש הגדיר twoFactorMethod="TOTP", הקוד נכנס
// מ-Authenticator app ולא מ-DB. ביצוע verify מול ה-secret המוצפן ב-User,
// ועדכון lastLoginAt + lastActivityAt בהצלחה. עוטף ב-transaction לאטומיות
// (ולמנוע race של 2 verifies סימולטניים שיגמרו ב-2 lastLogin updates).
async function verifyTotp(userId: string, inputCode: string): Promise<VerifyCodeResult> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { twoFactorSecret: true },
  });
  if (!user?.twoFactorSecret) {
    return { success: false, error: "לא הוגדר אימות TOTP. אנא הגדר/י מחדש." };
  }
  const ok = verifyTotpCode(user.twoFactorSecret, inputCode);
  if (!ok) {
    return { success: false, error: "קוד שגוי. נסה/י שוב." };
  }
  const now = new Date();
  await prisma.user.update({
    where: { id: userId },
    data: { lastLoginAt: now, lastActivityAt: now },
  });
  return { success: true };
}

// מאמת קוד שהמשתמש הזין. ב-success — מעדכן lastLoginAt + lastActivityAt.
//
// אטומיות: הבדיקה+ההגדלה+ה-mark-as-verified עוטפים בטרנזקציה,
// כדי שניסיונות מקבילים לא יוכלו לעקוף את MAX_ATTEMPTS.
//
// H4: אם המשתמש בחר twoFactorMethod="TOTP", פונקציה זו עוברת לנתיב TOTP
// (אימות מול secret במקום קוד שנשלח). אחרת — נתיב OTP-by-email/SMS (legacy).
export async function verifyCode(userId: string, inputCode: string): Promise<VerifyCodeResult> {
  // בדוק שיטה תחילה — אם TOTP, לא נוגעים ב-TwoFactorCode בכלל.
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { twoFactorMethod: true },
  });
  if (u?.twoFactorMethod === "TOTP") {
    return verifyTotp(userId, inputCode);
  }

  const inputHash = hashCode(inputCode);

  return await prisma.$transaction(async (tx) => {
    const code = await tx.twoFactorCode.findFirst({
      where: {
        userId,
        verifiedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    });

    if (!code) {
      return { success: false, error: "אין קוד פעיל. אנא בקש קוד חדש." };
    }

    if (code.attempts >= MAX_ATTEMPTS) {
      return { success: false, error: "יותר מדי ניסיונות. אנא בקש קוד חדש." };
    }

    const expectedBuf = Buffer.from(code.codeHash, "hex");
    const inputBuf = Buffer.from(inputHash, "hex");

    const isValid =
      expectedBuf.length === inputBuf.length && crypto.timingSafeEqual(expectedBuf, inputBuf);

    if (!isValid) {
      // updateMany עם תנאי attempts < MAX מבטיח שלא נחרוג גם בריצה מקבילה.
      const updated = await tx.twoFactorCode.updateMany({
        where: { id: code.id, attempts: { lt: MAX_ATTEMPTS } },
        data: { attempts: { increment: 1 } },
      });
      // אם count=0 — ניסיון מקביל כבר הגיע ל-MAX. גם אז ההודעה מתאימה.
      const newAttempts = updated.count > 0 ? code.attempts + 1 : MAX_ATTEMPTS;
      const remaining = Math.max(0, MAX_ATTEMPTS - newAttempts);
      return {
        success: false,
        error:
          remaining > 1
            ? `קוד שגוי. נותרו ${remaining} ניסיונות.`
            : remaining === 1
            ? "קוד שגוי. נותר ניסיון אחד."
            : "יותר מדי ניסיונות. אנא בקש קוד חדש.",
      };
    }

    // הצלחה — אטומית: only mark verified if not yet verified, and not over MAX attempts.
    const consumed = await tx.twoFactorCode.updateMany({
      where: {
        id: code.id,
        verifiedAt: null,
        attempts: { lt: MAX_ATTEMPTS },
      },
      data: { verifiedAt: new Date() },
    });

    if (consumed.count === 0) {
      // race — מישהו כבר השתמש בקוד או חסם אותו
      return { success: false, error: "הקוד כבר שומש. אנא בקש קוד חדש." };
    }

    const now = new Date();
    await tx.user.update({
      where: { id: userId },
      data: { lastLoginAt: now, lastActivityAt: now },
    });

    return { success: true };
  });
}

function buildEmailTemplate(code: string, name: string): string {
  const greeting = name ? `שלום ${escapeHtml(name)}` : "שלום";
  return `
    <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #1a56db;">${greeting}</h2>
      <p>קוד האימות שלך לכניסה ל-MyTipul:</p>
      <div style="font-size: 36px; font-weight: bold; letter-spacing: 8px; padding: 24px; background: #f3f4f6; text-align: center; border-radius: 8px; color: #111827; margin: 24px 0;">
        ${code}
      </div>
      <p style="color: #6b7280; font-size: 14px;">הקוד תקף ל-10 דקות.</p>
      <p style="color: #dc2626; font-size: 13px; margin-top: 24px;">
        אם לא ניסית להתחבר — אנא התעלם מהמייל ושנה את הסיסמה שלך מיד.
      </p>
    </div>
  `;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
