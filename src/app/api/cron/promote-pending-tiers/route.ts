// src/app/api/cron/promote-pending-tiers/route.ts
// Cron יומי — מקדם pendingTier ל-aiTier כש-now >= pendingTierEffectiveAt.
//
// תרחיש: משתמש PRO ACTIVE עם תוקף עד 2026-12-01 שדרג ל-ENTERPRISE.
// ב-subscription/create ה-periodStart=2026-12-01 (לא מאבד ימי PRO ששילם).
// ב-webhook (APPROVED) נשמר User.pendingTier=ENTERPRISE + pendingTierEffectiveAt=2026-12-01.
// ב-2026-12-01 ה-cron הזה מקדם: aiTier=ENTERPRISE, pendingTier=null.

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { checkCronAuth } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const guard = await checkCronAuth(request);
  if (guard) return guard;

  const now = new Date();

  try {
    // מצא משתמשים שה-pendingTierEffectiveAt שלהם הגיע — קדם את ה-tier
    const candidates = await prisma.user.findMany({
      where: {
        pendingTier: { not: null },
        pendingTierEffectiveAt: { lte: now },
      },
      select: {
        id: true,
        aiTier: true,
        pendingTier: true,
        pendingTierEffectiveAt: true,
      },
    });

    let promoted = 0;
    for (const u of candidates) {
      if (!u.pendingTier) continue;
      await prisma.user.update({
        where: { id: u.id },
        data: {
          aiTier: u.pendingTier,
          pendingTier: null,
          pendingTierEffectiveAt: null,
        },
      });
      logger.info("[cron promote-pending-tiers] tier promoted", {
        userId: u.id,
        from: u.aiTier,
        to: u.pendingTier,
        scheduledFor: u.pendingTierEffectiveAt?.toISOString(),
      });
      promoted++;
    }

    return NextResponse.json({ ok: true, promoted, candidates: candidates.length });
  } catch (err) {
    logger.error("[cron promote-pending-tiers] failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
