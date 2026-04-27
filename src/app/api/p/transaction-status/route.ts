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
import { checkRateLimit } from "@/lib/rate-limit";
import { resolveClientIp } from "@/lib/cardcom/verify-webhook";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const ip = resolveClientIp(request.headers);
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
  const tx = await prisma.cardcomTransaction.findUnique({
    where: { id: t },
    select: { status: true },
  });
  if (!tx) {
    return NextResponse.json({ status: "unknown" });
  }
  return NextResponse.json({ status: tx.status });
}
