// src/app/api/webhooks/cardcom/admin/route.ts
// Webhook handler for ADMIN-tenant Cardcom transactions (subscription payments).
//
// VERIFICATION STRATEGY: GetLpResult callback (Cardcom v11 LowProfile webhooks
// are NOT HMAC-signed — instead, we re-fetch the canonical state from Cardcom
// using the LowProfileId in the body). The fetch requires our terminal
// credentials, so an attacker cannot fabricate "approved" notifications for
// transactions that don't exist on Cardcom's side.
//
// Flow:
//  1. Rate-limit (per-instance + per-IP)
//  2. IP allowlist (defense-in-depth — soft warn, real verification is GetLpResult)
//  3. Parse body — used only for LowProfileId; data fields are re-fetched
//  4. GetLpResult against ADMIN credentials → canonical payload
//  5. Timestamp anti-replay (±5 minutes)
//  6. claimWebhook — lease-based idempotency (recovers from worker crashes)
//  7. Inside withAudit (system actor):
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
import { getAdminCardcomClient } from "@/lib/cardcom/admin-config";
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

  // IP allowlist as defense-in-depth, but soft. Real verification is GetLpResult.
  if (!isCardcomIp(ip)) {
    logger.warn("[Cardcom Admin Webhook] non-Cardcom IP (continuing — verified via GetLpResult)", { ip });
  }

  // Body is just a notification — Cardcom v11 LowProfile webhooks aren't
  // HMAC-signed. We re-fetch the canonical state via GetLpResult below.
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return new NextResponse("Bad Request", { status: 400 });
  }

  let bodyPayload: CardcomWebhookPayload;
  try {
    bodyPayload = JSON.parse(rawBody) as CardcomWebhookPayload;
  } catch {
    return new NextResponse("Invalid JSON", { status: 400 });
  }

  if (!verifyWebhookTimestamp(bodyPayload.Timestamp)) {
    logger.warn("[Cardcom Admin Webhook] stale timestamp", { ts: bodyPayload.Timestamp });
    return new NextResponse("Stale webhook", { status: 400 });
  }

  if (!bodyPayload.LowProfileId) {
    return new NextResponse("Missing LowProfileId", { status: 400 });
  }

  // ── Verification: GetLpResult callback ────────────────────────
  // Re-fetch canonical state from Cardcom using the global ADMIN credentials.
  // The fetch requires our terminal credentials, so an attacker can't fake an
  // approval for a transaction we didn't create.
  let cardcomClient;
  try {
    cardcomClient = await getAdminCardcomClient();
  } catch (err) {
    logger.error("[Cardcom Admin Webhook] admin client not configured", {
      error: err instanceof Error ? err.message : String(err),
    });
    return new NextResponse("Server misconfiguration", { status: 500 });
  }

  let payload: CardcomWebhookPayload;
  try {
    const fetched = (await cardcomClient.getLpResult(
      bodyPayload.LowProfileId
    )) as CardcomWebhookPayload & { ResponseCode?: number | string };
    if (!fetched || fetched.LowProfileId !== bodyPayload.LowProfileId) {
      logger.warn("[Cardcom Admin Webhook] GetLpResult returned mismatched LowProfileId", {
        bodyLpId: bodyPayload.LowProfileId,
        fetchedLpId: fetched?.LowProfileId,
      });
      return new NextResponse("Verification failed", { status: 401 });
    }
    payload = {
      ...fetched,
      ResponseCode: String(fetched.ResponseCode ?? bodyPayload.ResponseCode ?? ""),
      LowProfileId: bodyPayload.LowProfileId,
      Timestamp: bodyPayload.Timestamp,
    } as CardcomWebhookPayload;
  } catch (err) {
    logger.error("[Cardcom Admin Webhook] GetLpResult verification failed", {
      lowProfileId: bodyPayload.LowProfileId,
      error: err instanceof Error ? err.message : String(err),
    });
    return new NextResponse("Verification failed", { status: 401 });
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

  // CRITICAL — same three-part success criterion as USER webhook. See
  // user/route.ts for the rationale: ResponseCode=0 from GetLpResult only
  // means "API call ok", not "customer paid". An empty TranzactionInfo means
  // a session was created but never charged.
  const responseCode = String(payload.ResponseCode);
  const tranzactionIdNum = Number(payload.TranzactionId ?? 0);
  const approvalNumber = payload.TranzactionInfo?.ApprovalNumber ?? "";
  const success =
    responseCode === "0" &&
    tranzactionIdNum > 0 &&
    !!approvalNumber.trim();
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
      // INTENTIONAL: this block runs ONLY in the success branch (the whole
      // function early-returns on !success above). A chargeback/reverse webhook
      // arriving on an orphan is NOT an "all clear" — the chargeback handler
      // higher up raised its own URGENT alert and the orphan row stays open
      // for manual resolution.
      //
      // We deliberately do NOT auto-dismiss the parent AdminAlert here. A
      // single rolling alert may reference MANY orphans (different days /
      // tenants / users); dismissing the alert just because ONE orphan in
      // it resolved would hide the rest. The admin dismisses the alert
      // manually after all referenced orphans are resolved.
      // Coerce — Cardcom returns DocumentNumber/AllocationNumber as numbers
      // in GetLpResult; the schema columns are String. Without coercion
      // Prisma rejects with "Expected String, provided Int".
      const adminDocNumStr = payload.DocumentInfo?.DocumentNumber !== undefined &&
        payload.DocumentInfo?.DocumentNumber !== null
          ? String(payload.DocumentInfo.DocumentNumber)
          : null;
      const adminAllocationStr = payload.DocumentInfo?.AllocationNumber !== undefined &&
        payload.DocumentInfo?.AllocationNumber !== null
          ? String(payload.DocumentInfo.AllocationNumber)
          : null;

      if (adminDocNumStr) {
        await tx.orphanCardcomDocument.updateMany({
          where: {
            cardcomDocumentNumber: adminDocNumStr,
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
      if (adminDocNumStr && transaction.subscriptionPayment) {
        const sp = transaction.subscriptionPayment;
        // occurredAt = the date the income was actually received (per Israeli
        // tax reporting law). For ADMIN: the webhook's transaction completion is
        // the same calendar date the customer was charged. issuedAt = when
        // Cardcom rendered the document (also = now).
        const economicDate =
          sp.paidAt ?? transaction.completedAt ?? now;
        const documentType = payload.DocumentInfo?.DocumentType ?? "Receipt";
        const isLicensed = businessProfile.type === "LICENSED";
        const amountTotal = Number(transaction.amount);
        const vatRate = isLicensed ? businessProfile.vatRate : null;
        const amountBeforeVat = isLicensed && vatRate ? amountTotal / (1 + vatRate / 100) : null;
        const vatAmount =
          isLicensed && amountBeforeVat !== null ? amountTotal - amountBeforeVat : null;

        await tx.cardcomInvoice.create({
          data: {
            tenant: "ADMIN",
            cardcomDocumentNumber: adminDocNumStr,
            cardcomDocumentType: documentType,
            pdfUrl: payload.DocumentInfo?.DocumentLink ?? null,
            allocationNumber: adminAllocationStr,
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
