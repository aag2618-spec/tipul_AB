// src/app/api/admin/cardcom-transactions/[id]/sync-cardcom/route.ts
//
// Manual sync — when Cardcom didn't send a webhook (sandbox terminal unreliable
// behavior, or network issue in prod), an ADMIN can force-pull the canonical
// state from Cardcom and trigger our regular webhook processing.
//
// Implementation: self-call to /api/webhooks/cardcom/admin. The webhook
// re-fetches the LowProfile via GetLpResult anyway, so we just need to
// nudge it with the LowProfileId we already have stored. The webhook
// handles idempotency, transaction.status update, SubscriptionPayment
// PAID flag, User.aiTier upgrade, SavedCardToken, CardcomInvoice creation.
//
// We deliberately do NOT duplicate the webhook's processing logic —
// keeping a single source of truth for "what happens when a Cardcom
// payment succeeds." If the webhook ever changes, sync follows automatically.

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requirePermission } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    // ADMIN only — manual sync is a money-touching operation.
    const auth = await requirePermission("users.view");
    if ("error" in auth) return auth.error;
    const { session } = auth;
    if (session.user.role !== "ADMIN") {
      return NextResponse.json(
        { message: "פעולה זו זמינה לאדמין בלבד" },
        { status: 403 }
      );
    }
    if (session.user.actingAs) {
      return NextResponse.json(
        { message: "סנכרון לא זמין במצב התחזות" },
        { status: 403 }
      );
    }

    const { id: transactionId } = await context.params;

    // Look up the transaction.
    const tx = await prisma.cardcomTransaction.findUnique({
      where: { id: transactionId },
      select: {
        id: true,
        tenant: true,
        lowProfileId: true,
        status: true,
        userId: true,
      },
    });
    if (!tx) {
      return NextResponse.json(
        { message: "עסקה לא נמצאה" },
        { status: 404 }
      );
    }
    if (tx.tenant !== "ADMIN") {
      return NextResponse.json(
        { message: "סנכרון זמין רק לעסקאות ADMIN (מנוי)" },
        { status: 400 }
      );
    }
    if (!tx.lowProfileId) {
      return NextResponse.json(
        {
          message:
            "אין LowProfileId — Cardcom לא קיבל את העסקה כלל. צריך לבצע תשלום חדש.",
        },
        { status: 400 }
      );
    }
    if (tx.status === "APPROVED") {
      return NextResponse.json({
        success: true,
        status: "APPROVED",
        message: "העסקה כבר אושרה — אין מה לסנכרן",
      });
    }
    if (tx.status === "REFUNDED" || tx.status === "CANCELLED") {
      return NextResponse.json(
        {
          message: `העסקה במצב טרמינלי (${tx.status}) — לא ניתן לסנכרן`,
        },
        { status: 400 }
      );
    }

    // Self-call to the webhook. The webhook re-fetches via GetLpResult, so we
    // only need to provide LowProfileId + a fresh Timestamp.
    const origin =
      process.env.NEXT_PUBLIC_BASE_URL ??
      process.env.NEXTAUTH_URL;
    if (!origin) {
      return NextResponse.json(
        { message: "NEXT_PUBLIC_BASE_URL או NEXTAUTH_URL לא מוגדרים בסביבה" },
        { status: 500 }
      );
    }
    const webhookUrl = `${origin}/api/webhooks/cardcom/admin`;
    let webhookRes: Response;
    try {
      webhookRes = await fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          LowProfileId: tx.lowProfileId,
          Timestamp: new Date().toISOString(),
        }),
      });
    } catch (err) {
      logger.error("[admin/sync-cardcom] webhook self-call failed", {
        transactionId,
        error: err instanceof Error ? err.message : String(err),
      });
      return NextResponse.json(
        {
          message:
            "כשל בקריאה לwebhook הפנימי. בדוק שה-URL של האפליקציה מוגדר נכון.",
        },
        { status: 502 }
      );
    }

    const webhookBody = await webhookRes.json().catch(() => ({}));
    logger.info("[admin/sync-cardcom] webhook responded", {
      transactionId,
      adminId: session.user.id,
      httpStatus: webhookRes.status,
      body: webhookBody,
    });

    // Re-read DB to see the resolved state.
    const updated = await prisma.cardcomTransaction.findUnique({
      where: { id: transactionId },
      select: { status: true, errorCode: true, errorMessage: true },
    });

    if (!webhookRes.ok && updated?.status === "PENDING") {
      // The webhook itself rejected (rate limit / stale timestamp / verification).
      return NextResponse.json(
        {
          message: `Webhook החזיר ${webhookRes.status}. סטטוס עסקה: ${updated.status}.`,
          status: updated.status,
          webhookStatus: webhookRes.status,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      success: true,
      status: updated?.status ?? "UNKNOWN",
      errorMessage: updated?.errorMessage ?? null,
      message:
        updated?.status === "APPROVED"
          ? "הסנכרון הצליח — העסקה אושרה ועודכנה."
          : updated?.status === "DECLINED"
            ? "Cardcom החזיר שהעסקה נדחתה — העסקה לא נכנסה לתוקף."
            : updated?.status === "PENDING"
              ? "Cardcom עוד לא מאשר את העסקה. אם שילמת בפועל — נסה שוב בעוד מספר דקות."
              : `סטטוס לאחר סנכרון: ${updated?.status ?? "לא ידוע"}.`,
    });
  } catch (error) {
    logger.error("[admin/sync-cardcom] error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה בסנכרון" },
      { status: 500 }
    );
  }
}
