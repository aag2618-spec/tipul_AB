// src/lib/cardcom/pdf-backup.ts
// Download and persist Cardcom-hosted PDFs locally — required by the 7-year
// retention rule for Israeli tax documents.
//
// Runs OUT of the webhook critical path (Cardcom may not have published the PDF
// yet when the webhook fires). A separate cron walks rows where localPdfPath IS NULL.
//
// ⚠️⚠️⚠️ PRODUCTION REQUIREMENT — RENDER EPHEMERAL DISK ⚠️⚠️⚠️
// Render's default filesystem is EPHEMERAL — wiped on every redeploy.
// Local PDF backup will NOT survive a deploy.
//
// Before going to production you MUST do ONE of:
//   1. Attach a Render persistent disk and mount it at RECEIPTS_STORAGE_ROOT
//      (https://render.com/docs/disks — ~$1/month per GB).
//   2. Replace this implementation with object storage (S3 / Cloudflare R2 /
//      Backblaze B2). Cardcom invoices are tiny (~100KB each), so even 7
//      years × 1000 invoices/year = ~700 MB → cheap on R2.
//
// Until then this code is safe in development and sandbox testing only.
// CardcomInvoice.localPdfPath staying NULL after the cron means the writeable
// path is missing — surface it as an AdminAlert in production.

import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';

/**
 * Root directory for receipt backups. NOT inside /public — served only via
 * signed URL endpoint.
 *
 * In production this MUST be a persistent volume (Render disk or similar).
 * Render's default filesystem is ephemeral — without RECEIPTS_STORAGE_ROOT
 * pointing at a mounted disk, every redeploy wipes 7-year retention.
 * Production startup refuses to boot without it.
 */
function getStorageRoot(): string {
  if (process.env.NODE_ENV === 'production' && !process.env.RECEIPTS_STORAGE_ROOT) {
    throw new Error(
      'RECEIPTS_STORAGE_ROOT must be set in production (mount a persistent volume). ' +
      'Without it, PDF backups will be wiped on every deploy and 7-year retention is broken.'
    );
  }
  return process.env.RECEIPTS_STORAGE_ROOT || path.resolve(process.cwd(), 'storage', 'receipts');
}

const MAX_BACKUP_ATTEMPTS = 5;
const BATCH_LIMIT = 50;
const MAX_PDF_BYTES = 10 * 1024 * 1024; // 10 MB cap — Cardcom receipts are tiny (<200 KB normally)
const FETCH_TIMEOUT_MS = 30_000;

export interface BackupResult {
  invoiceId: string;
  success: boolean;
  localPath?: string;
  hash?: string;
  error?: string;
}

/**
 * Download one CardcomInvoice's PDF and persist it locally.
 * Records hash + local path on success; increments backup_attempts on failure.
 */
export async function backupSingleInvoice(invoiceId: string): Promise<BackupResult> {
  const invoice = await prisma.cardcomInvoice.findUnique({ where: { id: invoiceId } });
  if (!invoice) return { invoiceId, success: false, error: 'INVOICE_NOT_FOUND' };
  if (invoice.localPdfPath) {
    return { invoiceId, success: true, localPath: invoice.localPdfPath, hash: invoice.localPdfHash ?? undefined };
  }
  if (!invoice.pdfUrl) {
    return { invoiceId, success: false, error: 'NO_PDF_URL' };
  }
  if (invoice.backupAttempts >= MAX_BACKUP_ATTEMPTS) {
    return { invoiceId, success: false, error: 'MAX_ATTEMPTS_REACHED' };
  }
  // Defence against path-traversal: cardcomDocumentNumber must be alphanumeric
  // + hyphen/underscore. Cardcom's real numbers are short digits; our refund
  // fallback is `REFUND-{cuid}-{uuid}` (~70 chars) so we cap at 128.
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(invoice.cardcomDocumentNumber)) {
    await prisma.cardcomInvoice.update({
      where: { id: invoiceId },
      data: {
        backupFailedReason: 'INVALID_DOCUMENT_NUMBER',
        lastBackupAttemptAt: new Date(),
        backupAttempts: { increment: 1 },
      },
    });
    return { invoiceId, success: false, error: 'INVALID_DOCUMENT_NUMBER' };
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(invoice.pdfUrl, { signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
    if (!res.ok) throw new Error(`HTTP_${res.status}`);

    // Pre-check declared length (cheap rejection of obvious abuse).
    const declaredLength = Number(res.headers.get('content-length') ?? '0');
    if (declaredLength > MAX_PDF_BYTES) {
      throw new Error(`PDF_TOO_LARGE_${declaredLength}`);
    }

    // Streaming size check — Content-Length may be missing/lied. Read chunks
    // and abort if cumulative bytes exceed the cap (prevents OOM on a 1GB PDF).
    const reader = res.body?.getReader();
    if (!reader) throw new Error('NO_RESPONSE_BODY');
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > MAX_PDF_BYTES) {
          await reader.cancel('size_exceeded').catch(() => undefined);
          throw new Error(`PDF_TOO_LARGE_${total}`);
        }
        chunks.push(value);
      }
    }
    // Buffer.concat accepts Uint8Array directly — avoid the double copy.
    const buffer = Buffer.concat(chunks);
    const hash = createHash('sha256').update(buffer).digest('hex');

    const issuedAt = invoice.issuedAt;
    const yyyy = String(issuedAt.getUTCFullYear());
    const mm = String(issuedAt.getUTCMonth() + 1).padStart(2, '0');
    const dir = path.join(getStorageRoot(), yyyy, mm);
    await mkdir(dir, { recursive: true });
    const filename = `${invoice.cardcomDocumentNumber}.pdf`;
    const fullPath = path.join(dir, filename);
    await writeFile(fullPath, buffer);

    const relativePath = path.posix.join('storage', 'receipts', yyyy, mm, filename);

    await prisma.cardcomInvoice.update({
      where: { id: invoiceId },
      data: {
        localPdfPath: relativePath,
        localPdfHash: hash,
        lastBackupAttemptAt: new Date(),
        backupFailedReason: null,
      },
    });

    logger.info('[Cardcom PDF Backup] success', { invoiceId, path: relativePath });
    return { invoiceId, success: true, localPath: relativePath, hash };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await prisma.cardcomInvoice.update({
      where: { id: invoiceId },
      data: {
        backupAttempts: { increment: 1 },
        lastBackupAttemptAt: new Date(),
        backupFailedReason: message,
      },
    });
    logger.warn('[Cardcom PDF Backup] failed', { invoiceId, error: message });
    return { invoiceId, success: false, error: message };
  }
}

/**
 * Backup the next batch of invoices missing a local PDF. Used by cron.
 * Raises an AdminAlert when an invoice exhausts MAX_BACKUP_ATTEMPTS so the
 * admin sees that the 7-year retention guarantee is broken (e.g. Render disk
 * not configured, or Cardcom CDN blocking us).
 */
export async function backupPendingInvoices(): Promise<{ processed: number; succeeded: number; failed: number; alerted: number }> {
  const pending = await prisma.cardcomInvoice.findMany({
    where: {
      localPdfPath: null,
      pdfUrl: { not: null },
      backupAttempts: { lt: MAX_BACKUP_ATTEMPTS },
    },
    take: BATCH_LIMIT,
    orderBy: { issuedAt: 'asc' },
  });

  let succeeded = 0;
  let failed = 0;
  for (const inv of pending) {
    const result = await backupSingleInvoice(inv.id);
    if (result.success) succeeded++;
    else failed++;
  }

  // Raise AdminAlert for any invoice that just hit MAX_BACKUP_ATTEMPTS.
  // Use a deterministic, unique title per invoice — the title column has a regular
  // index, while JSON metadata path-filter would require a full table scan.
  // We then dedup against existing alerts in ONE batched query (no N+1).
  const exhausted = await prisma.cardcomInvoice.findMany({
    where: { localPdfPath: null, backupAttempts: { gte: MAX_BACKUP_ATTEMPTS } },
    take: 50,
    select: { id: true, cardcomDocumentNumber: true, backupFailedReason: true },
  });

  let alerted = 0;
  if (exhausted.length > 0) {
    const titles = exhausted.map((inv) => `[pdf-backup] ${inv.id}`);
    const existingAlerts = await prisma.adminAlert.findMany({
      where: { type: 'SYSTEM', title: { in: titles } },
      select: { title: true },
    });
    const existingTitleSet = new Set(existingAlerts.map((a) => a.title));

    const toCreate = exhausted
      .filter((inv) => !existingTitleSet.has(`[pdf-backup] ${inv.id}`))
      .map((inv) => ({
        type: 'SYSTEM' as const,
        priority: 'HIGH' as const,
        status: 'PENDING' as const,
        // Title encodes the invoice id so dedup is a simple string lookup with index.
        title: `[pdf-backup] ${inv.id}`,
        message: `גיבוי PDF נכשל לקבלה ${inv.cardcomDocumentNumber}: ${MAX_BACKUP_ATTEMPTS} ניסיונות נכשלו. ייתכן שה-Render disk לא מוגדר או שיש בעיית רשת ל-Cardcom CDN. סיבה אחרונה: ${inv.backupFailedReason ?? 'לא ידוע'}`,
        actionRequired: 'בדוק תצורת RECEIPTS_STORAGE_ROOT והרץ מחדש את ה-cron',
        metadata: { invoiceId: inv.id, documentNumber: inv.cardcomDocumentNumber },
      }));

    if (toCreate.length > 0) {
      const created = await prisma.adminAlert.createMany({ data: toCreate });
      alerted = created.count;
    }
  }

  return { processed: pending.length, succeeded, failed, alerted };
}
