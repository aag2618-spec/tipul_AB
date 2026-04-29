// src/app/api/payments/[id]/sync-cardcom-status/route.ts
//
// Manual sync trigger — when the Cardcom webhook is delayed/missing/blocked,
// the therapist clicks "סנכרן עם Cardcom" in the dialog to pull canonical
// state directly via LowProfile/GetLpResult and update our DB. The actual
// sync logic lives in src/lib/cardcom/sync-cardcom-payment.ts so the same
// path is used by the public polling endpoint (auto-sync after 15s of
// PENDING) and any future scheduled job.

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { syncCardcomTransaction } from "@/lib/cardcom/sync-cardcom-payment";

export const dynamic = "force-dynamic";

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { userId } = auth;

  const { id: paymentId } = await context.params;

  // Ownership check + locate the latest CardcomTransaction.
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: {
      client: { select: { therapistId: true } },
      cardcomTransactions: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, status: true, lowProfileId: true },
      },
    },
  });
  if (!payment || payment.client.therapistId !== userId) {
    return NextResponse.json({ message: "תשלום לא נמצא" }, { status: 404 });
  }

  const tx = payment.cardcomTransactions[0];
  if (!tx) {
    return NextResponse.json(
      { message: "אין עסקה מקושרת — צרי קישור תשלום חדש" },
      { status: 404 }
    );
  }
  if (!tx.lowProfileId) {
    return NextResponse.json(
      { message: "העסקה עוד לא נשלחה ל-Cardcom — נסי שוב בעוד רגע" },
      { status: 409 }
    );
  }

  // Already settled — return current state without doing work.
  if (tx.status === "APPROVED") {
    return NextResponse.json({ status: "APPROVED" });
  }
  if (tx.status === "CANCELLED") {
    return NextResponse.json({ status: "CANCELLED" });
  }

  let result;
  try {
    result = await syncCardcomTransaction(tx.id);
  } catch (err) {
    logger.error("[payments/sync-cardcom-status] sync failed", {
      userId,
      paymentId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { message: "שגיאת תקשורת עם Cardcom — נסי שוב בעוד רגע" },
      { status: 502 }
    );
  }

  return NextResponse.json({ status: result.status });
}
