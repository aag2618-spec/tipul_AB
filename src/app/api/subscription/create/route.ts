// src/app/api/subscription/create/route.ts
// API ליצירת מנוי חדש דרך Cardcom (סולק האשראי הראשי).
//
// תומך ב-4 תקופות: חודשי, רבעוני, חצי-שנתי, שנתי.
// כל המנויים מתחדשים אוטומטית (savedCardToken + cron) עד שהמשתמש מבטל.
//
// זרימה:
//   1. validation + rate limit + terms
//   2. resolve מחיר דרך src/lib/pricing/resolve.ts (USER → CLINIC_MEMBER → ORG → GLOBAL → fallback)
//   3. יצירת SubscriptionPayment ב-PENDING + CardcomTransaction ב-PENDING (לפני קריאה ל-Cardcom)
//   4. createPaymentPage עם createToken=true (כדי שחיוב חוזר חודשי יתאפשר)
//   5. עדכון transaction.lowProfileId + paymentPageUrl
//   6. החזרת URL ללקוח לפנייה ל-iframe Cardcom
//
// ה-webhook ב-`/api/webhooks/cardcom/admin` מטפל בכל השאר:
//   - אם APPROVED: SubscriptionPayment.status=PAID, User.subscriptionStatus=ACTIVE,
//     subscriptionStartedAt/EndsAt, aiTier, trialEndsAt=null, SavedCardToken, CardcomInvoice
//   - אם DECLINED: SubscriptionPayment.status=CANCELLED, User נשאר TRIALING

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  checkRateLimit,
  SUBSCRIPTION_RATE_LIMIT,
  rateLimitResponse,
} from "@/lib/rate-limit";
import { PRICING, PERIOD_DAYS, PERIOD_LABELS, PLAN_NAMES } from "@/lib/pricing";
import {
  fetchAndResolveSubscriptionPrice,
  getPriceForPeriod,
  type SubscriptionPeriodMonths,
} from "@/lib/pricing/resolve";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/api-auth";
import { getAdminCardcomClient } from "@/lib/cardcom/admin-config";
import { getAdminBusinessProfile } from "@/lib/site-settings";
import { scrubCardcomMessage } from "@/lib/cardcom/verify-webhook";
import type { AITier, PaymentMethod } from "@prisma/client";

export const dynamic = "force-dynamic";

const VALID_PLANS: readonly AITier[] = ["ESSENTIAL", "PRO", "ENTERPRISE"];
const VALID_MONTHS: readonly SubscriptionPeriodMonths[] = [1, 3, 6, 12];

function isAITier(v: unknown): v is AITier {
  return typeof v === "string" && (VALID_PLANS as readonly string[]).includes(v);
}

function isValidMonths(v: number): v is SubscriptionPeriodMonths {
  return (VALID_MONTHS as readonly number[]).includes(v);
}

export async function POST(request: NextRequest) {
  try {
    // disallowImpersonation: יצירת מנוי הוא פעולת חיוב — OWNER לא יוצר מנוי
    // בשם target (חיוב לכרטיס שלו).
    const auth = await requireAuth({ disallowImpersonation: true });
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    // Rate limiting — 5 ניסיונות יצירת מנוי לשעה
    const rateCheck = checkRateLimit(
      `sub_create:${userId}`,
      SUBSCRIPTION_RATE_LIMIT
    );
    if (!rateCheck.allowed) {
      return rateLimitResponse(rateCheck);
    }

    const body = (await request.json()) as Record<string, unknown>;
    const { plan, billingMonths = 1, termsAccepted } = body;

    if (!termsAccepted) {
      return NextResponse.json(
        { message: "יש לאשר את תנאי השימוש לפני רכישת מנוי" },
        { status: 400 }
      );
    }

    if (!isAITier(plan)) {
      return NextResponse.json({ message: "מסלול לא תקין" }, { status: 400 });
    }

    const months = Number(billingMonths);
    if (!Number.isInteger(months) || !isValidMonths(months)) {
      return NextResponse.json(
        { message: "תקופת חיוב לא תקינה" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        organizationId: true,
        billingPaidByClinic: true,
        subscriptionPausedReason: true,
        subscriptionStatus: true,
        subscriptionEndsAt: true,
        aiTier: true,
      },
    });

    if (!user) {
      return NextResponse.json({ message: "משתמש לא נמצא" }, { status: 404 });
    }

    // MyTipul-B: חסום רכישת מנוי אישי כשמשתמש משויך לקליניקה שמשלמת עליו.
    // חסימה מוחלטת על billingPaidByClinic=true (גם אם reason=null) למניעת
    // bypass של 2 חיובים מקבילים (קליניקה + אישי).
    if (user.billingPaidByClinic) {
      return NextResponse.json(
        {
          message:
            "המנוי שלך משולם ע״י הקליניקה — לא ניתן לרכוש מנוי אישי כל זמן השיוך. אם ברצונך לעבור לתשלום אישי, פנה/י לבעל/ת הקליניקה.",
        },
        { status: 403 }
      );
    }

    // === Resolve מחיר דרך מערכת ה-pricing הגמישה ===
    const now = new Date();
    let amount: number;
    try {
      const resolved = await fetchAndResolveSubscriptionPrice({
        userId: user.id,
        organizationId: user.organizationId,
        planTier: plan,
        now,
      });
      amount = getPriceForPeriod(resolved, months);
    } catch (priceError) {
      logger.error("[subscription/create] price resolution failed", {
        userId: user.id,
        plan,
        months,
        error:
          priceError instanceof Error
            ? priceError.message
            : String(priceError),
      });
      // Fallback בטוח: ננסה PRICING הקבוע (לא אמור לקרות כי resolver יש לו fallback)
      const fallbackAmount = PRICING[plan]?.[months];
      if (!fallbackAmount || fallbackAmount <= 0) {
        return NextResponse.json(
          { message: "לא נמצא מחיר תקין עבור המסלול. פנה/י לתמיכה." },
          { status: 500 }
        );
      }
      amount = fallbackAmount;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      logger.error("[subscription/create] invalid amount after resolution", {
        userId: user.id,
        amount,
      });
      return NextResponse.json(
        { message: "מחיר לא תקין. פנה/י לתמיכה." },
        { status: 500 }
      );
    }

    const intervalDays = PERIOD_DAYS[months];
    const description = `מנוי ${PLAN_NAMES[plan]} ${PERIOD_LABELS[months]} - MyTipul`;

    // קביעת periodStart/periodEnd לפי סוג הפעולה:
    //
    //   1. משתמש חדש / בניסיון / לא-פעיל:
    //      periodStart = now, periodEnd = now + interval.
    //
    //   2. משתמש ACTIVE, חידוש (אותו tier):
    //      periodStart = subscriptionEndsAt הקיים (לא מאבדים ימים ששולמו),
    //      periodEnd = currentEnd + interval. cron החיוב החוזר עובד ככה.
    //
    //   3. משתמש ACTIVE, שדרוג (tier יקר יותר):
    //      periodStart = now (תוקף מיידי ל-tier החדש),
    //      periodEnd = currentEnd + interval (הארכת תקופה כדי שלא יאבד ימים
    //      ששילם בעבור ה-tier הישן). המשתמש מקבל את ה-tier החדש מיד +
    //      ימי ה-tier הישן ששנותרו "מתורגמים" לתוספת זמן ב-tier החדש.
    //
    //   4. משתמש ACTIVE, הורדה (tier זול יותר):
    //      periodStart = currentEnd, periodEnd = currentEnd + interval.
    //      שומר את ה-tier הגבוה ששילם עליו עד סוף התקופה, אז עובר לחדש.
    //      (אותו התנהגות כמו חידוש — webhook + cron promote-pending-tiers מטפלים).
    // השוואה לפי דירוג tier ישיר (לא לפי PRICING) — כדי שדריסות מחיר
    // (override_price / isFreeSubscription) לא יסתירו את האבחנה בין שדרוג להורדה.
    const TIER_LEVEL: Record<AITier, number> = {
      ESSENTIAL: 0,
      PRO: 1,
      ENTERPRISE: 2,
    };
    const isUpgrade = TIER_LEVEL[plan] > TIER_LEVEL[user.aiTier];
    const userCurrentEndsAt =
      user.subscriptionStatus === "ACTIVE" &&
      user.subscriptionEndsAt &&
      user.subscriptionEndsAt.getTime() > now.getTime()
        ? user.subscriptionEndsAt
        : null;
    let periodStart: Date;
    let periodEnd: Date;
    if (userCurrentEndsAt && isUpgrade) {
      // שדרוג של משתמש ACTIVE — מיידי + הארכה
      periodStart = now;
      periodEnd = new Date(
        userCurrentEndsAt.getTime() + intervalDays * 24 * 60 * 60 * 1000
      );
    } else {
      // חידוש / הורדה / משתמש לא-ACTIVE
      periodStart = userCurrentEndsAt ?? now;
      periodEnd = new Date(
        periodStart.getTime() + intervalDays * 24 * 60 * 60 * 1000
      );
    }

    // === יצירת רשומות PENDING — atomic transaction ===
    // שתי הקריאות חייבות להצליח יחדיו, אחרת SubscriptionPayment יתום ייוותר.
    const { subscriptionPayment, cardcomTransaction } = await prisma.$transaction(
      async (tx) => {
        const sp = await tx.subscriptionPayment.create({
          data: {
            userId: user.id,
            amount,
            currency: "ILS",
            status: "PENDING",
            description,
            periodStart,
            periodEnd,
            method: "CREDIT_CARD" satisfies PaymentMethod,
            autoChargeEnabled: true,
            nextChargeAt: periodEnd, // יחודש על-ידי cron של חיוב חוזר
            planTier: plan, // נשמר לעדכון user.aiTier אחרי APPROVED
          },
        });
        const ct = await tx.cardcomTransaction.create({
          data: {
            tenant: "ADMIN",
            userId: user.id,
            subscriptionPaymentId: sp.id,
            amount,
            currency: "ILS",
            status: "PENDING",
          },
        });
        return { subscriptionPayment: sp, cardcomTransaction: ct };
      }
    );

    // === קריאה ל-Cardcom ===
    const baseUrl =
      process.env.NEXT_PUBLIC_BASE_URL ??
      process.env.NEXTAUTH_URL ??
      "https://mytipul.com";

    let paymentPageResult;
    try {
      const adminClient = await getAdminCardcomClient();
      const businessProfile = await getAdminBusinessProfile();
      const documentType =
        businessProfile.type === "LICENSED" ? "TaxInvoiceAndReceipt" : "Receipt";

      paymentPageResult = await adminClient.createPaymentPage({
        amount,
        description,
        createToken: true, // **קריטי**: לחיוב חוזר חודשי
        returnValue: cardcomTransaction.id, // מטה-data שתחזור ב-webhook
        uniqueAsmachta: cardcomTransaction.id, // idempotency
        successRedirectUrl: `${baseUrl}/dashboard?subscription=success&months=${months}`,
        failedRedirectUrl: `${baseUrl}/dashboard/settings/billing?subscription=failed`,
        webhookUrl: `${baseUrl}/api/webhooks/cardcom/admin`,
        customer: {
          name: user.name || "משתמש",
          email: user.email || undefined,
        },
        documentType,
        products: [
          {
            description,
            unitCost: amount,
            quantity: 1,
          },
        ],
        numOfPayments: 1,
      });

      // הגנה מפני 200 OK עם URL ריק
      if (!paymentPageResult?.url || !paymentPageResult?.lowProfileId) {
        throw new Error("Cardcom returned an empty payment URL");
      }
    } catch (cardcomError) {
      // עדכן את ה-transaction ל-FAILED עם הודעה מנוקה מ-PII
      const rawMsg =
        cardcomError instanceof Error
          ? cardcomError.message
          : String(cardcomError);
      const scrubbedMsg = scrubCardcomMessage(rawMsg) ?? "unknown error";
      await prisma.cardcomTransaction.update({
        where: { id: cardcomTransaction.id },
        data: {
          status: "FAILED",
          errorMessage: scrubbedMsg.substring(0, 500),
        },
      });
      await prisma.subscriptionPayment.update({
        where: { id: subscriptionPayment.id },
        data: { status: "CANCELLED" },
      });
      logger.error("[subscription/create] Cardcom createPaymentPage failed", {
        userId: user.id,
        transactionId: cardcomTransaction.id,
        error: scrubbedMsg,
      });
      return NextResponse.json(
        { message: "שגיאה ביצירת דף תשלום. נסה/י שוב מאוחר יותר." },
        { status: 502 }
      );
    }

    // עדכון ה-transaction עם lowProfileId
    await prisma.cardcomTransaction.update({
      where: { id: cardcomTransaction.id },
      data: {
        lowProfileId: paymentPageResult.lowProfileId,
        paymentPageUrl: paymentPageResult.url,
      },
    });

    // **לא לעדכן `user.aiTier` כאן!**
    // עדכון מתבצע רק ב-webhook אחרי APPROVED, למניעת "מנוי דמה" — משתמש שמקבל
    // tier משופר בלי תשלום (סוגר את ה-iframe בלי לסיים).

    // שמירת הוכחה חוקית על אישור תנאים
    await prisma.termsAcceptance.create({
      data: {
        userId: user.id,
        userEmail: user.email || "",
        userName: user.name,
        termsVersion: "1.0",
        termsType: "SUBSCRIPTION_TERMS",
        acceptedContent:
          "המשתמש אישר את תנאי המנוי כולל: חידוש אוטומטי, מדיניות ביטול והתאמת הנחה, ותנאי שימוש כלליים.",
        action: "SUBSCRIPTION_CREATE",
        planSelected: plan,
        billingMonths: months,
        amountAgreed: amount,
        ipAddress:
          request.headers.get("x-forwarded-for") ||
          request.headers.get("x-real-ip") ||
          "unknown",
        userAgent: request.headers.get("user-agent") || "unknown",
      },
    });

    return NextResponse.json({
      success: true,
      paymentUrl: paymentPageResult.url,
      lowProfileId: paymentPageResult.lowProfileId,
      transactionId: cardcomTransaction.id,
      subscriptionPaymentId: subscriptionPayment.id,
      plan,
      amount,
      billingMonths: months,
      intervalDays,
    });
  } catch (error) {
    logger.error("[subscription/create] error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ message: "שגיאה ביצירת מנוי" }, { status: 500 });
  }
}
