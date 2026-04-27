// src/app/api/webhooks/cardcom/user/route.ts
// Webhook handler for USER-tenant Cardcom transactions (therapist→client billing).
//
// Critical: do NOT trust ?userId= in the URL. We use it only to fetch the
// per-therapist BillingProvider row, then verify HMAC against that row's
// webhookSecret BEFORE acting on the payload.

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { withAudit } from "@/lib/audit";
import { decrypt } from "@/lib/encryption";
import {
  verifyWebhookSignature,
  verifyWebhookTimestamp,
  isCardcomIp,
  resolveClientIp,
  scrubCardcomMessage,
} from "@/lib/cardcom/verify-webhook";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  claimWebhook,
  finalizeWebhook,
  releaseWebhookClaim,
} from "@/lib/cardcom/webhook-claim";
import type { CardcomWebhookPayload } from "@/lib/cardcom/types";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const ip = resolveClientIp(request.headers);

  const rateLimitResult = checkRateLimit(`webhook:cardcom:user:${ip ?? "unknown"}`, {
    windowMs: 60 * 1000,
    maxRequests: 100,
  });
  if (!rateLimitResult.allowed) {
    logger.warn("[Cardcom User Webhook] rate limited", { ip });
    return new NextResponse("Too Many Requests", {
      status: 429,
      headers: {
        "Retry-After": String(
          Math.max(1, Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000))
        ),
      },
    });
  }

  if (!isCardcomIp(ip)) {
    logger.warn("[Cardcom User Webhook] rejected IP", { ip });
    return new NextResponse("Forbidden", { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const userId = searchParams.get("userId");
  if (!userId) {
    return new NextResponse("Missing userId", { status: 400 });
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return new NextResponse("Bad Request", { status: 400 });
  }

  // Look up therapist's BillingProvider — required for HMAC verification
  const provider = await prisma.billingProvider.findFirst({
    where: { userId, provider: "CARDCOM", isActive: true },
  });
  if (!provider?.webhookSecret) {
    logger.warn("[Cardcom User Webhook] no provider/secret for user", { userId });
    return new NextResponse("Unauthorized", { status: 401 });
  }

  let secret: string;
  try {
    secret = decrypt(provider.webhookSecret);
  } catch {
    return new NextResponse("Server error", { status: 500 });
  }

  const signature = request.headers.get("x-cardcom-signature");
  // Verify against current webhook secret first; if rotation happened recently,
  // also try the previous secret (grace window of 24h). decrypt() of the
  // previous secret is wrapped — if the encryption key was rotated and we
  // can't decode the legacy ciphertext, we MUST NOT crash the webhook (would
  // mean Cardcom retries forever). We just skip the fallback.
  let validSig = verifyWebhookSignature(rawBody, signature, secret);
  if (
    !validSig &&
    provider.previousWebhookSecret &&
    provider.previousWebhookSecretValidUntil &&
    provider.previousWebhookSecretValidUntil > new Date()
  ) {
    try {
      const prev = decrypt(provider.previousWebhookSecret);
      validSig = verifyWebhookSignature(rawBody, signature, prev);
    } catch (err) {
      logger.warn("[Cardcom User Webhook] previousWebhookSecret decrypt failed", {
        userId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }
  if (!validSig) {
    logger.warn("[Cardcom User Webhook] invalid signature", { userId, ip });
    return new NextResponse("Invalid signature", { status: 401 });
  }

  let payload: CardcomWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as CardcomWebhookPayload;
  } catch {
    return new NextResponse("Invalid JSON", { status: 400 });
  }

  if (!verifyWebhookTimestamp(payload.Timestamp)) {
    return new NextResponse("Stale webhook", { status: 400 });
  }

  if (!payload.LowProfileId) {
    return new NextResponse("Missing LowProfileId", { status: 400 });
  }

  // Lease-based idempotent claim — recovers from worker crashes.
  const eventKey = `USER:${userId}:${payload.LowProfileId}`;
  const claim = await claimWebhook("CARDCOM", eventKey, payload as object);
  if (claim.status === "already_processed") {
    return NextResponse.json({ ok: true, idempotent: true });
  }
  if (claim.status === "in_progress") {
    return new NextResponse("Webhook in progress", {
      status: 503,
      headers: { "Retry-After": "60" },
    });
  }

  try {
    await processUserWebhook(userId, payload);
    await finalizeWebhook(claim.eventId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("[Cardcom User Webhook] processing failed", {
      userId,
      lowProfileId: payload.LowProfileId,
      error: message,
    });
    await releaseWebhookClaim(claim.eventId, message);
    return new NextResponse("Processing error", { status: 500 });
  }
}

async function processUserWebhook(userId: string, payload: CardcomWebhookPayload): Promise<void> {
  const transaction = await prisma.cardcomTransaction.findUnique({
    where: { lowProfileId: payload.LowProfileId },
    include: { payment: { include: { client: true, session: true } } },
  });

  if (!transaction || transaction.tenant !== "USER" || transaction.userId !== userId) {
    // CRITICAL: do NOT silently mark this webhook as processed. If the
    // CardcomTransaction.lowProfileId hasn't been written yet (race between
    // /api/payments/[id]/charge-cardcom and a fast-arriving webhook), a quiet
    // return would cause finalizeWebhook to set processed=true and Cardcom
    // would never retry — the payment would be lost from our records.
    // Throwing causes releaseWebhookClaim → Cardcom retries → eventually
    // either matches OR ends up in OrphanCardcomDocument via the daily sync.
    logger.warn("[Cardcom User Webhook] mismatched transaction — releasing for retry", {
      userId,
      lowProfileId: payload.LowProfileId,
      foundTransactionId: transaction?.id ?? null,
      foundTenant: transaction?.tenant ?? null,
      foundUserId: transaction?.userId ?? null,
    });
    throw new Error("CARDCOM_USER_WEBHOOK_MISMATCHED_TRANSACTION");
  }

  // Therapist's own business profile — drives receipt/tax-invoice issuance type
  const therapist = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      name: true,
      email: true,
      businessType: true,
      businessName: true,
      businessIdNumber: true,
      businessAddress: true,
      businessPhone: true,
      accountingMethod: true,
    },
  });

  const responseCode = String(payload.ResponseCode);
  const success = responseCode === "0";

  // Chargeback / Reverse / Cancel — surfaced as ChargebackEvent + URGENT alert.
  // Same logic as ADMIN webhook (kept in sync deliberately).
  const operationLower = String(payload.Operation ?? "").toLowerCase();
  const isReversal =
    operationLower.includes("chargeback") ||
    operationLower.includes("reverse") ||
    operationLower.includes("refund") ||
    operationLower === "cancel";
  if (isReversal && transaction.status === "APPROVED") {
    logger.warn("[Cardcom User Webhook] reversal/chargeback detected", {
      transactionId: transaction.id,
      operation: payload.Operation,
    });
    await prisma.$transaction([
      prisma.chargebackEvent.create({
        data: {
          cardcomTransactionId: transaction.id,
          tenant: "USER",
          operation: String(payload.Operation ?? "unknown"),
          amount: transaction.amount,
          currency: transaction.currency,
          rawPayload: payload as object,
        },
      }),
      prisma.adminAlert.create({
        data: {
          type: "PAYMENT_FAILED",
          priority: "URGENT",
          status: "PENDING",
          title: `[cardcom-chargeback] עסקה ${transaction.id} (USER)`,
          message: `מטופל ביצע chargeback אצל Cardcom (Operation="${payload.Operation}"). המטפל ${userId} רשם הכנסה — נדרש refund/void ידני.`,
          actionRequired: "פנה למטפל, וודא ב-Cardcom שהכסף הוחזר, בצע refund/void בצד שלנו.",
          userId,
          metadata: {
            alertSubtype: "chargeback",
            transactionId: transaction.id,
            operation: payload.Operation,
            paymentId: transaction.paymentId,
          },
        },
      }),
    ]);
  }

  await withAudit(
    { kind: "system", source: "WEBHOOK_CARDCOM", externalRef: payload.LowProfileId },
    {
      action: success ? "cardcom_user_webhook_approved" : "cardcom_user_webhook_declined",
      targetType: "cardcom_transaction",
      targetId: transaction.id,
      details: {
        userId,
        responseCode,
        amount: Number(transaction.amount),
        last4: payload.TranzactionInfo?.Last4CardDigits,
      },
    },
    async (tx) => {
      const now = new Date();

      await tx.cardcomTransaction.update({
        where: { id: transaction.id },
        data: {
          status: success ? "APPROVED" : "DECLINED",
          transactionId: payload.TranzactionId ?? null,
          approvalNumber: payload.TranzactionInfo?.ApprovalNumber ?? null,
          cardLast4: payload.TranzactionInfo?.Last4CardDigits ?? transaction.cardLast4,
          cardHolder: payload.TranzactionInfo?.CardOwnerName ?? transaction.cardHolder,
          cardBrand: payload.TranzactionInfo?.CardName ?? null,
          token: payload.TranzactionInfo?.Token ?? null,
          tokenExpiryMonth: payload.TranzactionInfo?.CardExpirationMM
            ? Number(payload.TranzactionInfo.CardExpirationMM)
            : null,
          tokenExpiryYear: payload.TranzactionInfo?.CardExpirationYY
            ? 2000 + Number(payload.TranzactionInfo.CardExpirationYY)
            : null,
          errorCode: success ? null : responseCode,
          // PAN scrub — Cardcom Description may rarely echo card fragments.
          errorMessage: success ? null : scrubCardcomMessage(payload.Description),
          completedAt: now,
        },
      });

      if (!success) {
        // Surface the decline reason on Payment so the therapist sees it in UI
        // (not just buried in cardcomTransaction.errorMessage).
        if (transaction.paymentId) {
          await tx.payment.update({
            where: { id: transaction.paymentId },
            data: {
              lastDeclineReason:
                scrubCardcomMessage(payload.Description) ?? `Cardcom ${responseCode}`,
              lastDeclineAt: now,
            },
          });
        }
        return;
      }

      // Mark Payment as paid + clear any prior decline notice.
      if (transaction.paymentId && transaction.payment) {
        await tx.payment.update({
          where: { id: transaction.paymentId },
          data: {
            status: "PAID",
            method: "CREDIT_CARD",
            paidAt: now,
            lastDeclineReason: null,
            lastDeclineAt: null,
            ...(payload.DocumentInfo?.DocumentNumber
              ? {
                  receiptNumber: payload.DocumentInfo.DocumentNumber,
                  hasReceipt: true,
                  receiptUrl: payload.DocumentInfo.DocumentLink ?? undefined,
                }
              : {}),
          },
        });
      }

      // Save token for the client (if Cardcom returned one) — only with a real expiry.
      const expMM = payload.TranzactionInfo?.CardExpirationMM;
      const expYY = payload.TranzactionInfo?.CardExpirationYY;
      if (
        payload.TranzactionInfo?.Token &&
        transaction.payment?.clientId &&
        expMM &&
        expYY &&
        Number(expMM) >= 1 &&
        Number(expMM) <= 12
      ) {
        const tokenStr = payload.TranzactionInfo.Token;
        await tx.savedCardToken.upsert({
          where: { tenant_token: { tenant: "USER", token: tokenStr } },
          update: { lastUsedAt: now, isActive: true, deletedAt: null },
          create: {
            tenant: "USER",
            userId,
            clientId: transaction.payment.clientId,
            token: tokenStr,
            cardLast4: payload.TranzactionInfo.Last4CardDigits ?? "0000",
            cardHolder: payload.TranzactionInfo.CardOwnerName ?? "",
            cardBrand: payload.TranzactionInfo.CardName ?? null,
            expiryMonth: Number(expMM),
            expiryYear: 2000 + Number(expYY),
          },
        });
      } else if (payload.TranzactionInfo?.Token) {
        logger.warn("[Cardcom User Webhook] token returned without valid expiry — not saved", {
          transactionId: transaction.id,
          hasMM: !!expMM,
          hasYY: !!expYY,
        });
      }

      // Mirror metadata as CardcomInvoice for unified visibility (USER tenant invoices)
      if (
        payload.DocumentInfo?.DocumentNumber &&
        therapist &&
        transaction.payment?.client
      ) {
        const documentType = payload.DocumentInfo.DocumentType ?? "Receipt";
        const isLicensed = therapist.businessType === "LICENSED";
        const amountTotal = Number(transaction.amount);
        // VAT rate — for now use the standard Israeli rate; future: read from a
        // central settings table so a rate change in 2030 doesn't require deploy.
        const vatRate = isLicensed ? 18 : null;
        const amountBeforeVat = isLicensed && vatRate ? amountTotal / (1 + vatRate / 100) : null;
        const vatAmount =
          isLicensed && amountBeforeVat !== null ? amountTotal - amountBeforeVat : null;

        // Refuse to create a tax invoice without a tax id (legal requirement).
        const issuerIdNumber = therapist.businessIdNumber ?? "";
        if (isLicensed && !issuerIdNumber) {
          logger.error("[Cardcom User Webhook] LICENSED therapist has no businessIdNumber — invoice not recorded", {
            userId,
            documentNumber: payload.DocumentInfo.DocumentNumber,
          });
          // Do not throw — let the rest of the webhook complete (transaction marked, payment paid).
          // The unrecorded invoice is auditable via CardcomTransaction.
        } else {
          // The therapist (userId) is the ISSUER. The client is the SUBSCRIBER (recipient).
          // We store the client ONLY as snapshot fields, not as a User FK, because Client
          // is a separate model — but Prisma requires `subscriberId` to point at User.
          // Resolution: subscriberId points at the issuer (therapist) for USER tenant,
          // and we ALSO denormalize subscriberNameSnapshot/Email from the actual client.
          // The semantic is documented in the schema and exposed via `tenant=USER` filter.
          // For ADMIN tenant: subscriber=therapist (paying customer); for USER: snapshot only.
          // This keeps relational integrity (no nullable client FK on a "must-have" field).
          // occurredAt = the date the income economically belongs to.
          // CASH (default for all therapists today) — date of payment (NOW).
          // ACCRUAL — date of service (session). NEVER use session date for
          // CASH: if a session was held in February but charged in March, the
          // income belongs to March, and tax filing must reflect that.
          const sessionDate = transaction.payment.session?.startTime ?? null;
          const economicDate =
            therapist.accountingMethod === "ACCRUAL"
              ? (sessionDate ?? now)
              : now;
          // Auto-resolve any orphan row captured for this document by the
          // sync cron (late-webhook recovery).
          await tx.orphanCardcomDocument.updateMany({
            where: {
              cardcomDocumentNumber: payload.DocumentInfo.DocumentNumber,
              resolved: false,
            },
            data: {
              resolved: true,
              resolvedAt: new Date(),
              resolutionNote: "Auto-resolved by late webhook (USER tenant)",
            },
          });

          await tx.cardcomInvoice.create({
            data: {
              tenant: "USER",
              cardcomDocumentNumber: payload.DocumentInfo.DocumentNumber,
              cardcomDocumentType: documentType,
              pdfUrl: payload.DocumentInfo.DocumentLink ?? null,
              allocationNumber: payload.DocumentInfo.AllocationNumber ?? null,
              // Issuer = the therapist
              issuerUserId: userId,
              issuerBusinessType: therapist.businessType ?? "NONE",
              issuerBusinessName: therapist.businessName ?? therapist.name ?? "",
              issuerIdNumber,
              vatRateSnapshot: vatRate ? String(vatRate) : null,
              amountBeforeVat: amountBeforeVat !== null ? amountBeforeVat.toFixed(2) : null,
              vatAmount: vatAmount !== null ? vatAmount.toFixed(2) : null,
              // subscriberId is the therapist (FK integrity); the *real* recipient
              // of the invoice is captured by recipientClientId (Client FK).
              subscriberId: userId,
              subscriberNameSnapshot: transaction.payment.client.name,
              subscriberEmailSnapshot: transaction.payment.client.email ?? null,
              recipientClientId: transaction.payment.clientId,
              paymentId: transaction.payment.id,
              cardcomTransactionId: transaction.id,
              amount: transaction.amount,
              currency: transaction.currency,
              description: transaction.payment.notes ?? "תשלום על פגישה",
              occurredAt: economicDate,
              issuedAt: now,
            },
          });
        }
      }
    }
  );
}
