// ============================================================================
// CRON: Subscription Recurring Charge
// ============================================================================
// רץ יומית ב-09:00. מאתר SubscriptionPayment שצריך לחיוב חוזר
// ומחייב כל אחד דרך chargeNextSubscription. דילוג בשבת/חג.
//
// סינון:
//   - autoChargeEnabled = true
//   - savedCardTokenId IS NOT NULL
//   - nextChargeAt <= now
//   - User.subscriptionStatus IN (ACTIVE, PAST_DUE)
//   - !User.isBlocked  (DEBT auto-unblock קורה ב-chargeNextSubscription)
//   - !User.billingPaidByClinic (קליניקה משלמת — מנוי אישי PAUSED)
//
// batching: 50 בכל ריצה (rate limit סביר ל-Cardcom + Render 60s timeout).
// אם יש יותר — יטופלו בריצה הבאה (cron יומי, יש לנו 24h).
// ============================================================================

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { checkCronAuth } from "@/lib/cron-auth";
import { isShabbatOrYomTov } from "@/lib/shabbat";
import { chargeNextSubscription } from "@/lib/payments/subscription-recurring";

export const dynamic = "force-dynamic";

const BATCH_SIZE = 50;

export async function POST(request: NextRequest) {
  const guard = await checkCronAuth(request);
  if (guard) return guard;

  // שבת/חג — דילוג מלא. cron יומי; ייתפס מחר.
  if (isShabbatOrYomTov()) {
    logger.info("[cron subscription-recurring-charge] דילוג בשבת/חג");
    return NextResponse.json({ skipped: true, reason: "shabbat_or_yomtov" });
  }

  const now = new Date();
  const results = {
    candidates: 0,
    approved: 0,
    declined: 0,
    skipped: 0,
    errors: 0,
    details: [] as Array<{
      spId: string;
      status: string;
      errorCode?: string;
    }>,
  };

  try {
    const candidates = await prisma.subscriptionPayment.findMany({
      where: {
        autoChargeEnabled: true,
        savedCardTokenId: { not: null },
        nextChargeAt: { lte: now },
        user: {
          subscriptionStatus: { in: ["ACTIVE", "PAST_DUE"] },
          isBlocked: false,
          billingPaidByClinic: false,
          // isFreeSubscription = מתנה ידנית מאדמין — אין לחייב, מטופל ב-cron אחר.
          isFreeSubscription: false,
        },
        savedCardToken: {
          is: { isActive: true, deletedAt: null },
        },
      },
      select: { id: true },
      take: BATCH_SIZE,
      orderBy: { nextChargeAt: "asc" }, // הישנים ביותר ראשונים — fairness
    });

    results.candidates = candidates.length;

    // sequential — לא concurrent. Cardcom rate-limit + פחות סיכון double-charge
    // (כל sp לא נוגע באחר, אבל קל יותר לנפות).
    for (const c of candidates) {
      try {
        const res = await chargeNextSubscription({ subscriptionPaymentId: c.id });
        results.details.push({
          spId: c.id,
          status: res.status,
          ...(res.errorCode && { errorCode: res.errorCode }),
        });
        if (res.status === "approved") results.approved++;
        else if (res.status === "declined") results.declined++;
        else if (
          res.status === "skipped_in_progress" ||
          res.status === "skipped_not_eligible" ||
          res.status === "skipped_token_expired"
        )
          results.skipped++;
        else results.errors++;
      } catch (err) {
        results.errors++;
        results.details.push({ spId: c.id, status: "error" });
        logger.error("[cron subscription-recurring-charge] item failed", {
          subscriptionPaymentId: c.id,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    logger.info("[cron subscription-recurring-charge] done", {
      candidates: results.candidates,
      approved: results.approved,
      declined: results.declined,
      skipped: results.skipped,
      errors: results.errors,
    });

    return NextResponse.json({
      ok: true,
      timestamp: now.toISOString(),
      results,
    });
  } catch (err) {
    logger.error("[cron subscription-recurring-charge] fatal", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ ok: false, error: "שגיאה בחיוב חוזר" }, { status: 500 });
  }
}
