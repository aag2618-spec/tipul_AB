import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyCode, looksLikeRecoveryCode } from "@/lib/two-factor";
import {
  checkRateLimit,
  LOGIN_EMAIL_RATE_LIMIT,
  AUTH_RATE_LIMIT,
  RECOVERY_CODE_RATE_LIMIT,
  RECOVERY_CODE_EMAIL_RATE_LIMIT,
} from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { logAdminAction } from "@/lib/audit";
import { parseBodyWithErrorField } from "@/lib/validations/helpers";
import { twoFactorVerifySchema } from "@/lib/validations/auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    // H12: zod אוכף email + code (≤32). cap על code חיוני כדי למנוע DoS על bcrypt
    // (recovery codes משתמשים ב-bcrypt compare).
    const parsed = await parseBodyWithErrorField(req, twoFactorVerifySchema);
    if ("error" in parsed) return parsed.error;
    const { email, code } = parsed.data;

    // Rate limit כפול: email + IP. מונע גם brute-force ממוקד (לפי email),
    // וגם distributed brute-force (לפי IP).
    const emailLower = email; // trim+lowercase מ-zod
    const ipHeader = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "";
    const ip = ipHeader.split(",")[0]?.trim() || "unknown";
    const emailRl = checkRateLimit(`2fa:verify:email:${emailLower}`, LOGIN_EMAIL_RATE_LIMIT);
    const ipRl = checkRateLimit(`2fa:verify:ip:${ip}`, AUTH_RATE_LIMIT);
    if (!emailRl.allowed || !ipRl.allowed) {
      return NextResponse.json(
        { error: "יותר מדי ניסיונות. אנא נסה שוב בעוד מספר דקות." },
        { status: 429 }
      );
    }

    // H18: rate-limit מחמיר ספציפית ל-recovery codes — כל אימות = 10 bcrypt
    // compares (~500ms CPU). מונע DoS על worker וגם brute-force מעבר ל-
    // 49.5-bit entropy של הקודים. נבדק *לפני* bcrypt.
    // שתי שכבות: per-IP (DoS על worker) + per-email (brute-force מבוזר).
    if (looksLikeRecoveryCode(code)) {
      const recoveryIpRl = checkRateLimit(
        `2fa:recovery:ip:${ip}`,
        RECOVERY_CODE_RATE_LIMIT,
      );
      const recoveryEmailRl = checkRateLimit(
        `2fa:recovery:email:${emailLower}`,
        RECOVERY_CODE_EMAIL_RATE_LIMIT,
      );
      if (!recoveryIpRl.allowed || !recoveryEmailRl.allowed) {
        return NextResponse.json(
          { error: "יותר מדי ניסיונות עם קודי שחזור. נסה/י שוב בעוד 15 דקות." },
          { status: 429 }
        );
      }
    }

    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      select: { id: true },
    });

    if (!user) {
      // השהיה מלאכותית כדי לדמות בדיקת קוד — מונע timing-based enumeration.
      await new Promise((r) => setTimeout(r, 200 + Math.random() * 300));
      return NextResponse.json({ error: "קוד שגוי" }, { status: 400 });
    }

    const result = await verifyCode(user.id, code);

    // M10.4: audit trail עבור 2FA verify (success + failed). חיוני לזיהוי
    // ניסיונות brute-force ולחקירת חשבונות שנפרצו. fire-and-forget — לא
    // חוסם את ה-flow של המשתמש; אם DB נופל יש את logger ב-stdout fallback.
    const method = looksLikeRecoveryCode(code) ? "recovery_code" : "totp";
    void logAdminAction({
      adminId: user.id,
      action: result.success ? "2fa_verify_success" : "2fa_verify_failed",
      targetType: "user_auth",
      targetId: user.id,
      details: {
        method,
        ip,
        email: emailLower,
        error: result.success ? undefined : result.error,
      },
    }).catch((auditErr) => {
      logger.warn("[2fa] audit log failed (continuing)", {
        err: auditErr instanceof Error ? auditErr.message : String(auditErr),
      });
    });

    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error("2FA verify route error", { err: String(err) });
    return NextResponse.json({ error: "שגיאה כללית" }, { status: 500 });
  }
}
