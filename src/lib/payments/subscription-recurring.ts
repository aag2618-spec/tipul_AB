// ============================================================================
// Subscription Recurring Charge — חיוב חודשי אוטומטי
// ============================================================================
// chargeNextSubscription({ subscriptionPaymentId }) — מבצע חיוב חוזר
// על SubscriptionPayment קיים שהגיע ל-nextChargeAt. נקרא ע"י cron יומי
// (/api/cron/subscription-recurring-charge).
//
// זרימה (atomic where possible):
//   1. ATOMIC CLAIM: updateMany על sp.lastAttemptAt — רק אם NULL או ישן (>10ד).
//      מונע double-charge אם 2 workers רצים על אותו spId במקביל
//      (sequential connection pool — advisory lock לא יציב).
//   2. fetch sp + savedCardToken + user.
//   3. token expiry → DECLINED + dunning + block אם אחרון.
//   4. צור CardcomTransaction חדש (uniqueAsmachta=tx.id).
//   5. client.chargeToken({ token, amount, document, uniqueAsmachta }).
//   6. APPROVED → withAudit transaction:
//        - update tx → APPROVED.
//        - update sp → chargeAttempts=0, lastChargeError=null.
//        - create new SubscriptionPayment לתקופה הבאה (status=PAID, nextChargeAt=newEnd).
//        - update User → subscriptionEndsAt=newEnd, status=ACTIVE, isBlocked=false (DEBT only).
//   7. DECLINED → withAudit:
//        - update tx → DECLINED.
//        - update sp → chargeAttempts++, lastChargeError, nextChargeAt=retrySchedule.
//        - update User → subscriptionStatus=PAST_DUE.
//        - אם attempts >= 3 → isBlocked=true, blockReason=DEBT.
//      שלח dunning email לפי המספר.
//
// סייגים:
//   - שבת/חג: ה-cron מדלג. ה-helper הזה לא בודק (משחק רק כשנקרא).
//   - duplicate charge: uniqueAsmachta ב-Cardcom + lastAttemptAt lease בDB.
//   - token expiry: dunning final + לא מנסים ב-Cardcom (מונע decline מיותר).
//   - PAUSED users: cron לא ייתפס אותם (סינון מראש).
//
// קריטי לכסף — לפי feedback_critical_changes_process: TDD ראשון בקובץ
// __tests__/subscription-recurring.test.ts. כל שינוי לוגיקה חייב טסט קודם.
// ============================================================================

import "server-only";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { withAudit } from "@/lib/audit";
import { invalidateJwtCache } from "@/lib/auth";
import { getAdminCardcomClient } from "@/lib/cardcom/admin-config";
import { getAdminBusinessProfile } from "@/lib/site-settings";
import { scrubCardcomMessage } from "@/lib/cardcom/verify-webhook";
import { PLAN_NAMES } from "@/lib/pricing";
import {
  sendChargeFailedAttempt1Email,
  sendChargeFailedAttempt2Email,
  sendChargeFailedFinalEmail,
  sendAccountBlockedEmail,
} from "@/lib/emails/dunning";
import {
  calculateNextAttemptDate,
  shouldBlockAfterAttempt,
  isTokenExpired,
  getPeriodMonthsFromDates,
  addCalendarMonths,
  MAX_CHARGE_ATTEMPTS,
} from "@/lib/payments/subscription-recurring-helpers";
import type { Prisma } from "@prisma/client";

// Local types — תואמים בדיוק את ה-select שמתבצע ב-findUnique.
// לא מסתמכים על GetPayload עם include:true כי select מצמצם שדות.
type SpUserContext = {
  id: string;
  name: string | null;
  email: string | null;
  subscriptionStatus: "ACTIVE" | "TRIALING" | "PAST_DUE" | "CANCELLED" | "PAUSED";
  subscriptionEndsAt: Date | null;
  isBlocked: boolean;
  blockReason: string | null;
  aiTier: "ESSENTIAL" | "PRO" | "ENTERPRISE";
  organizationId: string | null;
  billingPaidByClinic: boolean;
};

// SpForDecline — מה שצריך לhandleDeclineDb (לא צריך savedCardToken).
type SpForDecline = Prisma.SubscriptionPaymentGetPayload<true> & {
  user: SpUserContext;
};

/**
 * lease של 3 דקות. Render serverless נחתך ב-60s; Cardcom 15s × 3 retries +
 * Resend ~5s + withAudit retries (Serializable, עד 30s) = עד ~60s. lease של
 * 3 דקות נותן באפר נוח לפני שworker אחר יכול לקחת.
 */
const CLAIM_LEASE_MS = 3 * 60 * 1000;

export interface ChargeNextSubscriptionResult {
  ok: boolean;
  status:
    | "approved"
    | "declined"
    | "skipped_not_eligible"
    | "skipped_in_progress"
    | "skipped_token_expired"
    | "error";
  newSubscriptionPaymentId?: string;
  cardcomTransactionId?: string;
  errorCode?: string;
  errorMessage?: string;
}

/**
 * חייב את ה-SubscriptionPayment הנתון. מקדם את התקופה אם הצליח,
 * מתזמן retry אם נכשל, חוסם משתמש אחרי 3 כישלונות.
 */
export async function chargeNextSubscription(params: {
  subscriptionPaymentId: string;
}): Promise<ChargeNextSubscriptionResult> {
  const { subscriptionPaymentId } = params;
  const now = new Date();
  const leaseCutoff = new Date(now.getTime() - CLAIM_LEASE_MS);

  // ── שלב 1: Atomic claim — מונע double-charge ──────────────────────
  // updateMany עם תנאים: רק אם autoCharge פעיל, יש token, nextChargeAt עבר,
  // ולא נטען לאחרונה. count===0 → לא לחייב (טופל / לא מתאים).
  // הגנת user — מונע "ניסיון רפאים" שתופס lease ל-3 דקות סתם.
  // PAUSED / billingPaidByClinic / isFreeSubscription / TOS_VIOLATION block
  // לא צריכים להגיע ל-chargeToken בכלל. ה-double-check בשלב 2 הוא safety net.
  const claim = await prisma.subscriptionPayment.updateMany({
    where: {
      id: subscriptionPaymentId,
      autoChargeEnabled: true,
      savedCardTokenId: { not: null },
      nextChargeAt: { lte: now },
      OR: [
        { lastAttemptAt: null },
        { lastAttemptAt: { lt: leaseCutoff } },
      ],
      user: {
        subscriptionStatus: { in: ["ACTIVE", "PAST_DUE"] },
        isFreeSubscription: false,
        billingPaidByClinic: false,
        // isBlocked=false או blockReason=DEBT (יישחרר בהצלחה).
        // TOS_VIOLATION / MANUAL חייב פעולת אדמין — לא לחייב.
        OR: [
          { isBlocked: false },
          { isBlocked: true, blockReason: { in: ["DEBT"] } },
          { isBlocked: true, blockReason: null }, // legacy: כל החסימות הישנות היו DEBT
        ],
      },
      savedCardToken: {
        is: { isActive: true, deletedAt: null },
      },
    },
    data: { lastAttemptAt: now },
  });

  if (claim.count === 0) {
    logger.info("[subscription-recurring] skipped — not eligible or in-progress", {
      subscriptionPaymentId,
    });
    return { ok: true, status: "skipped_in_progress" };
  }

  // ── שלב 2: שלוף את הפרטים המלאים ──────────────────────
  const sp = await prisma.subscriptionPayment.findUnique({
    where: { id: subscriptionPaymentId },
    include: {
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          subscriptionStatus: true,
          subscriptionEndsAt: true,
          isBlocked: true,
          blockReason: true,
          aiTier: true,
          organizationId: true,
          billingPaidByClinic: true,
        },
      },
      savedCardToken: true,
    },
  });

  if (!sp || !sp.user || !sp.savedCardToken) {
    logger.error("[subscription-recurring] sp / user / savedCardToken missing after claim", {
      subscriptionPaymentId,
    });
    return { ok: false, status: "error", errorMessage: "missing related records" };
  }

  // double-check: אל תחייב משתמש PAUSED, BLOCKED-non-DEBT, או billingPaidByClinic
  if (
    sp.user.subscriptionStatus === "PAUSED" ||
    sp.user.billingPaidByClinic ||
    (sp.user.isBlocked && sp.user.blockReason !== "DEBT" && sp.user.blockReason !== null)
  ) {
    logger.info("[subscription-recurring] skipped — user not chargeable", {
      subscriptionPaymentId,
      userId: sp.user.id,
      subscriptionStatus: sp.user.subscriptionStatus,
      isBlocked: sp.user.isBlocked,
      blockReason: sp.user.blockReason,
      billingPaidByClinic: sp.user.billingPaidByClinic,
    });
    // ננקה nextChargeAt כדי לא לתפוס שוב מחר
    await prisma.subscriptionPayment.update({
      where: { id: sp.id },
      data: { autoChargeEnabled: false, nextChargeAt: null },
    });
    return { ok: true, status: "skipped_not_eligible" };
  }

  // ── שלב 3: token expiry check ──────────────────────
  const token = sp.savedCardToken;
  if (
    isTokenExpired({
      expiryMonth: token.expiryMonth,
      expiryYear: token.expiryYear,
      now,
    })
  ) {
    logger.warn("[subscription-recurring] saved card token expired", {
      subscriptionPaymentId,
      userId: sp.user.id,
      expiryMonth: token.expiryMonth,
      expiryYear: token.expiryYear,
    });

    const attempt = sp.chargeAttempts + 1;
    const willBlock = shouldBlockAfterAttempt(attempt);

    await handleDeclineDb({
      sp,
      attemptNumber: attempt,
      errorCode: "TOKEN_EXPIRED",
      errorMessage: "כרטיס פג תוקף",
      cardcomTransactionId: null,
      cardcomTxStatus: null,
      willBlock,
      now,
    });

    await sendDunningEmailIdempotent({
      attempt,
      sp,
      gracePeriodDays: 7,
    });

    if (willBlock && sp.user.email) {
      await sendAccountBlockedEmail({
        email: sp.user.email,
        name: sp.user.name,
        planTier: sp.user.aiTier,
        amount: Number(sp.amount),
      });
    }

    return { ok: true, status: "skipped_token_expired" };
  }

  // ── שלב 4: צור CardcomTransaction חדש ──────────────────────
  const newTransaction = await prisma.cardcomTransaction.create({
    data: {
      tenant: "ADMIN",
      userId: sp.user.id,
      subscriptionPaymentId: sp.id,
      amount: sp.amount,
      currency: sp.currency,
      status: "PENDING",
      cardLast4: token.cardLast4,
      cardHolder: token.cardHolder,
      cardBrand: token.cardBrand,
      attemptNumber: sp.chargeAttempts + 1,
    },
  });

  // ── שלב 5: chargeToken ──────────────────────
  let cardcomResult;
  try {
    const client = await getAdminCardcomClient();
    const businessProfile = await getAdminBusinessProfile();
    const documentType =
      businessProfile.type === "LICENSED" ? "TaxInvoiceAndReceipt" : "Receipt";
    const description = sp.description ?? `חידוש מנוי ${PLAN_NAMES[sp.user.aiTier] ?? sp.user.aiTier}`;

    cardcomResult = await client.chargeToken({
      token: token.token,
      amount: Number(sp.amount),
      cardExpiration: { month: token.expiryMonth, year: token.expiryYear },
      description,
      uniqueAsmachta: newTransaction.id,
      document: {
        documentType,
        customer: {
          name: sp.user.name || "משתמש",
          email: sp.user.email || undefined,
        },
        products: [
          {
            description,
            unitCost: Number(sp.amount),
            quantity: 1,
          },
        ],
      },
    });
  } catch (cardcomErr) {
    // HTTP error / timeout — נחשב לכישלון רגיל וננסה שוב לפי הלוח.
    // ה-tx.update קורה בתוך handleDeclineDb (withAudit) כדי שהכל אטומי.
    const rawMsg =
      cardcomErr instanceof Error ? cardcomErr.message : String(cardcomErr);
    const scrubbed = scrubCardcomMessage(rawMsg) ?? "שגיאת תקשורת";

    const attempt = sp.chargeAttempts + 1;
    const willBlock = shouldBlockAfterAttempt(attempt);

    await handleDeclineDb({
      sp,
      attemptNumber: attempt,
      errorCode: "HTTP_ERROR",
      errorMessage: scrubbed,
      cardcomTransactionId: newTransaction.id,
      cardcomTxStatus: "FAILED",
      willBlock,
      now,
    });

    await sendDunningEmailIdempotent({ attempt, sp, gracePeriodDays: 7 });
    if (willBlock && sp.user.email) {
      await sendAccountBlockedEmail({
        email: sp.user.email,
        name: sp.user.name,
        planTier: sp.user.aiTier,
        amount: Number(sp.amount),
      });
    }

    logger.error("[subscription-recurring] chargeToken HTTP error", {
      subscriptionPaymentId,
      cardcomTransactionId: newTransaction.id,
      attempt,
      error: scrubbed,
    });

    return {
      ok: false,
      status: "error",
      cardcomTransactionId: newTransaction.id,
      errorMessage: scrubbed,
    };
  }

  // ── שלב 6: טיפול בתוצאה ──────────────────────
  if (cardcomResult.responseCode !== "0") {
    const attempt = sp.chargeAttempts + 1;
    const willBlock = shouldBlockAfterAttempt(attempt);
    const scrubbedErr = scrubCardcomMessage(cardcomResult.errorMessage) ?? "החיוב נדחה";

    // CardcomTransaction.update קורה בתוך handleDeclineDb (אטומי עם sp+user).
    await handleDeclineDb({
      sp,
      attemptNumber: attempt,
      errorCode: cardcomResult.responseCode,
      errorMessage: scrubbedErr,
      cardcomTransactionId: newTransaction.id,
      cardcomTxStatus: "DECLINED",
      willBlock,
      now,
    });

    await sendDunningEmailIdempotent({ attempt, sp, gracePeriodDays: 7 });
    if (willBlock && sp.user.email) {
      await sendAccountBlockedEmail({
        email: sp.user.email,
        name: sp.user.name,
        planTier: sp.user.aiTier,
        amount: Number(sp.amount),
      });
    }

    return {
      ok: true,
      status: "declined",
      cardcomTransactionId: newTransaction.id,
      errorCode: cardcomResult.responseCode,
      errorMessage: scrubbedErr,
    };
  }

  // ── הצלחה — withAudit transaction ──────────────────────
  // מחשבים תקופה חדשה לפי מספר חודשים (calendar-aware, לא ms קשיח) —
  // כך 1/3/6/12 חודשים שומרים על אותו יום בחודש לאורך זמן.
  // periodMonths נחשב מ-periodStart/periodEnd המקוריים של ה-SP — לא מושפע
  // מהארכה ידנית של אדמין שדוחה רק את nextChargeAt.
  const periodMonths = getPeriodMonthsFromDates(sp.periodStart, sp.periodEnd);
  const oldEnd = sp.periodEnd ?? now;
  // newPeriodStart = max(periodEnd, now) — אם אדמין הריץ extend_subscription
  // שדחה את nextChargeAt קדימה (periodEnd נשאר ישן), התקופה החדשה תתחיל מעכשיו
  // ולא מ-periodEnd הישן. אחרת היה נוצר SP חדש בעבר ש-subscriptionEndsAt
  // היה יורד לאחור מתחת לערך הנוכחי.
  const newPeriodStart = oldEnd.getTime() > now.getTime() ? oldEnd : now;
  const newPeriodEnd = addCalendarMonths(newPeriodStart, periodMonths);

  const newSpId = await withAudit(
    { kind: "system", source: "CRON", externalRef: "subscription-recurring-charge" },
    {
      action: "subscription_recurring_charged",
      targetType: "user",
      targetId: sp.user.id,
      details: {
        previousSubscriptionPaymentId: sp.id,
        cardcomTransactionId: newTransaction.id,
        amount: Number(sp.amount),
        periodStart: newPeriodStart.toISOString(),
        periodEnd: newPeriodEnd.toISOString(),
        attempt: sp.chargeAttempts + 1,
        approvalNumber: cardcomResult.approvalNumber,
      },
    },
    async (tx) => {
      const completedAt = new Date();
      await tx.cardcomTransaction.update({
        where: { id: newTransaction.id },
        data: {
          status: "APPROVED",
          transactionId: cardcomResult.transactionId,
          approvalNumber: cardcomResult.approvalNumber,
          completedAt,
        },
      });

      // הקיים sp נשאר PAID (כבר היה). מאפסים מצב dunning ומבטלים autoCharge
      // כי החיוב הבא יבוצע על ה-sp החדש.
      await tx.subscriptionPayment.update({
        where: { id: sp.id },
        data: {
          chargeAttempts: 0,
          lastChargeError: null,
          firstAttemptAt: null,
          dunningSentAttempt: 0,
          autoChargeEnabled: false,
          nextChargeAt: null,
        },
      });

      // sp חדש לתקופה הבאה — אתחול מפורש של dunning state
      // (אל תסמכי על Prisma defaults, כדי שיהיה ברור גם בקריאת הקוד).
      const created = await tx.subscriptionPayment.create({
        data: {
          userId: sp.user.id,
          amount: sp.amount,
          currency: sp.currency,
          status: "PAID",
          description: sp.description,
          periodStart: newPeriodStart,
          periodEnd: newPeriodEnd,
          paidAt: completedAt,
          method: "CREDIT_CARD",
          autoChargeEnabled: true,
          savedCardTokenId: token.id,
          nextChargeAt: newPeriodEnd,
          planTier: sp.planTier,
          chargeAttempts: 0,
          lastChargeError: null,
          lastAttemptAt: null,
          firstAttemptAt: null,
          dunningSentAttempt: 0,
        },
      });

      // קשר את ה-transaction ל-sp החדש (אם נשתמש בעתיד)
      // ה-tx כבר קשור ל-sp הקודם — נשאיר לאודיט.

      await tx.savedCardToken.update({
        where: { id: token.id },
        data: { lastUsedAt: completedAt },
      });

      // עדכון User: הארכת subscriptionEndsAt, ACTIVE (אם לא PAUSED),
      // unblock אם הסיבה היא DEBT (חוב נפרע אוטומטית).
      const shouldUnblock =
        sp.user.isBlocked &&
        (sp.user.blockReason === "DEBT" || sp.user.blockReason === null);

      // הגנה כפולה: subscriptionEndsAt לעולם לא יורד. אם אדמין הריץ
      // extend_subscription והוסיף ימים מעבר ל-newPeriodEnd, נשמור את הערך
      // הגבוה יותר כדי שהמשתמש לא יאבד את ההארכה.
      const currentEndsAt = sp.user.subscriptionEndsAt;
      const finalEndsAt =
        currentEndsAt && currentEndsAt.getTime() > newPeriodEnd.getTime()
          ? currentEndsAt
          : newPeriodEnd;

      await tx.user.update({
        where: { id: sp.user.id },
        data: {
          subscriptionEndsAt: finalEndsAt,
          ...(sp.user.subscriptionStatus !== "PAUSED" && {
            subscriptionStatus: "ACTIVE",
          }),
          ...(shouldUnblock && {
            isBlocked: false,
            blockReason: null,
            blockedAt: null,
            blockedBy: null,
          }),
        },
      });

      return created.id;
    }
  );

  // M10.2: subscriptionStatus/subscriptionEndsAt/isBlocked עלולים להשתנות.
  // סוגרים חלון של 30s ב-JWT cache.
  invalidateJwtCache(sp.user.id);

  logger.info("[subscription-recurring] charged successfully", {
    previousSubscriptionPaymentId: sp.id,
    newSubscriptionPaymentId: newSpId,
    userId: sp.user.id,
    amount: Number(sp.amount),
    cardcomTransactionId: newTransaction.id,
  });

  return {
    ok: true,
    status: "approved",
    newSubscriptionPaymentId: newSpId,
    cardcomTransactionId: newTransaction.id,
  };
}

// ============================================================================
// Internal helpers
// ============================================================================

/**
 * עדכוני DB אטומיים אחרי DECLINED / token-expired / HTTP error.
 * sp.chargeAttempts++, lastChargeError, nextChargeAt לפי לוח retry.
 * User → PAST_DUE; אם attemptNumber >= MAX → isBlocked=true (DEBT).
 */
async function handleDeclineDb(params: {
  sp: SpForDecline;
  attemptNumber: number;
  errorCode: string;
  errorMessage: string;
  cardcomTransactionId: string | null;
  cardcomTxStatus: "DECLINED" | "FAILED" | null;
  willBlock: boolean;
  now: Date;
}): Promise<void> {
  const {
    sp,
    attemptNumber,
    errorCode,
    errorMessage,
    cardcomTransactionId,
    cardcomTxStatus,
    willBlock,
    now,
  } = params;

  // לוח retry relative-to-first-attempt (לא relative-to-now), כדי שיום-3 יחול
  // 2 ימים אחרי יום-1 ולא 2 ימים אחרי יום-2. שומרים firstAttemptAt ב-DB
  // בניסיון 1 כדי שניסיון 2/3 יוכלו לקרוא אותו.
  const firstAttemptDate =
    attemptNumber === 1 ? now : (sp.firstAttemptAt ?? now);
  const nextDay = calculateNextAttemptDate({
    firstAttemptDate,
    attemptJustCompleted: attemptNumber,
  });

  await withAudit(
    { kind: "system", source: "CRON", externalRef: "subscription-recurring-charge" },
    {
      action: willBlock
        ? "subscription_recurring_failed_block"
        : "subscription_recurring_failed_retry",
      targetType: "user",
      targetId: sp.user.id,
      details: {
        subscriptionPaymentId: sp.id,
        cardcomTransactionId,
        attempt: attemptNumber,
        errorCode,
        errorMessage,
        nextRetryAt: nextDay?.toISOString() ?? null,
        willBlock,
        amount: Number(sp.amount),
      },
    },
    async (tx) => {
      // CardcomTransaction status — בתוך אותו tx כדי שלא יסתיים DECLINED
      // ב-DB עם sp.chargeAttempts לא מעודכן (race שמוביל לחיוב כפול).
      if (cardcomTransactionId && cardcomTxStatus) {
        await tx.cardcomTransaction.update({
          where: { id: cardcomTransactionId },
          data: {
            status: cardcomTxStatus,
            errorCode,
            errorMessage: errorMessage.substring(0, 500),
            completedAt: now,
          },
        });
      }

      await tx.subscriptionPayment.update({
        where: { id: sp.id },
        data: {
          chargeAttempts: attemptNumber,
          lastChargeError: errorMessage.substring(0, 500),
          lastAttemptAt: now,
          // שמור firstAttemptAt רק בניסיון 1 (אם לא קיים כבר)
          ...(attemptNumber === 1 && !sp.firstAttemptAt && { firstAttemptAt: now }),
          ...(nextDay
            ? { nextChargeAt: nextDay }
            : { autoChargeEnabled: false, nextChargeAt: null }),
          ...(willBlock && { status: "OVERDUE" as const }),
        },
      });

      // המשתמש עובר ל-PAST_DUE (אם לא PAUSED). חסימה רק בכישלון 3.
      const updateUser: Prisma.UserUpdateInput = {};
      if (sp.user.subscriptionStatus !== "PAUSED") {
        updateUser.subscriptionStatus = "PAST_DUE";
      }
      if (willBlock) {
        updateUser.isBlocked = true;
        updateUser.blockReason = "DEBT";
        updateUser.blockedAt = now;
        updateUser.blockedBy = null;
      }
      if (Object.keys(updateUser).length > 0) {
        await tx.user.update({ where: { id: sp.user.id }, data: updateUser });
      }
    }
  );

  // M10.2: סוגרים חלון של 30s ב-JWT cache — subscriptionStatus עבר ל-PAST_DUE
  // (ואולי isBlocked=true). בלי זה משתמש שצריך להיחסם ימשיך לפעול 30s.
  invalidateJwtCache(sp.user.id);
}

/**
 * dunning email לפי מספר הניסיון, idempotent.
 * משתמש ב-sp.dunningSentAttempt כדי למנוע כפילות:
 * - atomic claim של dunningSentAttempt → ה-attempt הנוכחי (רק אם < attempt)
 * - אם claim הצליח (count===1): שולחים email
 * - אחרת: כבר נשלח (cron הקודם, או retry של אותו cron)
 *
 * אחרי 3 — final + accountBlocked נשלח בנפרד.
 */
async function sendDunningEmailIdempotent(params: {
  attempt: number;
  sp: { id: string; user: { name: string | null; email: string | null; aiTier: string }; amount: Prisma.Decimal };
  gracePeriodDays: number;
}): Promise<void> {
  const { attempt, sp, gracePeriodDays } = params;
  if (!sp.user.email) return;

  // atomic claim: עדכן רק אם לא נשלח כבר ה-attempt הזה (או גדול ממנו).
  // dunningSentAttempt monotonically increasing — מבטיח שלא נשלח email לאחור.
  const claim = await prisma.subscriptionPayment.updateMany({
    where: { id: sp.id, dunningSentAttempt: { lt: attempt } },
    data: { dunningSentAttempt: attempt },
  });
  if (claim.count === 0) {
    logger.info("[subscription-recurring] dunning already sent — skipping", {
      subscriptionPaymentId: sp.id,
      attempt,
    });
    return;
  }

  const recipient = {
    email: sp.user.email,
    name: sp.user.name,
    planTier: sp.user.aiTier,
    amount: Number(sp.amount),
  };
  try {
    if (attempt === 1) {
      await sendChargeFailedAttempt1Email(recipient);
    } else if (attempt === 2) {
      await sendChargeFailedAttempt2Email(recipient);
    } else if (attempt >= MAX_CHARGE_ATTEMPTS) {
      await sendChargeFailedFinalEmail({ ...recipient, gracePeriodDays });
    }
  } catch (err) {
    logger.error("[subscription-recurring] dunning email send failed", {
      attempt,
      email: sp.user.email,
      error: err instanceof Error ? err.message : String(err),
    });
    // לא להחזיר ל-dunningSentAttempt — adversary safer (מייל אחד שלא נשלח עדיף
    // על שני מיילים עם תוכן זהה למשתמש).
  }
}
