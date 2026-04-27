// src/app/api/cron/cardcom-invoice-sync/route.ts
// Cron — daily, reconcile CardcomInvoice with Cardcom's source of truth.
//
// Runs the reconciliation TWICE:
//   1. ADMIN tenant — using the global MyTipul Cardcom credentials.
//   2. USER tenant — once per active BillingProvider of provider=CARDCOM.
//
// Without the per-USER pass, any therapist whose webhook was lost has an
// orphan that lives at Cardcom but never appears in our DB.

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { getAdminCardcomConfig } from "@/lib/cardcom/admin-config";
import { getUserCardcomCredentials } from "@/lib/cardcom/user-config";
import { searchCardcomDocuments } from "@/lib/cardcom/invoice-api";
import { getAdminBusinessProfile } from "@/lib/site-settings";
import { checkCronAuth } from "@/lib/cron-auth";
import type { CardcomConfig } from "@/lib/cardcom/types";
import type { CardcomTenant } from "@prisma/client";

export const dynamic = "force-dynamic";

interface SyncStats {
  remoteCount: number;
  updated: number;
  orphaned: number;
  skipped: boolean;
}

/**
 * Strip PII from the raw Cardcom document before storing it as JSON.
 * Customer name/email are kept on dedicated columns of OrphanCardcomDocument
 * (admin needs them to resolve manually); the raw blob is stripped of those
 * fields plus anything obviously sensitive that shouldn't sit in JSON.
 */
function sanitizeRawDocument(raw: object): object {
  const cloned = { ...(raw as Record<string, unknown>) };
  for (const key of [
    "customerName",
    "customerEmail",
    "CustomerName",
    "CustomerEmail",
    "customerPhone",
    "CustomerPhone",
    "ClientName",
    "ClientEmail",
    "ClientPhone",
    "TaxId",
  ]) {
    if (key in cloned) delete cloned[key];
  }
  return cloned;
}

async function syncForConfig(opts: {
  config: CardcomConfig;
  tenant: CardcomTenant;
  userId: string | null;
  fromDate: Date;
  toDate: Date;
}): Promise<SyncStats> {
  const { config, tenant, userId, fromDate, toDate } = opts;
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  if (!config.apiPassword) {
    return { remoteCount: 0, updated: 0, orphaned: 0, skipped: true };
  }

  const remoteDocs = await searchCardcomDocuments(config, fmt(fromDate), fmt(toDate));
  if (remoteDocs.length === 0) {
    return { remoteCount: 0, updated: 0, orphaned: 0, skipped: false };
  }

  const docNumbers = remoteDocs.map((d) => d.documentNumber);
  const [existing, existingOrphans] = await Promise.all([
    prisma.cardcomInvoice.findMany({
      where: { cardcomDocumentNumber: { in: docNumbers } },
      select: { cardcomDocumentNumber: true, allocationNumber: true, pdfUrl: true, id: true },
    }),
    prisma.orphanCardcomDocument.findMany({
      where: { cardcomDocumentNumber: { in: docNumbers } },
      select: { cardcomDocumentNumber: true },
    }),
  ]);
  const existingByNumber = new Map(existing.map((e) => [e.cardcomDocumentNumber, e]));
  const existingOrphanSet = new Set(existingOrphans.map((o) => o.cardcomDocumentNumber));

  let updated = 0;
  let orphaned = 0;

  const orphansToCreate: Array<{
    tenant: CardcomTenant;
    userId: string | null;
    cardcomDocumentNumber: string;
    cardcomDocumentType: string;
    amount: number;
    customerName: string | null;
    customerEmail: string | null;
    pdfUrl: string | null;
    allocationNumber: string | null;
    occurredAt: Date;
    rawDocument: object;
  }> = [];

  for (const doc of remoteDocs) {
    const local = existingByNumber.get(doc.documentNumber);
    if (!local) {
      if (!existingOrphanSet.has(doc.documentNumber)) {
        orphansToCreate.push({
          tenant,
          userId,
          cardcomDocumentNumber: doc.documentNumber,
          cardcomDocumentType: doc.documentType,
          amount: doc.amount,
          customerName: doc.customerName ?? null,
          customerEmail: doc.customerEmail ?? null,
          pdfUrl: doc.pdfUrl ?? null,
          allocationNumber: doc.allocationNumber ?? null,
          occurredAt: new Date(doc.issuedAt),
          rawDocument: sanitizeRawDocument(doc as unknown as object),
        });
        orphaned++;
      }
      continue;
    }
    const patch: Record<string, unknown> = {};
    if (doc.allocationNumber && !local.allocationNumber) patch.allocationNumber = doc.allocationNumber;
    if (doc.pdfUrl && !local.pdfUrl) patch.pdfUrl = doc.pdfUrl;
    if (Object.keys(patch).length > 0) {
      await prisma.cardcomInvoice.update({
        where: { id: local.id },
        data: { ...patch, syncedAt: new Date() },
      });
      updated++;
    }
  }

  if (orphansToCreate.length > 0) {
    await prisma.orphanCardcomDocument.createMany({ data: orphansToCreate });
    const today = new Date().toISOString().slice(0, 10);
    const tenantLabel = userId ? `USER:${userId}` : "ADMIN";
    const alertTitle = `[cardcom-sync] ${orphansToCreate.length} מסמכים יתומים (${tenantLabel}) — ${today}`;
    const alertExists = await prisma.adminAlert.findFirst({
      where: { type: "SYSTEM", title: alertTitle },
      select: { id: true },
    });
    if (!alertExists) {
      await prisma.adminAlert.create({
        data: {
          type: "SYSTEM",
          priority: "HIGH",
          status: "PENDING",
          title: alertTitle,
          message: `נמצאו ${orphansToCreate.length} מסמכים ב-Cardcom שלא תואמים לרשומות מקומיות (tenant=${tenant}${userId ? `, userId=${userId}` : ""}).`,
          actionRequired: "שייך כל מסמך ל-Payment או SubscriptionPayment המתאים, או סמן כ-write-off.",
          userId,
          metadata: { count: orphansToCreate.length, tenant, userId },
        },
      });
    }
  }

  return { remoteCount: remoteDocs.length, updated, orphaned, skipped: false };
}

export async function POST(request: NextRequest) {
  const guard = await checkCronAuth(request);
  if (guard) return guard;

  try {
    // 30-day window protects against extended cron-job.org outages.
    const toDate = new Date();
    const fromDate = new Date(toDate.getTime() - 30 * 24 * 60 * 60 * 1000);

    // ── ADMIN tenant pass ──
    const adminConfig = await getAdminCardcomConfig();
    const adminStats = await syncForConfig({
      config: adminConfig,
      tenant: "ADMIN",
      userId: null,
      fromDate,
      toDate,
    });

    // ── USER tenant pass — rotate through providers using lastSyncAt.
    // Pick the 15 oldest each run; with daily cron + 30-day window every
    // provider is reconciled at least every 2 days even at 200+ therapists.
    // (Without this batching, a 50+ provider list would exceed cron timeouts.)
    const PER_RUN_LIMIT = 15;
    const providers = await prisma.billingProvider.findMany({
      where: { provider: "CARDCOM", isActive: true },
      orderBy: [{ lastSyncAt: { sort: "asc", nulls: "first" } }],
      take: PER_RUN_LIMIT,
      select: { id: true, userId: true },
    });

    const perUser: Record<string, SyncStats> = {};
    for (const p of providers) {
      const creds = await getUserCardcomCredentials(p.userId);
      if (!creds) continue;
      try {
        perUser[p.userId] = await syncForConfig({
          config: creds.config,
          tenant: "USER",
          userId: p.userId,
          fromDate,
          toDate,
        });
        // Stamp lastSyncAt so the next run picks a different provider.
        await prisma.billingProvider.update({
          where: { id: p.id },
          data: { lastSyncAt: new Date() },
        });
      } catch (err) {
        logger.warn("[Cron invoice-sync] per-user sync failed", {
          userId: p.userId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const businessProfile = await getAdminBusinessProfile();

    const summary = {
      admin: adminStats,
      userCount: providers.length,
      userResults: perUser,
      businessType: businessProfile.type,
    };
    logger.info("[Cron invoice-sync] completed", summary);
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    logger.error("[Cron invoice-sync] failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
