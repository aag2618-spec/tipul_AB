// src/app/api/admin/receipts/route.ts
// GET — רשימת קבלות (CardcomInvoice metadata) עם סינון.

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requirePermission } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export async function GET(request: NextRequest) {
  const auth = await requirePermission("receipts.view");
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const subscriberId = searchParams.get("subscriberId");
  const status = searchParams.get("status");
  const documentType = searchParams.get("documentType");
  const fromDate = searchParams.get("fromDate");
  const toDate = searchParams.get("toDate");
  const cursor = searchParams.get("cursor");

  // Default scope: ADMIN tenant only (subscription invoices). USER tenant
  // invoices are visible only to ADMIN with explicit `tenant=USER`/`all`.
  const tenantFilter = searchParams.get("tenant"); // "ADMIN" | "USER" | "all" | null
  const where: Prisma.CardcomInvoiceWhereInput = {};
  if (subscriberId) where.subscriberId = subscriberId;
  if (status === "ISSUED" || status === "VOIDED" || status === "REFUNDED") where.status = status;
  if (documentType) where.cardcomDocumentType = documentType;
  if (tenantFilter !== "all") {
    // Filter via the linked CardcomTransaction.tenant (CardcomInvoice itself
    // does not have a tenant column — it inherits from the transaction).
    where.cardcomTransaction = {
      tenant: tenantFilter === "USER" ? "USER" : "ADMIN",
    };
  }
  if (fromDate || toDate) {
    where.issuedAt = {};
    if (fromDate) {
      const d = new Date(fromDate);
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json({ message: "fromDate לא תקין" }, { status: 400 });
      }
      where.issuedAt.gte = d;
    }
    if (toDate) {
      const d = new Date(toDate);
      if (Number.isNaN(d.getTime())) {
        return NextResponse.json({ message: "toDate לא תקין" }, { status: 400 });
      }
      where.issuedAt.lte = d;
    }
  }

  try {
    const items = await prisma.cardcomInvoice.findMany({
      where,
      take: PAGE_SIZE + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { issuedAt: "desc" },
      select: {
        id: true,
        cardcomDocumentNumber: true,
        cardcomDocumentType: true,
        pdfUrl: true,
        viewUrl: true,
        localPdfPath: true,
        allocationNumber: true,
        amount: true,
        currency: true,
        description: true,
        status: true,
        issuedAt: true,
        subscriberId: true,
        subscriberNameSnapshot: true,
        subscriberEmailSnapshot: true,
        issuerBusinessType: true,
        vatAmount: true,
        amountBeforeVat: true,
      },
    });

    const hasMore = items.length > PAGE_SIZE;
    const sliced = hasMore ? items.slice(0, PAGE_SIZE) : items;
    const nextCursor = hasMore ? sliced[sliced.length - 1]?.id : null;

    return NextResponse.json({
      items: sliced.map((it) => ({
        ...it,
        amount: Number(it.amount) || 0,
        vatAmount: it.vatAmount ? Number(it.vatAmount) : null,
        amountBeforeVat: it.amountBeforeVat ? Number(it.amountBeforeVat) : null,
        issuedAt: it.issuedAt.toISOString(),
        hasLocalBackup: !!it.localPdfPath,
      })),
      nextCursor,
    });
  } catch (err) {
    logger.error("[admin/receipts GET] failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ message: "שגיאה בטעינת הקבלות" }, { status: 500 });
  }
}
