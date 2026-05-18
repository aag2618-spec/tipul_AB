// src/app/api/webhooks/sumit/route.ts
// Webhook handler עבור Sumit - תשלומים וקבלות

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifySumitWebhook, SumitWebhookPayload } from "@/lib/sumit";
import { logger } from "@/lib/logger";
import { invalidateJwtCache } from "@/lib/auth";
import { completeWebhookPayment } from "@/lib/payments/receipt-service";
import { verifyPaymentByExternalId } from "@/lib/webhook-verification";
import { checkRateLimit, WEBHOOK_RATE_LIMIT } from "@/lib/rate-limit";
import { saveFailedWebhook } from "@/lib/webhook-retry";
import {
  verifyWebhookTimestamp,
  claimWebhook,
  finalizeWebhook,
  releaseWebhookClaim,
} from "@/lib/webhook-replay-protection";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get("x-sumit-signature") || "";
    
    // אימות החתימה
    const webhookSecret = process.env.SUMIT_WEBHOOK_SECRET;
    if (!webhookSecret) {
      return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
    }
    if (!verifySumitWebhook(body, signature, webhookSecret)) {
      logger.error("Invalid Sumit webhook signature");
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 401 }
      );
    }

    const payload: SumitWebhookPayload = JSON.parse(body);
    logger.info("Sumit webhook received:", { data: payload.Event });

    // Rate limiting per-IP — מקביל ל-Meshulam, מגן מפני flooding גם אם ה-secret דלף.
    const clientIp = request.headers.get("x-forwarded-for") || "unknown";
    const rateCheck = checkRateLimit(`webhook:sumit:${clientIp}`, WEBHOOK_RATE_LIMIT);
    if (!rateCheck.allowed) {
      return NextResponse.json({ error: "Too many requests" }, { status: 429 });
    }

    // ── Anti-replay timestamp check (±5 דק') ──
    if (!verifyWebhookTimestamp(payload.Timestamp, "sumit")) {
      logger.warn("[sumit] webhook timestamp out of range (replay rejected)");
      return NextResponse.json({ error: "Webhook expired" }, { status: 400 });
    }

    // ── Idempotency claim ──
    // externalId כולל את ה-Event כדי שאירועים שונים על אותו PaymentID יעובדו
    // בנפרד. דוגמה: payment.success (יוצר התראה) + document.created (כותב
    // receiptUrl) — אם נשתמש רק ב-PaymentID, השני ייחסם כ-already_processed.
    const idPart = payload.PaymentID ?? payload.DocumentID;
    const externalId = idPart ? `${payload.Event}:${idPart}` : null;
    let claim: { eventId: string } | null = null;
    if (externalId) {
      const claimResult = await claimWebhook("SUMIT", externalId, payload as object);
      if (claimResult.status === "already_processed") {
        logger.info("[sumit] webhook already processed — idempotent", { externalId });
        // מחזיר תשובה זהה למסלול הרגיל — מונע info-disclosure על אילו
        // PaymentIDs כבר עובדו.
        return NextResponse.json({ received: true });
      }
      if (claimResult.status === "in_progress") {
        return new NextResponse("Webhook in progress", {
          status: 503,
          headers: { "Retry-After": "60" },
        });
      }
      claim = { eventId: claimResult.eventId };
    } else {
      logger.warn("[sumit] webhook missing identifying ID — skipping idempotency", {
        event: payload.Event,
      });
    }

    try {
      switch (payload.Event) {
        case "payment.success":
          await handlePaymentSuccess(payload);
          break;
        case "payment.failed":
          await handlePaymentFailed(payload);
          break;
        case "document.created":
          await handleDocumentCreated(payload);
          break;
        default:
          logger.info("Unhandled webhook event:", { data: payload.Event });
      }
      if (claim) {
        await finalizeWebhook(claim.eventId);
      }
    } catch (handlerErr) {
      const errMsg = handlerErr instanceof Error ? handlerErr.message : String(handlerErr);
      // משחררים את ה-claim כדי ש-Sumit יוכלו retry.
      if (claim) {
        await releaseWebhookClaim(claim.eventId, errMsg);
      }
      // רושמים AdminAlert (כמו Meshulam מקבל מ-withWebhookRetry) — מבטיח שאדמין
      // יראה כל webhook שנכשל ב-Sumit, גם אם retry מאוחר יותר יצליח.
      await saveFailedWebhook({
        provider: "sumit",
        eventType: payload.Event,
        payload: body,
        error: errMsg,
      });
      throw handlerErr;
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    logger.error("Sumit webhook error", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { error: "Webhook processing failed" },
      { status: 500 }
    );
  }
}

/**
 * טיפול בתשלום מוצלח
 */
async function handlePaymentSuccess(payload: SumitWebhookPayload) {
  const { PaymentID, Amount, DocumentURL, Customer } = payload;

  // ── אימות בעלות + lookup atomic ──
  // מחפשים payment PENDING לפי PaymentID החיצוני (Sumit), ומקבלים
  // את ה-therapistId האמיתי מ-DB. שום payload field לא משמש כסמכות.
  const verified = await verifyPaymentByExternalId(PaymentID);

  if (verified) {
    // partial-aware: סטטוס נקבע לפי amount מול expectedAmount עם סף 0.001.
    // עקבי עם Cardcom user webhook + Meshulam webhook + charge-saved-token.
    const currentPayment = await prisma.payment.findUnique({
      where: { id: verified.paymentId },
      select: {
        notes: true,
        amount: true,
        expectedAmount: true,
        parentPaymentId: true,
      },
    });
    if (!currentPayment) {
      logger.warn("[Sumit] payment.success — payment not found", {
        paymentId: verified.paymentId,
      });
      return;
    }
    const paymentExpected = Number(currentPayment.expectedAmount) || 0;
    const paymentAmount = Number(currentPayment.amount);
    const isFullyCovered = paymentAmount >= paymentExpected - 0.001;
    const finalStatus = isFullyCovered ? "PAID" : "PENDING";

    // ── Idempotency guard: replay defense ─────────────────────────
    // Sumit עלול לחזור על webhook הצלחה. במצב PARTIAL — status נשאר
    // PENDING גם אחרי הריצה הראשונה, אז שדה status לבדו לא מספיק כ-guard.
    // ⚠️ הגרסה הקודמת חיפשה [PENDING:${PaymentID}] שלא נכתב באף נקודת
    // יצירה (legacy data) — מה שגרם לכל ה-Sumit לכשול. עכשיו אנחנו
    // משתמשים בסימון negative: [PAID:${PaymentID}] = "כבר עיבדנו". בריצה
    // ראשונה הסימון חסר → ה-WHERE מתאים ועדכון מצליח (כולל הוספת הסימון).
    // ב-replay הסימון קיים → count=0 ואנחנו מחזירים בלי לחזור על האפקטים.
    const paidMarker = `[PAID:${PaymentID}]`;
    const baseNotes = currentPayment.notes ?? "";
    const newNotes = baseNotes.includes(paidMarker)
      ? baseNotes
      : (baseNotes + (baseNotes.length ? " " : "") + paidMarker).trim();
    const updateResult = await prisma.payment.updateMany({
      where: {
        id: verified.paymentId,
        client: { therapistId: verified.therapistId },
        OR: [
          { notes: null },
          { notes: { not: { contains: paidMarker } } },
        ],
      },
      data: {
        status: finalStatus,
        paidAt: finalStatus === "PAID" ? new Date() : null,
        receiptUrl: DocumentURL,
        hasReceipt: !!DocumentURL,
        notes: newNotes,
      },
    });

    if (updateResult.count === 0) {
      logger.warn("[Sumit] payment.success — already processed (replay)", {
        paymentId: verified.paymentId,
      });
      return; // replay — לא לחזור על bump/notification/email
    }

    // ── parent bump (additive completion via Sumit) ──────────────
    // עקבי עם Meshulam/Cardcom: cash partial → Sumit completion → parent bump.
    if (currentPayment.parentPaymentId && finalStatus === "PAID") {
      const parent = await prisma.payment.findUnique({
        where: { id: currentPayment.parentPaymentId },
        select: { amount: true, expectedAmount: true, paidAt: true },
      });
      if (parent) {
        const parentExpected = Number(parent.expectedAmount) || 0;
        const newTotal = Number(parent.amount) + paymentAmount;
        const parentFullyPaid = newTotal >= parentExpected - 0.001;
        await prisma.payment.update({
          where: { id: currentPayment.parentPaymentId },
          data: {
            amount: newTotal,
            status: parentFullyPaid ? "PAID" : "PENDING",
            paymentType: parentFullyPaid ? "FULL" : "PARTIAL",
            method: "CREDIT_CARD",
            paidAt: parentFullyPaid ? (parent.paidAt ?? new Date()) : null,
          },
        });
        if (parentFullyPaid) {
          await prisma.task.updateMany({
            where: {
              userId: verified.therapistId,
              relatedEntityId: currentPayment.parentPaymentId,
              type: "COLLECT_PAYMENT",
              status: { in: ["PENDING", "IN_PROGRESS"] },
            },
            data: { status: "COMPLETED" },
          });
        }
      }
    }

    // יצירת התראה למטפל — תמיד עם therapistId המאומת
    await prisma.notification.create({
      data: {
        userId: verified.therapistId,
        type: "PAYMENT_REMINDER",
        title: "💳 תשלום התקבל",
        content: `התקבל תשלום בסך ₪${Amount} מ-${verified.clientName || "המטופל"}`,
        status: "PENDING",
      },
    });

    // Send receipt email + complete COLLECT_PAYMENT task
    await completeWebhookPayment(verified.paymentId);
  } else if (Customer?.Email) {
    // אולי זה תשלום מנוי. עוטפים ב-tx כדי שקריאת blockReason ועדכון יהיו
    // אטומיים מול PATCH אדמין שעלול לרוץ במקביל.
    const txResult = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findFirst({
        where: { email: Customer.Email },
      });
      if (!user) return null;

      // auto-unblock רק על DEBT או חסימה ישנה (legacy null — נחסמו לפני הוספת
      // השדה, כולן היסטורית על חוב). TOS/MANUAL נשארים חסומים.
      const isLegacyOrDebt =
        user.blockReason === "DEBT" || user.blockReason === null;
      const shouldUnblock = user.isBlocked && isLegacyOrDebt;
      await tx.user.update({
        where: { id: user.id },
        data: {
          subscriptionStatus: "ACTIVE",
          subscriptionStartedAt: user.subscriptionStartedAt || new Date(),
          subscriptionEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          ...(shouldUnblock && {
            isBlocked: false,
            blockReason: null,
            blockedAt: null,
            blockedBy: null,
          }),
        },
      });

      return { user, shouldUnblock };
    });

    if (txResult) {
      const { user, shouldUnblock } = txResult;

      // M10.2: סוגרים חלון של 30s ב-JWT cache (subscriptionStatus/isBlocked שונו).
      invalidateJwtCache(user.id);

      if (shouldUnblock) {
        logger.info("[sumit] auto-unblock on subscription payment (DEBT)", { userId: user.id });
      } else if (user.isBlocked) {
        logger.info("[sumit] payment received but user stays blocked (non-DEBT)", {
          userId: user.id,
          blockReason: user.blockReason,
        });
      }

      await prisma.subscriptionPayment.create({
        data: {
          userId: user.id,
          amount: Amount || 0,
          currency: "ILS",
          status: "PAID",
          description: "תשלום מנוי חודשי",
          invoiceUrl: DocumentURL,
          periodStart: new Date(),
          periodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          paidAt: new Date(),
        },
      });
    }
  }
}

/**
 * טיפול בתשלום שנכשל
 */
async function handlePaymentFailed(payload: SumitWebhookPayload) {
  const { PaymentID, ErrorMessage, Customer } = payload;

  // ── אימות בעלות + lookup atomic ──
  const verified = await verifyPaymentByExternalId(PaymentID);

  if (verified) {
    const currentPayment = await prisma.payment.findUnique({
      where: { id: verified.paymentId },
      select: { notes: true },
    });

    const updateResult = await prisma.payment.updateMany({
      where: {
        id: verified.paymentId,
        client: { therapistId: verified.therapistId },
      },
      data: {
        notes: `${currentPayment?.notes || ""}\nתשלום נכשל: ${ErrorMessage}`,
      },
    });

    if (updateResult.count === 0) {
      logger.warn("[Sumit] payment.failed update — no rows affected", {
        paymentId: verified.paymentId,
      });
      return;
    }

    await prisma.notification.create({
      data: {
        userId: verified.therapistId,
        type: "CUSTOM",
        title: "❌ תשלום נכשל",
        content: `התשלום מ-${verified.clientName || "המטופל"} נכשל: ${ErrorMessage}`,
        status: "PENDING",
      },
    });
  } else if (Customer?.Email) {
    // תשלום מנוי שנכשל
    const user = await prisma.user.findFirst({
      where: { email: Customer.Email },
    });

    if (user) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          subscriptionStatus: "PAST_DUE",
        },
      });

      // M10.2: סוגרים חלון של 30s — אחרת המשתמש יקבל subscriptionStatus="ACTIVE"
      // ב-cache עד שה-cache פג, וזה נותן לו גישה לתכונות בתשלום שגויה.
      invalidateJwtCache(user.id);

      await prisma.adminAlert.create({
        data: {
          userId: user.id,
          type: "PAYMENT_FAILED",
          title: "תשלום מנוי נכשל",
          message: `תשלום מנוי נכשל עבור ${user.name}: ${ErrorMessage}`,
          priority: "HIGH",
        },
      });
    }
  }
}

/**
 * טיפול ביצירת מסמך (קבלה/חשבונית)
 */
async function handleDocumentCreated(payload: SumitWebhookPayload) {
  const { DocumentID, DocumentURL, PaymentID } = payload;

  if (!PaymentID) return;

  // ── אימות שPaymentID שייך באמת לpayment במערכת ──
  // עדכון ה-Payment עם קישור למסמך — אבל רק אם payment לגיטימי קיים
  // ולא נחסם ע"י תוקף שיודע סנגנון של PaymentID חיצוני.
  const payment = await prisma.payment.findFirst({
    where: {
      notes: { contains: PaymentID },
    },
    select: {
      id: true,
      client: { select: { therapistId: true } },
    },
  });

  if (payment && payment.client?.therapistId) {
    await prisma.payment.updateMany({
      where: {
        id: payment.id,
        client: { therapistId: payment.client.therapistId },
      },
      data: {
        receiptUrl: DocumentURL,
        hasReceipt: true,
      },
    });
  } else {
    logger.warn("[Sumit] document.created — no matching payment found", {
      PaymentID,
      DocumentID,
    });
  }
}
