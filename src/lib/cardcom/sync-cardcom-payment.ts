// src/lib/cardcom/sync-cardcom-payment.ts
//
// Shared "pull canonical state from Cardcom and apply to our DB" logic.
// Two callers:
//   1. POST /api/payments/[id]/sync-cardcom-status — manual sync triggered
//      by the therapist via a button.
//   2. GET /api/p/transaction-status — public polling endpoint, calls this
//      automatically when a transaction has been PENDING for more than ~15s
//      (the webhook is unreliable on Cardcom sandbox terminal 1000).
//
// The function is idempotent (safe to call repeatedly), uses the SAME three-
// part success criterion as the webhook handler (responseCode=0 + TranzactionId
// + ApprovalNumber), and creates the CardcomInvoice + SavedCardToken so the
// receipt appears in /dashboard/receipts without further action.
//
// Returns the FINAL status after the sync attempt (APPROVED if Cardcom now
// confirms a successful charge, otherwise the unchanged status).
//
// SECURITY: scopes to the transaction's owning therapist — the caller does
// NOT need to pre-authenticate. Trust comes from the LowProfileId being
// present in our DB (which means we created it via this therapist's
// terminal credentials), and the GetLpResult call requiring those same
// credentials. An attacker who guesses a transaction id can only trigger
// a no-op sync — they cannot cause anything malicious to happen.

import { Prisma } from '@prisma/client';
import prisma from '@/lib/prisma';
import { logger } from '@/lib/logger';
import { getUserCardcomClient } from '@/lib/cardcom/user-config';
import { getAdminCardcomClient } from '@/lib/cardcom/admin-config';
import type { CardcomWebhookPayload } from '@/lib/cardcom/types';

export interface SyncResult {
  status: 'APPROVED' | 'PENDING' | 'CANCELLED' | 'FAILED' | 'unknown';
  changed: boolean;
}

export async function syncCardcomTransaction(transactionId: string): Promise<SyncResult> {
  const tx = await prisma.cardcomTransaction.findUnique({
    where: { id: transactionId },
    include: {
      payment: {
        include: {
          client: { select: { id: true, name: true, email: true } },
          session: { select: { id: true, startTime: true } },
        },
      },
    },
  });

  if (!tx) return { status: 'unknown', changed: false };
  // Already settled — no work to do, return current state.
  if (tx.status === 'APPROVED') return { status: 'APPROVED', changed: false };
  if (tx.status === 'CANCELLED') return { status: 'CANCELLED', changed: false };
  if (tx.status === 'FAILED') return { status: 'FAILED', changed: false };
  if (!tx.lowProfileId) return { status: 'PENDING', changed: false };

  // Resolve credentials for the right tenant. ADMIN tenant uses global env
  // credentials; USER tenant uses the per-therapist BillingProvider row.
  let cardcomClient;
  try {
    if (tx.tenant === 'USER') {
      if (!tx.userId) return { status: 'PENDING', changed: false };
      cardcomClient = await getUserCardcomClient(tx.userId);
      if (!cardcomClient) return { status: 'PENDING', changed: false };
    } else {
      cardcomClient = await getAdminCardcomClient();
    }
  } catch (err) {
    logger.warn('[sync-cardcom-payment] credentials unavailable', {
      transactionId,
      tenant: tx.tenant,
      error: err instanceof Error ? err.message : String(err),
    });
    return { status: 'PENDING', changed: false };
  }

  let fetched: (CardcomWebhookPayload & { ResponseCode?: number | string }) | null;
  try {
    fetched = (await cardcomClient.getLpResult(tx.lowProfileId)) as
      | (CardcomWebhookPayload & { ResponseCode?: number | string })
      | null;
  } catch (err) {
    logger.warn('[sync-cardcom-payment] GetLpResult failed', {
      transactionId,
      error: err instanceof Error ? err.message : String(err),
    });
    return { status: 'PENDING', changed: false };
  }

  if (!fetched || fetched.LowProfileId !== tx.lowProfileId) {
    return { status: 'PENDING', changed: false };
  }

  // Same three-part success criterion as the webhook handler — kept in sync
  // deliberately. Without ApprovalNumber + TranzactionId, GetLpResult merely
  // tells us a session exists, NOT that the bank approved a charge.
  const responseCode = String(fetched.ResponseCode ?? '');
  const tranzactionIdNum = Number(fetched.TranzactionId ?? 0);
  const approvalNumber = fetched.TranzactionInfo?.ApprovalNumber ?? '';
  const success =
    responseCode === '0' && tranzactionIdNum > 0 && !!approvalNumber.trim();

  if (!success) return { status: 'PENDING', changed: false };

  // ─── Apply success ────────────────────────────────────────────
  const documentNumber = fetched.DocumentInfo?.DocumentNumber ?? null;
  const documentLink = fetched.DocumentInfo?.DocumentLink ?? null;
  const documentType = fetched.DocumentInfo?.DocumentType ?? 'Receipt';
  const allocationNumber = fetched.DocumentInfo?.AllocationNumber ?? null;

  // Therapist business profile — needed for CardcomInvoice metadata.
  const therapist =
    tx.tenant === 'USER' && tx.userId
      ? await prisma.user.findUnique({
          where: { id: tx.userId },
          select: {
            name: true,
            businessType: true,
            businessName: true,
            businessIdNumber: true,
            accountingMethod: true,
          },
        })
      : null;

  const now = new Date();

  // The whole apply step runs inside one transaction. UNIQUE-violation aware
  // helpers below treat P2002 as "already done" — handles the race where the
  // webhook handler and a concurrent auto-sync poll arrive within ms.
  try {
    await prisma.$transaction(async (atx) => {
      // Idempotent on transaction.id — re-update is harmless even if a
      // concurrent webhook already moved status to APPROVED.
      await atx.cardcomTransaction.update({
        where: { id: tx.id },
        data: {
          status: 'APPROVED',
          transactionId: String(tranzactionIdNum),
          approvalNumber,
          completedAt: now,
          rawResponse: fetched as object,
        },
      });

      if (tx.payment) {
        await atx.payment.update({
          where: { id: tx.payment.id },
          data: {
            status: 'PAID',
            paidAt: now,
            method: 'CREDIT_CARD',
            ...(documentNumber
              ? {
                  receiptNumber: documentNumber,
                  hasReceipt: true,
                  receiptUrl: documentLink ?? undefined,
                }
              : {}),
          },
        });
      }

      // CardcomInvoice mirror — only when Cardcom actually issued the document.
      if (documentNumber && tx.tenant === 'USER' && therapist && tx.userId && tx.payment?.client) {
        const isLicensed = therapist.businessType === 'LICENSED';
        const amountTotal = Number(tx.amount);
        const vatRate = isLicensed ? 18 : null;
        const amountBeforeVat =
          isLicensed && vatRate ? amountTotal / (1 + vatRate / 100) : null;
        const vatAmount =
          isLicensed && amountBeforeVat !== null ? amountTotal - amountBeforeVat : null;

        await atx.orphanCardcomDocument.updateMany({
          where: { cardcomDocumentNumber: documentNumber, resolved: false },
          data: {
            resolved: true,
            resolvedAt: now,
            resolutionNote: 'Auto-resolved by sync-cardcom-payment',
          },
        });

        // Try-create-on-unique idiom: race-safe upsert without findFirst+create
        // (which has a TOCTOU window allowing a concurrent webhook to sneak in
        // between, then create() trips P2002 and rolls back the WHOLE
        // transaction — losing the cardcomTransaction/payment updates above).
        try {
          await atx.cardcomInvoice.create({
            data: {
              tenant: 'USER',
              cardcomDocumentNumber: documentNumber,
              cardcomDocumentType: documentType,
              pdfUrl: documentLink,
              allocationNumber,
              issuerUserId: tx.userId,
              issuerBusinessType: therapist.businessType ?? 'NONE',
              issuerBusinessName: therapist.businessName ?? therapist.name ?? '',
              issuerIdNumber: therapist.businessIdNumber ?? '',
              vatRateSnapshot: vatRate ? String(vatRate) : null,
              amountBeforeVat: amountBeforeVat !== null ? amountBeforeVat.toFixed(2) : null,
              vatAmount: vatAmount !== null ? vatAmount.toFixed(2) : null,
              subscriberId: tx.userId,
              subscriberNameSnapshot: tx.payment.client.name,
              subscriberEmailSnapshot: tx.payment.client.email ?? null,
              recipientClientId: tx.payment.client.id,
              paymentId: tx.payment.id,
              cardcomTransactionId: tx.id,
              amount: tx.amount,
              currency: tx.currency,
              description: tx.payment.notes ?? 'תשלום על פגישה',
              issuedAt: now,
              occurredAt:
                therapist.accountingMethod === 'ACCRUAL'
                  ? (tx.payment.session?.startTime ?? now)
                  : now,
            },
          });
        } catch (err) {
          if (
            err instanceof Prisma.PrismaClientKnownRequestError &&
            err.code === 'P2002'
          ) {
            // Another caller (webhook or parallel sync) already created the
            // invoice — fine, the row exists, we're done.
            logger.info('[sync-cardcom-payment] CardcomInvoice already exists', {
              transactionId: tx.id,
              documentNumber,
            });
          } else {
            throw err;
          }
        }
      }

      // Saved card token (when valid expiry).
      const expMM = fetched.TranzactionInfo?.CardExpirationMM;
      const expYY = fetched.TranzactionInfo?.CardExpirationYY;
      const tokenStr = fetched.TranzactionInfo?.Token;
      if (
        tokenStr &&
        expMM &&
        expYY &&
        Number(expMM) >= 1 &&
        Number(expMM) <= 12 &&
        tx.tenant === 'USER' &&
        tx.userId &&
        tx.payment?.client
      ) {
        try {
          await atx.savedCardToken.upsert({
            where: { tenant_token: { tenant: 'USER', token: tokenStr } },
            update: { lastUsedAt: now, isActive: true, deletedAt: null },
            create: {
              tenant: 'USER',
              userId: tx.userId,
              clientId: tx.payment.client.id,
              token: tokenStr,
              cardLast4: fetched.TranzactionInfo?.Last4CardDigits ?? '0000',
              cardHolder: fetched.TranzactionInfo?.CardOwnerName ?? '',
              cardBrand: fetched.TranzactionInfo?.CardName ?? null,
              expiryMonth: Number(expMM),
              expiryYear: 2000 + Number(expYY),
            },
          });
        } catch (err) {
          // Token save is non-critical — never let it abort the transaction.
          logger.warn('[sync-cardcom-payment] SavedCardToken upsert failed', {
            transactionId: tx.id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      if (tx.payment) {
        await atx.task.updateMany({
          where: {
            relatedEntityId: tx.payment.id,
            type: 'COLLECT_PAYMENT',
            status: { in: ['PENDING', 'IN_PROGRESS'] },
          },
          data: { status: 'COMPLETED' },
        });
      }
    });
  } catch (err) {
    // Surface the underlying cause to the caller via a clear log line. The
    // function itself returns PENDING so the manual-sync UI doesn't show a
    // generic "communication error" — instead the caller knows the helper
    // bailed for a known DB reason.
    logger.error('[sync-cardcom-payment] DB transaction failed', {
      transactionId: tx.id,
      error: err instanceof Error ? err.message : String(err),
      code: (err as { code?: string })?.code,
    });
    throw err;
  }

  logger.info('[sync-cardcom-payment] promoted to APPROVED', {
    transactionId: tx.id,
    paymentId: tx.payment?.id ?? null,
    documentNumber,
  });

  return { status: 'APPROVED', changed: true };
}
