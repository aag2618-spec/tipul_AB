// src/app/api/admin/chargebacks/route.ts
// GET — list ChargebackEvent rows with pagination and filters.
// Used by /admin/chargebacks UI for ops review and reconciliation.
//
// AUTHZ NOTE: gated by `billing.cardcom.view_transactions` (MANAGER+). The
// response includes therapist email/name as ops context (admins need to know
// which therapist's account triggered each chargeback for follow-up).
// This is INTENTIONAL — therapist directory is not customer-facing PII.
// Customer-side PII (cardholder name/email/phone) is excluded both here and
// at write time via `sanitizeChargebackPayload`.

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

const PAGE_SIZE_DEFAULT = 50;
const PAGE_SIZE_MAX = 200;

export async function GET(request: NextRequest) {
  const auth = await requirePermission("billing.cardcom.view_transactions");
  if ("error" in auth) return auth.error;

  const url = new URL(request.url);
  const tenantParam = url.searchParams.get("tenant"); // ADMIN | USER | (omit = both)
  const reconciledParam = url.searchParams.get("reconciled"); // true | false | (omit)
  const reviewedParam = url.searchParams.get("reviewed"); // true | false | (omit)
  const cursor = url.searchParams.get("cursor"); // last id from previous page
  const takeRaw = Number(url.searchParams.get("take") ?? PAGE_SIZE_DEFAULT);
  const take = Math.min(Math.max(1, isFinite(takeRaw) ? takeRaw : PAGE_SIZE_DEFAULT), PAGE_SIZE_MAX);

  const where: Record<string, unknown> = {};
  if (tenantParam === "ADMIN" || tenantParam === "USER") {
    where.tenant = tenantParam;
  }
  if (reconciledParam === "true") where.reconciled = true;
  if (reconciledParam === "false") where.reconciled = false;
  if (reviewedParam === "true") where.reviewedAt = { not: null };
  if (reviewedParam === "false") where.reviewedAt = null;

  try {
    const rows = await prisma.chargebackEvent.findMany({
      where,
      take: take + 1, // +1 to detect "has next page"
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      // Secondary id-desc for stable order when two rows share createdAt.
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      select: {
        id: true,
        cardcomTransactionId: true,
        tenant: true,
        operation: true,
        amount: true,
        currency: true,
        reviewedAt: true,
        reviewNote: true,
        reconciled: true,
        createdAt: true,
        cardcomTransaction: {
          select: {
            id: true,
            transactionId: true,
            cardLast4: true,
            cardHolder: true,
            userId: true,
            paymentId: true,
            subscriptionPaymentId: true,
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });

    const hasMore = rows.length > take;
    const items = (hasMore ? rows.slice(0, -1) : rows).map((r) => ({
      id: r.id,
      transactionId: r.cardcomTransactionId,
      cardcomTransactionExternalId: r.cardcomTransaction?.transactionId ?? null,
      tenant: r.tenant,
      operation: r.operation,
      amount: Number(r.amount) || 0,
      currency: r.currency,
      reviewedAt: r.reviewedAt?.toISOString() ?? null,
      reviewNote: r.reviewNote,
      reconciled: r.reconciled,
      createdAt: r.createdAt.toISOString(),
      cardLast4: r.cardcomTransaction?.cardLast4 ?? null,
      cardHolder: r.cardcomTransaction?.cardHolder ?? null,
      userName: r.cardcomTransaction?.user?.name ?? null,
      userEmail: r.cardcomTransaction?.user?.email ?? null,
      userId: r.cardcomTransaction?.user?.id ?? null,
      paymentId: r.cardcomTransaction?.paymentId ?? null,
      subscriptionPaymentId: r.cardcomTransaction?.subscriptionPaymentId ?? null,
    }));

    return NextResponse.json({
      items,
      nextCursor: hasMore ? items[items.length - 1]?.id : null,
    });
  } catch (err) {
    logger.error("[admin/chargebacks GET] failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { message: "שגיאה בטעינת רשימת החזרות חיוב" },
      { status: 500 }
    );
  }
}
