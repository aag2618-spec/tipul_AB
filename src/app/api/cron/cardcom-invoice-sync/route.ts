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
import { withAudit } from "@/lib/audit";
import type { CardcomConfig } from "@/lib/cardcom/types";
import type { CardcomTenant } from "@prisma/client";

export const dynamic = "force-dynamic";

interface SyncStats {
  remoteCount: number;
  updated: number;
  orphaned: number;
  skipped: boolean;
}

interface OrphanInput {
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
}

interface InvoicePatch {
  id: string;
  patch: { allocationNumber?: string; pdfUrl?: string };
}

/**
 * Plan computed in Phase 1+2 — describes the writes that Phase 3 will apply
 * atomically inside a single tx + audit row. Empty plan = nothing to do.
 */
interface SyncPlan {
  tenant: CardcomTenant;
  userId: string | null;
  tenantLabel: string;
  updates: InvoicePatch[];
  orphans: OrphanInput[];
  alertTitle: string | null;
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

/**
 * Phase 1 + 2 — fetch from Cardcom (HTTP) + read DB + compute plan.
 * No DB writes here. Plan is applied atomically by applySyncPlan().
 */
async function planSyncForConfig(opts: {
  config: CardcomConfig;
  tenant: CardcomTenant;
  userId: string | null;
  fromDate: Date;
  toDate: Date;
}): Promise<{ stats: SyncStats; plan: SyncPlan }> {
  const { config, tenant, userId, fromDate, toDate } = opts;
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  const tenantLabel = userId ? `USER:${userId}` : "ADMIN";
  const emptyPlan: SyncPlan = {
    tenant,
    userId,
    tenantLabel,
    updates: [],
    orphans: [],
    alertTitle: null,
  };

  if (!config.apiPassword) {
    return {
      stats: { remoteCount: 0, updated: 0, orphaned: 0, skipped: true },
      plan: emptyPlan,
    };
  }

  // ── Phase 1 — HTTP fetch (must stay outside any tx)
  const remoteDocs = await searchCardcomDocuments(config, fmt(fromDate), fmt(toDate));
  if (remoteDocs.length === 0) {
    return {
      stats: { remoteCount: 0, updated: 0, orphaned: 0, skipped: false },
      plan: emptyPlan,
    };
  }

  // ── Phase 1 — DB reads (no writes)
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

  // ── Phase 2 — compute plan (in-memory)
  const updates: InvoicePatch[] = [];
  const orphans: OrphanInput[] = [];

  for (const doc of remoteDocs) {
    const local = existingByNumber.get(doc.documentNumber);
    if (!local) {
      if (!existingOrphanSet.has(doc.documentNumber)) {
        orphans.push({
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
      }
      continue;
    }
    const patch: { allocationNumber?: string; pdfUrl?: string } = {};
    if (doc.allocationNumber && !local.allocationNumber) patch.allocationNumber = doc.allocationNumber;
    if (doc.pdfUrl && !local.pdfUrl) patch.pdfUrl = doc.pdfUrl;
    if (Object.keys(patch).length > 0) {
      updates.push({ id: local.id, patch });
    }
  }

  const today = new Date().toISOString().slice(0, 10);
  const alertTitle =
    orphans.length > 0
      ? `[cardcom-sync] ${orphans.length} מסמכים יתומים (${tenantLabel}) — ${today}`
      : null;

  return {
    stats: {
      remoteCount: remoteDocs.length,
      updated: updates.length,
      orphaned: orphans.length,
      skipped: false,
    },
    plan: { tenant, userId, tenantLabel, updates, orphans, alertTitle },
  };
}

/**
 * Phase 3 — apply plan inside a SINGLE tx that also writes the audit row.
 * If anything in the tx fails, ALL writes (updates, orphan creates,
 * adminAlert, audit row) roll back together.
 */
async function applySyncPlan(plan: SyncPlan): Promise<void> {
  if (plan.updates.length === 0 && plan.orphans.length === 0) {
    return; // nothing to apply
  }

  await withAudit(
    {
      kind: "system",
      source: "CRON",
      externalRef: `cardcom-invoice-sync:${plan.tenantLabel}`,
    },
    {
      action: "cron_cardcom_invoice_sync_apply",
      targetType: "cardcom_invoice",
      details: {
        tenant: plan.tenant,
        userId: plan.userId,
        updated: plan.updates.length,
        orphaned: plan.orphans.length,
      },
    },
    async (tx) => {
      for (const u of plan.updates) {
        await tx.cardcomInvoice.update({
          where: { id: u.id },
          data: { ...u.patch, syncedAt: new Date() },
        });
      }

      if (plan.orphans.length > 0) {
        await tx.orphanCardcomDocument.createMany({ data: plan.orphans });
        if (plan.alertTitle) {
          const alertExists = await tx.adminAlert.findFirst({
            where: { type: "SYSTEM", title: plan.alertTitle },
            select: { id: true },
          });
          if (!alertExists) {
            await tx.adminAlert.create({
              data: {
                type: "SYSTEM",
                priority: "HIGH",
                status: "PENDING",
                title: plan.alertTitle,
                message: `נמצאו ${plan.orphans.length} מסמכים ב-Cardcom שלא תואמים לרשומות מקומיות (tenant=${plan.tenant}${plan.userId ? `, userId=${plan.userId}` : ""}).`,
                actionRequired: "שייך כל מסמך ל-Payment או SubscriptionPayment המתאים, או סמן כ-write-off.",
                userId: plan.userId,
                metadata: {
                  count: plan.orphans.length,
                  tenant: plan.tenant,
                  userId: plan.userId,
                },
              },
            });
          }
        }
      }
    },
  );
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
    const adminPlanResult = await planSyncForConfig({
      config: adminConfig,
      tenant: "ADMIN",
      userId: null,
      fromDate,
      toDate,
    });
    await applySyncPlan(adminPlanResult.plan);
    const adminStats = adminPlanResult.stats;

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
        const userResult = await planSyncForConfig({
          config: creds.config,
          tenant: "USER",
          userId: p.userId,
          fromDate,
          toDate,
        });
        await applySyncPlan(userResult.plan);
        perUser[p.userId] = userResult.stats;
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

    // Summary audit row — written every run (also when no mutations occurred),
    // so the audit trail records that the cron executed. Per-config audits
    // are written by applySyncPlan() above only when there were real changes.
    const totals = {
      admin: { orphaned: adminStats.orphaned, updated: adminStats.updated },
      users: Object.entries(perUser).map(([userId, s]) => ({
        userId,
        orphaned: s.orphaned,
        updated: s.updated,
      })),
    };
    const totalOrphans =
      adminStats.orphaned +
      Object.values(perUser).reduce((sum, s) => sum + s.orphaned, 0);
    await withAudit(
      { kind: "system", source: "CRON", externalRef: "cardcom-invoice-sync" },
      {
        action: "cron_cardcom_invoice_sync",
        targetType: "cardcom_invoice",
        details: {
          reason: "scheduled_run",
          totalOrphans,
          totals,
        },
      },
      async () => {
        // no-op summary audit — records that the run happened
      },
    );

    logger.info("[Cron invoice-sync] completed", summary);
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    logger.error("[Cron invoice-sync] failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
