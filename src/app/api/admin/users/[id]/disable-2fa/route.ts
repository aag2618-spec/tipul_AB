// H18 follow-up: Admin endpoint לכיבוי 2FA למשתמש שאיבד גישה
// (איבד טלפון + איבד קודי שחזור = נעול לחלוטין).
//
// אבטחה:
//   • requirePermission("users.disable_2fa") — ADMIN בלבד (rank 10)
//   • דורש justification (סיבה כתובה) — נשמרת ב-AdminAuditLog
//   • withAudit — רישום ב-DB עם undoable=true (אדמין יכול לבטל תוך 10 שניות)
//   • invalidateJwtCache — סוגר חלון הזדמנות של 30s
//
// הפעולה:
//   • twoFactorEnabled → false
//   • twoFactorMethod → null
//   • twoFactorSecret → null (גם המוצפן נמחק — אסור להשאיר orphan secret)
//   • twoFactorRecoveryCodes → null
//   • המשתמש יוכל להיכנס בלי 2FA ולהגדיר מחדש מהtab Security ב-Settings.
//
// **חשוב**: הפעולה הזו חוטטת בחלון הזדמנות לתוקף שגנב את הסיסמה. השימוש בה
// צריך להיות מינימלי, אחרי וידוא זהות מחוץ למערכת (טלפון/מייל מאומת).

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requirePermission } from "@/lib/api-auth";
import { withAudit } from "@/lib/audit";
import { invalidateJwtCache } from "@/lib/auth";
import { sendEmail } from "@/lib/resend";
import { escapeHtml } from "@/lib/email-utils";
import {
  checkRateLimit,
  ADMIN_SENSITIVE_RATE_LIMIT,
  ADMIN_DISABLE_2FA_GLOBAL_RATE_LIMIT,
} from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// H18 follow-up: מייל הודעה למשתמש שה-2FA שלו כובה. חיוני מסיבות אבטחה:
// אם זה לא היה ביוזמת המשתמש (אדמין compromised וכו') — המייל מאפשר לו
// לאתר את הפעולה ולפעול מיידית. בשבת/חג — sendEmail חוסם מעצמו, וזה תקין
// (ההודעה תתעכב עד מוצאי שבת — לא קריטי, ה-audit log עדיין נכנס).
//
// אבטחה: מציגים adminName ולא adminEmail כדי לא לדלוף email פנימי אם
// המייל הזה דולף החוצה (forwarding, screenshot).
async function notifyUserOf2faDisabled(
  userEmail: string,
  userName: string | null,
  adminName: string | null,
  justification: string,
): Promise<void> {
  const greeting = userName ? `שלום ${escapeHtml(userName)}` : "שלום";
  const adminLabel = adminName ? escapeHtml(adminName) : "מנהל המערכת";
  const html = `
    <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #dc2626;">⚠️ הודעת אבטחה — אימות דו-שלבי כובה</h2>
      <p>${greeting},</p>
      <p>אנו מודיעים לך שאימות דו-שלבי (2FA) על חשבונך ב-MyTipul <strong>כובה</strong> על ידי ${adminLabel}.</p>
      <div style="background: #fef3c7; border: 1px solid #f59e0b; padding: 12px; border-radius: 6px; margin: 16px 0;">
        <strong>הסיבה שצוינה:</strong><br/>
        ${escapeHtml(justification)}
      </div>
      <p style="color: #dc2626; font-weight: bold;">
        אם <u>לא ביקשת</u> את הפעולה הזו — ייתכן שחשבונך נפרץ. אנא בצע/י מיידית:
      </p>
      <ol>
        <li>שנה/י את סיסמת החשבון</li>
        <li>צור/י קשר עם הנהלת המערכת</li>
        <li>הפעל/י מחדש 2FA מ-Settings ← אבטחה</li>
      </ol>
      <p style="color: #6b7280; font-size: 13px; margin-top: 24px;">
        אם הפעולה ביקשת ביוזמתך (לדוגמה: איבדת טלפון ופנית למנהל) — אפשר להתעלם
        מההודעה. מומלץ להפעיל מחדש 2FA בהקדם.
      </p>
    </div>
  `;

  const result = await sendEmail({
    to: userEmail,
    subject: "⚠️ MyTipul — אימות דו-שלבי בחשבונך כובה",
    html,
  });
  if (!result.success && !result.shabbatBlocked) {
    logger.warn("[admin/disable-2fa] notification email failed", {
      userEmail,
      error: result.error,
    });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requirePermission("users.disable_2fa");
    if ("error" in auth) return auth.error;
    const { session } = auth;

    const { id } = await params;

    // Rate-limit מחמיר: אם אדמין נפרץ, מגביל פעולת disable-2FA ל-5 לדקה.
    // המפתח כולל את ה-targetId כדי שאדמין לגיטימי שמעדכן 5 משתמשים שונים
    // לא ייחסם. תוקף שמנסה לכבות 2FA במאסה — ייחסם אחרי 5 קורבנות בדקה.
    const rl = checkRateLimit(
      `admin:disable-2fa:${session.user.id}:${id}`,
      ADMIN_SENSITIVE_RATE_LIMIT,
    );
    if (!rl.allowed) {
      return NextResponse.json(
        { message: "יותר מדי בקשות לכיבוי 2FA. נסה שוב בעוד דקה." },
        { status: 429 }
      );
    }
    // הגנה משנית — global per-admin: לא יותר מ-10 disable-2FA ב-15 דקות מאדמין יחיד.
    const globalRl = checkRateLimit(
      `admin:disable-2fa:global:${session.user.id}`,
      { maxRequests: 10, windowMs: 15 * 60 * 1000 },
    );
    if (!globalRl.allowed) {
      return NextResponse.json(
        { message: "חרגת ממכסת disable-2FA לרבע שעה. אם זה לגיטימי — פנה ל-ADMIN ראשי." },
        { status: 429 }
      );
    }

    let body: { justification?: unknown };
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ message: "גוף בקשה לא תקין" }, { status: 400 });
    }

    const justification =
      typeof body.justification === "string" ? body.justification.trim() : "";

    // ההצדקה חובה — לא לאפשר לאדמין להפעיל בלי לתעד למה.
    // מינימום 10 תווים: דורש משפט הסבר (לא רק "test" או "ok").
    if (justification.length < 10) {
      return NextResponse.json(
        { message: "נדרשת הצדקה כתובה של לפחות 10 תווים (הסבר מדוע כובה 2FA)" },
        { status: 400 }
      );
    }
    if (justification.length > 500) {
      return NextResponse.json(
        { message: "הצדקה ארוכה מדי (מקסימום 500 תווים)" },
        { status: 400 }
      );
    }

    // לא לאפשר disable-2FA על האדמין עצמו דרך ה-endpoint הזה — סיכון נעילה עצמית
    // וגם self-bypass של דרישת 2FA. אדמין שצריך לאפס לעצמו ייאלץ דרך DB ישירות
    // (עם 2-eyes/oversight) או דרך admin אחר.
    if (id === session.user.id) {
      return NextResponse.json(
        { message: "לא ניתן לכבות 2FA לחשבון שלך דרך endpoint זה. השתמש/י בtab Security ב-Settings." },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        twoFactorEnabled: true,
        twoFactorMethod: true,
        twoFactorSecret: true,
        twoFactorRecoveryCodes: true,
      },
    });

    if (!user) {
      return NextResponse.json({ message: "משתמש לא נמצא" }, { status: 404 });
    }

    if (!user.twoFactorEnabled && !user.twoFactorMethod && !user.twoFactorSecret) {
      return NextResponse.json(
        { message: "2FA כבר כבוי למשתמש זה" },
        { status: 400 }
      );
    }

    const previousState = {
      twoFactorEnabled: user.twoFactorEnabled,
      twoFactorMethod: user.twoFactorMethod,
      hadSecret: Boolean(user.twoFactorSecret),
      hadRecoveryCodes: Boolean(user.twoFactorRecoveryCodes),
    };

    await withAudit(
      { kind: "user", session },
      {
        action: "disable_2fa",
        targetType: "user",
        targetId: id,
        details: {
          justification,
          previousState,
          targetUserEmail: user.email,
        },
      },
      async (tx) => {
        await tx.user.update({
          where: { id },
          data: {
            twoFactorEnabled: false,
            twoFactorMethod: null,
            twoFactorSecret: null,
            twoFactorRecoveryCodes: null,
            // H6 (סבב אבטחה 14): bump sessionVersion — admin disable של 2FA
            // הוא פעולה רגישה. tokens קיימים של המשתמש המקור נדחים.
            sessionVersion: { increment: 1 },
          },
        });
      }
    );

    // סוגרים את ה-JWT cache: אם המשתמש הקצה היה באמצע סשן עם requires2FA=true,
    // הסשן הבא יראה enabled=false (ברירת מחדל DB שונתה).
    invalidateJwtCache(id);

    logger.info("[admin/disable-2fa] 2FA disabled by admin", {
      adminId: session.user.id,
      targetUserId: id,
      justificationLength: justification.length,
    });

    // הודעה למשתמש — אסינכרונית, לא חוסמת את ה-response.
    // אם נכשלת — לא קריטי (audit log כבר נכנס; המשתמש יראה ב-UI שה-2FA כבוי).
    // .catch() עוטף כדי שחריגה לא תהיה unhandled rejection.
    if (user.email) {
      notifyUserOf2faDisabled(
        user.email,
        user.name,
        session.user.name ?? null,
        justification,
      ).catch((err) => {
        logger.error("[admin/disable-2fa] notification dispatch threw", {
          err: err instanceof Error ? err.message : String(err),
        });
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("[admin/disable-2fa] error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה בכיבוי 2FA" },
      { status: 500 }
    );
  }
}
