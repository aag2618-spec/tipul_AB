// src/app/api/webhooks/cardcom/user/route.ts
// Webhook handler for USER-tenant Cardcom transactions (therapist→client billing).
//
// VERIFICATION STRATEGY: GetLpResult callback (Cardcom v11 LowProfile webhooks
// are NOT HMAC-signed — instead, we re-fetch the canonical state from Cardcom
// using the LowProfileId in the body). The fetch requires the therapist's
// terminal credentials (loaded via getUserCardcomClient), so an attacker
// cannot fabricate "approved" notifications for transactions that don't exist
// on Cardcom's side.
//
// Critical: do NOT trust ?userId= in the URL. We use it only to load the
// therapist's CardcomClient credentials; the LowProfileId must independently
// resolve to a CardcomTransaction WE created for that user.
//
// Flow:
//  1. Rate-limit (per-instance + per-IP)
//  2. IP allowlist (defense-in-depth — soft warn, real verification is GetLpResult)
//  3. Parse body — used only for LowProfileId; data fields are re-fetched
//  4. GetLpResult against the therapist's USER credentials → canonical payload
//  5. Timestamp anti-replay (±5 minutes)
//  6. claimWebhook — lease-based idempotency (recovers from worker crashes)
//  7. Inside withAudit (system actor):
//      - Update CardcomTransaction status
//      - Update Payment.status = PAID
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
import { getUserCardcomClient } from "@/lib/cardcom/user-config";
import { checkRateLimit } from "@/lib/rate-limit";
import {
  claimWebhook,
  finalizeWebhook,
  releaseWebhookClaim,
} from "@/lib/cardcom/webhook-claim";
import { sanitizeChargebackPayload } from "@/lib/cardcom/sanitize";
import { hashCardcomToken } from "@/lib/cardcom/token-hash";
import { getSiteSetting } from "@/lib/site-settings";
import type { CardcomWebhookPayload } from "@/lib/cardcom/types";

// Default to the standard Israeli VAT rate (18%) when SiteSetting is unset.
// Allows a future legislated change to be a single DB update instead of a deploy.
const DEFAULT_COUNTRY_VAT_RATE = 18;

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const ip = resolveClientIp(request.headers);

  // ⚠️ Per-instance + per-IP — NOT a real DoS shield. Real protection comes
  // from `isCardcomIp` (allowlist) below. The 100/min cap only bounds DB cost
  // when an attacker spoofs a Cardcom IP; with multiple Render instances or a
  // botnet of IPs the limit scales linearly.
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

  // IP allowlist as defense-in-depth, but soft (warn, don't reject). The real
  // verification is GetLpResult — an attacker can't fake an approval for a
  // transaction we didn't create, regardless of source IP.
  if (!isCardcomIp(ip)) {
    logger.warn("[Cardcom User Webhook] non-Cardcom IP (continuing — verified via GetLpResult)", { ip });
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

  // Parse the notification body. Cardcom doesn't HMAC-sign LowProfile webhooks,
  // so the body is treated as a notification only — the LowProfileId tells us
  // WHICH transaction was acted upon, but the response codes etc. are
  // re-fetched from Cardcom (GetLpResult) below.
  let bodyPayload: CardcomWebhookPayload;
  try {
    bodyPayload = JSON.parse(rawBody) as CardcomWebhookPayload;
  } catch {
    return new NextResponse("Invalid JSON", { status: 400 });
  }

  if (!verifyWebhookTimestamp(bodyPayload.Timestamp)) {
    return new NextResponse("Stale webhook", { status: 400 });
  }

  if (!bodyPayload.LowProfileId) {
    return new NextResponse("Missing LowProfileId", { status: 400 });
  }

  // ── Verification: GetLpResult callback ────────────────────────
  // Load the therapist's CardcomClient and re-fetch the canonical state for
  // this LowProfileId. Three guarantees this provides:
  //   1. Authenticity — only Cardcom can return success for a real
  //      transaction; we use our own credentials to fetch.
  //   2. Tenant isolation — getUserCardcomClient resolves credentials by
  //      `?userId=`. A LowProfileId from another terminal will return an
  //      error or mismatch, which we reject.
  //   3. Source of truth — we ignore the body's data fields beyond
  //      LowProfileId and process the GetLpResult response. Even a tampered
  //      body cannot promote a declined transaction to approved.
  const cardcomClient = await getUserCardcomClient(userId);
  if (!cardcomClient) {
    logger.warn("[Cardcom User Webhook] no Cardcom provider configured", { userId });
    return new NextResponse("Provider not configured", { status: 401 });
  }

  let payload: CardcomWebhookPayload;
  try {
    const fetched = (await cardcomClient.getLpResult(
      bodyPayload.LowProfileId
    )) as CardcomWebhookPayload & { ResponseCode?: number | string };
    if (!fetched || fetched.LowProfileId !== bodyPayload.LowProfileId) {
      logger.warn("[Cardcom User Webhook] GetLpResult returned mismatched LowProfileId", {
        userId,
        bodyLpId: bodyPayload.LowProfileId,
        fetchedLpId: fetched?.LowProfileId,
      });
      return new NextResponse("Verification failed", { status: 401 });
    }
    payload = {
      ...fetched,
      // Cardcom returns ResponseCode as a number from GetLpResult but as a
      // string in their webhook spec; normalize to the type the rest of this
      // handler already expects (string).
      ResponseCode: String(fetched.ResponseCode ?? bodyPayload.ResponseCode ?? ""),
      LowProfileId: bodyPayload.LowProfileId,
      Timestamp: bodyPayload.Timestamp,
    } as CardcomWebhookPayload;
  } catch (err) {
    logger.error("[Cardcom User Webhook] GetLpResult verification failed", {
      userId,
      lowProfileId: bodyPayload.LowProfileId,
      error: err instanceof Error ? err.message : String(err),
    });
    return new NextResponse("Verification failed", { status: 401 });
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

  // CRITICAL — three-part success criterion:
  //   1. ResponseCode === "0"           → API call to Cardcom succeeded
  //   2. TranzactionId is non-zero      → Cardcom recorded an actual transaction
  //   3. ApprovalNumber is set          → the bank (shva) approved the charge
  //
  // Cardcom's GetLpResult returns ResponseCode=0 to mean "the LowProfile
  // session was found and read successfully" — NOT "the customer paid". A
  // freshly-created LowProfile (link sent, dialog opened, page closed without
  // paying) returns ResponseCode=0 with EMPTY TranzactionInfo. Without the
  // extra checks below, every such webhook poke would flip Payment to PAID.
  const responseCode = String(payload.ResponseCode);
  const tranzactionIdNum = Number(payload.TranzactionId ?? 0);
  const approvalNumber = payload.TranzactionInfo?.ApprovalNumber ?? "";
  const success =
    responseCode === "0" &&
    tranzactionIdNum > 0 &&
    !!approvalNumber.trim();

  // Chargeback / Reverse / Cancel — surfaced as ChargebackEvent + URGENT alert.
  // Same logic as ADMIN webhook (kept in sync deliberately).
  const operationLower = String(payload.Operation ?? "").toLowerCase();
  const isReversal =
    operationLower.includes("chargeback") ||
    operationLower.includes("reverse") ||
    operationLower.includes("refund") ||
    operationLower === "cancel";
  // ── Cancelled link guard ───────────────────────────────────────
  // המטפל ביטל את הקישור לפני שהלקוח שילם. אם בכל זאת הגיע webhook:
  //   • success === true  → הלקוח הצליח לשלם בכל זאת. לא דורסים את הסטטוס
  //                         (נשאר CANCELLED) אבל פותחים אזהרה דחופה למטפל
  //                         לבצע זיכוי ידני ב-Cardcom — הכסף נגבה אבל
  //                         במערכת זה כבר "מבוטל".
  //   • success === false → הלקוח ניסה ונכשל; אין מה לעשות.
  // בכל מקרה — לא עוברים ל-withAudit שמעדכן את ה-CardcomTransaction, כדי
  // למנוע דריסה של הסטטוס CANCELLED.
  if (transaction.status === "CANCELLED") {
    logger.warn("[Cardcom User Webhook] webhook arrived after link cancellation", {
      transactionId: transaction.id,
      paymentId: transaction.paymentId,
      success,
      lowProfileId: payload.LowProfileId,
    });
    if (success) {
      try {
        await prisma.adminAlert.create({
          data: {
            type: "PAYMENT_FAILED",
            priority: "URGENT",
            status: "PENDING",
            title: `[cardcom-cancel-conflict] לקוח שילם דרך קישור מבוטל (USER)`,
            message:
              `המטפל ${userId} ביטל את הקישור לעסקה ${transaction.id} ובכל זאת הלקוח שילם דרכו ב-Cardcom. ` +
              `הכסף נגבה לחשבון המסוף אך במערכת התשלום מסומן כמבוטל. נדרש זיכוי ידני ב-Cardcom וקשר עם המטפל.`,
            actionRequired:
              "בצע refund/void ב-Cardcom עבור LowProfileId המצורף, ועדכן את המטפל. אם המטפל רוצה לקבל את הכסף — שחזר את הסטטוס ידנית ל-APPROVED.",
            userId,
            metadata: {
              alertSubtype: "cancelled_link_paid",
              transactionId: transaction.id,
              paymentId: transaction.paymentId,
              lowProfileId: payload.LowProfileId,
              tranzactionId: payload.TranzactionId ?? null,
              amount: Number(transaction.amount),
            },
          },
        });
      } catch (alertErr) {
        logger.error("[Cardcom User Webhook] failed creating cancel-conflict alert", {
          transactionId: transaction.id,
          error: alertErr instanceof Error ? alertErr.message : String(alertErr),
        });
      }
    }
    return;
  }

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
          // Stricter PII scrub for chargeback rows (kept long-term for audit).
          rawPayload: sanitizeChargebackPayload(payload as unknown as object),
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
            // CRITICAL: GetLpResult returns DocumentNumber as a number
            // (e.g. 639145), but Payment.receiptNumber is a String column.
            // Coerce explicitly. The URL field is `DocumentUrl` per Cardcom
            // v11 swagger; legacy payloads carried `DocumentLink` — read both
            // so we don't lose the link on either format.
            ...(payload.DocumentInfo?.DocumentNumber
              ? {
                  receiptNumber: String(payload.DocumentInfo.DocumentNumber),
                  hasReceipt: true,
                  receiptUrl:
                    payload.DocumentInfo.DocumentUrl
                    ?? payload.DocumentInfo.DocumentLink
                    ?? undefined,
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
        const tokenHash = hashCardcomToken(tokenStr);
        // upsert לפי tokenHash + legacy fallback (ראה הסבר ב-cardcom/admin).
        const existing =
          (await tx.savedCardToken.findFirst({
            where: { tenant: "USER", tokenHash },
          })) ??
          (await tx.savedCardToken.findFirst({
            where: { tenant: "USER", token: tokenStr, tokenHash: null },
          }));
        if (existing) {
          await tx.savedCardToken.update({
            where: { id: existing.id },
            data: { lastUsedAt: now, isActive: true, deletedAt: null, tokenHash },
          });
        } else {
          await tx.savedCardToken.create({
            data: {
              tenant: "USER",
              userId,
              clientId: transaction.payment.clientId,
              token: tokenStr,
              tokenHash,
              cardLast4: payload.TranzactionInfo.Last4CardDigits ?? "0000",
              cardHolder: payload.TranzactionInfo.CardOwnerName ?? "",
              cardBrand: payload.TranzactionInfo.CardName ?? null,
              expiryMonth: Number(expMM),
              expiryYear: 2000 + Number(expYY),
            },
          });
        }
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
        // Read country-wide VAT rate from SiteSetting (e.g. Israel 18%).
        // Falls back to DEFAULT_COUNTRY_VAT_RATE when the setting is missing OR
        // explicitly zero for a LICENSED issuer — Israeli VAT law applies to
        // every עוסק מורשה, so vatRate=0 is treated as misconfig (logged loud).
        // EXEMPT issuers stay at null (no VAT line on the receipt).
        const settingVatRate = await getSiteSetting<number>("country_vat_rate");
        const settingIsValidPositive =
          typeof settingVatRate === "number" && settingVatRate > 0;

        if (isLicensed && typeof settingVatRate === "number" && settingVatRate === 0) {
          logger.error(
            "[Cardcom User Webhook] LICENSED issuer with country_vat_rate=0 — falling back to default; fix SiteSetting",
            {
              userId,
              documentNumber: payload.DocumentInfo.DocumentNumber,
            }
          );
        }

        const vatRate = isLicensed
          ? (settingIsValidPositive ? settingVatRate : DEFAULT_COUNTRY_VAT_RATE)
          : null;
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
          // Coerce — Cardcom returns these as numbers in GetLpResult; the
          // schema columns are String. Without this Prisma rejects with
          // "Expected String, provided Int".
          const docNumStr = String(payload.DocumentInfo.DocumentNumber);
          const allocationStr =
            payload.DocumentInfo.AllocationNumber !== undefined &&
            payload.DocumentInfo.AllocationNumber !== null
              ? String(payload.DocumentInfo.AllocationNumber)
              : null;

          await tx.orphanCardcomDocument.updateMany({
            where: {
              cardcomDocumentNumber: docNumStr,
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
              cardcomDocumentNumber: docNumStr,
              cardcomDocumentType: documentType,
              pdfUrl:
                payload.DocumentInfo.DocumentUrl
                ?? payload.DocumentInfo.DocumentLink
                ?? null,
              allocationNumber: allocationStr,
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
