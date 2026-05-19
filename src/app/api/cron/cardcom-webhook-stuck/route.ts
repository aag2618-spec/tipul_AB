// src/app/api/cron/cardcom-webhook-stuck/route.ts
// Cron — hourly, detect SubscriptionPayments stuck in PENDING > 15 minutes
// even though Cardcom already returned a LowProfileId (meaning the user
// almost certainly paid, but the webhook never reached us).
//
// Triggered externally via Render cron with Bearer CRON_SECRET.
//
// Why this exists (from HANDOFF-cardcom-production-ready.md, section A):
//   The daily cardcom-cleanup-pending (03:00 UTC) only cancels the SP and
//   expires the CardcomTransaction after 24h — too late and silent. If
//   Cardcom's webhook never lands (IP allowlist drift, network blip, wrong
//   IndicatorUrl), the money may already be charged on Cardcom's side while
//   the SP stays PENDING and aiTier never upgrades. Admin needs to know
//   within minutes so they can hit "סנכרן מ-Cardcom".
//
// Window: 15min < createdAt < 24h.
//   < 15min  → webhook may still arrive, don't wake the admin.
//   > 24h    → cardcom-cleanup-pending already handled it (SP→CANCELLED,
//              CT→EXPIRED), no action left.
//
// Dedupe: an alert is keyed by metadata.subscriptionPaymentId — at most one
// PENDING/IN_PROGRESS alert per SP at a time. If the admin resolves it and a
// new payment from the same user gets stuck later, a new alert WILL fire.

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { AdminAlertType, AlertPriority } from "@prisma/client";
import { logger } from "@/lib/logger";
import { checkCronAuth } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";

const STUCK_MINUTES = 15;
const MAX_LOOKBACK_HOURS = 24;

export async function POST(request: NextRequest) {
  const guard = await checkCronAuth(request);
  if (guard) return guard;

  const now = Date.now();
  const stuckSince = new Date(now - STUCK_MINUTES * 60 * 1000);
  const lookbackUntil = new Date(now - MAX_LOOKBACK_HOURS * 60 * 60 * 1000);

  try {
    const stuckPayments = await prisma.subscriptionPayment.findMany({
      where: {
        status: "PENDING",
        createdAt: { lt: stuckSince, gt: lookbackUntil },
        cardcomTransactions: {
          some: {
            status: "PENDING",
            lowProfileId: { not: null },
          },
        },
      },
      select: {
        id: true,
        userId: true,
        amount: true,
        createdAt: true,
        planTier: true,
        user: {
          select: { id: true, name: true, email: true },
        },
        cardcomTransactions: {
          where: {
            status: "PENDING",
            lowProfileId: { not: null },
          },
          select: { id: true, lowProfileId: true },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    });

    let alertsCreated = 0;
    let alertsSkipped = 0;

    let alertsRacedToPaid = 0;

    for (const sp of stuckPayments) {
      // Race guard: between the findMany above and now, the webhook may have
      // arrived and flipped SP→PAID. Re-fetch the current status before
      // creating a false-positive alert. Narrow window remains (between this
      // check and create), but the webhook transaction is fast enough that the
      // overwhelming majority of late-arriving webhooks are caught here.
      const current = await prisma.subscriptionPayment.findUnique({
        where: { id: sp.id },
        select: { status: true },
      });
      if (!current || current.status !== "PENDING") {
        alertsRacedToPaid += 1;
        continue;
      }

      // Per-SP dedupe via metadata JSON path. Cheaper than another model.
      const existing = await prisma.adminAlert.findFirst({
        where: {
          type: AdminAlertType.SYSTEM,
          status: { in: ["PENDING", "IN_PROGRESS"] },
          userId: sp.userId,
          metadata: {
            path: ["subscriptionPaymentId"],
            equals: sp.id,
          },
        },
        select: { id: true },
      });

      if (existing) {
        alertsSkipped += 1;
        continue;
      }

      const minutesStuck = Math.floor((now - sp.createdAt.getTime()) / 60000);
      const ct = sp.cardcomTransactions[0];
      const userLabel = sp.user.name || sp.user.email;

      await prisma.adminAlert.create({
        data: {
          type: AdminAlertType.SYSTEM,
          priority: AlertPriority.URGENT,
          title: `Webhook של Cardcom לא הגיע — ${userLabel}`,
          message:
            `תשלום מנוי בסך ₪${Number(sp.amount) || 0} (${sp.planTier ?? "—"}) ` +
            `ממתין ${minutesStuck} דקות ב-PENDING למרות ש-Cardcom החזיר LowProfileId. ` +
            `סביר שהמשתמש שילם בפועל וה-webhook לא הגיע לשרת ` +
            `(בעיית IP allowlist, רשת, או IndicatorUrl). ` +
            `יש לסנכרן ידנית כדי לעדכן את המנוי.`,
          userId: sp.userId,
          actionRequired:
            `היכנס ל-/admin/users/${sp.userId} → קטע "תשלומי מנוי" → ` +
            `לחץ "סנכרן מ-Cardcom" על התשלום במצב PENDING.`,
          metadata: {
            subscriptionPaymentId: sp.id,
            cardcomTransactionId: ct?.id ?? null,
            lowProfileId: ct?.lowProfileId ?? null,
            amount: Number(sp.amount) || 0,
            planTier: sp.planTier,
            stuckMinutes: minutesStuck,
            createdAt: sp.createdAt.toISOString(),
          },
        },
      });

      alertsCreated += 1;
    }

    logger.info("[Cron cardcom-webhook-stuck] completed", {
      stuckFound: stuckPayments.length,
      alertsCreated,
      alertsSkipped,
      alertsRacedToPaid,
      stuckSince: stuckSince.toISOString(),
    });

    return NextResponse.json({
      ok: true,
      stuckFound: stuckPayments.length,
      alertsCreated,
      alertsSkipped,
      alertsRacedToPaid,
    });
  } catch (err) {
    logger.error("[Cron cardcom-webhook-stuck] failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
