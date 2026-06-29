// src/app/api/payments/[id]/cardcom-receipt-pdf/route.ts
//
// Lazy-resolve a Cardcom-issued receipt's PDF URL and redirect the caller to
// it. Cardcom's GetLpResult sometimes returns DocumentInfo.DocumentNumber
// without DocumentUrl (the link generation is async on their side), which
// leaves CardcomInvoice.pdfUrl empty and the receipts page with no "צפה" link.
//
// Resolution path (in order):
//   1. Fast path — cached pdfUrl/viewUrl on CardcomInvoice → redirect.
//   2. /Documents/CreateDocumentUrl — official v11 endpoint that returns a
//      public URL by DocumentNumber + DocumentType. Per Cardcom support
//      (https://cardcomapi.zendesk.com/hc/he/articles/25565747889682) this
//      is THE supported way to get a viewable URL after the fact.
//   3. /Documents/GetReport — date-range search; finds matching DocumentNumber
//      and reads its DocumentUrl. Used as a fallback if CreateDocumentUrl
//      isn't enabled on the terminal.
//
// Successful resolves are cached on CardcomInvoice.pdfUrl so subsequent
// clicks are instant.

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { getUserCardcomCredentials } from "@/lib/cardcom/user-config";
import {
  getCardcomDocumentUrl,
  searchCardcomDocuments,
} from "@/lib/cardcom/invoice-api";
import {
  buildPaymentWhere,
  loadScopeUser,
} from "@/lib/scope";
import { loadScopeUserWithMode } from "@/lib/secretary-mode";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { userId } = auth;

  const { id: paymentId } = await context.params;

  // Ownership check via scope (תומך גם בקליניקה רב-מטפלים).
  // ⚠️ הסקופ ההיסטורי השתמש ב-`payment.client.therapistId !== userId`, שחוסם
  // בעלת קליניקה / מזכירה מלצפות בקבלות של מטפלים אחרים בארגון, וגם נכשל
  // אחרי הפלבק החדש: הקבלה הונפקה ע"י בעל הקליניקה (issuerUserId שונה
  // מ-therapistId), והבדיקה הישנה הייתה תקינה אבל ה-credentials לא — ראה
  // למטה.
  let scopeUser;
  try {
    scopeUser = await loadScopeUserWithMode(userId);
  } catch (scopeErr) {
    logger.error("[cardcom-receipt-pdf] scope load failed", {
      userId,
      error: scopeErr instanceof Error ? scopeErr.message : String(scopeErr),
    });
    return NextResponse.json({ message: "אין הרשאה" }, { status: 403 });
  }
  const paymentWhere = buildPaymentWhere(scopeUser);

  const payment = await prisma.payment.findFirst({
    where: { AND: [{ id: paymentId }, paymentWhere] },
    include: {
      client: { select: { therapistId: true } },
      cardcomInvoices: {
        orderBy: { issuedAt: "desc" },
        take: 1,
        select: {
          id: true,
          cardcomDocumentNumber: true,
          cardcomDocumentType: true,
          pdfUrl: true,
          viewUrl: true,
          issuedAt: true,
          issuerUserId: true,
        },
      },
      // child payments — מאפשר fallback ב-bulk parents שלא קיבלו receiptNumber
      // ב-distributeBulkCardcomPayment (הוא מעדכן רק amount/status/method,
      // לא receiptNumber → ה-receiptNumber/Cardcom נמצא רק על ה-children
      // עם notes "Bulk Cardcom distribution").
      // orderBy paidAt:desc — אם תרחיש hand-recovery ידני יצר 2 children
      // Bulk לאותו parent, נבחר את החדש ביותר.
      childPayments: {
        where: { notes: { contains: "Bulk Cardcom distribution" } },
        select: { receiptNumber: true },
        orderBy: { paidAt: "desc" },
        take: 1,
      },
    },
  });
  if (!payment) {
    return NextResponse.json({ message: "תשלום לא נמצא" }, { status: 404 });
  }

  // ⚠️ Bulk-Cardcom backfill — בתשלום מצרפי ה-CardcomInvoice מקושר רק
  // ל-Umbrella Payment (cardcomDocumentNumber UNIQUE → לא יכול להיות
  // מקושר ל-N parents). distributeBulkCardcomPayment מעתיק את
  // receiptNumber/Url ל-children, אבל לא ל-parent ולא ל-CardcomInvoice.
  // אם payment.cardcomInvoices ריק:
  //   1. אם payment.receiptNumber קיים — לחפש Invoice לפי cardcomDocumentNumber.
  //      (תרחיש: child שנוצר ע"י distribute, או parent של partial-cash שמקבל
  //      receipt שלו, או umbrella ישיר.)
  //   2. אם זה parent של bulk (receiptNumber=null אבל יש child Bulk) — לחפש
  //      דרך ה-receiptNumber של ה-child.
  // false-positive collision מנוטרל ע"י paymentWhere (ownership) + העובדה
  // ש-cardcomDocumentNumber UNIQUE גלובלי.
  const lookupReceiptNumber =
    payment.receiptNumber ?? payment.childPayments[0]?.receiptNumber ?? null;
  let invoice = payment.cardcomInvoices[0];
  if (!invoice && lookupReceiptNumber) {
    const umbrellaInvoice = await prisma.cardcomInvoice.findUnique({
      where: { cardcomDocumentNumber: lookupReceiptNumber },
      select: {
        id: true,
        cardcomDocumentNumber: true,
        cardcomDocumentType: true,
        pdfUrl: true,
        viewUrl: true,
        issuedAt: true,
        issuerUserId: true,
      },
    });
    if (umbrellaInvoice) {
      invoice = umbrellaInvoice;
    }
  }
  if (!invoice) {
    return NextResponse.json(
      { message: "אין קבלת Cardcom מקושרת לתשלום זה" },
      { status: 404 }
    );
  }

  // 1. Fast path — link already cached.
  if (invoice.pdfUrl) {
    return NextResponse.redirect(invoice.pdfUrl, 302);
  }
  if (invoice.viewUrl) {
    return NextResponse.redirect(invoice.viewUrl, 302);
  }

  // ⚠️ ה-credentials חייבים להיות של ה-ISSUER של הקבלה (issuerUserId), לא
  // של ה-actor הנוכחי. אחרי הפלבק לבעל הקליניקה הקבלה הונפקה במסוף של
  // ה-OWNER, וטעינת credentials של ה-actor (המטפלת/המזכירה) הייתה מחזירה
  // null או credentials של מסוף שונה — ושאילתת CreateDocumentUrl על מסוף
  // לא נכון נכשלת. fallback ל-actor רק אם issuerUserId חסר (קבלות ישנות).
  const credsUserId = invoice.issuerUserId ?? userId;
  const creds = await getUserCardcomCredentials(credsUserId);
  if (!creds) {
    logger.warn("[cardcom-receipt-pdf] no Cardcom credentials for issuer", {
      paymentId,
      invoiceId: invoice.id,
      issuerUserId: invoice.issuerUserId,
      actorUserId: userId,
    });
    return NextResponse.json(
      { message: "מסוף Cardcom אינו מוגדר" },
      { status: 400 }
    );
  }
  if (!creds.config.apiPassword) {
    return NextResponse.json(
      { message: "חסרה סיסמת API ב-Cardcom — לא ניתן לבקש קישור מסמך" },
      { status: 400 }
    );
  }

  // 2. Preferred path — /Documents/CreateDocumentUrl. Direct lookup by
  //    DocumentNumber + DocumentType. Confirmed via Cardcom support article
  //    25565747889682 as the canonical way to materialize a public URL.
  const urlResult = await getCardcomDocumentUrl(creds.config, {
    documentNumber: invoice.cardcomDocumentNumber,
    documentType: invoice.cardcomDocumentType,
  });

  if (urlResult.success && urlResult.url) {
    // Persist for next click — best-effort, don't block the redirect on error.
    try {
      await prisma.cardcomInvoice.update({
        where: { id: invoice.id },
        data: { pdfUrl: urlResult.url },
      });
    } catch (err) {
      logger.warn("[cardcom-receipt-pdf] failed to cache pdfUrl on CardcomInvoice", {
        invoiceId: invoice.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
    return NextResponse.redirect(urlResult.url, 302);
  }

  if (!urlResult.notSupported) {
    // CreateDocumentUrl is exposed but returned an error (bad doc num,
    // expired credentials, etc.). Surface the actual Cardcom message.
    logger.warn("[cardcom-receipt-pdf] CreateDocumentUrl failed", {
      paymentId,
      docNumber: invoice.cardcomDocumentNumber,
      error: urlResult.error,
    });
    return NextResponse.json(
      {
        message: `Cardcom לא החזיר קישור: ${urlResult.error ?? "שגיאה לא ידועה"}`,
        docNumber: invoice.cardcomDocumentNumber,
      },
      { status: 502 }
    );
  }

  // 3. Fallback — /Documents/GetReport (date-range scan). Use only when
  //    CreateDocumentUrl isn't enabled on the terminal.
  const issuedAt = invoice.issuedAt;
  const fromDate = new Date(issuedAt.getTime() - 2 * 24 * 60 * 60 * 1000);
  const toDate = new Date(issuedAt.getTime() + 2 * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  let documents;
  try {
    documents = await searchCardcomDocuments(creds.config, fmt(fromDate), fmt(toDate));
  } catch (err) {
    const rawMsg = err instanceof Error ? err.message : String(err);
    logger.error("[cardcom-receipt-pdf] Documents/GetReport fallback failed", {
      paymentId,
      error: rawMsg,
      docNumber: invoice.cardcomDocumentNumber,
      fromDate: fmt(fromDate),
      toDate: fmt(toDate),
    });
    return NextResponse.json(
      {
        message: `שגיאת תקשורת עם Cardcom: ${rawMsg}`,
        docNumber: invoice.cardcomDocumentNumber,
      },
      { status: 502 }
    );
  }

  const match = documents.find(
    (d) => d.documentNumber === invoice.cardcomDocumentNumber
  );
  if (!match || !match.pdfUrl) {
    logger.warn("[cardcom-receipt-pdf] document not found in search results", {
      paymentId,
      docNumber: invoice.cardcomDocumentNumber,
      searchedRange: { fromDate: fmt(fromDate), toDate: fmt(toDate) },
      foundDocs: documents.length,
    });
    return NextResponse.json(
      {
        message:
          "Cardcom לא החזיר קישור למסמך. ניתן לפתוח את הקבלה דרך המייל שנשלח ללקוח.",
      },
      { status: 404 }
    );
  }

  try {
    await prisma.cardcomInvoice.update({
      where: { id: invoice.id },
      data: { pdfUrl: match.pdfUrl },
    });
  } catch (err) {
    logger.warn("[cardcom-receipt-pdf] failed to cache pdfUrl on CardcomInvoice", {
      invoiceId: invoice.id,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return NextResponse.redirect(match.pdfUrl, 302);
}
