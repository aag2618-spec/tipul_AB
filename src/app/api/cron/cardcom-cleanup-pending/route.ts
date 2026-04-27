// src/app/api/cron/cardcom-cleanup-pending/route.ts
// Cron — daily, mark CardcomTransactions stuck in PENDING > 24h as EXPIRED.
//
// Triggered externally via cron-job.org with Bearer CRON_SECRET.
// Reason: Cardcom HTTP calls run OUTSIDE withAudit (avoid timeout race).
// If the HTTP call fails AFTER the DB row was created but BEFORE Cardcom
// returned a lowProfileId, the row stays PENDING forever. This cron cleans
// them up so the admin UI doesn't show stale items.

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { checkCronAuth } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";

// Two-tier window:
//   - SHORT (2h): PENDING transactions WITHOUT a lowProfileId. Cardcom never
//     responded to LowProfile/Create, so there's no webhook to wait for.
//   - LONG (24h): PENDING transactions WITH a lowProfileId — the webhook may
//     still be retrying. We wait the full Cardcom retry window before giving up,
//     to avoid racing a webhook that's about to flip the row to APPROVED.
const SHORT_PENDING_HOURS = 2;
const LONG_PENDING_HOURS = 24;

export async function POST(request: NextRequest) {
  const guard = await checkCronAuth(request);
  if (guard) return guard;

  const now = Date.now();
  const shortCutoff = new Date(now - SHORT_PENDING_HOURS * 60 * 60 * 1000);
  const longCutoff = new Date(now - LONG_PENDING_HOURS * 60 * 60 * 1000);

  try {
    // 1) PENDING with NO lowProfileId — Cardcom never accepted the request,
    //    no webhook is ever coming. Expire after 2h.
    const noLp = await prisma.cardcomTransaction.updateMany({
      where: {
        status: "PENDING",
        lowProfileId: null,
        createdAt: { lt: shortCutoff },
      },
      data: {
        status: "EXPIRED",
        completedAt: new Date(),
        errorMessage: `Auto-expired (no LowProfileId) after ${SHORT_PENDING_HOURS}h`,
      },
    });

    // 2) PENDING WITH lowProfileId — wait the full webhook retry window (24h).
    //    Anything still PENDING this long means the webhook permanently failed.
    const withLp = await prisma.cardcomTransaction.updateMany({
      where: {
        status: "PENDING",
        lowProfileId: { not: null },
        createdAt: { lt: longCutoff },
      },
      data: {
        status: "EXPIRED",
        completedAt: new Date(),
        errorMessage: `Auto-expired after ${LONG_PENDING_HOURS}h with no webhook`,
      },
    });

    const result = { count: noLp.count + withLp.count };

    logger.info("[Cron cardcom-cleanup-pending] completed", {
      expired: result.count,
      noLowProfileExpired: noLp.count,
      withLowProfileExpired: withLp.count,
      shortCutoff: shortCutoff.toISOString(),
      longCutoff: longCutoff.toISOString(),
    });

    return NextResponse.json({ ok: true, expired: result.count });
  } catch (err) {
    logger.error("[Cron cardcom-cleanup-pending] failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
