// src/app/api/webhooks/cardcom/admin/route.ts
// Webhook handler for ADMIN-tenant Cardcom transactions (subscription payments).
//
// Flow:
//  1. IP allowlist check (defense-in-depth)
//  2. HMAC signature verification (env: CARDCOM_ADMIN_WEBHOOK_SECRET)
//  3. Timestamp anti-replay (±5 minutes)
//  4. WebhookEvent.upsert — idempotency (avoid double-processing)
//  5. Inside withAudit (system actor):
//      - Update CardcomTransaction status
//      - Update SubscriptionPayment.status = PAID
//      - Update User.subscriptionStatus
//      - Save token to SavedCardToken (if CreateToken)
//      - Create CardcomInvoice with metadata (PDF backup runs separately)

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { withAudit } from "@/lib/audit";
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
import { getAdminWebhookSecret } from "@/lib/cardcom/admin-config";
import { getAdminBusinessProfile } from "@/lib/site-settings";
import { sanitizeCardcomPayload, sanitizeChargebackPayload } from "@/lib/cardcom/sanitize";
import type { CardcomWebhookPayload } from "@/lib/cardcom/types";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const ip = resolveClientIp(request.headers);

  // Rate-limit before any DB / HMAC work — bounds CPU+DB cost of a flood of
  // bad requests. Cardcom's legitimate retry rate is well under 100/min.
  //
  // ⚠️ PER-INSTANCE LIMIT: checkRateLimit uses an in-memory Map. On Render
  // multi-instance plans this means each Node instance has its OWN counter —
  // 3 instances → effective 300/min global. MyTipul is single-instance today;
  // the assumption MUST be re-evaluated before scaling. Migrate to Upstash
  // Redis or a Postgres-backed counter when adding a second instance.
  const rateLimitResult = checkRateLimit(`webhook:cardcom:admin:${ip ?? "unknown"}`, {
    windowMs: 60 * 1000,
    maxRequests: 100,
  });
  if (!rateLimitResult.allowed) {
    logger.warn("[Cardcom Admin Webhook] rate limited", { ip });
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
    logger.warn("[Cardcom Admin Webhook] rejected IP", { ip });
    return new NextResponse("Forbidden", { status: 403 });
  }

  // Read raw body for HMAC verification
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return new NextResponse("Bad Request", { status: 400 });
  }

  let secret: string;
  try {
    secret = getAdminWebhookSecret();
  } catch {
    logger.error("[Cardcom Admin Webhook] secret not configured");
    return new NextResponse("Server misconfiguration", { status: 500 });
  }

  const signature = request.headers.get("x-cardcom-signature");
  if (!verifyWebhookSignature(rawBody, signature, secret)) {
    logger.warn("[Cardcom Admin Webhook] invalid signature", { ip });
    return new NextResponse("Invalid signature", { status: 401 });
  }

  let payload: CardcomWebhookPayload;
  try {
    payload = JSON.parse(rawBody) as CardcomWebhookPayload;
  } catch {
    return new NextResponse("Invalid JSON", { status: 400 });
  }

  if (!verifyWebhookTimestamp(payload.Timestamp)) {
    logger.warn("[Cardcom Admin Webhook] stale timestamp", { ts: payload.Timestamp });
    return new NextResponse("Stale webhook", { status: 400 });
  }

  if (!payload.LowProfileId) {
    return new NextResponse("Missing LowProfileId", { status: 400 });
  }

  // Lease-based idempotent claim — recovers from worker crashes.
  // ADMIN tenant prefix prevents collision with USER-tenant events that share
  // the same LowProfileId (extremely rare, but cheap to defend against).
  const eventKey = `ADMIN:${payload.LowProfileId}`;
  const claim = await claimWebhook("CARDCOM", eventKey, payload as object);
  if (claim.status === "already_processed") {
    return NextResponse.json({ ok: true, idempotent: true });
  }
  if (claim.status === "in_progress") {
    // Another worker holds the lease. 503 + Retry-After triggers Cardcom's retry
    // logic instead of having Cardcom mark the webhook as delivered.
    return new NextResponse("Webhook in progress", {
      status: 503,
      headers: { "Retry-After": "60" },
    });
  }

  try {
    await processAdminWebhook(payload);
    await finalizeWebhook(claim.eventId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error("[Cardcom Admin Webhook] processing failed", {
      lowProfileId: payload.LowProfileId,
      error: message,
    });
    await releaseWebhookClaim(claim.eventId, message);
    return new NextResponse("Processing error", { status: 500 });
  }
}

async function processAdminWebhook(payload: CardcomWebhookPayload): Promise<void> {
  const transaction = await prisma.cardcomTransaction.findUnique({
    where: { lowProfileId: payload.LowProfileId },
    include: { subscriptionPayment: { include: { user: true } } },
  });

  if (!transaction) {
    // Throw to release the claim — Cardcom retries until createPaymentPage
    // finishes writing the lowProfileId, OR the daily sync captures it as orphan.
    logger.warn("[Cardcom Admin Webhook] no matching CardcomTransaction — releasing for retry", {
      lowProfileId: payload.LowProfileId,
    });
    throw new Error("CARDCOM_ADMIN_WEBHOOK_NO_TRANSACTION");
  }

  if (transaction.tenant !== "ADMIN") {
    logger.warn("[Cardcom Admin Webhook] non-admin transaction routed to admin webhook", {
      transactionId: transaction.id,
    });
    throw new Error("CARDCOM_ADMIN_WEBHOOK_WRONG_TENANT");
  }

  const responseCode = String(payload.ResponseCode);
  const success = responseCode === "0";
  const businessProfile = await getAdminBusinessProfile();

  // Chargeback / Reverse / Cancel — Cardcom uses the Operation field to signal
  // post-success state changes initiated by their side or the cardholder.
  // We don't undo the transaction here (admin must verify), but raise an
  // URGENT alert so the income isn't silently overstated.
  const operationLower = String(payload.Operation ?? "").toLowerCase();
  const isReversal =
    operationLower.includes("chargeback") ||
    operationLower.includes("reverse") ||
    operationLower.includes("refund") ||
    operationLower === "cancel";
  if (isReversal && transaction.status === "APPROVED") {
    logger.warn("[Cardcom Admin Webhook] reversal/chargeback detected", {
      transactionId: transaction.id,
      operation: payload.Operation,
    });
    await prisma.$transaction([
      // ChargebackEvent — financial event, queryable for monthly reports
      // and block-listing repeat-chargeback customers.
      prisma.chargebackEvent.create({
        data: {
          cardcomTransactionId: transaction.id,
          tenant: "ADMIN",
          operation: String(payload.Operation ?? "unknown"),
          amount: transaction.amount,
          currency: transaction.currency,
          // Stricter PII scrub for chargeback rows (kept long-term for audit).
          rawPayload: sanitizeChargebackPayload(payload as unknown as object),
        },
      }),
      // AdminAlert — surfaced to the admin UI; subtype distinguishes from
      // a regular PAYMENT_FAILED (which is a charge that never succeeded).
      prisma.adminAlert.create({
        data: {
          type: "PAYMENT_FAILED",
          priority: "URGENT",
          status: "PENDING",
          title: `[cardcom-chargeback] עסקה ${transaction.id}`,
          message: `Cardcom שלחו webhook עם Operation="${payload.Operation}" על עסקה שאושרה. הכסף הוחזר ללקוח. ההכנסה אצלנו עדיין רשומה — נדרש refund/void ידני להתאמה.`,
          actionRequired: "וודא שהכסף הוחזר ב-Cardcom ובחר: cardcom/refund (להתאמת DB) או void.",
          userId: transaction.userId,
          metadata: {
            alertSubtype: "chargeback",
            transactionId: transaction.id,
            operation: payload.Operation,
            subscriptionPaymentId: transaction.subscriptionPaymentId,
          },
        },
      }),
    ]);
  }

  await withAudit(
    { kind: "system", source: "WEBHOOK_CARDCOM", externalRef: payload.LowProfileId },
    {
      action: success ? "cardcom_webhook_approved" : "cardcom_webhook_declined",
      targetType: "cardcom_transaction",
      targetId: transaction.id,
      details: {
        responseCode,
        amount: Number(transaction.amount),
        approvalNumber: payload.TranzactionInfo?.ApprovalNumber,
        last4: payload.TranzactionInfo?.Last4CardDigits,
      },
    },
    async (tx) => {
      const now = new Date();

      // Update CardcomTransaction
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
          rawResponse: sanitizeRawResponse(payload),
          completedAt: now,
        },
      });

      if (!success) return;

      // Update SubscriptionPayment
      if (transaction.subscriptionPaymentId) {
        await tx.subscriptionPayment.update({
          where: { id: transaction.subscriptionPaymentId },
          data: { status: "PAID", paidAt: now, method: "CREDIT_CARD" },
        });
      }

      // Update User.subscriptionStatus → ACTIVE (unless PAUSED)
      if (transaction.userId) {
        const user = await tx.user.findUnique({ where: { id: transaction.userId } });
        if (user && user.subscriptionStatus !== "PAUSED") {
          await tx.user.update({
            where: { id: transaction.userId },
            data: { subscriptionStatus: "ACTIVE" },
          });
        }
      }

      // Save token if Cardcom returned one — upsert (idempotent on retries).
      // Refuse to save without a real expiry (silently saving 12/2030 hides
      // expired tokens that will fail later with a generic decline).
      const expMM = payload.TranzactionInfo?.CardExpirationMM;
      const expYY = payload.TranzactionInfo?.CardExpirationYY;
      if (
        payload.TranzactionInfo?.Token &&
        transaction.userId &&
        expMM &&
        expYY &&
        Number(expMM) >= 1 &&
        Number(expMM) <= 12
      ) {
        const tokenStr = payload.TranzactionInfo.Token;
        await tx.savedCardToken.upsert({
          where: { tenant_token: { tenant: "ADMIN", token: tokenStr } },
          update: { lastUsedAt: now, isActive: true, deletedAt: null },
          create: {
            tenant: "ADMIN",
            subscriberId: transaction.userId,
            token: tokenStr,
            cardLast4: payload.TranzactionInfo.Last4CardDigits ?? "0000",
            cardHolder: payload.TranzactionInfo.CardOwnerName ?? "",
            cardBrand: payload.TranzactionInfo.CardName ?? null,
            expiryMonth: Number(expMM),
            expiryYear: 2000 + Number(expYY),
          },
        });
      } else if (payload.TranzactionInfo?.Token) {
        logger.warn("[Cardcom Admin Webhook] token returned without valid expiry — not saved", {
          transactionId: transaction.id,
          hasMM: !!expMM,
          hasYY: !!expYY,
        });
      }

      // If a daily-sync cron previously captured this document as orphan,
      // mark it resolved now that the late webhook arrived. Otherwise the
      // admin sees a stuck "orphan" alert for a doc that's actually fine.
      //
      // We deliberately do NOT auto-dismiss the parent AdminAlert here. A
      // single rolling alert may reference MANY orphans (different days /
      // tenants / users); dismissing the alert just because ONE orphan in
      // it resolved would hide the rest. The admin dismisses the alert
      // manually after all referenced orphans are resolved.
      if (payload.DocumentInfo?.DocumentNumber) {
        await tx.orphanCardcomDocument.updateMany({
          where: {
            cardcomDocumentNumber: payload.DocumentInfo.DocumentNumber,
            resolved: false,
          },
          data: {
            resolved: true,
            resolvedAt: new Date(),
            resolutionNote: "Auto-resolved by late webhook (ADMIN tenant)",
          },
        });
      }

      // Create CardcomInvoice with metadata (PDF backup runs in separate cron)
      if (payload.DocumentInfo?.DocumentNumber && transaction.subscriptionPayment) {
        const sp = transaction.subscriptionPayment;
        // occurredAt = the date the income was actually received (per Israeli
        // tax reporting law). For ADMIN: the webhook's transaction completion is
        // the same calendar date the customer was charged. issuedAt = when
        // Cardcom rendered the document (also = now).
        const economicDate =
          sp.paidAt ?? transaction.completedAt ?? now;
        const documentType = payload.DocumentInfo.DocumentType ?? "Receipt";
        const isLicensed = businessProfile.type === "LICENSED";
        const amountTotal = Number(transaction.amount);
        const vatRate = isLicensed ? businessProfile.vatRate : null;
        const amountBeforeVat = isLicensed && vatRate ? amountTotal / (1 + vatRate / 100) : null;
        const vatAmount =
          isLicensed && amountBeforeVat !== null ? amountTotal - amountBeforeVat : null;

        await tx.cardcomInvoice.create({
          data: {
            tenant: "ADMIN",
            cardcomDocumentNumber: payload.DocumentInfo.DocumentNumber,
            cardcomDocumentType: documentType,
            pdfUrl: payload.DocumentInfo.DocumentLink ?? null,
            allocationNumber: payload.DocumentInfo.AllocationNumber ?? null,
            // ADMIN tenant — issuer is MyTipul itself (not a User row).
            issuerUserId: null,
            issuerBusinessType: businessProfile.type,
            issuerBusinessName: businessProfile.name,
            issuerIdNumber: businessProfile.idNumber,
            vatRateSnapshot: vatRate ? String(vatRate) : null,
            amountBeforeVat: amountBeforeVat !== null ? amountBeforeVat.toFixed(2) : null,
            vatAmount: vatAmount !== null ? vatAmount.toFixed(2) : null,
            subscriberId: sp.userId,
            subscriberNameSnapshot: sp.user.name ?? "",
            subscriberEmailSnapshot: sp.user.email ?? null,
            subscriptionPaymentId: sp.id,
            cardcomTransactionId: transaction.id,
            amount: transaction.amount,
            currency: transaction.currency,
            description: sp.description ?? "מנוי MyTipul",
            occurredAt: economicDate,
            issuedAt: now,
          },
        });
      }
    }
  );
}

/**
 * Strip credentials and sensitive card data from rawResponse before persisting.
 * Stage 1.19 — uses shared deep redactor in @/lib/cardcom/sanitize.
 */
function sanitizeRawResponse(payload: CardcomWebhookPayload): object {
  return sanitizeCardcomPayload(payload as unknown as object);
}
