// src/app/api/webhooks/meshulam/route.ts
// Webhook handler עבור Meshulam - תשלומי מטופלים ומנויים

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyMeshulamWebhook, MeshulamWebhookPayload } from "@/lib/meshulam";
import { sendEmail } from "@/lib/resend";
import { withWebhookRetry } from "@/lib/webhook-retry";
import { checkRateLimit, WEBHOOK_RATE_LIMIT } from "@/lib/rate-limit";
import { PLAN_NAMES, detectPeriodFromAmount as detectPeriodCentral } from "@/lib/pricing";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const SYSTEM_URL = process.env.NEXTAUTH_URL || "";

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get("x-meshulam-signature") || "";
    
    // אימות החתימה
    const webhookSecret = process.env.MESHULAM_WEBHOOK_SECRET;
    if (webhookSecret && !verifyMeshulamWebhook(body, signature, webhookSecret)) {
      console.error("Invalid Meshulam webhook signature");
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 401 }
      );
    }

    const payload: MeshulamWebhookPayload = JSON.parse(body);
    console.log("Meshulam webhook received:", payload.type);

    // Rate limiting לwebhooks - הגנה מפני flooding
    const clientIp = request.headers.get("x-forwarded-for") || "unknown";
    const rateCheck = checkRateLimit(`webhook:meshulam:${clientIp}`, WEBHOOK_RATE_LIMIT);
    if (!rateCheck.allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    // עיבוד עם retry אוטומטי - שגיאות נשמרות לניסיון חוזר
    const result = await withWebhookRetry("meshulam", payload.type, body, async () => {
      switch (payload.type) {
        case "payment.success":
          await handlePaymentSuccess(payload);
          break;
        case "payment.failed":
          await handlePaymentFailed(payload);
          break;
        case "subscription.created":
          await handleSubscriptionCreated(payload);
          break;
        case "subscription.renewed":
          await handleSubscriptionRenewed(payload);
          break;
        case "subscription.cancelled":
          await handleSubscriptionCancelled(payload);
          break;
        default:
          console.log("Unhandled webhook type:", payload.type);
      }
    });

    if (!result.success) {
      console.error("Webhook handler failed but saved for retry:", result.error);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Meshulam webhook error:", error);
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}

/**
 * טיפול בתשלום מוצלח
 */
async function handlePaymentSuccess(payload: MeshulamWebhookPayload) {
  const { paymentId, customFields, amount, documentUrl, customerEmail } = payload;
  
  // בדיקה אם זה תשלום מנוי (לבעל המערכת) או תשלום מטופל
  if (customFields?.paymentId) {
    // תשלום מטופל - עדכון Payment במערכת
    await prisma.payment.update({
      where: { id: customFields.paymentId },
      data: {
        status: "PAID",
        paidAt: new Date(),
        receiptUrl: documentUrl,
        hasReceipt: !!documentUrl,
      },
    });

    // יצירת התראה למטפל
    if (customFields.therapistId) {
      await prisma.notification.create({
        data: {
          userId: customFields.therapistId,
          type: "PAYMENT_REMINDER",
          title: "💳 תשלום התקבל",
          content: `התקבל תשלום בסך ₪${amount} מהמטופל`,
          status: "PENDING",
        },
      });
    }
  } else if (payload.customerId) {
    // תשלום מנוי - מחפשים לפי המייל
    const user = await prisma.user.findFirst({
      where: { email: customerEmail },
    });

    if (user) {
      // אם היה מנוי חינם - מעבירים לרגיל
      const wasFree = user.isFreeSubscription;

      // חישוב תקופה לפי הסכום שנגבה (לא תמיד 30 יום!)
      const periodDays = detectPeriodCentral(user.aiTier, amount || 0);
      const periodMs = periodDays * 24 * 60 * 60 * 1000;
      const periodLabel = periodDays <= 31 ? "חודשי" : periodDays <= 91 ? "רבעוני" : periodDays <= 181 ? "חצי שנתי" : "שנתי";

      // עדכון סטטוס המנוי
      await prisma.user.update({
        where: { id: user.id },
        data: {
          subscriptionStatus: "ACTIVE",
          subscriptionStartedAt: user.subscriptionStartedAt || new Date(),
          subscriptionEndsAt: new Date(Date.now() + periodMs),
          // ניקוי שדות חינם אחרי תשלום
          ...(wasFree && {
            isFreeSubscription: false,
            freeSubscriptionNote: null,
          }),
        },
      });

      // רישום תשלום מנוי
      await prisma.subscriptionPayment.create({
        data: {
          userId: user.id,
          amount: amount || 0,
          currency: "ILS",
          status: "PAID",
          description: `תשלום מנוי ${periodLabel}`,
          invoiceUrl: documentUrl,
          periodStart: new Date(),
          periodEnd: new Date(Date.now() + periodMs),
          paidAt: new Date(),
        },
      });

      // ביטול התראות על תשלום
      await prisma.adminAlert.updateMany({
        where: {
          userId: user.id,
          type: { in: ["PAYMENT_DUE", "PAYMENT_OVERDUE"] },
          status: "PENDING",
        },
        data: {
          status: "RESOLVED",
          resolvedAt: new Date(),
          actionTaken: "שולם אוטומטית דרך Meshulam",
        },
      });

      // 📧 מייל אישור למנוי
      if (user.email) {
        await sendEmail({
          to: user.email,
          subject: "✅ התשלום התקבל - המנוי שלך פעיל!",
          html: createSubscriptionConfirmHtml(
            user.name || "משתמש",
            amount || 0,
            user.aiTier,
            documentUrl
          ),
        }).catch(err => console.error("Email to subscriber failed:", err));
      }

      // 📧 הודעה לאדמין (לך!)
      if (ADMIN_EMAIL) {
        await sendEmail({
          to: ADMIN_EMAIL,
          subject: `✅ תשלום מנוי התקבל - ${user.name} (₪${amount})`,
          html: createAdminPaymentHtml(
            user.name || "משתמש",
            user.email || "",
            user.aiTier,
            amount || 0,
            "תשלום מנוי התקבל בהצלחה",
            "success"
          ),
        }).catch(err => console.error("Email to admin failed:", err));
      }
    }
  }
}

/**
 * טיפול בתשלום שנכשל
 */
async function handlePaymentFailed(payload: MeshulamWebhookPayload) {
  const { customFields, errorMessage, customerEmail } = payload;

  if (customFields?.paymentId) {
    // תשלום מטופל שנכשל
    await prisma.payment.update({
      where: { id: customFields.paymentId },
      data: {
        status: "PENDING", // נשאר ממתין
        notes: `תשלום נכשל: ${errorMessage}`,
      },
    });

    if (customFields.therapistId) {
      await prisma.notification.create({
        data: {
          userId: customFields.therapistId,
          type: "CUSTOM",
          title: "❌ תשלום נכשל",
          content: `התשלום נכשל: ${errorMessage}`,
          status: "PENDING",
        },
      });
    }
  } else {
    // תשלום מנוי שנכשל
    const user = await prisma.user.findFirst({
      where: { email: customerEmail },
    });

    if (user) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          subscriptionStatus: "PAST_DUE",
        },
      });

      // יצירת התראה לאדמין
      await prisma.adminAlert.create({
        data: {
          userId: user.id,
          type: "PAYMENT_FAILED",
          title: "תשלום מנוי נכשל",
          message: `תשלום מנוי נכשל עבור ${user.name}: ${errorMessage}`,
          priority: "HIGH",
        },
      });

      // 📧 מייל למנוי שהתשלום נכשל + קישור לתשלום
      if (user.email) {
        const billingUrl = `${SYSTEM_URL}/dashboard/settings/billing`;
        await sendEmail({
          to: user.email,
          subject: "⚠️ התשלום לא עבר - נדרשת פעולה",
          html: `
            <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="text-align: center; padding: 20px; background: #f59e0b; border-radius: 12px 12px 0 0;">
                <h1 style="color: white; margin: 0;">⚠️ תשלום לא עבר</h1>
              </div>
              <div style="background: #fff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
                <h2 style="color: #333; margin-top: 0;">שלום ${user.name || ""},</h2>
                <p style="color: #555; font-size: 16px;">התשלום על המנוי שלך לא עבר. אנא עדכן את פרטי התשלום כדי להמשיך להשתמש במערכת.</p>
                <div style="text-align: center; margin: 25px 0;">
                  <a href="${billingUrl}" style="display: inline-block; background: #4f46e5; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold;">
                    עדכן פרטי תשלום
                  </a>
                </div>
              </div>
            </div>
          `,
        }).catch(err => console.error("Payment failed email to user error:", err));
      }

      // 📧 הודעה לאדמין
      if (ADMIN_EMAIL) {
        await sendEmail({
          to: ADMIN_EMAIL,
          subject: `❌ תשלום מנוי נכשל - ${user.name}`,
          html: createAdminPaymentHtml(
            user.name || "משתמש",
            user.email || "",
            user.aiTier,
            0,
            `תשלום נכשל: ${errorMessage}`,
            "error"
          ),
        }).catch(err => console.error("Payment failed email to admin error:", err));
      }
    }
  }
}

/**
 * טיפול ביצירת מנוי חדש
 */
async function handleSubscriptionCreated(payload: MeshulamWebhookPayload) {
  const { customerEmail, amount } = payload;

  const user = await prisma.user.findFirst({
    where: { email: customerEmail },
  });

  if (user) {
    // חישוב תקופה לפי הסכום (לא תמיד 30 יום!)
    const periodDays = detectPeriodCentral(user.aiTier, amount || 0);
    const periodMs = periodDays * 24 * 60 * 60 * 1000;
    const periodLabel = periodDays <= 31 ? "חודשי" : periodDays <= 91 ? "רבעוני" : periodDays <= 181 ? "חצי שנתי" : "שנתי";

    await prisma.user.update({
      where: { id: user.id },
      data: {
        subscriptionStatus: "ACTIVE",
        subscriptionStartedAt: new Date(),
        subscriptionEndsAt: new Date(Date.now() + periodMs),
      },
    });

    // יצירת התראה למשתמש
    await prisma.notification.create({
      data: {
        userId: user.id,
        type: "CUSTOM",
        title: "🎉 המנוי הופעל בהצלחה",
        content: `המנוי שלך הופעל בהצלחה. תשלום ${periodLabel}: ₪${amount}`,
        status: "PENDING",
      },
    });

    // 📧 מייל ברוכים הבאים למנוי
    if (user.email) {
      await sendEmail({
        to: user.email,
        subject: "🎉 ברוכים הבאים! המנוי שלך הופעל",
        html: createSubscriptionConfirmHtml(
          user.name || "משתמש",
          amount || 0,
          user.aiTier,
          undefined
        ),
      }).catch(err => console.error("Welcome email failed:", err));
    }

    // 📧 הודעה לאדמין - מנוי חדש!
    if (ADMIN_EMAIL) {
      await sendEmail({
        to: ADMIN_EMAIL,
        subject: `🎉 מנוי חדש! - ${user.name} (${PLAN_NAMES[user.aiTier] || user.aiTier})`,
        html: createAdminPaymentHtml(
          user.name || "משתמש",
          user.email || "",
          user.aiTier,
          amount || 0,
          "מנוי חדש נרשם למערכת!",
          "success"
        ),
      }).catch(err => console.error("Admin new sub email failed:", err));
    }
  }
}

/**
 * טיפול בחידוש מנוי
 */
async function handleSubscriptionRenewed(payload: MeshulamWebhookPayload) {
  const { customerEmail, amount, documentUrl } = payload;

  const user = await prisma.user.findFirst({
    where: { email: customerEmail },
  });

  if (user) {
    // חישוב תקופה לפי הסכום שנגבה
    const periodDays = detectPeriodCentral(user.aiTier, amount || 0);
    const periodMs = periodDays * 24 * 60 * 60 * 1000;
    const periodLabel = periodDays <= 31 ? "חודשי" : periodDays <= 91 ? "רבעוני" : periodDays <= 181 ? "חצי שנתי" : "שנתי";
    const wasFree = user.isFreeSubscription;

    await prisma.user.update({
      where: { id: user.id },
      data: {
        subscriptionStatus: "ACTIVE",
        subscriptionEndsAt: new Date(Date.now() + periodMs),
        // ניקוי שדות חינם אחרי חידוש בתשלום
        ...(wasFree && {
          isFreeSubscription: false,
          freeSubscriptionNote: null,
        }),
      },
    });

    await prisma.subscriptionPayment.create({
      data: {
        userId: user.id,
        amount: amount || 0,
        currency: "ILS",
        status: "PAID",
        description: `חידוש מנוי ${periodLabel}`,
        invoiceUrl: documentUrl,
        periodStart: new Date(),
        periodEnd: new Date(Date.now() + periodMs),
        paidAt: new Date(),
      },
    });

    // 📧 מייל אישור חידוש למנוי
    if (user.email) {
      await sendEmail({
        to: user.email,
        subject: "✅ המנוי שלך חודש בהצלחה!",
        html: createSubscriptionConfirmHtml(
          user.name || "משתמש",
          amount || 0,
          user.aiTier,
          documentUrl
        ),
      }).catch(err => console.error("Renewal email to user failed:", err));
    }

    // 📧 הודעה לאדמין - חידוש אוטומטי הצליח
    if (ADMIN_EMAIL) {
      await sendEmail({
        to: ADMIN_EMAIL,
        subject: `✅ מנוי חודש אוטומטית - ${user.name} (₪${amount})`,
        html: createAdminPaymentHtml(
          user.name || "משתמש",
          user.email || "",
          user.aiTier,
          amount || 0,
          "המנוי חודש אוטומטית בהצלחה",
          "success"
        ),
      }).catch(err => console.error("Renewal email to admin failed:", err));
    }
  }
}

/**
 * טיפול בביטול מנוי
 */
async function handleSubscriptionCancelled(payload: MeshulamWebhookPayload) {
  const { customerEmail } = payload;

  const user = await prisma.user.findFirst({
    where: { email: customerEmail },
  });

  if (user) {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        subscriptionStatus: "CANCELLED",
      },
    });

    await prisma.notification.create({
      data: {
        userId: user.id,
        type: "CUSTOM",
        title: "⚠️ המנוי בוטל",
        content: "המנוי שלך בוטל. תוכל להמשיך להשתמש עד לסיום התקופה הנוכחית.",
        status: "PENDING",
      },
    });

    // התראה לאדמין
    await prisma.adminAlert.create({
      data: {
        userId: user.id,
        type: "SUBSCRIPTION_EXPIRED",
        title: "מנוי בוטל",
        message: `המנוי של ${user.name} בוטל`,
        priority: "MEDIUM",
      },
    });

    // 📧 מייל למנוי שהמנוי בוטל
    if (user.email) {
      const billingUrl = `${SYSTEM_URL}/dashboard/settings/billing`;
      await sendEmail({
        to: user.email,
        subject: "המנוי שלך בוטל - נשמח לראותך חוזר",
        html: `
          <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="text-align: center; padding: 20px; background: #6b7280; border-radius: 12px 12px 0 0;">
              <h1 style="color: white; margin: 0;">המנוי בוטל</h1>
            </div>
            <div style="background: #fff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
              <h2 style="color: #333; margin-top: 0;">שלום ${user.name || ""},</h2>
              <p style="color: #555; font-size: 16px; line-height: 1.6;">
                המנוי שלך בוטל. תוכל להמשיך להשתמש עד סוף התקופה הנוכחית.
              </p>
              <p style="color: #555; font-size: 16px;">
                <strong>הנתונים שלך שמורים במערכת</strong> ותוכל לחדש בכל עת.
              </p>
              <div style="text-align: center; margin: 25px 0;">
                <a href="${billingUrl}" style="display: inline-block; background: #4f46e5; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold;">
                  חידוש המנוי
                </a>
              </div>
            </div>
          </div>
        `,
      }).catch(err => console.error("Cancellation email to user failed:", err));
    }

    // 📧 הודעה לאדמין
    if (ADMIN_EMAIL) {
      await sendEmail({
        to: ADMIN_EMAIL,
        subject: `⚠️ מנוי בוטל - ${user.name}`,
        html: createAdminPaymentHtml(
          user.name || "משתמש",
          user.email || "",
          user.aiTier,
          0,
          "המנוי בוטל על ידי המשתמש או ספק התשלום",
          "warning"
        ),
      }).catch(err => console.error("Cancellation email to admin failed:", err));
    }
  }
}

// ========================================
// Email HTML Templates
// ========================================

function createSubscriptionConfirmHtml(
  name: string,
  amount: number,
  tier: string,
  receiptUrl?: string
): string {
  const planName = PLAN_NAMES[tier] || tier;
  const receiptLink = receiptUrl
    ? `<p style="text-align: center; margin-top: 15px;"><a href="${receiptUrl}" style="color: #4f46e5;">📄 הורד קבלה</a></p>`
    : "";

  return `
    <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; padding: 20px; background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); border-radius: 12px 12px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 24px;">✅ המנוי פעיל!</h1>
      </div>
      <div style="background: #fff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
        <h2 style="color: #333; margin-top: 0;">שלום ${name},</h2>
        <p style="color: #555; font-size: 16px; line-height: 1.6;">
          התשלום התקבל בהצלחה. המנוי שלך פעיל ומוכן לשימוש!
        </p>
        <div style="background: #f0fdf4; border: 1px solid #86efac; border-radius: 8px; padding: 16px; margin: 20px 0;">
          <p style="margin: 0 0 8px; color: #166534;"><strong>מסלול:</strong> ${planName}</p>
          <p style="margin: 0; color: #166534;"><strong>סכום:</strong> ₪${amount}</p>
        </div>
        ${receiptLink}
        <div style="text-align: center; margin: 25px 0;">
          <a href="${SYSTEM_URL}/dashboard" style="display: inline-block; background: #4f46e5; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold;">
            כניסה למערכת
          </a>
        </div>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 20px 0;" />
        <p style="color: #9ca3af; font-size: 12px; text-align: center;">מייל אוטומטי ממערכת Tipul</p>
      </div>
    </div>
  `;
}

function createAdminPaymentHtml(
  userName: string,
  userEmail: string,
  tier: string,
  amount: number,
  message: string,
  type: "success" | "error" | "warning"
): string {
  const planName = PLAN_NAMES[tier] || tier;
  const colors = {
    success: { bg: "#f0fdf4", border: "#22c55e", icon: "✅" },
    error: { bg: "#fef2f2", border: "#dc2626", icon: "❌" },
    warning: { bg: "#fffbeb", border: "#f59e0b", icon: "⚠️" },
  };
  const c = colors[type];

  return `
    <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: #1e293b; padding: 15px 20px; border-radius: 8px 8px 0 0;">
        <h2 style="color: white; margin: 0; font-size: 18px;">${c.icon} Tipul Admin - עדכון מנוי</h2>
      </div>
      <div style="background: #fff; padding: 25px; border: 1px solid #e2e8f0; border-top: none;">
        <div style="background: ${c.bg}; border-right: 4px solid ${c.border}; padding: 16px; border-radius: 4px; margin-bottom: 16px;">
          <p style="margin: 0; font-size: 15px; color: #1e293b;">${message}</p>
        </div>
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tr><td style="padding: 8px 0; color: #64748b;">שם:</td><td style="padding: 8px 0;"><strong>${userName}</strong></td></tr>
          <tr><td style="padding: 8px 0; color: #64748b;">מייל:</td><td style="padding: 8px 0;">${userEmail}</td></tr>
          <tr><td style="padding: 8px 0; color: #64748b;">מסלול:</td><td style="padding: 8px 0;">${planName}</td></tr>
          ${amount > 0 ? `<tr><td style="padding: 8px 0; color: #64748b;">סכום:</td><td style="padding: 8px 0;"><strong>₪${amount}</strong></td></tr>` : ""}
        </table>
      </div>
      <div style="background: #f8fafc; padding: 12px 20px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 8px 8px;">
        <p style="margin: 0; color: #94a3b8; font-size: 12px; text-align: center;">
          ${new Date().toLocaleString("he-IL")} | <a href="${SYSTEM_URL}/admin/billing" style="color: #3b82f6;">פאנל ניהול</a>
        </p>
      </div>
    </div>
  `;
}

