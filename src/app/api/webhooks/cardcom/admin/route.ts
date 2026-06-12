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
import { invalidateJwtCache } from "@/lib/auth";
import {
  verifyWebhookTimestamp,
  isCardcomIp,
  resolveClientIp,
  scrubCardcomMessage,
  normalizeCardcomPayload,
} from "@/lib/cardcom/verify-webhook";
import {
  checkRateLimit,
  CARDCOM_WEBHOOK_PER_IP,
  CARDCOM_WEBHOOK_GLOBAL,
} from "@/lib/rate-limit";
import {
  claimWebhook,
  finalizeWebhook,
  releaseWebhookClaim,
} from "@/lib/cardcom/webhook-claim";
import { getAdminCardcomClient } from "@/lib/cardcom/admin-config";
import { getAdminBusinessProfile } from "@/lib/site-settings";
import { sanitizeCardcomPayload, sanitizeChargebackPayload } from "@/lib/cardcom/sanitize";
import { hashCardcomToken } from "@/lib/cardcom/token-hash";
import { resolveUpdateCardWebhookOutcome } from "@/lib/payments/subscription-settings";
import { resolvePackagePurchaseWebhookOutcome } from "@/lib/payments/package-purchase";
import { sendEmail } from "@/lib/resend";
import { escapeHtml, safeHttpUrl } from "@/lib/email-utils";
import type { CardcomWebhookPayload } from "@/lib/cardcom/types";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const ip = resolveClientIp(request.headers);

  // ── Layered rate limiting (Stage 2.0 hardening) ──────────────
  // שכבה 1 — per-IP (30/min): הוקשח מ-100→30. IP יחיד אמיתי של Cardcom
  // לא צריך לעבור 30/min בנסיבות נורמליות.
  // שכבה 2 — global (200/min): מונע botnet על מאות IPs.
  // שתי השכבות per-instance (in-memory). multi-instance ידרוש Redis (fix #2).
  const ipResult = checkRateLimit(
    `webhook:cardcom:admin:${ip ?? "unknown"}`,
    CARDCOM_WEBHOOK_PER_IP
  );
  if (!ipResult.allowed) {
    logger.warn("[Cardcom Admin Webhook] per-IP rate limited", { ip });
    return new NextResponse("Too Many Requests", {
      status: 429,
      headers: {
        "Retry-After": String(
          Math.max(1, Math.ceil((ipResult.resetAt - Date.now()) / 1000))
        ),
      },
    });
  }

  const globalResult = checkRateLimit(
    "webhook:cardcom:admin:global",
    CARDCOM_WEBHOOK_GLOBAL
  );
  if (!globalResult.allowed) {
    logger.error("[Cardcom Admin Webhook] GLOBAL rate limit hit — possible attack or surge", {
      ip,
    });
    return new NextResponse("Service Overloaded", {
      status: 503,
      headers: {
        "Retry-After": String(
          Math.max(1, Math.ceil((globalResult.resetAt - Date.now()) / 1000))
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
    // normalizeCardcomPayload: ה-sandbox של Cardcom (ולעיתים גם הפרודקשן) מחזיר
    // TranzactionId ו-Last4CardDigits כ-Int למרות ש-Prisma שלנו מצפה ל-String.
    // הנירמול הזה ממיר אותם פעם אחת כאן ⇒ כל ה-DB writes למטה בטוחים.
    payload = normalizeCardcomPayload({
      ...fetched,
      ResponseCode: String(fetched.ResponseCode ?? bodyPayload.ResponseCode ?? ""),
      LowProfileId: bodyPayload.LowProfileId,
      Timestamp: bodyPayload.Timestamp,
    }) as CardcomWebhookPayload;
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

  // ── Stage 4: UPDATE_CARD branch ─────────────────────────────────
  // עדכון כרטיס שמור — Operation=CreateTokenOnly, ללא חיוב, ללא
  // subscriptionPaymentId. הזרימה הרגילה (פעולות על SubscriptionPayment/User)
  // לא רלוונטית כאן ועלולה לגרום נזק (לדוגמה — לעדכן user ל-ACTIVE כשהוא
  // PAST_DUE). branch מוקדם מטפל בזה ייעודית.
  if (transaction.purpose === "UPDATE_CARD") {
    await processUpdateCardWebhook(transaction, payload, success, responseCode);
    return;
  }

  // ── Stage 5: PACKAGE_PURCHASE branch ─────────────────────────────
  // רכישת חבילת SMS/AI חד-פעמית. ללא subscriptionPaymentId, ללא token.
  // יוצרים UserPackagePurchase + cardcomInvoice. לא נוגעים ב-User.subscriptionStatus.
  if (transaction.purpose === "PACKAGE_PURCHASE") {
    await processPackagePurchaseWebhook(
      transaction,
      payload,
      success,
      responseCode
    );
    return;
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

      // Update CardcomTransaction — מוגן מפני downgrade של מצבים טרמינליים.
      // success: רק אם הסטטוס לא APPROVED/REFUNDED/CANCELLED (אחרת מסלול
      // אחר כבר טיפל). decline: רק אם הסטטוס לא APPROVED/REFUNDED (לא
      // מורידים אישור/זיכוי שהתקבל קודם).
      const upd = await tx.cardcomTransaction.updateMany({
        where: {
          id: transaction.id,
          status: success
            ? { notIn: ["APPROVED", "REFUNDED", "CANCELLED"] }
            : { notIn: ["APPROVED", "REFUNDED"] },
        },
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
          errorMessage: success ? null : scrubCardcomMessage(payload.Description),
          rawResponse: sanitizeRawResponse(payload),
          completedAt: now,
        },
      });
      if (upd.count === 0) {
        logger.info("[cardcom-admin-webhook] state already terminal — skipping", {
          transactionId: transaction.id,
          attempted: success ? "APPROVED" : "DECLINED",
        });
        return;
      }

      if (!success) {
        // תשלום נדחה — חייב לבטל SubscriptionPayment ולנקות nextChargeAt.
        // אחרת cron החיוב החוזר ינסה לחייב טוקן שלא נשמר → לולאת כשלון.
        if (transaction.subscriptionPaymentId) {
          await tx.subscriptionPayment.updateMany({
            where: {
              id: transaction.subscriptionPaymentId,
              status: "PENDING",
            },
            data: {
              status: "CANCELLED",
              autoChargeEnabled: false,
              nextChargeAt: null,
              lastChargeError: scrubCardcomMessage(payload.Description),
              lastAttemptAt: now,
            },
          });
        }
        return;
      }

      // Update SubscriptionPayment — מעבר ל-PAID + העתקת periodStart/End ל-User
      let activatedSubscription: {
        periodStart: Date | null;
        periodEnd: Date | null;
        planTier: "ESSENTIAL" | "PRO" | "ENTERPRISE" | null;
      } | null = null;
      if (transaction.subscriptionPaymentId) {
        const sp = await tx.subscriptionPayment.update({
          where: { id: transaction.subscriptionPaymentId },
          data: {
            status: "PAID",
            paidAt: now,
            method: "CREDIT_CARD",
            // איפוס מונה ניסיונות (אם זה תשלום ראשון או חידוש מוצלח אחרי כשלון)
            chargeAttempts: 0,
            lastChargeError: null,
          },
        });
        activatedSubscription = {
          periodStart: sp.periodStart,
          periodEnd: sp.periodEnd,
          planTier: sp.planTier,
        };
      }

      // Update User.subscriptionStatus → ACTIVE (unless PAUSED).
      // auto-unblock רק אם החסימה היא בגלל חוב (DEBT) או חסימה ישנה ללא reason.
      // משתמשים שנחסמו לפני הוספת blockReason — `blockReason=null` — היסטורית
      // נחסמו כולם על חוב מנוי (זה היה הקוד הישן). אנחנו מתייחסים אליהם כ-DEBT
      // כדי לא ליצור רגרסיה. חסימות TOS_VIOLATION / MANUAL **לא** משתחררות
      // בתשלום — דורשות החלטה ידנית של אדמין.
      if (transaction.userId) {
        const user = await tx.user.findUnique({ where: { id: transaction.userId } });
        if (user && user.subscriptionStatus !== "PAUSED") {
          const isLegacyOrDebt =
            user.blockReason === "DEBT" || user.blockReason === null;
          const shouldUnblock = user.isBlocked && isLegacyOrDebt;

          // Activation: עדכון תאריכי תקופת המנוי + סיום תקופת ניסיון + tier.
          const activationUpdates: {
            subscriptionStatus: "ACTIVE";
            subscriptionStartedAt?: Date;
            subscriptionEndsAt?: Date;
            trialEndsAt?: null;
            aiTier?: "ESSENTIAL" | "PRO" | "ENTERPRISE";
            pendingTier?: "ESSENTIAL" | "PRO" | "ENTERPRISE" | null;
            pendingTierEffectiveAt?: Date | null;
          } = { subscriptionStatus: "ACTIVE" };

          if (activatedSubscription?.periodStart && activatedSubscription?.periodEnd) {
            // המנוי "חדש" אם המשתמש לא היה ב-ACTIVE קודם
            // (TRIALING, CANCELLED, PAST_DUE, או חדש לגמרי)
            const isNewSubscriptionStart =
              user.subscriptionStatus !== "ACTIVE" || !user.subscriptionStartedAt;
            if (isNewSubscriptionStart) {
              activationUpdates.subscriptionStartedAt =
                activatedSubscription.periodStart;
            }
            // איפוס trialEndsAt רק כשעוברים מ-TRIALING ל-ACTIVE
            if (user.subscriptionStatus === "TRIALING") {
              activationUpdates.trialEndsAt = null;
            }
            // subscriptionEndsAt: לא לקצר תקופה משולמת קיימת!
            // אם המשתמש כבר ACTIVE עם תוקף עתידי — שמור את המאוחר משניהם.
            // בשדרוג: create בנה periodEnd=currentEnd+interval, ולכן candidateEnd
            // גדול מ-currentEnd ויתעדף. בחידוש/הורדה: periodStart=currentEnd ולכן
            // candidateEnd=currentEnd+interval, וגם הוא גדול. ההגנה רלוונטית בעיקר
            // למקרי הרצה מחודשת של webhook לאחר שכבר ACTIVE.
            const candidateEnd = activatedSubscription.periodEnd;
            const currentEnd = user.subscriptionEndsAt;
            activationUpdates.subscriptionEndsAt =
              currentEnd && currentEnd.getTime() > candidateEnd.getTime()
                ? currentEnd
                : candidateEnd;
          }

          // עדכון aiTier — לוגיקה שונה לפי האם השדרוג מתחיל מיד או בעתיד:
          //
          // תרחיש A — מנוי חדש / חידוש של אותו tier / משתמש לא-ACTIVE:
          //   periodStart = now → aiTier מתעדכן מיד.
          //
          // תרחיש B — שדרוג tier בתוך תקופה ששולמה (PRO ACTIVE → ENTERPRISE):
          //   periodStart = subscriptionEndsAt הקיים (בעתיד), planTier שונה מ-aiTier.
          //   מניעת "ימי tier חינם": שומרים את ה-tier הישן עד תאריך התחילה.
          //   pendingTier ייקדם ל-aiTier ע"י cron יומי כש-now >= pendingTierEffectiveAt.
          if (activatedSubscription?.planTier) {
            const newTier = activatedSubscription.planTier;
            const periodStart = activatedSubscription.periodStart;
            const isFutureStart =
              periodStart && periodStart.getTime() > now.getTime();
            const isTierUpgrade = user.aiTier !== newTier;

            if (isFutureStart && isTierUpgrade) {
              // שדרוג עתידי — שמור pending, אל תדרוס aiTier הנוכחי
              activationUpdates.pendingTier = newTier;
              activationUpdates.pendingTierEffectiveAt = periodStart;
              logger.info("[cardcom-admin] tier upgrade scheduled for future", {
                userId: user.id,
                currentTier: user.aiTier,
                pendingTier: newTier,
                effectiveAt: periodStart.toISOString(),
              });
            } else {
              // מיידי — עדכון aiTier וניקוי pending אם היה קיים
              activationUpdates.aiTier = newTier;
              if (user.pendingTier) {
                activationUpdates.pendingTier = null;
                activationUpdates.pendingTierEffectiveAt = null;
              }
            }
          }

          await tx.user.update({
            where: { id: transaction.userId },
            data: {
              ...activationUpdates,
              ...(shouldUnblock && {
                isBlocked: false,
                blockReason: null,
                blockedAt: null,
                blockedBy: null,
              }),
            },
          });
          if (shouldUnblock) {
            logger.info("[cardcom-admin] auto-unblock on subscription payment (DEBT)", {
              userId: user.id,
            });
          } else if (user.isBlocked) {
            logger.info("[cardcom-admin] payment received but user stays blocked (non-DEBT)", {
              userId: user.id,
              blockReason: user.blockReason,
            });
          }
          if (activationUpdates.subscriptionStartedAt) {
            logger.info("[cardcom-admin] subscription activated", {
              userId: user.id,
              subscriptionPaymentId: transaction.subscriptionPaymentId,
              periodEnd: activatedSubscription?.periodEnd?.toISOString(),
            });
          }
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
        const tokenHash = hashCardcomToken(tokenStr);
        // upsert לפי tokenHash. legacy fallback: רשומה ישנה עם tokenHash=null
        // אבל אותו plaintext token — נמצא ידנית ונעדכן את ה-tokenHash. כך
        // לא יווצרו רשומות כפולות אחרי הוספת השדה החדש.
        const existing =
          (await tx.savedCardToken.findFirst({
            where: { tenant: "ADMIN", tokenHash },
          })) ??
          (await tx.savedCardToken.findFirst({
            where: { tenant: "ADMIN", token: tokenStr, tokenHash: null },
          }));
        let savedTokenId: string;
        if (existing) {
          const updated = await tx.savedCardToken.update({
            where: { id: existing.id },
            data: { lastUsedAt: now, isActive: true, deletedAt: null, tokenHash },
          });
          savedTokenId = updated.id;
        } else {
          const created = await tx.savedCardToken.create({
            data: {
              tenant: "ADMIN",
              subscriberId: transaction.userId,
              token: tokenStr,
              tokenHash,
              cardLast4: payload.TranzactionInfo.Last4CardDigits ?? "0000",
              cardHolder: payload.TranzactionInfo.CardOwnerName ?? "",
              cardBrand: payload.TranzactionInfo.CardName ?? null,
              expiryMonth: Number(expMM),
              expiryYear: 2000 + Number(expYY),
            },
          });
          savedTokenId = created.id;
        }

        // Wire the saved token to the SubscriptionPayment for the recurring-charge cron.
        // nextChargeAt = periodEnd (אם זמין מ-activatedSubscription) או fallback.
        if (transaction.subscriptionPaymentId && activatedSubscription?.periodEnd) {
          await tx.subscriptionPayment.update({
            where: { id: transaction.subscriptionPaymentId },
            data: {
              savedCardTokenId: savedTokenId,
              nextChargeAt: activatedSubscription.periodEnd,
            },
          });
        }
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
            pdfUrl:
              payload.DocumentInfo?.DocumentUrl
              ?? payload.DocumentInfo?.DocumentLink
              ?? null,
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

  // M10.2: סוגרים חלון של 30s ב-JWT cache. ה-webhook עדכן
  // subscriptionStatus/isBlocked/aiTier/trialEndsAt — בלי זה ה-token של המשתמש
  // יחזיק נתונים ישנים עד שה-cache פג, וזה גם UX רע וגם סיכון security
  // (משתמש שצריך לעבור ל-PAST_DUE עדיין נראה ACTIVE).
  if (transaction.userId) {
    invalidateJwtCache(transaction.userId);
  }
}

/**
 * Strip credentials and sensitive card data from rawResponse before persisting.
 * Stage 1.19 — uses shared deep redactor in @/lib/cardcom/sanitize.
 */
function sanitizeRawResponse(payload: CardcomWebhookPayload): object {
  return sanitizeCardcomPayload(payload as unknown as object);
}

// ============================================================================
// processUpdateCardWebhook — Stage 4: עדכון כרטיס שמור (Operation=CreateTokenOnly)
// ============================================================================
// זרימה ייעודית: לא נוגעים ב-User.subscriptionStatus / SubscriptionPayment.status.
// רק שומרים SavedCardToken חדש, מסמנים את הישנים כ-isActive=false, ומחברים
// את כל המנויים הפעילים של המשתמש לטוקן החדש כדי שחיוב חוזר ידרך עליו.
//
// idempotency: ה-claimWebhook הראשי כבר מנע double processing של אותו LowProfileId.
// race בין 2 update_card שונים של אותו user: שני transactions אטומיים — האחרון
// שמסיים הוא ה-isActive=true; הקודם נסמן כ-inactive ע"י setOtherTokensInactiveForUser.
async function processUpdateCardWebhook(
  transaction: Awaited<
    ReturnType<typeof prisma.cardcomTransaction.findUnique>
  > & { userId: string | null },
  payload: CardcomWebhookPayload,
  success: boolean,
  responseCode: string
): Promise<void> {
  if (!transaction) return; // type-narrowing safety

  if (!transaction.userId) {
    logger.error("[cardcom-admin] UPDATE_CARD transaction missing userId", {
      transactionId: transaction.id,
    });
    throw new Error("CARDCOM_UPDATE_CARD_MISSING_USER");
  }

  const outcome = resolveUpdateCardWebhookOutcome({
    success,
    token: payload.TranzactionInfo?.Token ?? null,
    expiryMonth: payload.TranzactionInfo?.CardExpirationMM
      ? Number(payload.TranzactionInfo.CardExpirationMM)
      : null,
    expiryYear: payload.TranzactionInfo?.CardExpirationYY
      ? Number(payload.TranzactionInfo.CardExpirationYY)
      : null,
  });

  await withAudit(
    {
      kind: "system",
      source: "WEBHOOK_CARDCOM",
      externalRef: payload.LowProfileId,
    },
    {
      action:
        outcome.action === "CREATE_TOKEN"
          ? "cardcom_update_card_approved"
          : "cardcom_update_card_declined",
      targetType: "cardcom_transaction",
      targetId: transaction.id,
      details: {
        responseCode,
        outcome: outcome.action,
        last4: payload.TranzactionInfo?.Last4CardDigits,
      },
    },
    async (tx) => {
      const now = new Date();

      // עדכון CardcomTransaction — מצב טרמינלי בלבד (לא לדרוס APPROVED/DECLINED קודם).
      const newStatus =
        outcome.action === "CREATE_TOKEN" ? "APPROVED" : "DECLINED";
      const upd = await tx.cardcomTransaction.updateMany({
        where: {
          id: transaction.id,
          status:
            newStatus === "APPROVED"
              ? { notIn: ["APPROVED", "REFUNDED", "CANCELLED"] }
              : { notIn: ["APPROVED", "REFUNDED"] },
        },
        data: {
          status: newStatus,
          cardLast4:
            payload.TranzactionInfo?.Last4CardDigits ?? transaction.cardLast4,
          cardHolder:
            payload.TranzactionInfo?.CardOwnerName ?? transaction.cardHolder,
          cardBrand: payload.TranzactionInfo?.CardName ?? null,
          token: payload.TranzactionInfo?.Token ?? null,
          tokenExpiryMonth: payload.TranzactionInfo?.CardExpirationMM
            ? Number(payload.TranzactionInfo.CardExpirationMM)
            : null,
          tokenExpiryYear: payload.TranzactionInfo?.CardExpirationYY
            ? 2000 + Number(payload.TranzactionInfo.CardExpirationYY)
            : null,
          errorCode: outcome.action === "CREATE_TOKEN" ? null : responseCode,
          errorMessage:
            outcome.action === "CREATE_TOKEN"
              ? null
              : scrubCardcomMessage(payload.Description),
          rawResponse: sanitizeCardcomPayload(payload as unknown as object),
          completedAt: now,
        },
      });
      if (upd.count === 0) {
        logger.info(
          "[cardcom-admin] UPDATE_CARD already terminal — skipping",
          { transactionId: transaction.id }
        );
        return;
      }

      if (outcome.action !== "CREATE_TOKEN") {
        // נכשל / לא נשמר טוקן — אין מה לעדכן עוד.
        logger.warn("[cardcom-admin] UPDATE_CARD did not produce token", {
          transactionId: transaction.id,
          outcome: outcome.action,
          responseCode,
        });
        return;
      }

      const tokenStr = payload.TranzactionInfo?.Token;
      if (!tokenStr) {
        // type-narrowing — outcome.action === CREATE_TOKEN מבטיח שזה לא יקרה
        logger.error("[cardcom-admin] UPDATE_CARD: outcome=CREATE_TOKEN but token missing", {
          transactionId: transaction.id,
        });
        return;
      }

      const tokenHash = hashCardcomToken(tokenStr);
      const userId = transaction.userId!;

      // upsert לפי tokenHash. אם המשתמש מעדכן ל-token שכבר היה לו (אותו כרטיס) —
      // נשתמש ברשומה הקיימת. אחרת — ניצור חדשה.
      const existing =
        (await tx.savedCardToken.findFirst({
          where: { tenant: "ADMIN", tokenHash, subscriberId: userId },
        })) ??
        (await tx.savedCardToken.findFirst({
          where: {
            tenant: "ADMIN",
            token: tokenStr,
            tokenHash: null,
            subscriberId: userId,
          },
        }));
      let savedTokenId: string;
      if (existing) {
        const updated = await tx.savedCardToken.update({
          where: { id: existing.id },
          data: {
            isActive: true,
            deletedAt: null,
            lastUsedAt: now,
            tokenHash,
            cardLast4:
              payload.TranzactionInfo?.Last4CardDigits ?? existing.cardLast4,
            cardHolder:
              payload.TranzactionInfo?.CardOwnerName ?? existing.cardHolder,
            cardBrand: payload.TranzactionInfo?.CardName ?? existing.cardBrand,
            expiryMonth: outcome.expiryMonth,
            expiryYear: outcome.expiryYear,
          },
        });
        savedTokenId = updated.id;
      } else {
        const created = await tx.savedCardToken.create({
          data: {
            tenant: "ADMIN",
            subscriberId: userId,
            token: tokenStr,
            tokenHash,
            cardLast4: payload.TranzactionInfo?.Last4CardDigits ?? "0000",
            cardHolder: payload.TranzactionInfo?.CardOwnerName ?? "",
            cardBrand: payload.TranzactionInfo?.CardName ?? null,
            expiryMonth: outcome.expiryMonth,
            expiryYear: outcome.expiryYear,
          },
        });
        savedTokenId = created.id;
      }

      // סימון שאר הטוקנים של אותו user כ-inactive (idempotent).
      // סוכן 4 #8 + סוכן 5 #11: מסננים במפורש `clientId: null` כדי לא להשפיע
      // על טוקני clinic-clients (טוקנים שהמטפל שמר עבור הלקוחות שלו).
      // Race UPDATE_CARD: ה-tx כאן בתוך withAudit Serializable + מסומן
      // last-writer-wins ע"י `id: not: savedTokenId`. תיאורטית 2 webhooks
      // מקבילים יוצרים זמן קצר עם 2 active, אבל הסופי דטרמיניסטי לפי סדר
      // commit. אם זה יהפוך לבעיה אמיתית — לעבור ל-advisory_xact_lock.
      await tx.savedCardToken.updateMany({
        where: {
          tenant: "ADMIN",
          subscriberId: userId,
          clientId: null,
          isActive: true,
          id: { not: savedTokenId },
        },
        data: {
          isActive: false,
          deletedAt: now,
        },
      });

      // סוכן 4 #9 — TOCTOU: בדיקה מחודשת של billingPaidByClinic לפני wiring.
      // אם הקליניקה שינתה אותו ל-true בין יצירת ה-transaction להגעת ה-webhook,
      // אסור לחבר את הטוקן ל-SPs — אחרת cron החיוב יחייב את המשתמש למרות
      // שהקליניקה משלמת.
      const userNow = await tx.user.findUnique({
        where: { id: userId },
        select: { billingPaidByClinic: true },
      });
      if (userNow?.billingPaidByClinic) {
        logger.warn(
          "[cardcom-admin] UPDATE_CARD: billingPaidByClinic became true mid-flow — saving token but not wiring",
          { userId, transactionId: transaction.id }
        );
        return;
      }

      // חיבור כל ה-SubscriptionPayments הפעילים של המשתמש לטוקן החדש כדי
      // שחיוב חוזר ייגע בכרטיס המעודכן. autoChargeEnabled לא משתנה — אם
      // המשתמש ביטל חידוש, ה-update לא מחזיר חיוב.
      const wired = await tx.subscriptionPayment.updateMany({
        where: {
          userId,
          status: { in: ["PAID", "PENDING"] },
          nextChargeAt: { not: null },
        },
        data: {
          savedCardTokenId: savedTokenId,
        },
      });

      logger.info("[cardcom-admin] UPDATE_CARD complete", {
        userId,
        transactionId: transaction.id,
        savedTokenId,
        wiredSubscriptions: wired.count,
        last4: payload.TranzactionInfo?.Last4CardDigits,
      });
    }
  );
}

// ============================================================================
// processPackagePurchaseWebhook — Stage 5: רכישת חבילות SMS/AI
// ============================================================================
// יוצר UserPackagePurchase עם source=CARDCOM, externalId=transactionId,
// type/credits מקוטלוג ה-Package. idempotent דרך alreadyGranted (חיפוש לפי
// externalId). ה-tx ב-withAudit Serializable מבטיח אטומיות.
async function processPackagePurchaseWebhook(
  transaction: Awaited<
    ReturnType<typeof prisma.cardcomTransaction.findUnique>
  > & { userId: string | null },
  payload: CardcomWebhookPayload,
  success: boolean,
  responseCode: string
): Promise<void> {
  if (!transaction) return;

  if (!transaction.userId) {
    logger.error("[cardcom-admin] PACKAGE_PURCHASE transaction missing userId", {
      transactionId: transaction.id,
    });
    throw new Error("CARDCOM_PACKAGE_PURCHASE_MISSING_USER");
  }

  // בודקים אם כבר ניתנו credits לעסקה הזו (idempotency).
  // ה-externalId שלנו הוא ה-CardcomTransaction.id.
  const existingPurchase = await prisma.userPackagePurchase.findFirst({
    where: {
      externalId: transaction.id,
      source: "CARDCOM",
      reverted: false,
    },
    select: { id: true },
  });

  const outcome = resolvePackagePurchaseWebhookOutcome({
    success,
    alreadyGranted: existingPurchase !== null,
  });

  const emailRef: {
    data: {
      userEmail: string;
      userName: string;
      packageName: string;
      credits: number;
      amount: number;
      receiptUrl: string | null;
      receiptNumber: string | null;
    } | null;
  } = { data: null };

  await withAudit(
    {
      kind: "system",
      source: "WEBHOOK_CARDCOM",
      externalRef: payload.LowProfileId,
    },
    {
      action:
        outcome.action === "GRANT_CREDITS"
          ? "cardcom_package_purchase_approved"
          : outcome.action === "SKIP_ALREADY"
            ? "cardcom_package_purchase_skipped_idempotent"
            : "cardcom_package_purchase_declined",
      targetType: "cardcom_transaction",
      targetId: transaction.id,
      details: {
        responseCode,
        outcome: outcome.action,
        amount: Number(transaction.amount),
      },
    },
    async (tx) => {
      const now = new Date();
      const newStatus =
        outcome.action === "GRANT_CREDITS" ? "APPROVED" : "DECLINED";

      // עדכון CardcomTransaction — מוגן מ-downgrade.
      // SKIP_ALREADY: אם success=true (duplicate webhook אחרי הצלחה), עדיין
      // מעדכנים ל-APPROVED אם זה PENDING (סוכן 1 ממצא #3 — סטטוס לא נשאר
      // PENDING לנצח). אם success=false ו-alreadyGranted, השאר APPROVED.
      const shouldUpdateStatus =
        outcome.action !== "SKIP_ALREADY" ||
        (outcome.action === "SKIP_ALREADY" && success);
      const effectiveStatus =
        outcome.action === "SKIP_ALREADY" ? "APPROVED" : newStatus;
      if (shouldUpdateStatus) {
        const upd = await tx.cardcomTransaction.updateMany({
          where: {
            id: transaction.id,
            status:
              effectiveStatus === "APPROVED"
                ? { notIn: ["APPROVED", "REFUNDED", "CANCELLED"] }
                : { notIn: ["APPROVED", "REFUNDED"] },
          },
          data: {
            status: effectiveStatus,
            transactionId: payload.TranzactionId ?? null,
            approvalNumber: payload.TranzactionInfo?.ApprovalNumber ?? null,
            cardLast4:
              payload.TranzactionInfo?.Last4CardDigits ?? transaction.cardLast4,
            cardHolder:
              payload.TranzactionInfo?.CardOwnerName ?? transaction.cardHolder,
            cardBrand: payload.TranzactionInfo?.CardName ?? null,
            errorCode: effectiveStatus === "APPROVED" ? null : responseCode,
            errorMessage:
              effectiveStatus === "APPROVED"
                ? null
                : scrubCardcomMessage(payload.Description),
            rawResponse: sanitizeCardcomPayload(payload as unknown as object),
            completedAt: now,
          },
        });
        if (upd.count === 0) {
          logger.info(
            "[cardcom-admin] PACKAGE_PURCHASE already terminal — skipping",
            { transactionId: transaction.id }
          );
          return;
        }
      }

      if (outcome.action !== "GRANT_CREDITS") {
        // DECLINE או SKIP_ALREADY — לא יוצרים UserPackagePurchase
        logger.info(
          "[cardcom-admin] PACKAGE_PURCHASE not granting credits",
          {
            transactionId: transaction.id,
            outcome: outcome.action,
          }
        );
        return;
      }

      // packageId מאוחסן ב-bulkPaymentIds[0] (purchase/route.ts).
      // sync-cardcom-payment + refund route מוגנים ב-purpose !== PACKAGE_PURCHASE
      // כך שהשימוש הזה ב-bulkPaymentIds לא יוצר התנגשות עם bulk payments אמיתיים.
      const packageIdFromBulk = transaction.bulkPaymentIds?.[0] ?? null;
      if (!packageIdFromBulk) {
        // הכסף נגבה אבל אין packageId — מצב חמור.
        logger.error(
          "[cardcom-admin] PACKAGE_PURCHASE missing packageId in bulkPaymentIds",
          { transactionId: transaction.id }
        );
        await raisePackageMissingAlert(
          tx,
          transaction.id,
          transaction.userId!,
          Number(transaction.amount),
          "missing_package_id"
        );
        return;
      }
      const pkg = await tx.package.findUnique({
        where: { id: packageIdFromBulk },
        select: { id: true, type: true, credits: true, name: true },
      });
      if (!pkg) {
        // הכסף נגבה אבל ה-Package נמחק — נדרש refund ידני.
        logger.error("[cardcom-admin] PACKAGE_PURCHASE — package not found", {
          transactionId: transaction.id,
          packageId: packageIdFromBulk,
        });
        await raisePackageMissingAlert(
          tx,
          transaction.id,
          transaction.userId!,
          Number(transaction.amount),
          "package_deleted",
          packageIdFromBulk
        );
        return;
      }

      // יצירת UserPackagePurchase + תיעוד source=CARDCOM.
      // ה-unique constraint על (externalId, source) מבטיח שגם race יתפס ע"י DB.
      let created;
      try {
        created = await tx.userPackagePurchase.create({
          data: {
            userId: transaction.userId!,
            packageId: pkg.id,
            type: pkg.type,
            credits: pkg.credits,
            creditsUsed: 0,
            source: "CARDCOM",
            externalId: transaction.id,
            note: pkg.name,
          },
        });
      } catch (err) {
        // P2002 = unique constraint violation. race עם webhook duplicate — בסדר.
        if (
          err &&
          typeof err === "object" &&
          "code" in err &&
          err.code === "P2002"
        ) {
          logger.info(
            "[cardcom-admin] PACKAGE_PURCHASE — duplicate caught by DB unique constraint",
            { transactionId: transaction.id }
          );
          return;
        }
        throw err;
      }

      // יצירת CardcomInvoice (אם Cardcom החזיר DocumentNumber) + orphan resolution.
      // קריטי לדיווחי מע"מ — לפי חוק חשבוניות 2024.
      const businessProfile = await getAdminBusinessProfile();
      const adminDocNumStr =
        payload.DocumentInfo?.DocumentNumber !== undefined &&
        payload.DocumentInfo?.DocumentNumber !== null
          ? String(payload.DocumentInfo.DocumentNumber)
          : null;
      const adminAllocationStr =
        payload.DocumentInfo?.AllocationNumber !== undefined &&
        payload.DocumentInfo?.AllocationNumber !== null
          ? String(payload.DocumentInfo.AllocationNumber)
          : null;

      if (adminDocNumStr) {
        // resolve orphan אם נרשם
        await tx.orphanCardcomDocument.updateMany({
          where: {
            cardcomDocumentNumber: adminDocNumStr,
            resolved: false,
          },
          data: {
            resolved: true,
            resolvedAt: new Date(),
            resolutionNote: "Auto-resolved by package purchase webhook",
          },
        });

        // יצירת CardcomInvoice — מחיר/מע"מ כמו ב-SUBSCRIPTION_CREATE
        const documentType = payload.DocumentInfo?.DocumentType ?? "Receipt";
        const isLicensed = businessProfile.type === "LICENSED";
        const amountTotal = Number(transaction.amount);
        const vatRate = isLicensed ? businessProfile.vatRate : null;
        const amountBeforeVat =
          isLicensed && vatRate ? amountTotal / (1 + vatRate / 100) : null;
        const vatAmount =
          isLicensed && amountBeforeVat !== null
            ? amountTotal - amountBeforeVat
            : null;

        const subscriberUser = await tx.user.findUnique({
          where: { id: transaction.userId! },
          select: { name: true, email: true },
        });

        await tx.cardcomInvoice.create({
          data: {
            tenant: "ADMIN",
            cardcomDocumentNumber: adminDocNumStr,
            cardcomDocumentType: documentType,
            pdfUrl:
              payload.DocumentInfo?.DocumentUrl ??
              payload.DocumentInfo?.DocumentLink ??
              null,
            allocationNumber: adminAllocationStr,
            issuerUserId: null,
            issuerBusinessType: businessProfile.type,
            issuerBusinessName: businessProfile.name,
            issuerIdNumber: businessProfile.idNumber,
            vatRateSnapshot: vatRate ? String(vatRate) : null,
            amountBeforeVat:
              amountBeforeVat !== null ? amountBeforeVat.toFixed(2) : null,
            vatAmount: vatAmount !== null ? vatAmount.toFixed(2) : null,
            subscriberId: transaction.userId!,
            subscriberNameSnapshot: subscriberUser?.name ?? "",
            subscriberEmailSnapshot: subscriberUser?.email ?? null,
            subscriptionPaymentId: null,
            cardcomTransactionId: transaction.id,
            amount: transaction.amount,
            currency: transaction.currency,
            description: pkg.name,
            occurredAt: transaction.completedAt ?? new Date(),
            issuedAt: new Date(),
          },
        });
      }

      const subscriberForEmail = await tx.user.findUnique({
        where: { id: transaction.userId! },
        select: { name: true, email: true },
      });

      emailRef.data = {
        userEmail: subscriberForEmail?.email ?? "",
        userName: subscriberForEmail?.name ?? "",
        packageName: pkg.name,
        credits: pkg.credits,
        amount: Number(transaction.amount),
        receiptUrl:
          payload.DocumentInfo?.DocumentUrl ??
          payload.DocumentInfo?.DocumentLink ??
          null,
        receiptNumber: adminDocNumStr,
      };

      logger.info("[cardcom-admin] PACKAGE_PURCHASE granted credits", {
        userId: transaction.userId,
        transactionId: transaction.id,
        purchaseId: created.id,
        packageId: pkg.id,
        credits: pkg.credits,
        invoiceCreated: adminDocNumStr !== null,
      });
    }
  );

  const emailData = emailRef.data;
  if (emailData?.userEmail) {
    const typeLabelHe =
      emailData.credits > 0
        ? `${emailData.credits} קרדיטים`
        : emailData.packageName;
    const safeUser = escapeHtml(emailData.userName || "משתמש/ת");
    const safePkg = escapeHtml(emailData.packageName);
    const amountStr = `₪${emailData.amount.toLocaleString("he-IL")}`;
    const safeReceiptUrl = safeHttpUrl(emailData.receiptUrl ?? null);
    const receiptHtml = safeReceiptUrl
      ? `<a href="${escapeHtml(safeReceiptUrl)}" style="display:inline-block;background:#10b981;color:#fff;padding:10px 24px;border-radius:6px;text-decoration:none;font-weight:600;margin-top:16px;">צפה בקבלה</a>`
      : emailData.receiptNumber
        ? `<p style="color:#6b7280;font-size:14px;">מספר קבלה: ${escapeHtml(emailData.receiptNumber)}</p>`
        : "";

    void sendEmail({
      to: emailData.userEmail,
      subject: `אישור רכישה — ${emailData.packageName}`,
      html: `
        <div dir="rtl" style="font-family:'Segoe UI',Tahoma,Geneva,Verdana,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
          <div style="background:linear-gradient(135deg,#10b981 0%,#059669 100%);padding:24px;border-radius:12px 12px 0 0;text-align:center;">
            <div style="font-size:40px;margin-bottom:8px;">✓</div>
            <h1 style="color:#fff;margin:0;font-size:22px;">הרכישה הושלמה בהצלחה</h1>
          </div>
          <div style="background:#fff;padding:24px;border-radius:0 0 12px 12px;border:1px solid #e5e7eb;border-top:none;">
            <p style="color:#111827;font-size:16px;">שלום ${safeUser},</p>
            <p style="color:#4b5563;font-size:15px;line-height:1.6;">
              חבילת <strong>${safePkg}</strong> נרכשה בהצלחה.
            </p>
            <div style="background:#d1fae5;border:2px solid #10b981;border-radius:10px;padding:16px;margin:20px 0;text-align:center;">
              <p style="margin:0;color:#065f46;font-size:13px;font-weight:600;">סכום ששולם</p>
              <p style="margin:6px 0 0;color:#047857;font-size:28px;font-weight:800;">${escapeHtml(amountStr)}</p>
            </div>
            <p style="color:#4b5563;font-size:15px;">
              <strong>${escapeHtml(typeLabelHe)}</strong> נוספו לחשבון שלך.
            </p>
            ${receiptHtml}
            <p style="color:#9ca3af;font-size:12px;margin-top:30px;">
              הודעה זו נשלחה אוטומטית. אין צורך להשיב.
            </p>
          </div>
        </div>
      `,
    }).catch((err) => {
      logger.error("[cardcom-admin] PACKAGE_PURCHASE receipt email failed", {
        userId: transaction.userId,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  }
}

// raisePackageMissingAlert — סוכן 5 ממצא #2: הכסף נגבה אבל אין Package להעניק.
// מעלים AdminAlert URGENT עם הוראת פעולה ל-refund ידני. CardcomTransaction
// כבר במצב APPROVED (ה-updateMany קודם הצליח), כך שהיא לא נשארת PENDING.
async function raisePackageMissingAlert(
  tx: Parameters<Parameters<typeof withAudit>[2]>[0],
  transactionId: string,
  userId: string,
  amount: number,
  reason: "missing_package_id" | "package_deleted",
  packageId?: string
): Promise<void> {
  await tx.adminAlert.create({
    data: {
      type: "PAYMENT_FAILED",
      priority: "URGENT",
      status: "PENDING",
      title: `[package-purchase] חבילה לא נמצאה אחרי תשלום (${transactionId})`,
      message:
        reason === "missing_package_id"
          ? `התקבל תשלום של ₪${amount.toLocaleString("he-IL")} עבור חבילה, אבל ב-CardcomTransaction חסר packageId. הכסף נגבה ולא הוענקו credits.`
          : `התקבל תשלום של ₪${amount.toLocaleString("he-IL")} עבור Package id=${packageId} שלא קיים יותר. הכסף נגבה ולא הוענקו credits.`,
      actionRequired:
        "נדרש refund ידני ב-Cardcom + יצירת CardcomTransaction מתאים לזיכוי, או הענקת credits שווה ערך ידנית.",
      userId,
      metadata: {
        alertSubtype: "package_purchase_orphan",
        transactionId,
        packageId: packageId ?? null,
        reason,
      },
    },
  });
}
