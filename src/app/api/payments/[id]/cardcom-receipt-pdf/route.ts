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

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { userId } = auth;

  const { id: paymentId } = await context.params;

  // Ownership check + load the most recent CardcomInvoice for this payment.
  const payment = await prisma.payment.findUnique({
    where: { id: paymentId },
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
        },
      },
    },
  });
  if (!payment || payment.client.therapistId !== userId) {
    return NextResponse.json({ message: "תשלום לא נמצא" }, { status: 404 });
  }

  const invoice = payment.cardcomInvoices[0];
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

  const creds = await getUserCardcomCredentials(userId);
  if (!creds) {
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
