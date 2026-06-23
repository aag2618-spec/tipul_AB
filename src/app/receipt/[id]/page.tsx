"use client";

import { useState, useEffect, use } from "react";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { escapeHtml } from "@/lib/email-utils";

const METHOD_LABELS: Record<string, string> = {
  CASH: "מזומן",
  CREDIT_CARD: "אשראי",
  BANK_TRANSFER: "העברה בנקאית",
  CHECK: "המחאה",
  CREDIT: "קרדיט",
  OTHER: "אחר",
};

interface ReceiptData {
  receiptNumber: string | null;
  amount: number;
  expectedAmount: number;
  method: string;
  paidAt: string | null;
  createdAt: string;
  clientName: string;
  sessionDate: string | null;
  receiptUrl: string | null;
  isPartial: boolean;
  remaining: number;
  // קבלה מאוחדת (תשלום מצרפי): תיאור רב-שורתי עם פירוט הפגישות. קבלה רגילה: undefined.
  description?: string;
  therapist: {
    name: string;
    businessName: string;
    phone: string;
    address: string;
  };
}

// בונה את הקבלה כמחרוזת HTML עם צבעי hex inline בלבד (ללא class-ים של
// Tailwind v4 שהם oklch — html2canvas 1.4.1 נכשל עליהם). זהו אותו דפוס
// המשמש בדף הקבלות הראשי (dashboard/receipts/page.tsx) שעובד באמינות.
// כל נתון שמקורו במשתמש עובר escapeHtml — הקבלה מורצת ב-iframe (document.write)
// שמריץ קוד, ולכן חובה הגנת XSS.
function buildReceiptHtml(receipt: ReceiptData, fallbackId: string): string {
  const businessName = escapeHtml(
    receipt.therapist.businessName || receipt.therapist.name || "MyTipul"
  );
  const dateStr = format(
    new Date(receipt.paidAt || receipt.createdAt),
    "dd בMMMM yyyy",
    { locale: he }
  );
  const methodLabel = escapeHtml(METHOD_LABELS[receipt.method] || receipt.method);
  const receiptNum = escapeHtml(
    receipt.receiptNumber || `R-${fallbackId.slice(0, 8).toUpperCase()}`
  );
  const sessionDateStr = receipt.sessionDate
    ? format(new Date(receipt.sessionDate), "dd/MM/yyyy")
    : null;
  // קבלה מאוחדת: description רב-שורתי (escape + white-space:pre-line). אחרת — שורה גנרית.
  const descriptionHtml = receipt.description
    ? escapeHtml(receipt.description)
    : `פגישה טיפולית${sessionDateStr ? ` - ${sessionDateStr}` : ""}`;
  const phone = receipt.therapist.phone ? escapeHtml(receipt.therapist.phone) : "";
  const address = receipt.therapist.address
    ? escapeHtml(receipt.therapist.address)
    : "";
  const clientName = escapeHtml(receipt.clientName);
  const footerDate = format(
    new Date(receipt.paidAt || receipt.createdAt),
    "dd/MM/yyyy"
  );

  return `
    <div style="padding: 40px; direction: rtl; font-family: 'Heebo', 'Segoe UI', Arial, sans-serif; color: #1a1a1a; width: 714px;">
      <div style="background: #0f766e; padding: 30px; text-align: center; color: white; border-radius: 8px 8px 0 0;">
        <h1 style="margin: 0; font-size: 30px; font-weight: 700;">קבלה</h1>
        <p style="margin: 10px 0 0; font-size: 16px; opacity: 0.9;">${businessName}</p>
      </div>
      <table style="width: 100%; border-collapse: collapse; border: 1px solid #e5e7eb; border-top: none;">
        <tr>
          <td style="padding: 16px 25px; font-size: 13px; color: #6b7280; vertical-align: top;">
            ${phone ? `<p style="margin: 0 0 4px;">טלפון: ${phone}</p>` : ""}
            ${address ? `<p style="margin: 0;">כתובת: ${address}</p>` : ""}
          </td>
          <td style="padding: 16px 25px; font-size: 13px; color: #6b7280; text-align: left; vertical-align: top;">
            <p style="margin: 0 0 4px;">קבלה מס׳: ${receiptNum}</p>
            <p style="margin: 0;">תאריך: ${dateStr}</p>
          </td>
        </tr>
      </table>
      <div style="border: 1px solid #e5e7eb; border-top: none; padding: 18px 25px;">
        <p style="margin: 0 0 4px; font-size: 12px; color: #0f766e; font-weight: 600;">התקבל מאת:</p>
        <p style="margin: 0; font-size: 17px; font-weight: 600;">${clientName}</p>
      </div>
      <table style="width: 100%; border-collapse: collapse; border: 1px solid #e5e7eb; border-top: none;">
        <thead><tr style="background: #f3f4f6;">
          <th style="padding: 12px 16px; text-align: right; font-size: 13px; color: #6b7280; font-weight: 600; border-bottom: 1px solid #e5e7eb;">תיאור</th>
          <th style="padding: 12px 16px; text-align: center; font-size: 13px; color: #6b7280; font-weight: 600; border-bottom: 1px solid #e5e7eb;">אמצעי תשלום</th>
          <th style="padding: 12px 16px; text-align: left; font-size: 13px; color: #6b7280; font-weight: 600; border-bottom: 1px solid #e5e7eb;">סכום</th>
        </tr></thead>
        <tbody><tr>
          <td style="padding: 14px 16px; font-size: 14px; border-bottom: 1px solid #e5e7eb; white-space: pre-line;">${descriptionHtml}</td>
          <td style="padding: 14px 16px; font-size: 14px; text-align: center; border-bottom: 1px solid #e5e7eb;">${methodLabel}</td>
          <td style="padding: 14px 16px; font-size: 14px; text-align: left; font-weight: 600; border-bottom: 1px solid #e5e7eb;">₪${receipt.amount.toLocaleString()}</td>
        </tr></tbody>
      </table>
      <div style="border: 1px solid #e5e7eb; border-top: 2px solid #0f766e; padding: 16px 25px; background: #f9fafb; border-radius: 0 0 ${receipt.isPartial ? "0 0" : "8px 8px"};">
        <span style="font-size: 20px; font-weight: 700; color: #0f766e;">סה״כ שולם: ₪${receipt.amount.toLocaleString()}</span>
      </div>
      ${receipt.isPartial ? `
      <div style="border: 1px solid #e5e7eb; border-top: none; padding: 14px 25px; background: #fffbeb; border-radius: 0 0 8px 8px;">
        <p style="margin: 0 0 6px; font-size: 13px; color: #92400e; font-weight: 600;">* תשלום חלקי</p>
        <table style="width: 100%; font-size: 13px;">
          <tr style="color: #78716c;">
            <td style="padding: 2px 0;">סכום מלא לפגישה:</td>
            <td style="padding: 2px 0; text-align: left; font-weight: 600;">₪${receipt.expectedAmount.toLocaleString()}</td>
          </tr>
          <tr style="color: #ea580c;">
            <td style="padding: 2px 0;">נותר לתשלום:</td>
            <td style="padding: 2px 0; text-align: left; font-weight: 600;">₪${receipt.remaining.toLocaleString()}</td>
          </tr>
        </table>
      </div>` : ""}
      <div style="text-align: center; margin-top: 35px; padding-top: 15px; border-top: 1px solid #e5e7eb;">
        <p style="margin: 0; font-size: 11px; color: #9ca3af;">הופק על ידי MyTipul | ${footerDate}</p>
      </div>
    </div>`;
}

export default function PublicReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // M9.2: ה-token מגיע ב-URL fragment (#t=...) כדי שלא ידלוף ב-Referer header
    // (CDN/jspdf/html2canvas script-src).
    // M10.8: ה-fallback ל-?t= הוסר — אין משתמשים פעילים, ה-receiptUrl ב-DB מבוסס
    // על generator שמייצר fragment בלבד.
    const url = new URL(window.location.href);
    const hash = url.hash;
    if (!hash.startsWith("#t=")) {
      setError("קישור לא תקין");
      setLoading(false);
      return;
    }
    const token = decodeURIComponent(hash.substring("#t=".length));
    // מנקים את ה-token מ-URL כדי שלא יישאר ב-history/clipboard.
    window.history.replaceState(null, "", window.location.pathname);

    if (!token) {
      setError("קישור לא תקין");
      setLoading(false);
      return;
    }

    fetch(`/api/receipts/${id}/public?t=${encodeURIComponent(token)}`)
      .then((res) => {
        if (!res.ok) throw new Error("not found");
        return res.json();
      })
      .then((data) => setReceipt(data))
      .catch(() => setError("הקבלה לא נמצאה או שהקישור לא תקין"))
      .finally(() => setLoading(false));
  }, [id]);

  const handleDownloadPdf = async () => {
    if (!receipt) return;

    // מרנדרים את הקבלה ב-iframe מבודד מ-HTML מבוסס-hex (ראה buildReceiptHtml)
    // במקום לצלם את ה-DOM החי — שמכיל class-ים של Tailwind v4 בצבעי oklch
    // ש-html2canvas 1.4.1 לא יודע לפענח. iframe נקי = שליטה מלאה בצבעים.
    let iframe: HTMLIFrameElement | null = null;
    try {
      const html2canvasModule = await import("html2canvas");
      const h2c = html2canvasModule.default ?? html2canvasModule;
      const { jsPDF } = await import("jspdf");

      iframe = document.createElement("iframe");
      iframe.style.position = "fixed";
      iframe.style.left = "-9999px";
      iframe.style.top = "0";
      iframe.style.width = "794px";
      iframe.style.height = "1200px";
      iframe.style.border = "none";
      document.body.appendChild(iframe);

      const iDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!iDoc) throw new Error("Cannot access iframe document");

      iDoc.open();
      iDoc.write(`<!DOCTYPE html><html dir="rtl"><head>
        <link href="https://fonts.googleapis.com/css2?family=Heebo:wght@300;400;500;600;700&display=swap" rel="stylesheet"/>
        <style>*{margin:0;padding:0;box-sizing:border-box;font-family:'Heebo',sans-serif;}</style>
      </head><body style="background:white;">${buildReceiptHtml(receipt, id)}</body></html>`);
      iDoc.close();

      await new Promise((r) => setTimeout(r, 500));
      if (iDoc.fonts) await iDoc.fonts.ready;

      const target = (iDoc.body.firstElementChild as HTMLElement) || iDoc.body;
      const canvas = await h2c(target, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
        windowWidth: 794,
      });

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("portrait", "mm", "a4");
      const pageWidth = 210;
      const imgHeight = (canvas.height * pageWidth) / canvas.width;
      pdf.addImage(imgData, "PNG", 0, 0, pageWidth, imgHeight);

      const fileName = receipt.receiptNumber
        ? `קבלה_${receipt.receiptNumber}.pdf`
        : `קבלה_${format(new Date(receipt.paidAt || receipt.createdAt), "yyyy-MM-dd")}.pdf`;

      const blob = pdf.output("blob");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("PDF generation error:", err);
      alert("שגיאה ביצירת PDF. נסה שוב או השתמש בכפתור ההדפסה.");
    } finally {
      if (iframe) document.body.removeChild(iframe);
    }
  };

  const handlePrint = () => window.print();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-teal-600" />
      </div>
    );
  }

  if (error || !receipt) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50" dir="rtl">
        <div className="bg-white rounded-xl shadow-lg p-10 text-center max-w-md">
          <div className="text-5xl mb-4">🔒</div>
          <h1 className="text-xl font-bold text-gray-800 mb-2">
            {error || "הקבלה לא נמצאה"}
          </h1>
          <p className="text-gray-500 text-sm">
            הקישור שגוי או שפג תוקפו. פנה למטפל/ת לקבלת קישור חדש.
          </p>
        </div>
      </div>
    );
  }

  const dateStr = format(
    new Date(receipt.paidAt || receipt.createdAt),
    "dd בMMMM yyyy",
    { locale: he }
  );
  const methodLabel = METHOD_LABELS[receipt.method] || receipt.method;
  const businessName =
    receipt.therapist.businessName || receipt.therapist.name || "MyTipul";
  const receiptNum = receipt.receiptNumber || `R-${id.slice(0, 8).toUpperCase()}`;
  const sessionDateStr = receipt.sessionDate
    ? format(new Date(receipt.sessionDate), "dd/MM/yyyy")
    : null;

  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4" dir="rtl">
      <div className="max-w-2xl mx-auto">
        {/* Download button */}
        <div className="flex justify-between items-center mb-4 print:hidden">
          <h1 className="text-lg font-semibold text-gray-700">קבלה</h1>
          <div className="flex gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 px-4 py-2.5 rounded-lg font-medium transition-colors"
            >
              🖨️ הדפס
            </button>
            <button
              onClick={handleDownloadPdf}
              className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-5 py-2.5 rounded-lg font-medium transition-colors shadow-md"
            >
              📥 הורד PDF
            </button>
          </div>
        </div>

        {/* Receipt card - this is what gets captured to PDF.
            ⚠️ id="mytipul-receipt-print" — דרוש כדי ש-@media print
            ב-globals.css יזהה את הקבלה ויסתיר את שאר הדף בעת הדפסה.
            אותו ID משמש גם ב-ReceiptPreviewDialog בתוך הדאשבורד. */}
        <div
          id="mytipul-receipt-print"
          className="bg-white rounded-xl shadow-lg overflow-hidden"
          style={{ fontFamily: "'Heebo', 'Segoe UI', Arial, sans-serif" }}
        >
          {/* Header */}
          <div
            className="text-center py-8 px-6"
            style={{ background: "linear-gradient(135deg, #0f766e, #14b8a6)" }}
          >
            <h2 className="text-white text-3xl font-bold m-0">קבלה</h2>
            <p className="text-white/90 text-base mt-2">{businessName}</p>
          </div>

          {/* Info row */}
          <div className="flex justify-between items-start px-8 py-5 border-b border-gray-200">
            <div className="text-sm text-gray-500 space-y-1">
              {receipt.therapist.phone && (
                <p>טלפון: {receipt.therapist.phone}</p>
              )}
              {receipt.therapist.address && (
                <p>כתובת: {receipt.therapist.address}</p>
              )}
            </div>
            <div className="text-sm text-gray-500 text-left space-y-1">
              <p>קבלה מס׳: {receiptNum}</p>
              <p>תאריך: {dateStr}</p>
            </div>
          </div>

          {/* Bill to */}
          <div className="px-8 py-5 border-b border-gray-200">
            <p className="text-xs font-semibold text-teal-700 mb-1">
              התקבל מאת:
            </p>
            <p className="text-lg font-semibold text-gray-900">
              {receipt.clientName}
            </p>
          </div>

          {/* Table */}
          <div className="px-8 py-0">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50">
                  <th className="py-3 px-4 text-right text-sm font-semibold text-gray-500 border-b">
                    תיאור
                  </th>
                  <th className="py-3 px-4 text-center text-sm font-semibold text-gray-500 border-b">
                    אמצעי תשלום
                  </th>
                  <th className="py-3 px-4 text-left text-sm font-semibold text-gray-500 border-b">
                    סכום
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td
                    className="py-4 px-4 text-sm text-gray-800 border-b"
                    style={{ whiteSpace: "pre-line" }}
                  >
                    {receipt.description
                      ? receipt.description
                      : `פגישה טיפולית${sessionDateStr ? ` - ${sessionDateStr}` : ""}`}
                  </td>
                  <td className="py-4 px-4 text-sm text-gray-800 text-center border-b">
                    {methodLabel}
                  </td>
                  <td className="py-4 px-4 text-sm font-semibold text-gray-900 text-left border-b">
                    ₪{receipt.amount.toLocaleString()}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Total */}
          <div className="px-8 py-5 bg-gray-50 border-t-2 border-teal-500">
            <div className="flex justify-between items-center">
              <span className="text-xl font-bold text-teal-700">
                סה״כ שולם: ₪{receipt.amount.toLocaleString()}
              </span>
            </div>
            {receipt.isPartial && (
              <div className="mt-3 pt-3 border-t border-gray-200 text-sm text-gray-600 space-y-1">
                <div className="flex justify-between">
                  <span>סכום מלא לפגישה:</span>
                  <span className="font-medium">₪{receipt.expectedAmount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span>נותר לתשלום:</span>
                  <span className="font-medium text-orange-600">₪{receipt.remaining.toLocaleString()}</span>
                </div>
                <p className="text-xs text-orange-500 mt-1 font-medium">* תשלום חלקי</p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="text-center py-6 border-t border-gray-200">
            <p className="text-xs text-gray-400">
              הופק על ידי MyTipul |{" "}
              {format(
                new Date(receipt.paidAt || receipt.createdAt),
                "dd/MM/yyyy"
              )}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
