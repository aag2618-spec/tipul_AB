// src/app/api/payments/[id]/charge-cardcom/route.ts
// יצירת דף תשלום Cardcom עבור Payment קיים — המטפל מחייב מטופל.
// המטפל חייב להיות קישור הבעלים של ה-Payment (דרך Client.therapistId).

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { withAudit } from "@/lib/audit";
import { getUserCardcomClient } from "@/lib/cardcom/user-config";
import { resolveCardcomBilling } from "@/lib/cardcom/billing-resolver";
import { scrubCardcomMessage } from "@/lib/cardcom/verify-webhook";
import type { CardcomDocumentType } from "@/lib/cardcom/types";
import {
  buildPaymentWhere,
  isSecretary,
  loadScopeUser,
  secretaryCan,
} from "@/lib/scope";
import { isShabbatOrYomTov } from "@/lib/shabbat";
import { chargeCardcomSchema } from "@/lib/validations/payment";

export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { userId, session } = auth;

  // חסימה הלכתית — אסור ליצור קישור תשלום בשבת/יו״ט.
  // קישור שייווצר עכשיו פותח דף תשלום אצל Cardcom שיכול להיות בשימוש מיידי.
  if (isShabbatOrYomTov()) {
    return NextResponse.json(
      { message: "לא ניתן ליצור קישור תשלום בשבת ויום טוב" },
      { status: 403 }
    );
  }

  const { id: paymentId } = await context.params;

  // Idempotency — המפתח חייב להיות מקובע ל-(userId, route, paymentId, header)
  // אחרת replay בין routes/תשלומים שונים יחזיר תגובה שגויה. ה-TTL נאכף גם
  // בקריאה (לא רק ב-cron) — שורה שפג תוקפה לא מוחזרת מהקאש.
  const idempotencyKey = request.headers.get("Idempotency-Key") ?? request.headers.get("idempotency-key");
  const idempotencyDbKey = idempotencyKey
    ? `${userId}:POST:/api/payments/${paymentId}/charge-cardcom:${idempotencyKey}`
    : null;
  if (idempotencyDbKey) {
    const existing = await prisma.idempotencyKey.findUnique({
      where: { key: idempotencyDbKey },
    });
    if (existing && existing.expiresAt > new Date()) {
      return NextResponse.json(existing.response, { status: existing.statusCode });
    }
  }

  // H2: zod strict — דוחה שדות לא ידועים שעלולים להגיע ל-Cardcom payload.
  let body: import("zod").infer<typeof chargeCardcomSchema> = {};
  try {
    const raw = await request.json().catch(() => ({}));
    const parsed = chargeCardcomSchema.safeParse(raw ?? {});
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return NextResponse.json(
        { message: first?.message ?? "נתונים לא תקינים", field: first?.path.join(".") ?? null },
        { status: 400 }
      );
    }
    body = parsed.data;
  } catch {
    body = {};
  }

  const numOfPayments = Math.min(Math.max(body.numOfPayments ?? 1, 1), 36);

  // Scope-based ownership: כולל קליניקות רב-מטפלים. גישה לסליקת אשראי גם
  // מצריכה הרשאת קבלות אצל מזכירה (sליקה מנפיקה קבלת/חשבונית).
  const scopeUser = await loadScopeUser(userId);
  if (isSecretary(scopeUser) && !secretaryCan(scopeUser, "canIssueReceipts")) {
    return NextResponse.json(
      { message: "אין הרשאה לסליקת אשראי / הוצאת קבלות" },
      { status: 403 }
    );
  }
  const paymentWhere = buildPaymentWhere(scopeUser);

  const payment = await prisma.payment.findFirst({
    where: { AND: [{ id: paymentId }, paymentWhere] },
    include: { client: true },
  });
  if (!payment) {
    return NextResponse.json({ message: "תשלום לא נמצא" }, { status: 404 });
  }
  if (payment.status === "PAID") {
    return NextResponse.json({ message: "התשלום כבר שולם" }, { status: 409 });
  }

  // ⚠️ billingUserId = המטפל בעל החיוב (תמיד מ-payment.client.therapistId).
  // זה חיוני כשמזכירה (userId שונה) פועלת בשם המטפל — Cardcom client,
  // הקבלה, ה-CardcomTransaction.userId ו-webhookUrl חייבים להיות של המטפל.
  // userId נשמר בנפרד כ-actor ל-audit trail.
  //
  // resolveCardcomBilling מוסיף fallback לבעל הקליניקה אם המטפל הספציפי לא
  // חיבר Cardcom — תרחיש נפוץ בקליניקה רב-מטפלים שבה רק ה-OWNER חיבר את
  // המסוף. בלי הפלבק היינו מחזירים "לא הוגדר מסוף Cardcom" למרות שהקליניקה
  // כן מחוברת. כשמשתמשים בפלבק — האודיט שומר את ה-intendedTherapistId יחד
  // עם ה-cardcomOwnerUserId כדי לשקף שהקבלה הונפקה ע"י ה-OWNER.
  const intendedTherapistId = payment.client.therapistId;
  const resolved = await resolveCardcomBilling(
    intendedTherapistId,
    payment.organizationId,
  );
  if (!resolved) {
    logger.warn("[payments/charge-cardcom] no Cardcom resolved → 400", {
      paymentId,
      intendedTherapistId,
      organizationId: payment.organizationId,
      actorUserId: userId,
    });
    return NextResponse.json(
      { message: "לא הוגדר מסוף Cardcom — יש לחבר אותו בהגדרות אינטגרציות חיוב" },
      { status: 400 }
    );
  }
  const billingUserId = resolved.cardcomOwnerUserId;
  const isSecretaryActor = billingUserId !== userId;

  const cardcomClient = await getUserCardcomClient(billingUserId);
  if (!cardcomClient) {
    // resolved.cardcomOwnerUserId הובטח כבעל BillingProvider פעיל. אם זה
    // עדיין מחזיר null זה כשל decrypt/DB transient — לוג ברור והודעה ידידותית.
    logger.error("[payments/charge-cardcom] resolved owner has no usable client", {
      paymentId,
      intendedTherapistId,
      cardcomOwnerUserId: billingUserId,
      fellbackToOrgOwner: resolved.fellbackToOrgOwner,
    });
    return NextResponse.json(
      { message: "תקלה בטעינת פרטי מסוף Cardcom — נסי שוב או פני לתמיכה" },
      { status: 500 }
    );
  }

  // Determine document type from therapist's businessType + accountingMethod
  const therapist = await prisma.user.findUnique({
    where: { id: billingUserId },
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
        title: `[cardcom] חיוב נחסם — חסר ת.ז./מספר עוסק אצל ${therapist.name ?? billingUserId}`,
        message: `מטפל מסוג ${therapist.businessType} ניסה ליצור דף תשלום בלי שהוזן businessIdNumber. הקריאה נחסמה כדי למנוע הנפקת מסמך לא חוקי.`,
        actionRequired: "פנה למטפל ובקש להזין ת.ז./מספר עוסק בהגדרות העסק",
        userId: billingUserId,
        metadata: {
          paymentId,
          therapistId: billingUserId,
          businessType: therapist.businessType,
          ...(isSecretaryActor ? { actorUserId: userId } : {}),
        },
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

  // Declared outside the try so the outer catch can read it for cleanup.
  let cardcomSucceeded = false;

  try {
    // Cardcom HTTP outside withAudit (timeout race) — see admin/create-payment-page.
    // Atomic guard against double-charges: two parallel callers (e.g. therapist
    // double-clicks "צור לינק", or two devices try concurrently) must not each
    // create their own PENDING transaction. Use a SERIALIZABLE transaction to
    // (a) detect any existing in-flight charge and (b) atomically claim a new
    // one. Mirrors the same pattern used in `charge-saved-token`.
    let transaction;
    try {
      transaction = await prisma.$transaction(
        async (tx) => {
          const inFlight = await tx.cardcomTransaction.findFirst({
            where: {
              paymentId: payment.id,
              tenant: "USER",
              status: { in: ["PENDING", "APPROVED"] },
            },
            select: { id: true, status: true },
          });
          if (inFlight) {
            throw new Error(
              inFlight.status === "APPROVED"
                ? "ALREADY_PAID"
                : "CHARGE_IN_PROGRESS"
            );
          }
          return tx.cardcomTransaction.create({
            data: {
              tenant: "USER",
              userId: billingUserId,
              paymentId: payment.id,
              amount: payment.amount,
              currency: "ILS",
              numOfPayments,
              status: "PENDING",
            },
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );
    } catch (claimErr) {
      const msg = claimErr instanceof Error ? claimErr.message : String(claimErr);
      if (msg === "ALREADY_PAID") {
        return NextResponse.json(
          { message: "התשלום כבר שולם" },
          { status: 409 }
        );
      }
      if (msg === "CHARGE_IN_PROGRESS") {
        return NextResponse.json(
          { message: "כבר קיים חיוב פתוח לתשלום זה. המתן לסיומו או בטל אותו." },
          { status: 409 }
        );
      }
      // Serialization failure → ask the caller to retry once.
      const code = (claimErr as { code?: string })?.code;
      if (code === "P2034" || code === "40001") {
        return NextResponse.json(
          { message: "המערכת עמוסה — נסה שוב בעוד רגע" },
          { status: 503 }
        );
      }
      throw claimErr;
    }

    // Track if Cardcom already accepted the request — if a downstream step
    // (withAudit, DB updates) throws AFTER this point, we need to mark the
    // transaction FAILED so the next attempt isn't blocked by the
    // CHARGE_IN_PROGRESS guard above. Without this, an audit-log failure
    // leaves a permanent PENDING zombie that locks the payment.
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
        webhookUrl: `${baseUrl}/api/webhooks/cardcom/user?userId=${billingUserId}`,
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
      // Scrub PAN fragments from Cardcom error body before persisting.
      const rawMessage =
        cardcomErr instanceof Error ? cardcomErr.message : String(cardcomErr);
      await prisma.cardcomTransaction.update({
        where: { id: transaction.id },
        data: {
          status: "FAILED",
          errorMessage: scrubCardcomMessage(rawMessage),
          completedAt: new Date(),
        },
      });
      throw cardcomErr;
    }
    cardcomSucceeded = true;

    // Defense-in-depth: לוודא שה-URL שמחזיר Cardcom הוא אכן של Cardcom
    // לפני שמירה ב-DB. אם משהו השתבש (MITM/data corruption), לא לאחסן URL
    // זדוני שיגיע אחר כך ל-/p/pay/[lpId] gateway.
    {
      try {
        const u = new URL(cardcomResult.url);
        const allowed = ["cardcom.solutions", "cardcom.co.il"];
        const okHost = allowed.some(
          (d) => u.hostname === d || u.hostname.endsWith(`.${d}`)
        );
        if (u.protocol !== "https:" || !okHost) {
          throw new Error("CARDCOM_URL_NOT_TRUSTED");
        }
      } catch {
        await prisma.cardcomTransaction.update({
          where: { id: transaction.id },
          data: {
            status: "FAILED",
            errorMessage: "Cardcom החזיר URL לא צפוי — לא נשמר",
            completedAt: new Date(),
          },
        });
        return NextResponse.json(
          { message: "Cardcom החזיר תגובה לא תקינה. נסה שוב." },
          { status: 502 }
        );
      }
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
          billingUserId,
          intendedTherapistId,
          fellbackToOrgOwner: resolved.fellbackToOrgOwner,
          ...(isSecretaryActor ? { actorUserId: userId } : {}),
        },
      },
      async (tx) => {
        const updated = await tx.cardcomTransaction.update({
          where: { id: transaction.id },
          data: {
            lowProfileId: cardcomResult.lowProfileId,
            paymentPageUrl: cardcomResult.url,
          },
        });
        return {
          transactionId: updated.id,
          lowProfileId: cardcomResult.lowProfileId,
          url: cardcomResult.url,
        };
      }
    );

    if (idempotencyDbKey) {
      // Tolerate the race where two concurrent identical Idempotency-Key
      // requests both pass the `findUnique` check above and try to `create`.
      // The second one trips P2002; we silently accept it because both
      // requests will return the same `result` payload anyway.
      try {
        await prisma.idempotencyKey.create({
          data: {
            key: idempotencyDbKey,
            method: "POST",
            path: `/api/payments/${paymentId}/charge-cardcom`,
            statusCode: 200,
            response: result,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
          },
        });
      } catch (storeErr) {
        if (
          storeErr instanceof Prisma.PrismaClientKnownRequestError &&
          storeErr.code === "P2002"
        ) {
          // Concurrent duplicate — idempotency-by-design.
        } else {
          throw storeErr;
        }
      }
    }

    return NextResponse.json(result);
  } catch (err) {
    logger.error("[payments/charge-cardcom] failed", {
      userId,
      paymentId,
      cardcomSucceeded,
      error: err instanceof Error ? err.message : String(err),
    });
    // If Cardcom already issued a low-profile (URL exists in their system) but
    // a later step here failed, the transaction is currently PENDING with no
    // lowProfileId — and the `CHARGE_IN_PROGRESS` guard would block the next
    // attempt forever. Mark it FAILED so the user can retry. Best-effort:
    // we suppress errors here so the original error still propagates.
    if (cardcomSucceeded) {
      try {
        await prisma.cardcomTransaction.updateMany({
          where: {
            paymentId,
            tenant: "USER",
            status: "PENDING",
            lowProfileId: null,
          },
          data: {
            status: "FAILED",
            // Scrub the post-cardcom failure message — it may include the
            // raw upstream error which can echo PAN fragments.
            errorMessage:
              err instanceof Error
                ? scrubCardcomMessage(`post-cardcom failure: ${err.message}`)
                : "post-cardcom failure",
            completedAt: new Date(),
          },
        });
      } catch (cleanupErr) {
        logger.error("[payments/charge-cardcom] post-success cleanup failed", {
          userId,
          paymentId,
          error:
            cleanupErr instanceof Error
              ? cleanupErr.message
              : String(cleanupErr),
        });
      }
    }
    return NextResponse.json({ message: "שגיאה ביצירת דף תשלום" }, { status: 502 });
  }
}
