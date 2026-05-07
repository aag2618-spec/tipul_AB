// src/app/api/payments/charge-cardcom-bulk/route.ts
// יצירת דף תשלום Cardcom עבור תשלום מצרפי על מספר חובות (כמה Payments).
//
// ארכיטקטורה — "Umbrella Payment":
//   1. ה-API מקבל clientId + paymentIds[] + totalAmount.
//   2. נוצר Payment "umbrella" יחיד (PENDING, method=CREDIT_CARD, amount=totalAmount)
//      שאין לו session ולא parentPaymentId — הוא מטה הסליקה.
//   3. נוצר CardcomTransaction יחיד עם paymentId=umbrella.id וגם bulkPaymentIds=[X1..Xn]
//      (רשימת ה-Payments האמיתיים שצריך לסמן PAID).
//   4. Cardcom יוצר LowProfile יחיד על totalAmount, מפיק קבלה אחת על הסכום הכולל.
//   5. ב-webhook (cardcom/user) — אחרי APPROVED — אנחנו קוראים ל-
//      distributeBulkCardcomPayment(umbrellaId), שמחלק את הכסף ב-children תחת
//      ה-Payments המקוריים (כמו processMultiSessionPayment).
//
// המסלול הזה משלים את `charge-cardcom` (תשלום בודד) — שניהם משתמשים באותו
// webhook, באותו דפוס SERIALIZABLE race-guard, ובאותם Cardcom credentials.

import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { withAudit } from "@/lib/audit";
import { getUserCardcomClient } from "@/lib/cardcom/user-config";
import { scrubCardcomMessage } from "@/lib/cardcom/verify-webhook";
import type { CardcomDocumentType } from "@/lib/cardcom/types";
import {
  buildClientWhere,
  buildPaymentWhere,
  isSecretary,
  loadScopeUser,
  secretaryCan,
} from "@/lib/scope";
import { isShabbatOrYomTov } from "@/lib/shabbat";
import { BULK_UMBRELLA_NOTES_PREFIX } from "@/lib/payments/types";

export const dynamic = "force-dynamic";

interface ChargeBulkBody {
  clientId: string;
  paymentIds: string[];
  totalAmount: number;
  numOfPayments?: number;
  createToken?: boolean;
  description?: string;
  successRedirectUrl?: string;
  failedRedirectUrl?: string;
}

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { userId, session } = auth;

  // חסימה הלכתית — אסור ליצור קישור תשלום בשבת/יו״ט (זהה ל-charge-cardcom).
  if (isShabbatOrYomTov()) {
    return NextResponse.json(
      { message: "לא ניתן ליצור קישור תשלום בשבת ויום טוב" },
      { status: 403 }
    );
  }

  // Idempotency — מפתח קישור ל-(userId, route, header). שני קליקים מהירים עם
  // אותו header → אותה תוצאה (לא 2 umbrella payments + 2 חיובים).
  const idempotencyKey = request.headers.get("Idempotency-Key") ?? request.headers.get("idempotency-key");
  const idempotencyDbKey = idempotencyKey
    ? `${userId}:POST:/api/payments/charge-cardcom-bulk:${idempotencyKey}`
    : null;
  if (idempotencyDbKey) {
    const existing = await prisma.idempotencyKey.findUnique({
      where: { key: idempotencyDbKey },
    });
    if (existing && existing.expiresAt > new Date()) {
      return NextResponse.json(existing.response, { status: existing.statusCode });
    }
  }

  let body: ChargeBulkBody;
  try {
    body = (await request.json()) as ChargeBulkBody;
  } catch {
    return NextResponse.json({ message: "גוף הבקשה לא תקין" }, { status: 400 });
  }

  const { clientId, paymentIds, totalAmount } = body;
  const numOfPayments = Math.min(Math.max(body.numOfPayments ?? 1, 1), 36);

  if (!clientId || typeof clientId !== "string") {
    return NextResponse.json({ message: "חסר מזהה מטופל" }, { status: 400 });
  }
  if (!Array.isArray(paymentIds) || paymentIds.length === 0) {
    return NextResponse.json({ message: "אין תשלומים לחיוב" }, { status: 400 });
  }
  if (paymentIds.length > 50) {
    // הגנה מפני body מנופח — Cardcom Products array גם מוגבל בפועל.
    return NextResponse.json({ message: "ניתן לצרף עד 50 פגישות בחיוב יחיד" }, { status: 400 });
  }
  if (typeof totalAmount !== "number" || !Number.isFinite(totalAmount) || totalAmount <= 0) {
    return NextResponse.json({ message: "סכום התשלום חייב להיות חיובי" }, { status: 400 });
  }

  // Scope-based ownership + הרשאת קבלות למזכירה (סליקה מנפיקה קבלה/חשבונית).
  const scopeUser = await loadScopeUser(userId);
  if (isSecretary(scopeUser) && !secretaryCan(scopeUser, "canIssueReceipts")) {
    return NextResponse.json(
      { message: "אין הרשאה לסליקת אשראי / הוצאת קבלות" },
      { status: 403 }
    );
  }

  // ולידציה: כל ה-payments שייכים למטופל ובסקופ של המשתמש, ולא שולמו כבר.
  const clientWhere = buildClientWhere(scopeUser);
  const client = await prisma.client.findFirst({
    where: { AND: [{ id: clientId }, clientWhere] },
    select: { id: true, name: true, email: true },
  });
  if (!client) {
    return NextResponse.json({ message: "מטופל לא נמצא" }, { status: 404 });
  }

  const paymentWhere = buildPaymentWhere(scopeUser);
  const payments = await prisma.payment.findMany({
    where: {
      AND: [
        paymentWhere,
        {
          id: { in: paymentIds },
          clientId,
          status: "PENDING",
          parentPaymentId: null, // רק parent payments — children הם פיצולים פנימיים
        },
      ],
    },
    select: {
      id: true,
      amount: true,
      expectedAmount: true,
      currency: true,
      organizationId: true,
      notes: true,
    },
    orderBy: { createdAt: "asc" },
  });

  if (payments.length === 0) {
    return NextResponse.json(
      { message: "לא נמצאו תשלומים פעילים בסקופ זה" },
      { status: 404 }
    );
  }

  // מטבע אחיד — Cardcom flow מניח ILS (ראה Multi-currency guard ב-charge-cardcom).
  const nonIls = payments.find((p) => p.currency !== "ILS");
  if (nonIls) {
    return NextResponse.json(
      { message: `מטבע ${nonIls.currency} עדיין לא נתמך בסליקת אשראי. רק ILS נתמך כעת.` },
      { status: 501 }
    );
  }

  // סכום הקלט לא יכול לחרוג מסך החובות בפועל — מונע כפיית קרדיט עודף בטעות.
  const totalDebt = payments.reduce((sum, p) => {
    const exp = Number(p.expectedAmount) || 0;
    const cur = Number(p.amount) || 0;
    return sum + Math.max(0, exp - cur);
  }, 0);
  if (totalAmount > totalDebt + 0.01) {
    return NextResponse.json(
      {
        message: `סכום החיוב (₪${totalAmount.toFixed(0)}) חורג מסך החוב (₪${totalDebt.toFixed(0)}).`,
      },
      { status: 400 }
    );
  }

  // אם המשתמש העביר paymentIds שלא נמצאו (סקופ/PAID/דלטה) — נחסום במקום
  // לקבל "להמשיך עם החלקיות". המשתמש צריך לקבל מסך מצב מעודכן.
  if (payments.length !== paymentIds.length) {
    return NextResponse.json(
      {
        message:
          "חלק מהפגישות שהועברו אינן זמינות לחיוב (אולי שולמו כבר). רענני את העמוד ונסי שוב.",
      },
      { status: 409 }
    );
  }

  const cardcomClient = await getUserCardcomClient(userId);
  if (!cardcomClient) {
    return NextResponse.json(
      { message: "לא הוגדר מסוף Cardcom — יש לחבר אותו בהגדרות אינטגרציות חיוב" },
      { status: 400 }
    );
  }

  // ולידציה משפטית — ת.ז./מספר עוסק חובה ל-LICENSED/EXEMPT (ראה charge-cardcom).
  const therapist = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      businessType: true,
      businessIdNumber: true,
      accountingMethod: true,
      name: true,
    },
  });

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
        title: `[cardcom-bulk] חיוב נחסם — חסר ת.ז./מספר עוסק אצל ${therapist.name ?? userId}`,
        message: `מטפל מסוג ${therapist.businessType} ניסה ליצור דף תשלום מצרפי בלי businessIdNumber. נחסם.`,
        actionRequired: "פנה למטפל ובקש להזין ת.ז./מספר עוסק בהגדרות העסק",
        userId,
        metadata: { paymentIds, therapistId: userId, businessType: therapist.businessType },
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
  // תיאור עבור Cardcom (יוצג ללקוח / קבלה).
  const cardcomDescription =
    body.description?.trim() ||
    `תשלום מצרפי על ${payments.length} פגישות — ${client.name}`;
  // תיאור פנימי ל-Umbrella Payment — מתחיל ב-BULK_UMBRELLA_NOTES_PREFIX
  // כך שכל תצוגות סיכום/היסטוריה/CSV יידעו לסנן אותו (הסכום נספר דרך
  // ה-children תחת ה-Payments האמיתיים).
  const umbrellaNotes = `${BULK_UMBRELLA_NOTES_PREFIX} ${cardcomDescription}`;

  // organizationId — נורש מה-payments (כולם שייכים לאותה קליניקה אם בכלל).
  const organizationId = payments[0]?.organizationId ?? null;

  let cardcomSucceeded = false;

  try {
    // SERIALIZABLE race-guard: מונע 2 לחיצות מקבילות שייצרו 2 umbrellas + 2
    // חיובים. בנוסף — בודק שאף אחד מה-paymentIds לא בעיצומו של חיוב Cardcom
    // אחר (PENDING/APPROVED), אחרת המטופל היה משלם פעמיים.
    let umbrella;
    let transaction;
    try {
      const result = await prisma.$transaction(
        async (tx) => {
          // מבטיחים שאין CardcomTransaction חי (PENDING/APPROVED) על אף אחד
          // מה-payments — לא ב-paymentId הישיר, ולא ברשימה bulkPaymentIds
          // של umbrella אחר שעדיין לא הסתיים.
          const inFlightDirect = await tx.cardcomTransaction.findFirst({
            where: {
              tenant: "USER",
              status: { in: ["PENDING", "APPROVED"] },
              paymentId: { in: paymentIds },
            },
            select: { id: true },
          });
          if (inFlightDirect) {
            throw new Error("CHARGE_IN_PROGRESS");
          }
          const inFlightBulk = await tx.cardcomTransaction.findFirst({
            where: {
              tenant: "USER",
              status: { in: ["PENDING", "APPROVED"] },
              bulkPaymentIds: { hasSome: paymentIds },
            },
            select: { id: true },
          });
          if (inFlightBulk) {
            throw new Error("CHARGE_IN_PROGRESS");
          }

          const umb = await tx.payment.create({
            data: {
              clientId,
              amount: totalAmount,
              expectedAmount: totalAmount,
              currency: "ILS",
              method: "CREDIT_CARD",
              status: "PENDING",
              paymentType: "FULL",
              notes: umbrellaNotes,
              organizationId,
              // קבלה תופק ע"י Cardcom (Documents API) ב-webhook — לא כאן.
              hasReceipt: false,
            },
          });
          const tx_ = await tx.cardcomTransaction.create({
            data: {
              tenant: "USER",
              userId,
              paymentId: umb.id,
              bulkPaymentIds: paymentIds,
              amount: totalAmount,
              currency: "ILS",
              numOfPayments,
              status: "PENDING",
            },
          });
          return { umb, tx_ };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
      );
      umbrella = result.umb;
      transaction = result.tx_;
    } catch (claimErr) {
      const msg = claimErr instanceof Error ? claimErr.message : String(claimErr);
      if (msg === "CHARGE_IN_PROGRESS") {
        return NextResponse.json(
          { message: "כבר קיים חיוב פתוח על אחת מהפגישות. המתיני לסיומו או בטלי אותו." },
          { status: 409 }
        );
      }
      const code = (claimErr as { code?: string })?.code;
      if (code === "P2034" || code === "40001") {
        return NextResponse.json(
          { message: "המערכת עמוסה — נסה שוב בעוד רגע" },
          { status: 503 }
        );
      }
      throw claimErr;
    }

    // קריאה ל-Cardcom — כל אחד מה-payments הופך ל-product עם description+amount,
    // כך שהקבלה שתיווצר תכלול שורה לכל פגישה. אם נשאר עודף (totalAmount <
    // totalDebt) Cardcom יחייב את הסכום שהוזכר ב-Amount הראשי, וה-distribution
    // ב-webhook יחלק לפי הסדר ולא יחרוג.
    let cardcomResult;
    try {
      cardcomResult = await cardcomClient.createPaymentPage({
        amount: totalAmount,
        description: cardcomDescription,
        returnValue: transaction.id,
        successRedirectUrl:
          body.successRedirectUrl ?? `${baseUrl}/p/thanks?t=${transaction.id}`,
        failedRedirectUrl:
          body.failedRedirectUrl ?? `${baseUrl}/p/failed?t=${transaction.id}`,
        webhookUrl: `${baseUrl}/api/webhooks/cardcom/user?userId=${userId}`,
        createToken: !!body.createToken,
        numOfPayments,
        language: "he",
        uniqueAsmachta: transaction.id,
        documentType,
        customer: {
          name: client.name,
          email: client.email ?? undefined,
        },
        // Single product line על הסכום הכולל — מונע סטייה בין סכום סך-הכל
        // לבין סך השורות (Cardcom פוסל אם sum(products) ≠ Amount, וב-PARTIAL
        // הסכום קטן מהחוב המלא).
        products: [
          {
            description: cardcomDescription,
            unitCost: totalAmount,
            quantity: 1,
          },
        ],
      });
    } catch (cardcomErr) {
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
      // נשאיר את ה-umbrella PENDING — fix-stuck-payments cron ינקה אותו אחר כך
      // (הוא מסומן method=CREDIT_CARD ולכן יוגן מ-auto-fix לא רצוי).
      throw cardcomErr;
    }
    cardcomSucceeded = true;

    // URL validation — Cardcom domain בלבד, HTTPS.
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
        action: "cardcom_user_create_bulk_payment_page",
        targetType: "payment",
        targetId: umbrella.id,
        details: {
          amount: totalAmount,
          clientId,
          paymentIds,
          numOfPayments,
          transactionId: transaction.id,
          umbrellaPaymentId: umbrella.id,
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
          umbrellaPaymentId: umbrella.id,
        };
      }
    );

    if (idempotencyDbKey) {
      try {
        await prisma.idempotencyKey.create({
          data: {
            key: idempotencyDbKey,
            method: "POST",
            path: `/api/payments/charge-cardcom-bulk`,
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
          // duplicate Idempotency-Key — אותה תוצאה תחזור ממילא.
        } else {
          throw storeErr;
        }
      }
    }

    return NextResponse.json(result);
  } catch (err) {
    logger.error("[payments/charge-cardcom-bulk] failed", {
      userId,
      clientId,
      paymentIds,
      cardcomSucceeded,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ message: "שגיאה ביצירת דף תשלום" }, { status: 502 });
  }
}
