// src/app/api/p/transaction-status/route.ts
// Public, no-auth endpoint that returns the status of a CardcomTransaction
// + the resulting receipt URL once the webhook has issued it.
// Used by the /p/thanks page to poll until the webhook flips PENDING → APPROVED
// and then to display/print the receipt inline.
//
// SECURITY MODEL — `t` (CardcomTransaction id) is a CAPABILITY token:
//  - cuid (~10^36) — guessing is infeasible, but URL leakage via referrers,
//    screenshots, browser history, or shared links is realistic.
//  - Whoever holds `t` is treated as the payer. They can:
//    (a) see the payment status, and
//    (b) AFTER status is APPROVED/REFUNDED, retrieve the receiptUrl + receipt
//        number (which itself carries its own signed token — internal:
//        128-bit HMAC fragment, external: signed Cardcom URL).
//  - Receipt fields are gated to APPROVED/REFUNDED — a leaked `t` for a
//    PENDING/FAILED transaction reveals only the status, never financials.
//  - Amount / approval-number / clientName are NOT echoed by this API
//    directly. They're reachable only via the receipt URL → /api/receipts/
//    [id]/public (separate token check) or the Cardcom-hosted PDF.
//  - Rate-limited per IP (60/min) — the thanks page polls ~30 times in 90s,
//    so 60/min is generous for legit clients while bounding abuse cost.
// NOTE: The thanks page (/p/thanks) renders the receipt inline once it's
// available. The privacy posture is intentionally identical to the public
// receipt page (/receipt/[id]#t=…) — meant for the payer.

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";
import { resolveClientIp } from "@/lib/cardcom/verify-webhook";
import { syncCardcomTransaction } from "@/lib/cardcom/sync-cardcom-payment";

export const dynamic = "force-dynamic";

// Auto-sync window: if the transaction has been PENDING this long, the next
// poll will trigger a server-side GetLpResult before responding. Cardcom's
// webhook usually arrives within 1-5s; 15s is a comfortable buffer that
// protects against missed/delayed webhooks (especially on sandbox terminal
// 1000 which doesn't reliably deliver them).
const AUTO_SYNC_THRESHOLD_MS = 15_000;

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
      select: {
        status: true,
        createdAt: true,
        // צריך לדעת אם החוב נסגר במלואו (Payment.status=PAID), לא רק
        // אם החיוב הספציפי אושר. בתשלום חלקי באשראי, העסקה APPROVED
        // אבל ה-Payment עדיין PENDING (יש יתרה). דף התודה ישתמש בזה
        // כדי להציג מסר מדויק.
        // ⚠️ child-aware: ב-additive partial CC, ה-CardcomTransaction מקושרת
        // ל-child Payment שעליו נכתב receiptUrl. ה-parent עוד לא PAID.
        // המסך משתמש ב-receiptUrl/receiptNumber/hasReceipt של ה-payment
        // המקושר (child אם קיים) כדי להציג את הקבלה הנכונה.
        payment: {
          select: {
            id: true,
            status: true,
            parentPaymentId: true,
            receiptUrl: true,
            receiptNumber: true,
            hasReceipt: true,
          },
        },
      },
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

    // Auto-sync for PENDING transactions older than the threshold. Cardcom's
    // webhook should have arrived by now; if it hasn't (sandbox or delayed),
    // we fetch canonical state ourselves so the polling caller sees APPROVED
    // without needing the user to click "סנכרן" manually. syncCardcomTransaction
    // is idempotent and bounded — at most one Cardcom call per poll cycle.
    // ── helper: גייט שדות קבלה ל-APPROVED/REFUNDED בלבד ────────
    // defense-in-depth: גם אם תוקף יקרא ל-API ישירות (לא דרך thanks-client),
    // הוא יקבל מידע פיננסי רק אחרי שהתשלום אושר. לפני זה — רק status.
    const isFinalApproved = (s: string): boolean =>
      s === "APPROVED" || s === "REFUNDED";

    if (tx.status === "PENDING" && ageMs > AUTO_SYNC_THRESHOLD_MS) {
      try {
        const result = await syncCardcomTransaction(t);
        // אחרי sync — לטעון מחדש את ה-Payment כדי להחזיר debtFullyPaid טרי
        // וגם את שדות הקבלה (אם ה-sync טריגר את webhook flow).
        const fresh = await prisma.cardcomTransaction.findUnique({
          where: { id: t },
          select: {
            payment: {
              select: {
                id: true,
                status: true,
                receiptUrl: true,
                receiptNumber: true,
                hasReceipt: true,
              },
            },
          },
        });
        const includeReceipt = isFinalApproved(result.status);
        return NextResponse.json({
          status: result.status,
          debtFullyPaid:
            !fresh?.payment || fresh.payment.status === "PAID",
          // paymentId נחשף רק עם קבלה (אין בו תועלת לקליינט אחרת,
          // וחושף correlation id מיותר במצב PENDING/FAILED).
          paymentId: includeReceipt ? fresh?.payment?.id ?? null : null,
          receiptUrl: includeReceipt ? fresh?.payment?.receiptUrl ?? null : null,
          receiptNumber: includeReceipt
            ? fresh?.payment?.receiptNumber ?? null
            : null,
          hasReceipt: includeReceipt
            ? fresh?.payment?.hasReceipt ?? false
            : false,
        });
      } catch (err) {
        logger.warn("[p/transaction-status] auto-sync failed", {
          tIdPrefix: t.slice(0, 8),
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // debtFullyPaid: אם אין Payment מקושר → אין חוב בכלל (true).
    // אחרת — true רק כש-Payment.status=PAID.
    // receiptUrl/receiptNumber/hasReceipt/paymentId: רק ב-APPROVED/REFUNDED.
    const includeReceipt = isFinalApproved(tx.status);
    return NextResponse.json({
      status: tx.status,
      debtFullyPaid: !tx.payment || tx.payment.status === "PAID",
      paymentId: includeReceipt ? tx.payment?.id ?? null : null,
      receiptUrl: includeReceipt ? tx.payment?.receiptUrl ?? null : null,
      receiptNumber: includeReceipt ? tx.payment?.receiptNumber ?? null : null,
      hasReceipt: includeReceipt ? tx.payment?.hasReceipt ?? false : false,
    });
  } catch (err) {
    logger.warn("[p/transaction-status] DB lookup failed", {
      tIdPrefix: t.slice(0, 8),
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ status: "unknown" });
  }
}
