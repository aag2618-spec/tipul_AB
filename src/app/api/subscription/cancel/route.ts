// src/app/api/subscription/cancel/route.ts
// API לביטול מנוי - המנוי ימשיך עד סוף התקופה הנוכחית
// כולל חישוב התאמת הנחה לביטול מוקדם

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { sendEmail } from "@/lib/resend";
import { checkRateLimit, SUBSCRIPTION_RATE_LIMIT, rateLimitResponse } from "@/lib/rate-limit";
import { PLAN_NAMES, PRICING } from "@/lib/pricing";
import { escapeHtml } from "@/lib/email-utils";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/api-auth";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const SYSTEM_URL = process.env.NEXTAUTH_URL || "";

// ========================================
// חישוב מחיר הוגן לביטול מוקדם
// ========================================

function calculateFairPrice(tier: string, monthsUsed: number): number {
  const pricing = PRICING[tier];
  if (!pricing) return 0;
  
  // בוחר את החבילה הטובה ביותר (הזולה ביותר) ללקוח
  if (monthsUsed >= 12) return pricing[12];
  if (monthsUsed >= 6) return pricing[6] + (monthsUsed - 6) * pricing[1];
  if (monthsUsed >= 3) return pricing[3] + (monthsUsed - 3) * pricing[1];
  return monthsUsed * pricing[1];
}

function calculateCancellationAdjustment(
  tier: string,
  totalMonths: number,
  monthsUsed: number,
  totalPaid: number
): { adjustment: number; fairPrice: number; paidSoFar: number } {
  const fairPrice = calculateFairPrice(tier, monthsUsed);
  const paidSoFar = Math.round((totalPaid / totalMonths) * monthsUsed);
  const adjustment = Math.max(0, fairPrice - paidSoFar);
  
  return { adjustment, fairPrice, paidSoFar };
}

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    // Rate limiting
    const rateCheck = checkRateLimit(`sub_cancel:${userId}`, SUBSCRIPTION_RATE_LIMIT);
    if (!rateCheck.allowed) {
      return rateLimitResponse(rateCheck);
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        aiTier: true,
        subscriptionStatus: true,
        subscriptionStartedAt: true,
        subscriptionEndsAt: true,
      },
    });

    if (!user) {
      return NextResponse.json({ message: "משתמש לא נמצא" }, { status: 404 });
    }

    if (user.subscriptionStatus !== "ACTIVE" && user.subscriptionStatus !== "TRIALING") {
      return NextResponse.json({ message: "אין מנוי פעיל לביטול" }, { status: 400 });
    }

    // ========================================
    // חישוב התאמת הנחה (אם רלוונטי)
    // ========================================
    let adjustment = 0;
    let adjustmentDetails = "";

    if (user.subscriptionStartedAt && user.subscriptionEndsAt) {
      const start = new Date(user.subscriptionStartedAt);
      const end = new Date(user.subscriptionEndsAt);
      const now = new Date();
      
      const totalMs = end.getTime() - start.getTime();
      const usedMs = now.getTime() - start.getTime();
      const totalMonths = Math.round(totalMs / (30 * 24 * 60 * 60 * 1000));
      const monthsUsed = Math.max(1, Math.ceil(usedMs / (30 * 24 * 60 * 60 * 1000)));
      
      // רק אם זו תקופה רב-חודשית (יש הנחה)
      if (totalMonths > 1) {
        // שליפת התשלום האחרון לדעת כמה שולם
        const lastPayment = await prisma.subscriptionPayment.findFirst({
          where: { userId: user.id, status: "PAID" },
          orderBy: { paidAt: "desc" },
          select: { amount: true },
        });
        
        const totalPaid = lastPayment ? Number(lastPayment.amount) : 0;
        
        if (totalPaid > 0) {
          const calc = calculateCancellationAdjustment(user.aiTier, totalMonths, monthsUsed, totalPaid);
          adjustment = calc.adjustment;
          
          if (adjustment > 0) {
            adjustmentDetails = `שימוש: ${monthsUsed}/${totalMonths} חודשים. מחיר הוגן: ₪${calc.fairPrice}. שולם יחסי: ₪${calc.paidSoFar}. הפרש: ₪${adjustment}`;
          }
        }
      }
    }

    // ========================================
    // עדכון סטטוס המנוי
    // ========================================
    await prisma.user.update({
      where: { id: user.id },
      data: {
        subscriptionStatus: "CANCELLED",
      },
    });

    // יצירת רשומת חיוב אם יש הפרש
    if (adjustment > 0) {
      await prisma.subscriptionPayment.create({
        data: {
          userId: user.id,
          amount: adjustment,
          currency: "ILS",
          status: "PENDING",
          description: `התאמת הנחה - ביטול מוקדם. ${adjustmentDetails}`,
          periodStart: user.subscriptionStartedAt || new Date(),
          periodEnd: new Date(),
        },
      });
    }

    // התראה למשתמש
    const adjustmentNote = adjustment > 0 
      ? ` הערה: בגלל ביטול מוקדם של מנוי מוזל, יחויב הפרש של ₪${adjustment}.`
      : "";

    await prisma.notification.create({
      data: {
        userId: user.id,
        type: "CUSTOM",
        title: "המנוי בוטל",
        content: `המנוי שלך בוטל. תוכל להמשיך להשתמש עד ${user.subscriptionEndsAt ? new Date(user.subscriptionEndsAt).toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" }) : "סוף התקופה"}.${adjustmentNote}`,
        status: "PENDING",
      },
    });

    // התראה לאדמין
    await prisma.adminAlert.create({
      data: {
        userId: user.id,
        type: "SUBSCRIPTION_EXPIRED",
        title: "מנוי בוטל על ידי המשתמש",
        message: `${user.name} (${user.email}) ביטל את המנוי במסלול ${PLAN_NAMES[user.aiTier] || user.aiTier}${adjustment > 0 ? `. הפרש הנחה: ₪${adjustment}` : ""}`,
        priority: "MEDIUM",
      },
    });

    // 📧 מייל אישור למנוי
    if (user.email) {
      const billingUrl = `${SYSTEM_URL}/dashboard/settings/billing`;
      await sendEmail({
        to: user.email,
        subject: "אישור ביטול מנוי",
        html: `
          <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="text-align: center; padding: 20px; background: #6b7280; border-radius: 12px 12px 0 0;">
              <h1 style="color: white; margin: 0;">אישור ביטול מנוי</h1>
            </div>
            <div style="background: #fff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
              <h2 style="color: #333; margin-top: 0;">שלום ${escapeHtml(user.name || "")},</h2>
              <p style="color: #555; font-size: 16px; line-height: 1.6;">
                המנוי שלך בוטל בהצלחה.
              </p>
              <div style="background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; padding: 16px; margin: 20px 0;">
                <p style="margin: 0 0 8px; color: #166534;">
                  ✅ תוכל להמשיך להשתמש עד: <strong>${user.subscriptionEndsAt ? new Date(user.subscriptionEndsAt).toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" }) : "סוף התקופה"}</strong>
                </p>
                <p style="margin: 0; color: #166534;">
                  ✅ הנתונים שלך שמורים ומאובטחים
                </p>
              </div>
              ${adjustment > 0 ? `
              <div style="background: #fffbeb; border: 1px solid #fcd34d; border-radius: 8px; padding: 16px; margin: 20px 0;">
                <p style="margin: 0; color: #92400e; font-size: 14px;">
                  📋 <strong>התאמת הנחה:</strong> מאחר שביטלת לפני תום תקופת ההנחה, חושב הפרש של <strong>₪${adjustment}</strong> לפי תקופת השימוש בפועל. הסכום יחויב בכרטיס האשראי.
                </p>
              </div>
              ` : ""}
              <p style="color: #555; font-size: 14px;">
                התחרטת? תוכל לחדש את המנוי בכל עת:
              </p>
              <div style="text-align: center; margin: 20px 0;">
                <a href="${billingUrl}" style="display: inline-block; background: #4f46e5; color: white; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: bold;">
                  חדש את המנוי
                </a>
              </div>
            </div>
          </div>
        `,
      }).catch(err => logger.error("Cancel confirmation email failed:", { error: err instanceof Error ? err.message : String(err) }));
    }

    // 📧 הודעה לאדמין
    if (ADMIN_EMAIL) {
      await sendEmail({
        to: ADMIN_EMAIL,
        subject: `⚠️ מנוי בוטל ע"י המשתמש - ${user.name}`,
        html: `
          <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: #1e293b; padding: 15px 20px; border-radius: 8px 8px 0 0;">
              <h2 style="color: white; margin: 0;">⚠️ ביטול מנוי</h2>
            </div>
            <div style="background: #fff; padding: 25px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 8px 8px;">
              <div style="background: #fffbeb; border-right: 4px solid #f59e0b; padding: 16px; border-radius: 4px;">
                <p style="margin: 0; font-size: 15px;"><strong>${escapeHtml(user.name || "")}</strong> (${escapeHtml(user.email ?? "")}) ביטל את המנוי.</p>
                <p style="margin: 8px 0 0; font-size: 14px; color: #64748b;">מסלול: ${PLAN_NAMES[user.aiTier] || user.aiTier}</p>
                ${adjustment > 0 ? `<p style="margin: 8px 0 0; font-size: 14px; color: #d97706;"><strong>התאמת הנחה:</strong> ₪${adjustment}</p>` : ""}
              </div>
              <p style="color: #64748b; font-size: 14px; margin-top: 16px;">
                <strong>פעולה מומלצת:</strong> כדאי ליצור קשר ולברר את הסיבה לביטול.
              </p>
            </div>
          </div>
        `,
      }).catch(err => logger.error("Admin cancel notification failed:", { error: err instanceof Error ? err.message : String(err) }));
    }

    return NextResponse.json({
      success: true,
      message: "המנוי בוטל בהצלחה",
      activeUntil: user.subscriptionEndsAt,
      adjustment,
    });
  } catch (error) {
    logger.error("Cancel subscription error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "שגיאה בביטול המנוי" },
      { status: 500 }
    );
  }
}
