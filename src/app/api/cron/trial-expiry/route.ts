import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { sendEmail } from "@/lib/resend";
import { escapeHtml } from "@/lib/email-utils";
import { logger } from "@/lib/logger";
import { isShabbatOrYomTov } from "@/lib/shabbat";
import { checkCronAuth } from "@/lib/cron-auth";
import { withAudit } from "@/lib/audit";

const SYSTEM_URL = process.env.NEXTAUTH_URL || "https://your-app.onrender.com";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const guard = await checkCronAuth(req);
    if (guard) return guard;

    // Shabbat/Yom Tov — דילוג. cron יומי; ייתפס שוב ביום המחרת.
    if (isShabbatOrYomTov()) {
      logger.info("[cron trial-expiry] דילוג בשבת/חג");
      return NextResponse.json({ skipped: true, reason: "shabbat_or_yomtov" });
    }

    const now = new Date();
    const results = {
      warnings3Days: 0,
      expiredAndBlocked: 0,
      errors: [] as string[],
    };

    // ========================================
    // 1. Warning: 3 days before trial expires
    // ========================================
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const twoDaysFromNow = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);

    const expiringIn3Days = await prisma.user.findMany({
      where: {
        subscriptionStatus: "TRIALING",
        trialEndsAt: {
          gte: twoDaysFromNow,
          lt: threeDaysFromNow,
        },
        isBlocked: false,
        isFreeSubscription: false,
      },
      select: {
        id: true,
        name: true,
        email: true,
        trialEndsAt: true,
      },
    });

    for (const user of expiringIn3Days) {
      if (!user.email) continue;
      try {
        const expiryDate = user.trialEndsAt
          ? new Date(user.trialEndsAt).toLocaleDateString("he-IL", { timeZone: 'Asia/Jerusalem' })
          : "בקרוב";

        await sendEmail({
          to: user.email,
          subject: "תקופת הניסיון שלך מסתיימת בעוד 3 ימים - Tipul",
          html: `
            <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="text-align: center; padding: 20px; background: linear-gradient(135deg, #f59e0b 0%, #ef4444 100%); border-radius: 12px 12px 0 0;">
                <h1 style="color: white; margin: 0; font-size: 24px;">תקופת הניסיון מסתיימת בקרוב</h1>
              </div>
              <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
                <h2 style="color: #333; margin-top: 0;">שלום ${escapeHtml(user.name || "")},</h2>
                <p style="color: #555; font-size: 16px; line-height: 1.6;">
                  תקופת הניסיון שלך מסתיימת בתאריך <strong>${expiryDate}</strong>.
                </p>
                <div style="background: #fef3c7; border: 1px solid #fcd34d; border-radius: 8px; padding: 16px; margin: 20px 0;">
                  <p style="margin: 0 0 8px; color: #92400e; font-weight: bold;">
                    נותרו לך 3 ימים לבחור מסלול מנוי
                  </p>
                  <p style="margin: 0; color: #92400e;">
                    לאחר תום הניסיון, הגישה למערכת תיחסם עד להפעלת מנוי.
                  </p>
                </div>
                <p style="color: #555; font-size: 14px;">
                  כל הנתונים שלך שמורים - בחר מסלול והמשך מאיפה שהפסקת:
                </p>
                <div style="text-align: center; margin: 25px 0;">
                  <a href="${SYSTEM_URL}/dashboard/settings/billing"
                     style="display: inline-block; background: linear-gradient(135deg, #f59e0b, #ef4444); color: white; padding: 14px 36px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px;">
                    בחר מסלול עכשיו
                  </a>
                </div>
                <p style="color: #9ca3af; font-size: 12px; text-align: center;">
                  מייל זה נשלח אוטומטית ממערכת Tipul
                </p>
              </div>
            </div>
          `,
        });
        results.warnings3Days++;
      } catch (err) {
        results.errors.push(`3-day warning for ${user.email}: ${err}`);
      }
    }

    // ========================================
    // 2. Expire & Block: trial ended
    // ========================================
    const expiredTrials = await prisma.user.findMany({
      where: {
        subscriptionStatus: "TRIALING",
        trialEndsAt: {
          lt: now,
        },
        isBlocked: false,
        isFreeSubscription: false,
      },
      select: {
        id: true,
        name: true,
        email: true,
        trialEndsAt: true,
      },
    });

    for (const user of expiredTrials) {
      try {
        // Cursor סיבוב 1.17 Bug 3: לעטוף ב-withAudit כדי לרשום ש-cron חסם
        // משתמש (אחרת אם המשתמש שואל "למה חסמתם?", אין רישום).
        await withAudit(
          { kind: "system", source: "CRON", externalRef: "trial-expiry" },
          {
            action: "block_user_trial_expired",
            targetType: "user",
            targetId: user.id,
            details: {
              // forensic snapshot — אם המשתמש יישאל "למה חסמתם?" בעוד שנה,
              // השדות האלה עוזרים לאתר אותו גם אם נמחק/שונה (Cursor סוכן 2).
              email: user.email,
              name: user.name,
              previousStatus: "TRIALING",
              newStatus: "CANCELLED",
              trialEndsAt: user.trialEndsAt?.toISOString() ?? null,
              blockedAt: now.toISOString(),
              reason: "trial_period_ended",
            },
          },
          async (tx) =>
            tx.user.update({
              where: { id: user.id },
              data: {
                isBlocked: true,
                subscriptionStatus: "CANCELLED",
              },
            })
        );

        if (user.email) {
          const billingUrl = `${SYSTEM_URL}/dashboard/settings/billing`;
          await sendEmail({
            to: user.email,
            subject: "תקופת הניסיון הסתיימה - הפעל מנוי כדי להמשיך - Tipul",
            html: `
              <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="text-align: center; padding: 20px; background: #dc2626; border-radius: 12px 12px 0 0;">
                  <h1 style="color: white; margin: 0; font-size: 24px;">תקופת הניסיון הסתיימה</h1>
                </div>
                <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
                  <h2 style="color: #333; margin-top: 0;">שלום ${escapeHtml(user.name || "")},</h2>
                  <p style="color: #555; font-size: 16px; line-height: 1.6;">
                    תקופת הניסיון שלך ב-Tipul הסתיימה, והגישה למערכת הוגבלה.
                  </p>
                  <div style="background: #fef2f2; border: 2px solid #ef4444; border-radius: 8px; padding: 16px; margin: 20px 0;">
                    <p style="margin: 0 0 8px; color: #991b1b; font-weight: bold;">
                      כדי להמשיך לנהל את המטופלים והפגישות שלך, יש להפעיל מנוי.
                    </p>
                    <p style="margin: 0; color: #991b1b;">
                      כל הנתונים שלך שמורים ומאובטחים - ברגע שתפעיל מנוי, הכל יחזור לעבוד מיד.
                    </p>
                  </div>
                  <div style="text-align: center; margin: 25px 0;">
                    <a href="${billingUrl}"
                       style="display: inline-block; background: #4f46e5; color: white; padding: 16px 40px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 18px;">
                      הפעל מנוי עכשיו
                    </a>
                  </div>
                  <p style="color: #9ca3af; font-size: 13px; text-align: center;">
                    לשאלות: support@tipul.co.il
                  </p>
                </div>
              </div>
            `,
          });
        }

        if (ADMIN_EMAIL) {
          await sendEmail({
            to: ADMIN_EMAIL,
            subject: `ניסיון פג וחסום - ${user.name || user.email}`,
            html: `
              <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <div style="background: #1e293b; padding: 15px 20px; border-radius: 8px 8px 0 0;">
                  <h2 style="color: white; margin: 0; font-size: 18px;">ניסיון פג - Tipul Admin</h2>
                </div>
                <div style="background: #ffffff; padding: 25px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 8px 8px;">
                  <div style="background: #fef2f2; border-right: 4px solid #ef4444; padding: 16px; border-radius: 4px; margin-bottom: 16px;">
                    <p style="margin: 0; color: #1e293b; font-size: 15px; line-height: 1.6;">
                      תקופת הניסיון של <strong>${escapeHtml(user.name || "")}</strong> (${escapeHtml(user.email ?? "")}) הסתיימה.<br/>
                      המשתמש <strong>נחסם</strong> והסטטוס שונה ל-CANCELLED.
                    </p>
                  </div>
                  <p style="color: #64748b; font-size: 14px; margin: 0;">
                    <strong>פעולה:</strong> ליצור קשר עם המשתמש ולעודד הפעלת מנוי.
                  </p>
                </div>
              </div>
            `,
          });
        }

        results.expiredAndBlocked++;
      } catch (err) {
        results.errors.push(`Expire+block for ${user.email}: ${err}`);
      }
    }

    logger.info("Trial expiry cron results:", { data: results });

    return NextResponse.json({
      success: true,
      timestamp: now.toISOString(),
      results,
    });
  } catch (error) {
    logger.error("Trial expiry cron error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: "שגיאה בהרצת בדיקת תפוגת ניסיון" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
