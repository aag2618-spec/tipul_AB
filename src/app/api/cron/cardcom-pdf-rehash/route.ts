// src/app/api/cron/cardcom-pdf-rehash/route.ts
//
// Cron — monthly. Re-reads each backed-up PDF from disk and verifies its
// SHA-256 against the stored localPdfHash. Mismatches are raised as HIGH
// priority AdminAlerts.
//
// Why: the 7-year retention rule (חוק חשבונאות ישראל) requires the documents
// to be READABLE. If Render disk suffers bit-rot, or a deploy accidentally
// overwrites a file, we'd only discover this years later during a tax audit.
// This cron catches it within a month.

import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { checkCronAuth } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";

const BATCH_LIMIT = 1000;
const CONCURRENCY = 16; // parallel file reads to avoid 50s blocking on SSD

function getStorageRoot(): string {
  return process.env.RECEIPTS_STORAGE_ROOT || path.resolve(process.cwd(), "storage", "receipts");
}

export async function POST(request: NextRequest) {
  const guard = await checkCronAuth(request);
  if (guard) return guard;

  // Pick the next batch of invoices that haven't been verified recently
  // (orderBy lastBackupAttemptAt ascending — covers oldest first).
  const invoices = await prisma.cardcomInvoice.findMany({
    where: {
      localPdfPath: { not: null },
      localPdfHash: { not: null },
    },
    take: BATCH_LIMIT,
    orderBy: { lastBackupAttemptAt: "asc" },
    select: {
      id: true,
      cardcomDocumentNumber: true,
      localPdfPath: true,
      localPdfHash: true,
    },
  });

  let verified = 0;
  let mismatched = 0;
  let missing = 0;
  const mismatchAlerts: Array<{ id: string; doc: string }> = [];
  const verifiedIds: string[] = [];

  type CheckResult =
    | { kind: "verified"; id: string }
    | { kind: "mismatch"; id: string; doc: string }
    | { kind: "missing"; id: string; doc: string }
    | { kind: "skipped"; id: string };

  const checkOne = async (inv: (typeof invoices)[number]): Promise<CheckResult> => {
    if (!inv.localPdfPath || !inv.localPdfHash) return { kind: "skipped", id: inv.id };
    const resolved = path.resolve(
      getStorageRoot(),
      path.relative("storage/receipts/", inv.localPdfPath)
    );
    const root = path.resolve(getStorageRoot());
    if (!resolved.startsWith(root + path.sep) && resolved !== root) {
      logger.warn("[pdf-rehash] path outside storage root, skipping", {
        invoiceId: inv.id,
        path: inv.localPdfPath,
      });
      return { kind: "skipped", id: inv.id };
    }
    try {
      const buffer = await readFile(resolved);
      const actualHash = createHash("sha256").update(buffer).digest("hex");
      if (actualHash !== inv.localPdfHash) {
        return { kind: "mismatch", id: inv.id, doc: inv.cardcomDocumentNumber };
      }
      return { kind: "verified", id: inv.id };
    } catch {
      return { kind: "missing", id: inv.id, doc: inv.cardcomDocumentNumber };
    }
  };

  // Process in parallel chunks (CONCURRENCY=16) — 1000 files in ~3-4s on SSD,
  // vs ~50s if done sequentially.
  for (let i = 0; i < invoices.length; i += CONCURRENCY) {
    const chunk = invoices.slice(i, i + CONCURRENCY);
    const results = await Promise.all(chunk.map(checkOne));
    for (const r of results) {
      if (r.kind === "verified") {
        verified++;
        verifiedIds.push(r.id);
      } else if (r.kind === "mismatch") {
        mismatched++;
        mismatchAlerts.push({ id: r.id, doc: r.doc });
      } else if (r.kind === "missing") {
        missing++;
        mismatchAlerts.push({ id: r.id, doc: r.doc });
      }
    }
  }

  // Stamp lastBackupAttemptAt on verified rows so the next cron run picks
  // OTHER files first (the orderBy: lastBackupAttemptAt asc rotates the batch).
  // Without this update the same 1000 invoices would be re-checked forever.
  if (verifiedIds.length > 0) {
    await prisma.cardcomInvoice.updateMany({
      where: { id: { in: verifiedIds } },
      data: { lastBackupAttemptAt: new Date() },
    });
  }

  // Single rollup AdminAlert per cron run when problems are found.
  if (mismatchAlerts.length > 0) {
    const today = new Date().toISOString().slice(0, 10);
    const title = `[pdf-rehash] ${mismatchAlerts.length} קבצי PDF פגומים/חסרים — ${today}`;
    const exists = await prisma.adminAlert.findFirst({
      where: { type: "SYSTEM", title },
      select: { id: true },
    });
    if (!exists) {
      await prisma.adminAlert.create({
        data: {
          type: "SYSTEM",
          priority: "URGENT",
          status: "PENDING",
          title,
          message: `נמצאו ${mismatched} קבצי PDF עם hash שלא תואם, ו-${missing} קבצים חסרים. זוהי הפרת חוק 7 שנים — נדרשת פעולה מיידית: שחזור מ-Cardcom CDN או חידוש אובייקטי גיבוי.`,
          actionRequired: `הרץ /api/admin/cardcom/receipts/restore עבור invoiceIds: ${mismatchAlerts.slice(0, 20).map((a) => a.id).join(", ")}${mismatchAlerts.length > 20 ? "..." : ""}`,
          metadata: { mismatched, missing, sampleIds: mismatchAlerts.slice(0, 50).map((a) => a.id) },
        },
      });
    }
  }

  logger.info("[Cron pdf-rehash] completed", { verified, mismatched, missing });
  return NextResponse.json({ ok: true, verified, mismatched, missing });
}
