// src/app/api/p/transaction-status/route.ts
// Public, no-auth endpoint that returns ONLY the status of a CardcomTransaction.
// Used by the /p/thanks page to poll until the webhook flips PENDING → APPROVED.
//
// SECURITY:
//  - Returns just `{ status }` — no amount, no approval number, no PII.
//  - Transaction id is a cuid (~10^36) so guessing is hard, but URL leakage
//    (referrers, screenshots) is realistic and the response must be useless
//    to anyone except the polling page.
//  - Rate-limited per IP (60/min) to bound abuse cost. The thanks page polls
//    at most ~20 times in 60s, so 60/min is generous for legit clients.

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";
import { resolveClientIp } from "@/lib/cardcom/verify-webhook";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const ip = resolveClientIp(request.headers);
  // ⚠️ Per-instance + per-IP cap. Bounds DB cost from a single attacker; not
  // a real DoS shield (multi-instance or distributed sources scale around it).
  const limit = checkRateLimit(`p:transaction-status:${ip ?? "unknown"}`, {
    windowMs: 60 * 1000,
    maxRequests: 60,
  });
  if (!limit.allowed) {
    return new NextResponse("Too Many Requests", {
      status: 429,
      headers: {
        "Retry-After": String(
          Math.max(1, Math.ceil((limit.resetAt - Date.now()) / 1000))
        ),
      },
    });
  }

  const t = new URL(request.url).searchParams.get("t");
  if (!t || !/^[A-Za-z0-9_-]{1,64}$/.test(t)) {
    return NextResponse.json({ status: "unknown" }, { status: 400 });
  }

  // On a transient DB error report "unknown" rather than 500 — the polling
  // page will simply retry, and the user keeps waiting on the thanks screen.
  // Crashing here would surface a confusing error after a successful payment.
  try {
    const tx = await prisma.cardcomTransaction.findUnique({
      where: { id: t },
      select: { status: true, createdAt: true },
    });
    if (!tx) {
      return NextResponse.json({ status: "unknown" });
    }
    // Time-window guard: the legitimate /p/thanks polling happens within
    // minutes of payment. After 24h the transaction id is no longer relevant
    // for live polling — narrow the leakage window if a URL leaks via referrer
    // or screenshot.
    const ageMs = Date.now() - tx.createdAt.getTime();
    if (ageMs > 24 * 60 * 60 * 1000) {
      return NextResponse.json({ status: "unknown" });
    }
    return NextResponse.json({ status: tx.status });
  } catch (err) {
    logger.warn("[p/transaction-status] DB lookup failed", {
      tIdPrefix: t.slice(0, 8),
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ status: "unknown" });
  }
}
