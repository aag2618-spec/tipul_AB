// src/app/api/payments/[id]/charge-cardcom/route.ts
// יצירת דף תשלום Cardcom עבור Payment קיים — המטפל מחייב מטופל.
// המטפל חייב להיות קישור הבעלים של ה-Payment (דרך Client.therapistId).

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { withAudit } from "@/lib/audit";
import { getUserCardcomClient } from "@/lib/cardcom/user-config";
import type { CardcomDocumentType } from "@/lib/cardcom/types";

export const dynamic = "force-dynamic";

interface ChargeBody {
  /** Number of installments, 1-36 (USER may set >1 for client). */
  numOfPayments?: number;
  /** Save the card token for future recurring charges. */
  createToken?: boolean;
  successRedirectUrl?: string;
  failedRedirectUrl?: string;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { userId, session } = auth;

  // Idempotency
  const idempotencyKey = request.headers.get("Idempotency-Key") ?? request.headers.get("idempotency-key");
  if (idempotencyKey) {
    const existing = await prisma.idempotencyKey.findUnique({
      where: { key: `${userId}:${idempotencyKey}` },
    });
    if (existing) return NextResponse.json(existing.response, { status: existing.statusCode });
  }

  const { id: paymentId } = await context.params;

  let body: ChargeBody;
  try {
    body = await request.json().catch(() => ({}));
  } catch {
    body = {};
  }

  const numOfPayments = Math.min(Math.max(body.numOfPayments ?? 1, 1), 36);

  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
    include: { client: true },
  });
  if (!payment) {
    return NextResponse.json({ message: "תשלום לא נמצא" }, { status: 404 });
  }
  if (payment.client.therapistId !== userId) {
    return NextResponse.json({ message: "אין הרשאה לחייב תשלום זה" }, { status: 403 });
  }
  if (payment.status === "PAID") {
    return NextResponse.json({ message: "התשלום כבר שולם" }, { status: 409 });
  }

  const cardcomClient = await getUserCardcomClient(userId);
  if (!cardcomClient) {
    return NextResponse.json(
      { message: "לא הוגדר מסוף Cardcom — יש לחבר אותו בהגדרות אינטגרציות חיוב" },
      { status: 400 }
    );
  }

  // Determine document type from therapist's businessType + accountingMethod
  const therapist = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      businessType: true,
      businessIdNumber: true,
      accountingMethod: true,
      name: true,
    },
  });

  // CRITICAL legal check: any business issuing a receipt/invoice that wasn't
  // linked to a tax id violates חוק חשבוניות ישראל 2024 (penalty: ₪5K-30K per
  // event). LICENSED issues tax-invoice-receipts; EXEMPT issues receipts that
  // STILL must include the issuer's ID number. Block BEFORE the customer pays.
  if (
    therapist &&
    (therapist.businessType === "LICENSED" || therapist.businessType === "EXEMPT") &&
    !therapist.businessIdNumber?.trim()
  ) {
    await prisma.adminAlert.create({
      data: {
        type: "SYSTEM",
        priority: "HIGH",
        status: "PENDING",
        title: `[cardcom] חיוב נחסם — חסר ת.ז./מספר עוסק אצל ${therapist.name ?? userId}`,
        message: `מטפל מסוג ${therapist.businessType} ניסה ליצור דף תשלום בלי שהוזן businessIdNumber. הקריאה נחסמה כדי למנוע הנפקת מסמך לא חוקי.`,
        actionRequired: "פנה למטפל ובקש להזין ת.ז./מספר עוסק בהגדרות העסק",
        userId,
        metadata: { paymentId, therapistId: userId, businessType: therapist.businessType },
      },
    });
    return NextResponse.json(
      {
        message:
          "לא ניתן להנפיק מסמך חשבונאי ללא ת.ז./מספר עוסק. הזן את הפרטים בהגדרות העסק לפני גביית תשלום.",
      },
      { status: 409 }
    );
  }

  // Multi-currency guard: the entire Cardcom flow assumes ILS (ISOCoinId=1,
  // VAT 18%). Reject anything else — when we add multi-currency support
  // (FX rates, document templates, Cardcom currency config) this throw is
  // the single trigger for the changes that need to follow.
  if (payment.currency !== "ILS") {
    return NextResponse.json(
      {
        message: `מטבע ${payment.currency} עדיין לא נתמך בסליקת אשראי. רק ILS נתמך כעת.`,
      },
      { status: 501 }
    );
  }

  // Document type chosen by businessType × accountingMethod:
  //   EXEMPT (any method)  → Receipt (no VAT)
  //   LICENSED + CASH      → TaxInvoiceAndReceipt (combined)
  //   LICENSED + ACCRUAL   → NOT_IMPLEMENTED — requires a separate
  //                          "tax invoice at agreement" flow (Cardcom
  //                          Document/CreateTaxInvoice). Refuse explicitly so
  //                          a UI that exposes ACCRUAL doesn't silently issue
  //                          a CASH-style document instead.
  if (
    therapist?.businessType === "LICENSED" &&
    therapist?.accountingMethod === "ACCRUAL"
  ) {
    return NextResponse.json(
      {
        message:
          "מסלול חשבונאות מצטבר (ACCRUAL) טרם נתמך. צור קשר עם תמיכה ל-MyTipul, או חזור למסלול 'מקבל-תשלום' (CASH) זמנית.",
      },
      { status: 501 }
    );
  }
  const documentType: CardcomDocumentType =
    therapist?.businessType === "LICENSED" ? "TaxInvoiceAndReceipt" : "Receipt";

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://mytipul.co.il";

  try {
    // Cardcom HTTP outside withAudit (timeout race) — see admin/create-payment-page.
    const transaction = await prisma.cardcomTransaction.create({
      data: {
        tenant: "USER",
        userId,
        paymentId: payment.id,
        amount: payment.amount,
        currency: "ILS",
        numOfPayments,
        status: "PENDING",
      },
    });

    let cardcomResult;
    try {
      cardcomResult = await cardcomClient.createPaymentPage({
        amount: Number(payment.amount),
        description: payment.notes ?? `תשלום עבור ${payment.client.name}`,
        returnValue: transaction.id,
        successRedirectUrl:
          body.successRedirectUrl ?? `${baseUrl}/p/thanks?t=${transaction.id}`,
        failedRedirectUrl:
          body.failedRedirectUrl ?? `${baseUrl}/p/failed?t=${transaction.id}`,
        webhookUrl: `${baseUrl}/api/webhooks/cardcom/user?userId=${userId}`,
        createToken: !!body.createToken,
        numOfPayments,
        language: "he",
        // Idempotency at Cardcom — HTTP timeout retry won't create a duplicate.
        uniqueAsmachta: transaction.id,
        documentType,
        customer: {
          name: payment.client.name,
          email: payment.client.email ?? undefined,
        },
        products: [
          {
            description: payment.notes ?? "פגישה",
            unitCost: Number(payment.amount),
            quantity: 1,
          },
        ],
      });
    } catch (cardcomErr) {
      await prisma.cardcomTransaction.update({
        where: { id: transaction.id },
        data: {
          status: "FAILED",
          errorMessage: cardcomErr instanceof Error ? cardcomErr.message : String(cardcomErr),
          completedAt: new Date(),
        },
      });
      throw cardcomErr;
    }

    const result = await withAudit(
      { kind: "user", session },
      {
        action: "cardcom_user_create_payment_page",
        targetType: "payment",
        targetId: payment.id,
        details: {
          amount: Number(payment.amount),
          clientId: payment.clientId,
          numOfPayments,
          transactionId: transaction.id,
        },
      },
      async (tx) => {
        const updated = await tx.cardcomTransaction.update({
          where: { id: transaction.id },
          data: { lowProfileId: cardcomResult.lowProfileId },
        });
        return {
          transactionId: updated.id,
          lowProfileId: cardcomResult.lowProfileId,
          url: cardcomResult.url,
        };
      }
    );

    if (idempotencyKey) {
      await prisma.idempotencyKey.create({
        data: {
          key: `${userId}:${idempotencyKey}`,
          method: "POST",
          path: `/api/payments/${paymentId}/charge-cardcom`,
          statusCode: 200,
          response: result,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        },
      });
    }

    return NextResponse.json(result);
  } catch (err) {
    logger.error("[payments/charge-cardcom] failed", {
      userId,
      paymentId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ message: "שגיאה ביצירת דף תשלום" }, { status: 502 });
  }
}
