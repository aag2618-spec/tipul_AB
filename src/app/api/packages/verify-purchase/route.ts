// src/app/api/packages/verify-purchase/route.ts
// Polling endpoint — called by PackagesClient after a Cardcom redirect.
//
// If a recent PACKAGE_PURCHASE is still PENDING, self-calls the webhook
// endpoint (same pattern as admin sync-cardcom) which re-fetches canonical
// state via GetLpResult. This handles Cardcom sandbox (terminal 1000) and
// any production webhook delivery failures.
//
// Returns current package balances so the client can detect when credits land.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/api-auth";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { calculateRemainingCredits } from "@/lib/payments/package-purchase";

export const dynamic = "force-dynamic";

const AUTO_SYNC_THRESHOLD_MS = 10_000;

export async function POST() {
  const auth = await requireAuth({ disallowImpersonation: true });
  if ("error" in auth) return auth.error;
  const { userId } = auth;

  const rateCheck = checkRateLimit(`pkg_verify:${userId}`, {
    windowMs: 60_000,
    maxRequests: 30,
  });
  if (!rateCheck.allowed) return rateLimitResponse(rateCheck);

  try {
    const pendingTx = await prisma.cardcomTransaction.findFirst({
      where: {
        userId,
        purpose: "PACKAGE_PURCHASE",
        status: "PENDING",
        lowProfileId: { not: null },
      },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        lowProfileId: true,
        createdAt: true,
      },
    });

    if (pendingTx && pendingTx.lowProfileId) {
      const ageMs = Date.now() - pendingTx.createdAt.getTime();
      if (ageMs > AUTO_SYNC_THRESHOLD_MS) {
        const origin =
          process.env.NEXT_PUBLIC_BASE_URL ?? process.env.NEXTAUTH_URL;
        if (origin) {
          fetch(`${origin}/api/webhooks/cardcom/admin`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              LowProfileId: pendingTx.lowProfileId,
              Timestamp: new Date().toISOString(),
            }),
          }).catch((err) => {
            logger.warn("[packages/verify-purchase] webhook self-call failed", {
              transactionId: pendingTx.id,
              error: err instanceof Error ? err.message : String(err),
            });
          });
        } else {
          logger.warn("[packages/verify-purchase] no BASE_URL configured — skipping sync");
        }
      }
    }

    const purchases = await prisma.userPackagePurchase.findMany({
      where: { userId, reverted: false },
      select: { type: true, credits: true, creditsUsed: true, reverted: true },
      take: 200,
    });

    return NextResponse.json({
      balances: {
        SMS: calculateRemainingCredits(purchases, "SMS"),
        AI_DETAILED_ANALYSIS: calculateRemainingCredits(
          purchases,
          "AI_DETAILED_ANALYSIS"
        ),
      },
      hasPendingPurchase: !!pendingTx,
    });
  } catch (error) {
    logger.error("[packages/verify-purchase] error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה בבדיקת רכישה" },
      { status: 500 }
    );
  }
}
