import crypto from "crypto";
import bcrypt from "bcryptjs";
import { generateSecret, generateURI, verifySync } from "otplib";
import prisma from "./prisma";
import { sendEmail } from "./resend";
import { sendSMS } from "./sms";
import { logger } from "./logger";

const CODE_EXPIRY_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const INACTIVITY_THRESHOLD_MS = 3 * 60 * 60 * 1000;

// H18: Recovery codes — 10 קודים חד-פעמיים, כל אחד 10 תווים אלפא-נומריים
// (ללא תווים מבלבלים כמו 0/O/1/l/I) בפורמט XXXXX-XXXXX.
// bcrypt cost 10 — אבטחה סבירה ו-~50ms לאימות יחיד (10 קודים = ~500ms סה"כ
// בתרחיש הגרוע — מקובל כיוון שזה רק בעת shutdown של הטלפון).
const RECOVERY_CODES_COUNT = 10;
const RECOVERY_CODE_LENGTH = 10;
// 31 תווים: 24 אותיות (ללא I/L/O) + 7 ספרות (ללא 0/1) = 31^10 ≈ 8.2×10^14
// קומבינציות = ~49.5 bits אנטרופיה. מספיק בהינתן rate-limit + bcrypt.
const RECOVERY_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const BCRYPT_COST = 10;

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

// Anti-2FA-bypass (2026-06-10): סוגר עקיפת 2FA בין sessions. ה-jwt callback מנקה
// את requires2FA רק אם האימות בוצע *בדיוק* עבור ה-login הנוכחי (token.loginAt) —
// שוויון מדויק, לא ">", כך ש-verify שבוצע ל-login אחר (למשל login לגיטימי של הקורבן)
// לא משחרר token חצי-מאומת ישן של תוקף שמחזיק את הסיסמה.
export function isTwoFactorVerifiedForLogin(
  verifiedForLoginAt: Date | null | undefined,
  tokenLoginAt: number,
): boolean {
  if (verifiedForLoginAt == null) return false;
  return verifiedForLoginAt.getTime() === tokenLoginAt;
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

// M16.10 (סבב 16g): recommendRotation מסמן למשתמש שכדאי לחדש את כל קודי
// השחזור — מוחזר תמיד true אחרי שימוש בקוד recovery (סטנדרט Google/GitHub).
// אם תוקף השיג גישה לקוד אחד, סביר שיש לו גישה גם לאחרים — rotation מנטרל.
export type VerifyCodeResult =
  | { success: true; recommendRotation?: boolean }
  | { success: false; error: string };

// H4: אימות קוד TOTP. אם המשתמש הגדיר twoFactorMethod="TOTP", הקוד נכנס
// מ-Authenticator app ולא מ-DB. ביצוע verify מול ה-secret המוצפן ב-User,
// ועדכון lastLoginAt + lastActivityAt בהצלחה. עוטף ב-transaction לאטומיות
// (ולמנוע race של 2 verifies סימולטניים שיגמרו ב-2 lastLogin updates).
//
// H18: אם הקוד נראה כמו recovery code (10 תווים אלפא-נומריים, לא 6 ספרות),
// עובר ל-verifyAndConsumeRecoveryCode במקום TOTP. זה מאפשר למשתמש שאיבד
// טלפון להיכנס בעזרת קוד שחזור.
async function verifyTotp(userId: string, inputCode: string, loginAt: number): Promise<VerifyCodeResult> {
  // H18: אם נראה כמו recovery code — ננתב אליו.
  if (looksLikeRecoveryCode(inputCode)) {
    try {
      return await verifyAndConsumeRecoveryCode(userId, inputCode, loginAt);
    } catch (err) {
      if (err instanceof Error && err.message === "RECOVERY_RACE") {
        return { success: false, error: "קוד שחזור כבר בשימוש. אנא נסה/י קוד אחר." };
      }
      logger.error("[2fa/recovery] verify error", {
        userId,
        err: err instanceof Error ? err.message : String(err),
      });
      return { success: false, error: "שגיאה באימות קוד שחזור." };
    }
  }

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
    data: { lastLoginAt: now, lastActivityAt: now, twoFactorVerifiedForLoginAt: new Date(loginAt) },
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
export async function verifyCode(userId: string, inputCode: string, loginAt: number): Promise<VerifyCodeResult> {
  // בדוק שיטה תחילה — אם TOTP, לא נוגעים ב-TwoFactorCode בכלל.
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { twoFactorMethod: true },
  });
  if (u?.twoFactorMethod === "TOTP") {
    return verifyTotp(userId, inputCode, loginAt);
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
      data: { lastLoginAt: now, lastActivityAt: now, twoFactorVerifiedForLoginAt: new Date(loginAt) },
    });

    return { success: true };
  });
}

// H18: יוצר 10 קודי שחזור חד-פעמיים. הקודים עצמם מוחזרים פעם אחת בלבד
// (frontend מציג אותם למשתמש להורדה/הדפסה). ב-DB נשמרים רק bcrypt hashes.
//
// משתמשים ב-crypto.randomInt(0, N) במקום `byte % N` — randomInt עושה
// rejection sampling פנימית, כך שאין modulo bias (חיוני כי 31 לא מחלק 256).
export function generateRecoveryCodes(): string[] {
  const codes: string[] = [];
  for (let i = 0; i < RECOVERY_CODES_COUNT; i++) {
    let code = "";
    for (let j = 0; j < RECOVERY_CODE_LENGTH; j++) {
      const idx = crypto.randomInt(0, RECOVERY_CODE_ALPHABET.length);
      code += RECOVERY_CODE_ALPHABET[idx];
    }
    // פורמט XXXXX-XXXXX לקריאות
    codes.push(`${code.slice(0, 5)}-${code.slice(5, 10)}`);
  }
  return codes;
}

// H18: hash של כל הקודים. נקרא בעת הפעלת TOTP או בעת regenerate.
export async function hashRecoveryCodes(codes: string[]): Promise<string[]> {
  return Promise.all(codes.map((c) => bcrypt.hash(normalizeRecoveryCode(c), BCRYPT_COST)));
}

// נורמליזציה: להסיר רווחים, מקפים, ולעלות ל-uppercase כדי שלא ייכשל
// על "abcde-12345" או "ABCDE 12345".
export function normalizeRecoveryCode(code: string): string {
  return code.replace(/[\s-]/g, "").toUpperCase().trim();
}

// H18: בודק אם הקלט נראה כמו recovery code (לא 6 ספרות אלא 10 תווים אלפא-נום).
export function looksLikeRecoveryCode(input: string): boolean {
  const normalized = normalizeRecoveryCode(input);
  return /^[A-Z0-9]{10}$/.test(normalized);
}

// H18: מאמת קוד שחזור ומסיר אותו מהרשימה (one-time use). אטומי דרך transaction.
// בהצלחה — מעדכן lastLoginAt + lastActivityAt בדומה ל-verifyTotp.
//
// אבטחה:
//   • כל ה-hashes נבדקים גם בכישלון (לא יוצאים מוקדם) כדי למנוע timing attack
//     שמדליף אילו hashes כבר נוצלו.
//   • הקוד שנמצא מוסר מהמערך באטומיות (write-back עם compareAndSet logic).
export async function verifyAndConsumeRecoveryCode(
  userId: string,
  inputCode: string,
  loginAt: number,
): Promise<VerifyCodeResult> {
  const normalized = normalizeRecoveryCode(inputCode);
  if (!looksLikeRecoveryCode(normalized)) {
    return { success: false, error: "פורמט קוד שחזור לא תקין." };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { twoFactorRecoveryCodes: true },
  });
  if (!user?.twoFactorRecoveryCodes) {
    return { success: false, error: "אין קודי שחזור זמינים. אנא צור/י קודים חדשים." };
  }

  let hashes: string[];
  try {
    const parsed = JSON.parse(user.twoFactorRecoveryCodes);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return { success: false, error: "כל קודי השחזור נוצלו. אנא צור/י קודים חדשים." };
    }
    hashes = parsed.filter((h): h is string => typeof h === "string");
  } catch {
    logger.error("[2fa/recovery] failed to parse recovery codes JSON", { userId });
    return { success: false, error: "שגיאה בקריאת קודי שחזור." };
  }

  // בודק את כל ה-hashes (לא יוצא מוקדם — constant-time-ish).
  let matchedIndex = -1;
  for (let i = 0; i < hashes.length; i++) {
    const ok = await bcrypt.compare(normalized, hashes[i]);
    if (ok && matchedIndex === -1) {
      matchedIndex = i;
    }
  }

  if (matchedIndex === -1) {
    return { success: false, error: "קוד שחזור שגוי." };
  }

  // הסר את הקוד שנוצל. אטומיות אמיתית: optimistic CAS ב-WHERE clause —
  // עדכון יבוצע רק אם הערך ב-DB עדיין זהה למה שקראנו. אם בקשה מקבילה
  // הקדימה ושינתה — count===0 ונחזיר RECOVERY_RACE.
  //
  // הערה: ב-Prisma transaction בלבד (בלי `FOR UPDATE`) הקריאה והכתיבה לא
  // ננעלות אטומית ב-READ COMMITTED. ה-CAS על העמודה הוא הדרך הנכונה לסגור
  // race condition של "אותו קוד נוצל פעמיים" בלי lock מיותר.
  const remaining = hashes.filter((_, idx) => idx !== matchedIndex);
  const newJson = remaining.length > 0 ? JSON.stringify(remaining) : null;
  const now = new Date();

  const updated = await prisma.user.updateMany({
    where: {
      id: userId,
      // CAS: רק אם הערך הנוכחי תואם מה שקראנו (לפני שהשתמשנו בקוד).
      twoFactorRecoveryCodes: user.twoFactorRecoveryCodes,
    },
    data: {
      twoFactorRecoveryCodes: newJson,
      lastLoginAt: now,
      lastActivityAt: now,
      twoFactorVerifiedForLoginAt: new Date(loginAt),
    },
  });

  if (updated.count === 0) {
    // בקשה מקבילה כבר שינתה את ה-codes — אסור לאשר את הlogin הזה,
    // אחרת אותו קוד עלול להתפרש כ"מנוצל" בכפילות.
    throw new Error("RECOVERY_RACE");
  }

  logger.info("[2fa/recovery] recovery code consumed", {
    userId,
    remainingCount: remaining.length,
  });

  // M16.10 (סבב 16g): תמיד ממליצים על rotation אחרי שימוש בקוד שחזור.
  // הקודים הם backup חד-פעמי — אם נוצל אחד, כדאי לחדש את כולם כדי לצמצם
  // חלון פגיעות אם הם דלפו מאותו מקור.
  return { success: true, recommendRotation: true };
}

// H18: ספירת הקודים שנותרו לשימוש (לא חשיפת ה-hashes עצמם).
export async function countRemainingRecoveryCodes(userId: string): Promise<number> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { twoFactorRecoveryCodes: true },
  });
  if (!user?.twoFactorRecoveryCodes) return 0;
  try {
    const parsed = JSON.parse(user.twoFactorRecoveryCodes);
    if (!Array.isArray(parsed)) return 0;
    return parsed.filter((h) => typeof h === "string").length;
  } catch {
    return 0;
  }
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
