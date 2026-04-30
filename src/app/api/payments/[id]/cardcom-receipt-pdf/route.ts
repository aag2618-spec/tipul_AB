// src/app/api/payments/[id]/cardcom-receipt-pdf/route.ts
//
// Lazy-resolve a Cardcom-issued receipt's PDF URL and redirect the caller to
// it. Cardcom's GetLpResult sometimes returns DocumentInfo.DocumentNumber
// without DocumentLink (the link is generated asynchronously), which leaves
// the CardcomInvoice.pdfUrl empty and the receipts page with no "צפה" link.
//
// On first call we fall back to Documents/Search to fetch the URL by date
// range + document number, persist it on CardcomInvoice.pdfUrl so the next
// click is instant, and 302-redirect the therapist to the PDF.

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { getUserCardcomCredentials } from "@/lib/cardcom/user-config";
import { searchCardcomDocuments } from "@/lib/cardcom/invoice-api";

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

  // Fast path — link already cached.
  if (invoice.pdfUrl) {
    return NextResponse.redirect(invoice.pdfUrl, 302);
  }
  if (invoice.viewUrl) {
    return NextResponse.redirect(invoice.viewUrl, 302);
  }

  // Slow path — Cardcom didn't return the link in GetLpResult/Documents/Create
  // at issuance time. Fetch it from Documents/Search now.
  const creds = await getUserCardcomCredentials(userId);
  if (!creds) {
    return NextResponse.json(
      { message: "מסוף Cardcom אינו מוגדר" },
      { status: 400 }
    );
  }
  if (!creds.config.apiPassword) {
    return NextResponse.json(
      { message: "חסרה סיסמת API ב-Cardcom — לא ניתן לחפש מסמכים" },
      { status: 400 }
    );
  }

  // Search a ±2-day window around the issuance date — Cardcom's date filter
  // is inclusive but timezone behavior is fuzzy; a small window prevents
  // off-by-one misses without dragging back too many results to scan.
  // Format YYYY-MM-DD (matches cardcom-invoice-sync cron exactly).
  const issuedAt = invoice.issuedAt;
  const fromDate = new Date(issuedAt.getTime() - 2 * 24 * 60 * 60 * 1000);
  const toDate = new Date(issuedAt.getTime() + 2 * 24 * 60 * 60 * 1000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  let documents;
  try {
    documents = await searchCardcomDocuments(creds.config, fmt(fromDate), fmt(toDate));
  } catch (err) {
    logger.error("[cardcom-receipt-pdf] Documents/Search failed", {
      paymentId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { message: "שגיאת תקשורת עם Cardcom — נסי שוב בעוד רגע" },
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

  // Persist for next click — best-effort, don't block the redirect on error.
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
