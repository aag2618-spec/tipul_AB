// src/app/api/cron/subscription-reminders/route.ts
// CRON Job: שליחת תזכורות מנוי אוטומטיות + הודעות לאדמין
// מומלץ להריץ: כל יום ב-09:00 בבוקר

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { sendEmail } from "@/lib/resend";
import { PLAN_NAMES, MONTHLY_PRICES } from "@/lib/pricing";
import { escapeHtml } from "@/lib/email-utils";
import { logger } from "@/lib/logger";
import { isShabbatOrYomTov } from "@/lib/shabbat";

// ========================================
// הגדרות
// ========================================

const GRACE_PERIOD_DAYS = 7;
const SYSTEM_URL = process.env.NEXTAUTH_URL || "https://your-app.onrender.com";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL; // המייל שלך - בעל המערכת

// הפניה מקוצרת למחירים (לתאימות עם שאר הקוד)
const PLAN_PRICES = MONTHLY_PRICES;

// ========================================
// API Route
// ========================================

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    // אימות CRON secret
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      return NextResponse.json({ message: "CRON_SECRET not configured" }, { status: 503 });
    }
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ message: "לא מורשה" }, { status: 401 });
    }

    // Shabbat/Yom Tov — דילוג. cron יומי; ייתפס שוב ביום המחרת.
    if (isShabbatOrYomTov()) {
      logger.info("[cron subscription-reminders] דילוג בשבת/חג");
      return NextResponse.json({ skipped: true, reason: "shabbat_or_yomtov" });
    }

    const now = new Date();
    const results = {
      reminders7days: 0,
      reminders3days: 0,
      reminders1day: 0,
      gracePeriodReminders: 0,
      expiredBlocked: 0,
      adminNotifications: 0,
      errors: [] as string[],
    };

    // ========================================
    // 1. תזכורת 7 ימים לפני תפוגת המנוי
    // ========================================
    const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const sixDaysFromNow = new Date(now.getTime() + 6 * 24 * 60 * 60 * 1000);

    const expiringIn7Days = await prisma.user.findMany({
      where: {
        subscriptionStatus: { in: ["ACTIVE", "CANCELLED"] },
        subscriptionEndsAt: {
          gte: sixDaysFromNow,
          lte: sevenDaysFromNow,
        },
        isBlocked: false,
      },
      select: {
        id: true,
        name: true,
        email: true,
        aiTier: true,
        subscriptionEndsAt: true,
      },
    });

    for (const user of expiringIn7Days) {
      if (!user.email) continue;
      try {
        await sendSubscriptionReminderEmail(user, 7);
        results.reminders7days++;
      } catch (err) {
        results.errors.push(`7-day reminder failed for ${user.email}: ${err}`);
      }
    }

    // ========================================
    // 2. תזכורת 3 ימים לפני תפוגת המנוי
    // ========================================
    const threeDaysFromNow = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
    const twoDaysFromNow = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);

    const expiringIn3Days = await prisma.user.findMany({
      where: {
        subscriptionStatus: { in: ["ACTIVE", "CANCELLED"] },
        subscriptionEndsAt: {
          gte: twoDaysFromNow,
          lte: threeDaysFromNow,
        },
        isBlocked: false,
      },
      select: {
        id: true,
        name: true,
        email: true,
        aiTier: true,
        subscriptionEndsAt: true,
      },
    });

    for (const user of expiringIn3Days) {
      if (!user.email) continue;
      try {
        await sendSubscriptionReminderEmail(user, 3);
        results.reminders3days++;
      } catch (err) {
        results.errors.push(`3-day reminder failed for ${user.email}: ${err}`);
      }
    }

    // ========================================
    // 3. תזכורת ביום האחרון (0-1 ימים)
    // ========================================
    const oneDayFromNow = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000);

    const expiringTomorrow = await prisma.user.findMany({
      where: {
        subscriptionStatus: { in: ["ACTIVE", "CANCELLED"] },
        subscriptionEndsAt: {
          gte: now,
          lte: oneDayFromNow,
        },
        isBlocked: false,
      },
      select: {
        id: true,
        name: true,
        email: true,
        aiTier: true,
        subscriptionEndsAt: true,
      },
    });

    for (const user of expiringTomorrow) {
      if (!user.email) continue;
      try {
        await sendLastDayReminderEmail(user);
        results.reminders1day++;
      } catch (err) {
        results.errors.push(`Last day reminder failed for ${user.email}: ${err}`);
      }
    }

    // ========================================
    // 4. תזכורות בתקופת החסד (כבר פג)
    // ========================================
    const gracePeriodEnd = new Date(now.getTime() - GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);

    const inGracePeriod = await prisma.user.findMany({
      where: {
        subscriptionStatus: { in: ["ACTIVE", "CANCELLED"] },
        subscriptionEndsAt: {
          lt: now,
          gte: gracePeriodEnd,
        },
        isBlocked: false,
      },
      select: {
        id: true,
        name: true,
        email: true,
        aiTier: true,
        subscriptionEndsAt: true,
      },
    });

    for (const user of inGracePeriod) {
      if (!user.email || !user.subscriptionEndsAt) continue;
      
      const daysSinceExpiry = Math.floor(
        (now.getTime() - user.subscriptionEndsAt.getTime()) / (24 * 60 * 60 * 1000)
      );
      
      // שולחים תזכורת ביום 1, 3, 5, 7 של תקופת החסד
      if ([1, 3, 5, 7].includes(daysSinceExpiry)) {
        try {
          const daysLeft = GRACE_PERIOD_DAYS - daysSinceExpiry;
          await sendGracePeriodEmail(user, daysLeft);
          results.gracePeriodReminders++;

          // שולחים גם הודעה לאדמין
          if (ADMIN_EMAIL) {
            await sendAdminGraceAlert(user, daysLeft);
            results.adminNotifications++;
          }
        } catch (err) {
          results.errors.push(`Grace period reminder failed for ${user.email}: ${err}`);
        }
      }
    }

    // ========================================
    // 5. חסימת מנויים שתקופת החסד נגמרה
    // ========================================
    const fullyExpired = await prisma.user.findMany({
      where: {
        subscriptionStatus: { in: ["ACTIVE", "CANCELLED"] },
        subscriptionEndsAt: {
          lt: gracePeriodEnd,
        },
        isBlocked: false,
      },
      select: {
        id: true,
        name: true,
        email: true,
        aiTier: true,
      },
    });

    for (const user of fullyExpired) {
      try {
        // עדכון סטטוס ל-CANCELLED
        await prisma.user.update({
          where: { id: user.id },
          data: {
            subscriptionStatus: "CANCELLED",
          },
        });

        // שליחת מייל סופי למנוי
        if (user.email) {
          await sendSubscriptionExpiredEmail(user);
        }

        // הודעה לאדמין
        if (ADMIN_EMAIL) {
          await sendAdminExpiredAlert(user);
          results.adminNotifications++;
        }

        results.expiredBlocked++;
      } catch (err) {
        results.errors.push(`Expired blocking failed for ${user.email}: ${err}`);
      }
    }

    // ========================================
    // 5.5 תזכורות ניסיון - יום 7 ויום 12
    // ========================================
    
    // תזכורת יום 7 - חצי מתקופת הניסיון
    const trialDay7Start = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const trialDay7End = new Date(now.getTime() + 6 * 24 * 60 * 60 * 1000);
    
    const trialReminder7 = await prisma.user.findMany({
      where: {
        subscriptionStatus: "TRIALING",
        trialEndsAt: {
          gte: trialDay7End,
          lt: trialDay7Start,
        },
        isBlocked: false,
        emailVerified: { not: null },
      },
      select: { id: true, name: true, email: true, aiTier: true, trialEndsAt: true },
    });

    for (const user of trialReminder7) {
      try {
        if (user.email) {
          await sendEmail({
            to: user.email,
            subject: "נותרו לך 7 ימים בתקופת הניסיון - Tipul",
            html: `
              <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #1e293b;">שלום ${escapeHtml(user.name || "")},</h2>
                <p>נותרו לך <strong>7 ימים</strong> בתקופת הניסיון שלך.</p>
                <p>נהנה מהמערכת? בחר מסלול ותמשיך לנהל את הפרקטיקה שלך ללא הפסקה:</p>
                <div style="text-align: center; margin: 20px 0;">
                  <a href="${SYSTEM_URL}/dashboard/settings/billing" 
                     style="background: linear-gradient(135deg, #0284c7, #7c3aed); color: white; padding: 12px 30px; border-radius: 8px; text-decoration: none; font-weight: bold;">
                    בחר מסלול
                  </a>
                </div>
                <p style="color: #64748b; font-size: 13px;">כל הנתונים שלך שמורים - המעבר חלק ומיידי.</p>
              </div>
            `,
          });
        }
      } catch (err) {
        results.errors.push(`Trial 7-day reminder for ${user.email}: ${err}`);
      }
    }

    // תזכורת יום 12 - יומיים לפני סוף
    const trialDay2Start = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000);
    const trialDay2End = new Date(now.getTime() + 1 * 24 * 60 * 60 * 1000);
    
    const trialReminder2 = await prisma.user.findMany({
      where: {
        subscriptionStatus: "TRIALING",
        trialEndsAt: {
          gte: trialDay2End,
          lt: trialDay2Start,
        },
        isBlocked: false,
        emailVerified: { not: null },
      },
      select: { id: true, name: true, email: true, aiTier: true, trialEndsAt: true },
    });

    for (const user of trialReminder2) {
      try {
        if (user.email) {
          await sendEmail({
            to: user.email,
            subject: "נותרו יומיים לסיום תקופת הניסיון! - Tipul",
            html: `
              <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #1e293b;">שלום ${escapeHtml(user.name || "")},</h2>
                <p style="color: #dc2626; font-weight: bold;">תקופת הניסיון שלך מסתיימת בעוד יומיים!</p>
                <p>כדי להמשיך ליהנות מכל התכונות ולשמור על הנתונים שלך נגישים, בחר עכשיו מסלול מנוי:</p>
                <div style="text-align: center; margin: 20px 0;">
                  <a href="${SYSTEM_URL}/dashboard/settings/billing" 
                     style="background: linear-gradient(135deg, #dc2626, #9333ea); color: white; padding: 14px 36px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px;">
                    בחר מסלול עכשיו
                  </a>
                </div>
                <p style="color: #64748b; font-size: 13px;">לאחר סיום הניסיון, תהיה לך תקופת חסד של 7 ימים. לאחר מכן הגישה תוגבל.</p>
              </div>
            `,
          });
        }
      } catch (err) {
        results.errors.push(`Trial 2-day reminder for ${user.email}: ${err}`);
      }
    }

    // ========================================
    // 6. TRIAL שפג תוקף
    // ========================================
    const expiredTrials = await prisma.user.findMany({
      where: {
        subscriptionStatus: "TRIALING",
        trialEndsAt: {
          lt: now,
        },
        isBlocked: false,
      },
      select: {
        id: true,
        name: true,
        email: true,
        aiTier: true,
        trialEndsAt: true,
      },
    });

    for (const user of expiredTrials) {
      try {
        await prisma.user.update({
          where: { id: user.id },
          data: {
            subscriptionStatus: "PAST_DUE",
          },
        });

        if (user.email) {
          await sendTrialExpiredEmail(user);
        }

        if (ADMIN_EMAIL) {
          await sendEmail({
            to: ADMIN_EMAIL,
            subject: `📋 תקופת ניסיון הסתיימה - ${user.name}`,
            html: createAdminNotificationHtml(
              `תקופת הניסיון של <strong>${escapeHtml(user.name || "")}</strong> (${escapeHtml(user.email ?? "")}) הסתיימה.`,
              "כדאי ליצור קשר ולעודד מעבר למנוי בתשלום.",
              "info"
            ),
          });
          results.adminNotifications++;
        }
      } catch (err) {
        results.errors.push(`Trial expired for ${user.email}: ${err}`);
      }
    }

    logger.info("Subscription reminders results:", { data: results });

    return NextResponse.json({
      success: true,
      timestamp: now.toISOString(),
      results,
    });
  } catch (error) {
    logger.error("Subscription reminders cron error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: "שגיאה בהרצת תזכורות מנויים" },
      { status: 500 }
    );
  }
}

// ========================================
// פונקציות שליחת מייל למנוי
// ========================================

async function sendSubscriptionReminderEmail(
  user: { name: string | null; email: string | null; aiTier: string; subscriptionEndsAt: Date | null },
  daysUntilExpiry: number
) {
  if (!user.email) return;
  
  const planName = PLAN_NAMES[user.aiTier] || user.aiTier;
  const price = PLAN_PRICES[user.aiTier] || 0;
  const expiryDate = user.subscriptionEndsAt 
    ? new Date(user.subscriptionEndsAt).toLocaleDateString("he-IL", { timeZone: 'Asia/Jerusalem' }) 
    : "בקרוב";
  const billingUrl = `${SYSTEM_URL}/dashboard/settings/billing`;

  await sendEmail({
    to: user.email,
    subject: `⏰ תוקף המנוי שלך מסתיים בעוד ${daysUntilExpiry} ימים - חדש עכשיו`,
    html: `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; padding: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px 12px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 24px;">תוקף המנוי הולך להסתיים</h1>
        </div>
        
        <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
          <h2 style="color: #333; margin-top: 0;">שלום ${escapeHtml(user.name || "")},</h2>
          
          <p style="color: #555; font-size: 16px; line-height: 1.6;">
            תוקף המנוי שלך במסלול <strong>${planName}</strong> מסתיים בתאריך 
            <strong>${expiryDate}</strong>.
          </p>
          
          <div style="background: #fef3c7; border: 1px solid #fcd34d; border-radius: 8px; padding: 16px; margin: 20px 0;">
            <p style="margin: 0 0 8px; color: #92400e;">
              ⏰ <strong>נותרו לך ${daysUntilExpiry} ימים</strong> לחדש את המנוי
            </p>
            <p style="margin: 0; color: #92400e;">
              💳 מחיר המנוי: <strong>₪${price} לחודש</strong> בלבד
            </p>
          </div>
          
          <p style="color: #555; font-size: 14px;">
            כדי להמשיך להשתמש במערכת ללא הפסקה, נא לחדש את המנוי:
          </p>
          
          <div style="text-align: center; margin: 25px 0;">
            <a href="${billingUrl}" 
               style="display: inline-block; background: #4f46e5; color: white; padding: 16px 40px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 18px;">
              💳 חדש את המנוי עכשיו
            </a>
          </div>
          
          <p style="color: #9ca3af; font-size: 13px; text-align: center;">
            לאחר חידוש, המנוי יתחדש אוטומטית מדי חודש. ניתן לבטל בכל עת.
          </p>
          
          <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
          
          <p style="color: #9ca3af; font-size: 12px; text-align: center;">
            מייל זה נשלח אוטומטית ממערכת Tipul
          </p>
        </div>
      </div>
    `,
  });
}

async function sendLastDayReminderEmail(
  user: { name: string | null; email: string | null; aiTier: string; subscriptionEndsAt: Date | null }
) {
  if (!user.email) return;
  
  const planName = PLAN_NAMES[user.aiTier] || user.aiTier;
  const price = PLAN_PRICES[user.aiTier] || 0;
  const billingUrl = `${SYSTEM_URL}/dashboard/settings/billing`;

  await sendEmail({
    to: user.email,
    subject: "🚨 תוקף המנוי שלך מסתיים היום! חדש עכשיו",
    html: `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; padding: 20px; background: linear-gradient(135deg, #f59e0b 0%, #ef4444 100%); border-radius: 12px 12px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 24px;">🚨 המנוי מסתיים היום!</h1>
        </div>
        
        <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
          <h2 style="color: #333; margin-top: 0;">שלום ${escapeHtml(user.name || "")},</h2>
          
          <p style="color: #555; font-size: 16px; line-height: 1.6;">
            תוקף המנוי שלך במסלול <strong>${planName}</strong> מסתיים <strong>היום</strong>.
          </p>
          
          <div style="background: #fef2f2; border: 2px solid #ef4444; border-radius: 8px; padding: 16px; margin: 20px 0;">
            <p style="margin: 0 0 8px; color: #991b1b; font-weight: bold;">
              ⚠️ אם לא תחדש, הגישה למערכת תיחסם תוך 7 ימים.
            </p>
            <p style="margin: 0; color: #991b1b;">
              💳 חדש עכשיו ב-<strong>₪${price} לחודש</strong> בלבד
            </p>
          </div>
          
          <div style="text-align: center; margin: 25px 0;">
            <a href="${billingUrl}" 
               style="display: inline-block; background: #ef4444; color: white; padding: 16px 40px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 18px;">
              💳 חדש את המנוי עכשיו
            </a>
          </div>
          
          <p style="color: #9ca3af; font-size: 13px; text-align: center;">
            הנתונים שלך שמורים ומאובטחים. לאחר חידוש הכל חוזר לעבוד כרגיל.
          </p>
        </div>
      </div>
    `,
  });
}

async function sendGracePeriodEmail(
  user: { name: string | null; email: string | null; aiTier: string },
  daysLeft: number
) {
  if (!user.email) return;
  
  const billingUrl = `${SYSTEM_URL}/dashboard/settings/billing`;
  const urgencyColor = daysLeft <= 2 ? "#dc2626" : "#f59e0b";
  const planName = PLAN_NAMES[user.aiTier] || user.aiTier;
  const price = PLAN_PRICES[user.aiTier] || 0;
  
  // חישוב תאריך חסימה
  const israelNowStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
  const blockDate = new Date(`${israelNowStr}T12:00:00Z`);
  blockDate.setDate(blockDate.getDate() + daysLeft);
  const blockDateStr = blockDate.toLocaleDateString("he-IL", { timeZone: 'Asia/Jerusalem' });

  await sendEmail({
    to: user.email,
    subject: `🚨 המנוי שלך פג! הגישה תיחסם ב-${blockDateStr}`,
    html: `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; padding: 20px; background: ${urgencyColor}; border-radius: 12px 12px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 24px;">🚨 תוקף המנוי פג!</h1>
        </div>
        
        <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
          <h2 style="color: #333; margin-top: 0;">שלום ${escapeHtml(user.name || "")},</h2>
          
          <p style="color: #555; font-size: 16px; line-height: 1.6;">
            תוקף המנוי שלך במסלול <strong>${planName}</strong> פג. 
          </p>
          
          <div style="background: #fef2f2; border: 2px solid ${urgencyColor}; border-radius: 8px; padding: 16px; margin: 20px 0;">
            <p style="margin: 0 0 10px; color: #991b1b; font-size: 16px; font-weight: bold;">
              ⏰ נותרו לך ${daysLeft} ימים בלבד לחדש!
            </p>
            <p style="margin: 0 0 8px; color: #991b1b; font-size: 14px;">
              📅 הגישה למערכת תיחסם בתאריך: <strong>${blockDateStr}</strong>
            </p>
            <p style="margin: 0; color: #991b1b; font-size: 14px;">
              ${daysLeft <= 2 
                ? "⚠️ <strong>זמן קצר מאוד נותר!</strong> חדש מיד כדי לא לאבד גישה." 
                : "נא לחדש בהקדם כדי להמשיך להשתמש במערכת ובכל הנתונים שלך."}
            </p>
          </div>
          
          <div style="text-align: center; margin: 25px 0;">
            <a href="${billingUrl}" 
               style="display: inline-block; background: ${urgencyColor}; color: white; padding: 16px 40px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 18px;">
              💳 חדש את המנוי - ₪${price}/חודש
            </a>
          </div>
          
          <p style="color: #9ca3af; font-size: 13px; text-align: center;">
            הנתונים שלך שמורים ומאובטחים. ברגע שתחדש, הכל חוזר לעבוד מיד.
          </p>
        </div>
      </div>
    `,
  });
}

async function sendSubscriptionExpiredEmail(
  user: { name: string | null; email: string | null }
) {
  if (!user.email) return;
  
  const billingUrl = `${SYSTEM_URL}/dashboard/settings/billing`;

  await sendEmail({
    to: user.email,
    subject: "❌ המנוי שלך נחסם - חדש עכשיו",
    html: `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; padding: 20px; background: #dc2626; border-radius: 12px 12px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 24px;">❌ המנוי נחסם</h1>
        </div>
        
        <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
          <h2 style="color: #333; margin-top: 0;">שלום ${escapeHtml(user.name || "")},</h2>
          
          <p style="color: #555; font-size: 16px; line-height: 1.6;">
            לצערנו, המנוי שלך נחסם עקב אי-תשלום.
          </p>
          
          <p style="color: #555; font-size: 16px; line-height: 1.6;">
            <strong>הנתונים שלך שמורים במערכת</strong> ומחכים לך. 
            ברגע שתחדש את המנוי, הכל יחזור לעבוד כרגיל.
          </p>
          
          <div style="text-align: center; margin: 25px 0;">
            <a href="${billingUrl}" 
               style="display: inline-block; background: #4f46e5; color: white; padding: 16px 40px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 18px;">
              חדש את המנוי
            </a>
          </div>
          
          <p style="color: #9ca3af; font-size: 12px; text-align: center;">
            לשאלות: support@tipul.co.il
          </p>
        </div>
      </div>
    `,
  });
}

async function sendTrialExpiredEmail(
  user: { name: string | null; email: string | null; aiTier: string }
) {
  if (!user.email) return;
  
  const billingUrl = `${SYSTEM_URL}/dashboard/settings/billing`;
  const planName = PLAN_NAMES[user.aiTier] || user.aiTier;
  const price = PLAN_PRICES[user.aiTier] || 0;

  await sendEmail({
    to: user.email,
    subject: "🎉 תקופת הניסיון הסתיימה - המשך עם Tipul!",
    html: `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; padding: 20px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 12px 12px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 24px;">תקופת הניסיון הסתיימה</h1>
        </div>
        
        <div style="background: #ffffff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
          <h2 style="color: #333; margin-top: 0;">שלום ${escapeHtml(user.name || "")},</h2>
          
          <p style="color: #555; font-size: 16px; line-height: 1.6;">
            תודה שניסית את Tipul! תקופת הניסיון שלך הסתיימה.
          </p>
          
          <p style="color: #555; font-size: 16px; line-height: 1.6;">
            כדי להמשיך לנהל את המטופלים, הפגישות והתשלומים שלך, 
            הפעל מנוי במסלול <strong>${planName}</strong> ב-<strong>₪${price}/חודש</strong> בלבד.
          </p>
          
          <div style="text-align: center; margin: 25px 0;">
            <a href="${billingUrl}" 
               style="display: inline-block; background: #4f46e5; color: white; padding: 16px 40px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 18px;">
              הפעל מנוי עכשיו
            </a>
          </div>
        </div>
      </div>
    `,
  });
}

// ========================================
// פונקציות הודעות לאדמין (לך!)
// ========================================

async function sendAdminGraceAlert(
  user: { name: string | null; email: string | null; aiTier: string },
  daysLeft: number
) {
  if (!ADMIN_EMAIL) return;

  await sendEmail({
    to: ADMIN_EMAIL,
    subject: `⚠️ מנוי בתקופת חסד - ${user.name} (${daysLeft} ימים נותרו)`,
    html: createAdminNotificationHtml(
      `<strong>${escapeHtml(user.name || "")}</strong> (${escapeHtml(user.email ?? "")}) נמצא בתקופת חסד.<br/>
       מסלול: ${PLAN_NAMES[user.aiTier] || user.aiTier}<br/>
       <strong>נותרו ${daysLeft} ימים</strong> לפני חסימה.`,
      daysLeft <= 2 
        ? "כדאי ליצור קשר ישיר עם המנוי!" 
        : "המנוי קיבל מייל תזכורת אוטומטי.",
      daysLeft <= 2 ? "urgent" : "warning"
    ),
  });
}

async function sendAdminExpiredAlert(
  user: { name: string | null; email: string | null; aiTier: string }
) {
  if (!ADMIN_EMAIL) return;

  await sendEmail({
    to: ADMIN_EMAIL,
    subject: `❌ מנוי נחסם - ${user.name}`,
    html: createAdminNotificationHtml(
      `המנוי של <strong>${escapeHtml(user.name || "")}</strong> (${escapeHtml(user.email ?? "")}) <strong>נחסם</strong> עקב אי-תשלום.<br/>
       מסלול: ${PLAN_NAMES[user.aiTier] || user.aiTier}`,
      "המנוי קיבל מייל עם קישור לחידוש. הנתונים שלו שמורים.",
      "error"
    ),
  });
}

/**
 * HTML template להודעות אדמין - נקי ומקצועי
 */
function createAdminNotificationHtml(
  message: string,
  action: string,
  type: "info" | "warning" | "urgent" | "error" | "success"
): string {
  const colors = {
    info: { bg: "#f0f9ff", border: "#0ea5e9", icon: "ℹ️" },
    warning: { bg: "#fffbeb", border: "#f59e0b", icon: "⚠️" },
    urgent: { bg: "#fef2f2", border: "#ef4444", icon: "🚨" },
    error: { bg: "#fef2f2", border: "#dc2626", icon: "❌" },
    success: { bg: "#f0fdf4", border: "#22c55e", icon: "✅" },
  };

  const c = colors[type];

  return `
    <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: #1e293b; padding: 15px 20px; border-radius: 8px 8px 0 0;">
        <h2 style="color: white; margin: 0; font-size: 18px;">${c.icon} הודעת מערכת - Tipul Admin</h2>
      </div>
      
      <div style="background: #ffffff; padding: 25px; border: 1px solid #e2e8f0; border-top: none;">
        <div style="background: ${c.bg}; border-right: 4px solid ${c.border}; padding: 16px; border-radius: 4px; margin-bottom: 16px;">
          <p style="margin: 0; color: #1e293b; font-size: 15px; line-height: 1.6;">${message}</p>
        </div>
        
        <p style="color: #64748b; font-size: 14px; margin: 0;">
          <strong>פעולה:</strong> ${action}
        </p>
      </div>
      
      <div style="background: #f8fafc; padding: 12px 20px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 8px 8px;">
        <p style="margin: 0; color: #94a3b8; font-size: 12px; text-align: center;">
          ${new Date().toLocaleString("he-IL", { timeZone: 'Asia/Jerusalem' })} | 
          <a href="${SYSTEM_URL}/admin/billing" style="color: #0ea5e9;">פאנל ניהול</a>
        </p>
      </div>
    </div>
  `;
}
