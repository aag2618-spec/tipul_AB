// src/app/api/webhooks/meshulam/route.ts
// Webhook handler עבור Meshulam - תשלומי מטופלים ומנויים

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyMeshulamWebhook, MeshulamWebhookPayload } from "@/lib/meshulam";
import { sendEmail } from "@/lib/resend";
import { withWebhookRetry } from "@/lib/webhook-retry";
import { checkRateLimit, WEBHOOK_RATE_LIMIT } from "@/lib/rate-limit";
import {
  PLAN_NAMES,
  PERIOD_DAYS,
  PRICING,
  matchAmountToPeriodMonths,
} from "@/lib/pricing";
import {
  fetchAndResolveSubscriptionPrice,
  getPriceForPeriod,
  type SubscriptionPeriodMonths,
} from "@/lib/pricing/resolve";
import { escapeHtml, safeHttpUrl } from "@/lib/email-utils";
import { logger } from "@/lib/logger";
import { invalidateJwtCache } from "@/lib/auth";
import { completeWebhookPayment } from "@/lib/payments/receipt-service";
import { verifyPaymentOwnership } from "@/lib/webhook-verification";
import {
  verifyWebhookTimestamp,
  claimWebhook,
  finalizeWebhook,
  releaseWebhookClaim,
} from "@/lib/webhook-replay-protection";
import type { AITier, SubscriptionStatus } from "@prisma/client";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const SYSTEM_URL = process.env.NEXTAUTH_URL || "";

const PERIOD_MONTHS: SubscriptionPeriodMonths[] = [1, 3, 6, 12];

// סף עתידי לבדיקת "subscription פעיל" — אם user.subscriptionEndsAt נמצא מעבר
// לסף הזה ב-subscription.created, האירוע חשוד (יש כבר מנוי פעיל משמעותי).
const ACTIVE_SUBSCRIPTION_FUTURE_MS = 7 * 24 * 60 * 60 * 1000;

type MeshulamSubEventType =
  | "created"
  | "renewed"
  | "cancelled"
  | "payment_success"
  | "payment_failed";

type VerifiedMeshulamUser = {
  id: string;
  email: string | null;
  name: string | null;
  organizationId: string | null;
  aiTier: AITier;
  subscriptionStatus: SubscriptionStatus;
  subscriptionEndsAt: Date | null;
  isBlocked: boolean;
  blockReason: string | null;
  isFreeSubscription: boolean;
  meshulamCustomerId: string | null;
  billingPaidByClinic: boolean;
};

/**
 * אימות שsubscription webhook אכן שייך למשתמש שטוען payload.customerEmail.
 *
 * רציונל אבטחה (defense in depth):
 * HMAC signature + replay protection (5 דק') + claimWebhook idempotency מגנים
 * מפני זיוף — **כל עוד ה-secret לא דלף**. אם תוקף משיג את ה-secret, הוא יכול
 * לחתום payload עם customerEmail של משתמש אחר ולגרום ל-renewed/cancelled/
 * payment-success מזויפים. הגנה זו חוסמת תוקף כזה ע"י:
 *   1. דרישת payload.customerId (תוקף צריך גם לנחש מה Meshulam ייתן)
 *   2. eligibility checks לפי event type (renewed ללא היסטוריה = חשוד,
 *      created על user ACTIVE עם endsAt עתידי = חשוד, וכו')
 *   3. adminAlert על כל מקרה חשוד — visibility ל-forensics
 *
 * כעת כולל meshulamCustomerId binding (schema migration 20260525200000):
 *   - webhook ראשון → bind (שומר customerId על User)
 *   - webhook הבא → validate (customerId חייב להתאים לשמור על User)
 *   - unique constraint מונע bind של אותו customerId ל-2 users שונים
 * תוקף שמזייף email+HMAC אבל לא יודע את ה-customerId האמיתי → נחסם.
 *
 * @returns user metadata אם תקין; null אם פסול (כל ה-callers צריכים לבדוק null
 *   ולחזור בלי לעשות פעולה).
 */
async function verifyMeshulamSubscriptionUser(
  customerEmail: string | undefined,
  customerId: string | undefined,
  eventType: MeshulamSubEventType,
  clientIp: string
): Promise<VerifiedMeshulamUser | null> {
  if (!customerEmail || typeof customerEmail !== "string") {
    logger.warn("[meshulam] subscription webhook rejected — missing customerEmail", { eventType });
    return null;
  }
  // basic email format check — anti-injection + sanity
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customerEmail) ||
    customerEmail.length > 320
  ) {
    logger.warn("[meshulam] subscription webhook rejected — invalid customerEmail format", {
      eventType,
    });
    return null;
  }
  if (!customerId || typeof customerId !== "string" || customerId.length < 3) {
    logger.error(
      "[meshulam] subscription webhook rejected — missing/invalid customerId (potential IDOR)",
      { eventType, clientIp }
    );
    return null;
  }

  // email normalization (lowercase + trim) — Postgres email column הוא case-sensitive
  // ב-default. בלי normalization, payload "User@X.com" + DB "user@x.com" יחזיר null
  // = false negative. עקבי עם signup/login flows שמטמיעים lowercase.
  const normalizedEmail = customerEmail.toLowerCase().trim();
  const user = await prisma.user.findFirst({
    where: { email: normalizedEmail },
    select: {
      id: true,
      email: true,
      name: true,
      organizationId: true,
      aiTier: true,
      subscriptionStatus: true,
      subscriptionEndsAt: true,
      isBlocked: true,
      blockReason: true,
      isFreeSubscription: true,
      meshulamCustomerId: true,
      // B7: billingPaidByClinic = "המנוי משולם ע"י הקליניקה". כאשר true,
      // המשתמש לא אמור לקבל אירועי תשלום אישיים ב-Meshulam — אם מתקבל
      // payment_success מזויף (או double-charge בטעות מקליק ישן על link
      // אישי שעוד תקף), הוא היה מסומן ACTIVE + מבטל את החיוב המוסדי.
      billingPaidByClinic: true,
    },
  });
  if (!user) {
    return null;
  }

  // ── customerId binding (anti-IDOR מלא) ──
  // webhook ראשון → bind. כל webhook הבא → validate.
  // תוקף שזייף email+HMAC אבל לא יודע את ה-customerId האמיתי → נחסם.
  if (user.meshulamCustomerId === null) {
    // first webhook — bind customerId ל-user.
    try {
      await prisma.user.update({
        where: { id: user.id },
        data: { meshulamCustomerId: customerId },
      });
    } catch (bindErr) {
      // unique constraint violation = customerId כבר שייך ל-user אחר → IDOR
      logger.error("[meshulam] customerId binding failed — possible IDOR (duplicate customerId)", {
        userId: user.id,
        customerId,
        error: bindErr instanceof Error ? bindErr.message : String(bindErr),
        clientIp,
      });
      try {
        await prisma.adminAlert.create({
          data: {
            userId: user.id,
            type: "SYSTEM",
            title: "🚨 customerId binding נכשל — IDOR אפשרי",
            message: `customerId=${customerId} כבר שייך למשתמש אחר. IP=${clientIp}`,
            priority: "HIGH",
          },
        });
      } catch { /* best effort */ }
      return null;
    }
  } else if (user.meshulamCustomerId !== customerId) {
    // customerId לא תואם → IDOR attempt
    logger.error("[meshulam] customerId mismatch — IDOR rejected", {
      userId: user.id,
      expectedCustomerId: user.meshulamCustomerId,
      payloadCustomerId: customerId,
      eventType,
      clientIp,
    });
    try {
      await prisma.adminAlert.create({
        data: {
          userId: user.id,
          type: "SYSTEM",
          title: "🚨 customerId mismatch — IDOR נחסם",
          message: `expected=${user.meshulamCustomerId}, got=${customerId}. event=${eventType}, IP=${clientIp}`,
          priority: "HIGH",
        },
      });
    } catch { /* best effort */ }
    return null;
  }
  // else: user.meshulamCustomerId === customerId → תקין ✓

  const suspicious = await detectSuspiciousMeshulamEvent(user, eventType);
  if (suspicious) {
    logger.error(
      "[meshulam] subscription webhook suspicious — rejected (potential IDOR)",
      {
        userId: user.id,
        eventType,
        reason: suspicious,
        subscriptionStatus: user.subscriptionStatus,
        isBlocked: user.isBlocked,
        blockReason: user.blockReason,
        customerId,
        clientIp,
      }
    );
    try {
      await prisma.adminAlert.create({
        data: {
          userId: user.id,
          type: "SYSTEM",
          title: "🚨 webhook חשוד מ-Meshulam — IDOR אפשרי",
          message: `אירוע ${eventType} נדחה: ${suspicious}. customerId=${customerId}, IP=${clientIp}`,
          priority: "HIGH",
        },
      });
    } catch (alertErr) {
      logger.error("[meshulam] failed to create suspicious-webhook adminAlert", {
        userId: user.id,
        error: alertErr instanceof Error ? alertErr.message : String(alertErr),
      });
    }
    return null;
  }

  return user;
}

/**
 * מחזיר string הסבר אם state של ה-user לא תואם ל-event type (חשוד), null אחרת.
 */
async function detectSuspiciousMeshulamEvent(
  user: VerifiedMeshulamUser,
  eventType: MeshulamSubEventType
): Promise<string | null> {
  // BLOCKED עם TOS_VIOLATION/MANUAL — לעולם לא ליצור/לחדש (DEBT מותר — תשלום משחרר).
  const hardBlocked =
    user.isBlocked &&
    (user.blockReason === "TOS_VIOLATION" || user.blockReason === "MANUAL");
  if (
    hardBlocked &&
    (eventType === "created" ||
      eventType === "renewed" ||
      eventType === "payment_success")
  ) {
    return `user hard-blocked (blockReason=${user.blockReason})`;
  }

  // B7: כשהמנוי מושלם ע"י הקליניקה (PAUSED או דגל billingPaidByClinic=true)
  // אסור לקבל created / renewed / payment_success אישיים. payment_success
  // היה החסר: אילו תוקף/חיוב כפול היה מצליח, היינו מסמנים את המשתמש כ-ACTIVE
  // ומאפסים את שיוך החיוב המוסדי בלי הקליניקה לדעת. שני הקריטריונים
  // מתאחדים — billingPaidByClinic הוא ה-source of truth, וסטטוס PAUSED הוא
  // הסטטוס המותאם — נחסום על שניהם defense-in-depth.
  if (
    (user.subscriptionStatus === "PAUSED" || user.billingPaidByClinic) &&
    (eventType === "created" ||
      eventType === "renewed" ||
      eventType === "payment_success")
  ) {
    return user.billingPaidByClinic
      ? "user billingPaidByClinic=true (billing managed by organization)"
      : "user PAUSED (billing paid by clinic)";
  }

  if (eventType === "created") {
    // יש כבר ACTIVE עם endsAt עתידי משמעותי = create חדש לא הגיוני.
    if (
      user.subscriptionStatus === "ACTIVE" &&
      !user.isFreeSubscription &&
      user.subscriptionEndsAt &&
      user.subscriptionEndsAt.getTime() >
        Date.now() + ACTIVE_SUBSCRIPTION_FUTURE_MS
    ) {
      return "user already has ACTIVE subscription with >7 days remaining";
    }
  } else if (eventType === "renewed") {
    // renewed חייב היסטוריה של תשלום מנוי PAID קודם.
    const hasHistory = await prisma.subscriptionPayment.findFirst({
      where: { userId: user.id, status: "PAID" },
      select: { id: true },
    });
    if (!hasHistory) {
      return "renewal without prior PAID SubscriptionPayment history";
    }
  } else if (eventType === "cancelled") {
    // cancelled על user שמעולם לא היה לו מנוי אקטיבי = no-op חשוד.
    if (
      (user.subscriptionStatus === "TRIALING" ||
        user.subscriptionStatus === "CANCELLED") &&
      (!user.subscriptionEndsAt ||
        user.subscriptionEndsAt.getTime() < Date.now())
    ) {
      return `cancelled on user with no active subscription (status=${user.subscriptionStatus})`;
    }
  }

  return null;
}

const PERIOD_LABEL_BY_MONTHS: Record<number, string> = {
  1: "חודשי",
  3: "רבעוני",
  6: "חצי שנתי",
  12: "שנתי",
};

type DetectedPeriod = {
  periodDays: number;
  periodLabel: string;
  matchedMonths: number;
  /** מאיפה הגיעה טבלת המחירים שאליה הותאם הסכום — לדיבוג/forensics. */
  source: string;
};

/**
 * גוזר את תקופת המנוי המוענקת מתוך *מחיר-אמת בצד השרת*, ולא מהסכום שה-webhook
 * מדווח על עצמו. זהו לב התיקון מפני price/amount tampering.
 *
 * הזרימה:
 *   1. resolve את טבלת המחירים של המשתמש (PricingPolicy/TierLimits מ-DB).
 *   2. מתאים את הסכום לאחת מ-4 התקופות בסבילות מחמירה (matchAmountToPeriodMonths).
 *   3. אם ה-resolver זמין אך הסכום לא תואם אף תקופה → null (דחייה) — לא נופלים
 *      ל-30 יום שקט כמו בעבר.
 *   4. רק אם ה-resolver *זרק* (תקלת DB אמיתית) — fallback להתאמה מול PRICING
 *      hardcoded, עדיין מחמיר (אין התאמה → null).
 *
 * החזרה null = הסכום אפס/שגוי/מזויף → ה-caller חייב לדחות את האירוע בלי להעניק
 * ACTIVE. הסכום שה-webhook מדווח משמש אך ורק לבחירה בין התקופות המתומחרות
 * בצד השרת — לא להמצאת תקופה חדשה ולא להענקת מנוי על סכום לא מוכר.
 */
async function matchSubscriptionPeriod(
  userId: string,
  organizationId: string | null,
  tier: AITier,
  amount: number,
  now: Date
): Promise<DetectedPeriod | null> {
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }

  let months: number | null = null;
  let source = "RESOLVER";
  try {
    const resolved = await fetchAndResolveSubscriptionPrice({
      userId,
      organizationId,
      planTier: tier,
      now,
    });
    source = resolved.source;
    months = matchAmountToPeriodMonths(
      PERIOD_MONTHS.map((m) => ({ months: m, price: getPriceForPeriod(resolved, m) })),
      amount
    );
    // ה-resolver הצליח — ההחלטה שלו סופית. אם months===null נדחה למטה,
    // לא נופלים ל-fallback (זה לא תקלת DB אלא סכום שלא תואם מחיר-אמת).
  } catch (priceError) {
    logger.warn(
      "[meshulam] period resolver failed — falling back to hardcoded PRICING match",
      {
        userId,
        tier,
        amount,
        error: priceError instanceof Error ? priceError.message : String(priceError),
      }
    );
    const tierPricing = PRICING[tier];
    if (tierPricing) {
      months = matchAmountToPeriodMonths(
        PERIOD_MONTHS.map((m) => ({ months: m, price: tierPricing[m] })),
        amount
      );
      source = "FALLBACK";
    }
  }

  if (months === null) return null;
  return {
    periodDays: PERIOD_DAYS[months] || 30,
    periodLabel: PERIOD_LABEL_BY_MONTHS[months] || "חודשי",
    matchedMonths: months,
    source,
  };
}

/**
 * דוחה אירוע מנוי שסכומו אינו תואם אף תקופת מחיר ידועה — לוג + adminAlert.
 * נקרא כש-matchSubscriptionPeriod החזיר null (סכום אפס/שגוי/מזויף). מבטיח
 * visibility ל-forensics בדיוק כמו שאר ה-suspect cases ב-verifyMeshulamSubscriptionUser.
 */
async function rejectUnpricedSubscriptionEvent(
  user: VerifiedMeshulamUser,
  eventType: MeshulamSubEventType,
  amount: number | undefined,
  clientIp: string
): Promise<void> {
  logger.error(
    "[meshulam] subscription event rejected — amount does not match any expected price",
    { userId: user.id, eventType, amount, tier: user.aiTier, clientIp }
  );
  try {
    await prisma.adminAlert.create({
      data: {
        userId: user.id,
        type: "SYSTEM",
        title: "🚨 webhook מנוי נדחה — סכום לא תואם מחיר",
        message: `אירוע ${eventType} נדחה: הסכום ₪${amount ?? 0} אינו תואם אף תקופת מחיר ידועה (tier=${user.aiTier}). חשד ל-amount tampering / סוד שדלף. IP=${clientIp}`,
        priority: "HIGH",
      },
    });
  } catch (alertErr) {
    logger.error("[meshulam] failed to create unpriced-event adminAlert", {
      userId: user.id,
      error: alertErr instanceof Error ? alertErr.message : String(alertErr),
    });
  }
}

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get("x-meshulam-signature") || "";
    
    // אימות החתימה
    const webhookSecret = process.env.MESHULAM_WEBHOOK_SECRET;
    if (!webhookSecret) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }
    if (!verifyMeshulamWebhook(body, signature, webhookSecret)) {
      logger.error("Invalid Meshulam webhook signature");
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 401 }
      );
    }

    const payload: MeshulamWebhookPayload = JSON.parse(body);
    logger.info("Meshulam webhook received:", { data: payload.type });

    // Rate limiting לwebhooks - הגנה מפני flooding
    const clientIp = request.headers.get("x-forwarded-for") || "unknown";
    // sanitize ל-clientIp לפני loger/adminAlert — x-forwarded-for יכול להכיל
    // chain (a.b.c.d, e.f.g.h) או injection attempts. נחתוך ל-first hop ול-64 תוים.
    const safeClientIp = clientIp.split(",")[0].trim().slice(0, 64) || "unknown";
    const rateCheck = checkRateLimit(`webhook:meshulam:${safeClientIp}`, WEBHOOK_RATE_LIMIT);
    if (!rateCheck.allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    // ── Anti-replay timestamp check (±5 דק') ──
    // HMAC לבד לא מספיק: תוקף שלכד payload חתום ושולח אותו שוב מאוחר יקבל
    // שוב חתימה תקפה. בדיקת timestamp חוסמת זאת.
    if (!verifyWebhookTimestamp(payload.timestamp, "meshulam")) {
      logger.warn("[meshulam] webhook timestamp out of range (replay rejected)");
      return NextResponse.json({ error: "Webhook expired" }, { status: 400 });
    }

    // ── Idempotency claim ──
    // Meshulam עלולים לשלוח retry על אותו אירוע (network duplication, server
    // crash). claimWebhook מבטיח שכל transactionId/paymentId יעובד פעם אחת.
    // ה-event type נכלל ב-key כדי שאירועים שונים על אותו ID לא יתערבבו.
    const idPart =
      payload.transactionId ?? payload.paymentId ?? payload.documentId;
    const externalId = idPart ? `${payload.type}:${idPart}` : null;
    if (!externalId) {
      logger.warn("[meshulam] webhook missing identifying ID — skipping idempotency", {
        type: payload.type,
      });
      // ממשיכים בלי claim — מסתמכים על rate-limit. ספק לא תקני שלא שולח ID
      // לא יקבל הגנת replay מלאה, אבל לפחות 5-min timestamp window כן עובד.
    }

    let claim: { eventId: string } | null = null;
    if (externalId) {
      const claimResult = await claimWebhook("MESHULAM", externalId, payload as object);
      if (claimResult.status === "already_processed") {
        logger.info("[meshulam] webhook already processed — idempotent", { externalId });
        // מחזיר תשובה זהה למסלול הרגיל — מונע info-disclosure על אילו
        // transactionIds כבר עובדו (חשוב אם ה-secret דולף ותוקף enumerates).
        return NextResponse.json({ received: true });
      }
      if (claimResult.status === "in_progress") {
        // worker אחר עוד עובד — Meshulam ינסה שוב.
        return new NextResponse("Webhook in progress", {
          status: 503,
          headers: { "Retry-After": "60" },
        });
      }
      claim = { eventId: claimResult.eventId };
    }

    // עיבוד עם retry אוטומטי - שגיאות נשמרות לניסיון חוזר
    const result = await withWebhookRetry("meshulam", payload.type, body, async () => {
      switch (payload.type) {
        case "payment.success":
          await handlePaymentSuccess(payload, safeClientIp);
          break;
        case "payment.failed":
          await handlePaymentFailed(payload, safeClientIp);
          break;
        case "subscription.created":
          await handleSubscriptionCreated(payload, safeClientIp);
          break;
        case "subscription.renewed":
          await handleSubscriptionRenewed(payload, safeClientIp);
          break;
        case "subscription.cancelled":
          await handleSubscriptionCancelled(payload, safeClientIp);
          break;
        default:
          logger.info("Unhandled webhook type:", { data: payload.type });
      }
    });

    if (!result.success) {
      logger.error("Webhook handler failed but saved for retry", { error: String(result.error) });
      // משחררים את ה-claim כדי ש-Meshulam יוכלו retry מאוחר.
      if (claim) {
        await releaseWebhookClaim(claim.eventId, String(result.error));
      }
    } else if (claim) {
      // עיבוד הושלם — מסמנים כסופי.
      await finalizeWebhook(claim.eventId);
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    logger.error("Meshulam webhook error", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}

/**
 * טיפול בתשלום מוצלח
 */
async function handlePaymentSuccess(
  payload: MeshulamWebhookPayload,
  clientIp: string
) {
  const { paymentId, customFields, amount, documentUrl, customerEmail, customerId } = payload;
  
  // בדיקה אם זה תשלום מנוי (לבעל המערכת) או תשלום מטופל
  if (customFields?.paymentId) {
    // ── אימות בעלות (anti-IDOR) ──
    // אסור לסמוך על customFields.therapistId מהpayload — תוקף עם חתימה
    // תקפה (חולשה לחילוץ secret) יכול לזייף את ה-paymentId/therapistId.
    // נאמת מול DB ונשתמש ב-therapistId האמיתי משם.
    const verified = await verifyPaymentOwnership(
      customFields.paymentId,
      customFields.therapistId
    );
    if (!verified) {
      logger.error(
        "[Meshulam] payment.success rejected — ownership verification failed",
        { paymentId: customFields.paymentId }
      );
      return; // לא לעדכן כלום — מתעלמים מ-webhook חשוד
    }

    // partial-aware: סטטוס נקבע לפי amount מול expectedAmount עם סף 0.001.
    // ב-Meshulam אין currently זרם של "תשלום חלקי דרך לינק" (השרת מקבל את
    // amount מ-Meshulam ולא יודע אם זה חלקי או מלא). אבל אם המטפל הגדיר
    // expectedAmount גדול יותר, צריך להתייחס לזה כ-PARTIAL ולא לסמן PAID.
    // עקבי עם Cardcom user webhook (route.ts:498-525) ו-charge-saved-token.
    const existingPayment = await prisma.payment.findUnique({
      where: { id: verified.paymentId },
      select: {
        amount: true,
        expectedAmount: true,
        parentPaymentId: true,
      },
    });
    if (!existingPayment) {
      logger.error("[Meshulam] payment.update failed — payment not found", {
        paymentId: verified.paymentId,
      });
      return;
    }
    const paymentExpected = Number(existingPayment.expectedAmount) || 0;
    const paymentAmount = Number(existingPayment.amount);
    const isFullyCovered = paymentAmount >= paymentExpected - 0.001;
    const finalStatus = isFullyCovered ? "PAID" : "PENDING";

    // ── Idempotency guard: replay defense (negative marker) ──────────
    // Meshulam עלול לדחוף הצלחה כמה פעמים. הגישה הקודמת השתמשה ב-
    // paidAt:null למסלול PARTIAL — אבל גם אחרי הריצה הראשונה paidAt
    // נשאר null במצב PENDING, אז replay עדיין יכול להתאים → התראה/מייל
    // כפולים. עכשיו מאמצים את דפוס Sumit: שומרים [PAID:${meshulamPid}]
    // ב-notes ומסננים על היעדרו. זהה גם ל-PAID וגם ל-PARTIAL.
    const meshulamPid = String(paymentId ?? "");
    const paidMarker = meshulamPid ? `[MESHULAM_PAID:${meshulamPid}]` : null;
    const fullPaymentRow = await prisma.payment.findUnique({
      where: { id: verified.paymentId },
      select: { notes: true },
    });
    const baseNotes = fullPaymentRow?.notes ?? "";
    const newNotes = paidMarker
      ? (baseNotes.includes(paidMarker)
          ? baseNotes
          : (baseNotes + (baseNotes.length ? " " : "") + paidMarker).trim())
      : baseNotes;

    const updateWhere: Record<string, unknown> = {
      id: verified.paymentId,
      client: { therapistId: verified.therapistId },
    };
    if (paidMarker) {
      updateWhere.OR = [
        { notes: null },
        { notes: { not: { contains: paidMarker } } },
      ];
    } else if (finalStatus === "PAID") {
      updateWhere.status = "PENDING";
    } else {
      updateWhere.paidAt = null;
    }
    const updateResult = await prisma.payment.updateMany({
      where: updateWhere,
      data: {
        status: finalStatus,
        paidAt: finalStatus === "PAID" ? new Date() : null,
        receiptUrl: documentUrl,
        hasReceipt: !!documentUrl,
        notes: newNotes,
      },
    });

    if (updateResult.count === 0) {
      logger.warn("[Meshulam] payment.update — already processed (replay)", {
        paymentId: verified.paymentId,
      });
      return; // replay — לא לבצע bump/notification/email שוב
    }

    // ── parent bump (additive completion via Meshulam) ──────────
    // אם ה-Payment הזה הוא child של parent עם תשלום מצטבר (תרחיש:
    // cash 200 + Meshulam link 150 → parent.amount=350 PAID). עקבי עם
    // הלוגיקה ב-Cardcom user webhook. רץ רק על ריצה ראשונה (count>0
    // לעיל מבטיח זאת).
    if (existingPayment.parentPaymentId && finalStatus === "PAID") {
      const parent = await prisma.payment.findUnique({
        where: { id: existingPayment.parentPaymentId },
        select: { amount: true, expectedAmount: true, paidAt: true },
      });
      if (parent) {
        const parentExpected = Number(parent.expectedAmount) || 0;
        const newTotal = Number(parent.amount) + paymentAmount;
        const parentFullyPaid = newTotal >= parentExpected - 0.001;
        await prisma.payment.update({
          where: { id: existingPayment.parentPaymentId },
          data: {
            amount: newTotal,
            status: parentFullyPaid ? "PAID" : "PENDING",
            paymentType: parentFullyPaid ? "FULL" : "PARTIAL",
            method: "CREDIT_CARD",
            paidAt: parentFullyPaid ? (parent.paidAt ?? new Date()) : null,
          },
        });
        if (parentFullyPaid) {
          await prisma.task.updateMany({
            where: {
              userId: verified.therapistId,
              relatedEntityId: existingPayment.parentPaymentId,
              type: "COLLECT_PAYMENT",
              status: { in: ["PENDING", "IN_PROGRESS"] },
            },
            data: { status: "COMPLETED" },
          });
        }
      }
    }

    // יצירת התראה למטפל — תמיד עם therapistId המאומת מ-DB
    await prisma.notification.create({
      data: {
        userId: verified.therapistId,
        type: "PAYMENT_REMINDER",
        title: "💳 תשלום התקבל",
        content: `התקבל תשלום בסך ₪${amount} מהמטופל`,
        status: "PENDING",
      },
    });

    // Send receipt email + complete COLLECT_PAYMENT task
    await completeWebhookPayment(verified.paymentId);
  } else if (payload.customerId) {
    // תשלום מנוי - מחפשים לפי המייל.
    // ── אימות anti-IDOR ──
    // לפני round-trip ל-resolver/tx: ודא ש-customerEmail+customerId תקפים,
    // user קיים, וה-event מתיישב עם state נוכחי. דוחה suspect cases + adminAlert.
    const verifiedUser = await verifyMeshulamSubscriptionUser(
      customerEmail,
      customerId,
      "payment_success",
      clientIp
    );
    if (!verifiedUser) {
      return;
    }
    // ── אימות סכום מול מחיר-אמת בצד השרת (anti amount-tampering) ──
    // התקופה נגזרת מהתאמת הסכום לטבלת המחירים של המשתמש, לא מהסכום כמספר חופשי.
    // סכום אפס/שגוי/לא-תואם → דחייה (לא הענקת מנוי).
    const detected = await matchSubscriptionPeriod(
      verifiedUser.id,
      verifiedUser.organizationId,
      verifiedUser.aiTier,
      amount ?? 0,
      new Date()
    );
    if (!detected) {
      await rejectUnpricedSubscriptionEvent(verifiedUser, "payment_success", amount, clientIp);
      return;
    }
    const { periodDays, periodLabel } = detected;
    const periodMs = periodDays * 24 * 60 * 60 * 1000;

    // עוטפים ב-transaction כדי שקריאת blockReason ועדכונו יהיו אטומיים —
    // מונע race עם PATCH אדמין שמשנה blockReason באותו רגע.
    // refetch לפי id (לא email) — שמירה על identity יציבה גם אם email משתנה.
    const txResult = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: verifiedUser.id },
      });

      if (!user) return null;

      const wasFree = user.isFreeSubscription;

      // שחרור אוטומטי רק אם DEBT או חסימה ישנה (blockReason=null — נחסמו לפני
      // הוספת השדה, כולן היסטורית על חוב). TOS_VIOLATION / MANUAL נשארים חסומים.
      const isLegacyOrDebt =
        user.blockReason === "DEBT" || user.blockReason === null;
      const shouldUnblock = user.isBlocked && isLegacyOrDebt;

      await tx.user.update({
        where: { id: user.id },
        data: {
          subscriptionStatus: "ACTIVE",
          subscriptionStartedAt: user.subscriptionStartedAt || new Date(),
          subscriptionEndsAt: new Date(Date.now() + periodMs),
          ...(wasFree && {
            isFreeSubscription: false,
            freeSubscriptionNote: null,
          }),
          ...(shouldUnblock && {
            isBlocked: false,
            blockReason: null,
            blockedAt: null,
            blockedBy: null,
          }),
        },
      });

      return { user, periodDays, periodMs, periodLabel, wasFree, shouldUnblock };
    });

    if (txResult) {
      const { user, periodMs, periodLabel, shouldUnblock } = txResult;

      // M10.2: סוגרים חלון של 30s שבו ה-JWT cache עוד מחזיק
      // subscriptionStatus/isBlocked ישנים. בלי זה — משתמש שתשלום שלו נקלט
      // עדיין רואה "חסום" עד שה-cache פג.
      invalidateJwtCache(user.id);

      if (shouldUnblock) {
        logger.info("[meshulam] auto-unblock on subscription payment (DEBT)", { userId: user.id });
      } else if (user.isBlocked) {
        logger.info("[meshulam] payment received but user stays blocked (non-DEBT)", {
          userId: user.id,
          blockReason: user.blockReason,
        });
      }

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
        }).catch(err => logger.error("Email to subscriber failed", { error: err instanceof Error ? err.message : String(err) }));
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
        }).catch(err => logger.error("Email to admin failed", { error: err instanceof Error ? err.message : String(err) }));
      }
    }
  }
}

/**
 * טיפול בתשלום שנכשל
 */
async function handlePaymentFailed(
  payload: MeshulamWebhookPayload,
  clientIp: string
) {
  const { customFields, errorMessage, customerEmail, customerId } = payload;

  if (customFields?.paymentId) {
    // ── אימות בעלות (anti-IDOR) ──
    const verified = await verifyPaymentOwnership(
      customFields.paymentId,
      customFields.therapistId
    );
    if (!verified) {
      logger.error(
        "[Meshulam] payment.failed rejected — ownership verification failed",
        { paymentId: customFields.paymentId }
      );
      return;
    }

    // תשלום מטופל שנכשל (atomic update)
    const updateResult = await prisma.payment.updateMany({
      where: {
        id: verified.paymentId,
        client: { therapistId: verified.therapistId },
      },
      data: {
        status: "PENDING", // נשאר ממתין
        notes: `תשלום נכשל: ${errorMessage}`,
      },
    });

    if (updateResult.count === 0) {
      logger.error("[Meshulam] payment.failed update — no rows affected", {
        paymentId: verified.paymentId,
      });
      return;
    }

    await prisma.notification.create({
      data: {
        userId: verified.therapistId,
        type: "CUSTOM",
        title: "❌ תשלום נכשל",
        content: `התשלום נכשל: ${errorMessage}`,
        status: "PENDING",
      },
    });
  } else {
    // תשלום מנוי שנכשל — ── אימות anti-IDOR ──
    // חשוב כאן: תוקף שיודע email יכול לכפות PAST_DUE + מייל מטעה על משתמש.
    const verifiedUser = await verifyMeshulamSubscriptionUser(
      customerEmail,
      customerId,
      "payment_failed",
      clientIp
    );
    if (!verifiedUser) {
      return;
    }
    // משתמשים ב-verifiedUser ישירות — כבר טעון עם השדות הדרושים. חוסך DB query.
    const user = verifiedUser;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        subscriptionStatus: "PAST_DUE",
      },
    });

    // M10.2: סוגרים חלון של 30s — אחרת המשתמש ימשיך לקבל subscriptionStatus="ACTIVE"
    // ב-JWT cache עד שה-cache פג, וזה נותן לו גישה לתכונות בתשלום שגויה.
    invalidateJwtCache(user.id);

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
              <h2 style="color: #333; margin-top: 0;">שלום ${escapeHtml(user.name || "")},</h2>
              <p style="color: #555; font-size: 16px;">התשלום על המנוי שלך לא עבר. אנא עדכן את פרטי התשלום כדי להמשיך להשתמש במערכת.</p>
              <div style="text-align: center; margin: 25px 0;">
                <a href="${billingUrl}" style="display: inline-block; background: #4f46e5; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-weight: bold;">
                  עדכן פרטי תשלום
                </a>
              </div>
            </div>
          </div>
        `,
      }).catch(err => logger.error("Payment failed email to user error", { error: err instanceof Error ? err.message : String(err) }));
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
      }).catch(err => logger.error("Payment failed email to admin error", { error: err instanceof Error ? err.message : String(err) }));
    }
  }
}

/**
 * טיפול ביצירת מנוי חדש
 */
async function handleSubscriptionCreated(
  payload: MeshulamWebhookPayload,
  clientIp: string
) {
  const { customerEmail, customerId, amount } = payload;

  // ── אימות anti-IDOR ──
  // ודא ש-user קיים והאירוע מתיישב עם state נוכחי (לא ACTIVE עם endsAt עתידי
  // משמעותי, לא PAUSED, לא hard-blocked). דוחה suspect cases + adminAlert.
  const verifiedUser = await verifyMeshulamSubscriptionUser(
    customerEmail,
    customerId,
    "created",
    clientIp
  );
  if (!verifiedUser) return;

  // ── אימות סכום מול מחיר-אמת בצד השרת (anti amount-tampering) ──
  const detected = await matchSubscriptionPeriod(
    verifiedUser.id,
    verifiedUser.organizationId,
    verifiedUser.aiTier,
    amount ?? 0,
    new Date()
  );
  if (!detected) {
    await rejectUnpricedSubscriptionEvent(verifiedUser, "created", amount, clientIp);
    return;
  }
  const { periodDays, periodLabel } = detected;
  const periodMs = periodDays * 24 * 60 * 60 * 1000;

  // עוטפים ב-transaction כדי שקריאת blockReason ועדכון יהיו אטומיים
  // (מונע race עם PATCH אדמין שמשנה blockReason באותו זמן).
  // refetch לפי id (לא email) — identity יציבה.
  const txResult = await prisma.$transaction(async (tx) => {
    const user = await tx.user.findUnique({
      where: { id: verifiedUser.id },
    });
    if (!user) return null;

    // auto-unblock רק על DEBT או חסימה ישנה (legacy null) — TOS/MANUAL נשארים
    const shouldUnblockOnCreate =
      user.isBlocked &&
      (user.blockReason === "DEBT" || user.blockReason === null);
    await tx.user.update({
      where: { id: user.id },
      data: {
        subscriptionStatus: "ACTIVE",
        subscriptionStartedAt: new Date(),
        subscriptionEndsAt: new Date(Date.now() + periodMs),
        ...(shouldUnblockOnCreate && {
          isBlocked: false,
          blockReason: null,
          blockedAt: null,
          blockedBy: null,
        }),
      },
    });

    return { user, periodMs, periodLabel, shouldUnblockOnCreate };
  });

  if (txResult) {
    const { user, periodLabel, shouldUnblockOnCreate } = txResult;

    // M10.2: סוגרים חלון של 30s ב-JWT cache.
    invalidateJwtCache(user.id);

    if (shouldUnblockOnCreate) {
      logger.info("[meshulam] auto-unblock on subscription created (DEBT)", { userId: user.id });
    }

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
      }).catch(err => logger.error("Welcome email failed", { error: err instanceof Error ? err.message : String(err) }));
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
      }).catch(err => logger.error("Admin new sub email failed", { error: err instanceof Error ? err.message : String(err) }));
    }
  }
}

/**
 * טיפול בחידוש מנוי
 */
async function handleSubscriptionRenewed(
  payload: MeshulamWebhookPayload,
  clientIp: string
) {
  const { customerEmail, customerId, amount, documentUrl } = payload;

  // ── אימות anti-IDOR ──
  // renewed דורש היסטוריה של תשלום קודם — מונע יצירת mock renewal עבור משתמש
  // שמעולם לא היה לו תשלום מנוי דרך Meshulam.
  const verifiedUser = await verifyMeshulamSubscriptionUser(
    customerEmail,
    customerId,
    "renewed",
    clientIp
  );
  if (!verifiedUser) return;

  // verifiedUser מספק את כל השדות שצריך מחוץ ל-tx. ה-tx עצמו יבצע refetch
  // לפי id כדי לקבל state עדכני של isBlocked/blockReason/isFreeSubscription
  // בצורה אטומית מול PATCH אדמין מקביל.
  const user = verifiedUser;

  // ── אימות סכום מול מחיר-אמת בצד השרת (anti amount-tampering) ──
  // קריאה מחוץ ל-tx — DB query של ה-resolver לא תאריך את ה-lock.
  const detected = await matchSubscriptionPeriod(
    user.id,
    user.organizationId,
    user.aiTier,
    amount ?? 0,
    new Date()
  );
  if (!detected) {
    await rejectUnpricedSubscriptionEvent(user, "renewed", amount, clientIp);
    return;
  }
  const { periodDays, periodLabel } = detected;
  const periodMs = periodDays * 24 * 60 * 60 * 1000;

  // עוטפים בעדכון תוך-tx — מבטיח שקריאת blockReason ועדכון אטומיים מול
  // PATCH אדמין שעלול לרוץ במקביל.
  const renewResult = await prisma.$transaction(async (tx) => {
    const fresh = await tx.user.findUnique({ where: { id: user.id } });
    if (!fresh) return null;
    const wasFree = fresh.isFreeSubscription;

    // auto-unblock רק על DEBT או חסימה ישנה (legacy null) — TOS/MANUAL נשארים
    const shouldUnblockOnRenew =
      fresh.isBlocked &&
      (fresh.blockReason === "DEBT" || fresh.blockReason === null);
    await tx.user.update({
      where: { id: fresh.id },
      data: {
        subscriptionStatus: "ACTIVE",
        subscriptionEndsAt: new Date(Date.now() + periodMs),
        ...(wasFree && {
          isFreeSubscription: false,
          freeSubscriptionNote: null,
        }),
        ...(shouldUnblockOnRenew && {
          isBlocked: false,
          blockReason: null,
          blockedAt: null,
          blockedBy: null,
        }),
      },
    });

    return { fresh, shouldUnblockOnRenew };
  });

  if (!renewResult) return;
  const { shouldUnblockOnRenew } = renewResult;

  // M10.2: סוגרים חלון של 30s ב-JWT cache.
  invalidateJwtCache(user.id);

  if (shouldUnblockOnRenew) {
    logger.info("[meshulam] auto-unblock on subscription renewed (DEBT)", { userId: user.id });
  }

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
    }).catch(err => logger.error("Renewal email to user failed", { error: err instanceof Error ? err.message : String(err) }));
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
    }).catch(err => logger.error("Renewal email to admin failed", { error: err instanceof Error ? err.message : String(err) }));
  }
}

/**
 * טיפול בביטול מנוי
 */
async function handleSubscriptionCancelled(
  payload: MeshulamWebhookPayload,
  clientIp: string
) {
  const { customerEmail, customerId } = payload;

  // ── אימות anti-IDOR ──
  // מונע ביטול מזויף של מנוי משתמש אחר ע"י זיוף email בפיילואד חתום.
  const verifiedUser = await verifyMeshulamSubscriptionUser(
    customerEmail,
    customerId,
    "cancelled",
    clientIp
  );
  if (!verifiedUser) return;

  // משתמשים ב-verifiedUser ישירות — חוסך DB fetch כפול.
  const user = verifiedUser;
  await prisma.user.update({
    where: { id: user.id },
    data: {
      subscriptionStatus: "CANCELLED",
    },
  });

  // M10.2: סוגרים חלון של 30s ב-JWT cache.
  invalidateJwtCache(user.id);

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
            <h2 style="color: #333; margin-top: 0;">שלום ${escapeHtml(user.name || "")},</h2>
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
    }).catch(err => logger.error("Cancellation email to user failed", { error: err instanceof Error ? err.message : String(err) }));
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
    }).catch(err => logger.error("Cancellation email to admin failed", { error: err instanceof Error ? err.message : String(err) }));
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
  const safeReceiptUrl = safeHttpUrl(receiptUrl);
  const receiptLink = safeReceiptUrl
    ? `<p style="text-align: center; margin-top: 15px;"><a href="${escapeHtml(safeReceiptUrl)}" style="color: #4f46e5;">📄 הורד קבלה</a></p>`
    : "";

  return `
    <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; padding: 20px; background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%); border-radius: 12px 12px 0 0;">
        <h1 style="color: white; margin: 0; font-size: 24px;">✅ המנוי פעיל!</h1>
      </div>
      <div style="background: #fff; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px;">
        <h2 style="color: #333; margin-top: 0;">שלום ${escapeHtml(name)},</h2>
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
          <p style="margin: 0; font-size: 15px; color: #1e293b;">${escapeHtml(message)}</p>
        </div>
        <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
          <tr><td style="padding: 8px 0; color: #64748b;">שם:</td><td style="padding: 8px 0;"><strong>${escapeHtml(userName)}</strong></td></tr>
          <tr><td style="padding: 8px 0; color: #64748b;">מייל:</td><td style="padding: 8px 0;">${escapeHtml(userEmail)}</td></tr>
          <tr><td style="padding: 8px 0; color: #64748b;">מסלול:</td><td style="padding: 8px 0;">${planName}</td></tr>
          ${amount > 0 ? `<tr><td style="padding: 8px 0; color: #64748b;">סכום:</td><td style="padding: 8px 0;"><strong>₪${amount}</strong></td></tr>` : ""}
        </table>
      </div>
      <div style="background: #f8fafc; padding: 12px 20px; border: 1px solid #e2e8f0; border-top: none; border-radius: 0 0 8px 8px;">
        <p style="margin: 0; color: #94a3b8; font-size: 12px; text-align: center;">
          ${new Date().toLocaleString("he-IL", { timeZone: "Asia/Jerusalem" })} | <a href="${SYSTEM_URL}/admin/billing" style="color: #0ea5e9;">פאנל ניהול</a>
        </p>
      </div>
    </div>
  `;
}

