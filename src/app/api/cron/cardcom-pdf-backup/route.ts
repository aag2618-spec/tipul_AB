// src/app/api/cron/cardcom-pdf-backup/route.ts
// Cron — every 10 minutes, backup pending CardcomInvoice PDFs locally.
// Triggered externally via cron-job.org with Bearer CRON_SECRET.

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { backupPendingInvoices } from "@/lib/cardcom/pdf-backup";
import { checkCronAuth } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const guard = await checkCronAuth(request);
  if (guard) return guard;

  try {
    const result = await backupPendingInvoices();
    logger.info("[Cron pdf-backup] completed", result);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logger.error("[Cron pdf-backup] failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ ok: false }, { status: 500 });
  }
}
