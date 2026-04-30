import crypto from "crypto";
import prisma from "./prisma";
import { sendEmail } from "./resend";
import { sendSMS } from "./sms";
import { logger } from "./logger";

const CODE_EXPIRY_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const INACTIVITY_THRESHOLD_MS = 3 * 60 * 60 * 1000;

export function generateCode(): string {
  const code = crypto.randomInt(0, 1000000);
  return code.toString().padStart(6, "0");
}

export function hashCode(code: string): string {
  return crypto.createHash("sha256").update(code).digest("hex");
}

// 2FA נדרש רק לאנשי צוות (USER/MANAGER/ADMIN), כשהפעילות האחרונה הייתה לפני יותר מ-3 שעות
// או שאין פעילות בכלל (כניסה ראשונה).
export function requires2FA(user: {
  role: string;
  twoFactorEnabled: boolean;
  lastActivityAt: Date | null;
}): boolean {
  const isStaff = user.role === "USER" || user.role === "MANAGER" || user.role === "ADMIN";
  if (!isStaff) return false;
  if (!user.twoFactorEnabled) return false;
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

// מאמת קוד שהמשתמש הזין. ב-success — מעדכן lastLoginAt + lastActivityAt.
//
// אטומיות: הבדיקה+ההגדלה+ה-mark-as-verified עוטפים בטרנזקציה,
// כדי שניסיונות מקבילים לא יוכלו לעקוף את MAX_ATTEMPTS.
export async function verifyCode(userId: string, inputCode: string): Promise<VerifyCodeResult> {
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
