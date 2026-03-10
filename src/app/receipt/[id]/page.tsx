"use client";

import { useState, useEffect, useRef, use } from "react";
import { format } from "date-fns";
import { he } from "date-fns/locale";

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
  therapist: {
    name: string;
    businessName: string;
    phone: string;
    address: string;
  };
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
  const receiptRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("t");
    if (!token) {
      setError("קישור לא תקין");
      setLoading(false);
      return;
    }

    fetch(`/api/receipts/${id}/public?t=${token}`)
      .then((res) => {
        if (!res.ok) throw new Error("not found");
        return res.json();
      })
      .then((data) => setReceipt(data))
      .catch(() => setError("הקבלה לא נמצאה או שהקישור לא תקין"))
      .finally(() => setLoading(false));
  }, [id]);

  const handleDownloadPdf = async () => {
    if (!receiptRef.current || !receipt) return;

    try {
      await document.fonts.ready;

      const html2canvasModule = await import("html2canvas");
      const h2c = html2canvasModule.default ?? html2canvasModule;
      const { jsPDF } = await import("jspdf");

      const clone = receiptRef.current.cloneNode(true) as HTMLElement;
      clone.style.width = "794px";
      clone.style.position = "absolute";
      clone.style.left = "-9999px";
      clone.style.top = "0";
      document.body.appendChild(clone);

      await new Promise((r) => setTimeout(r, 200));

      const canvas = await h2c(clone, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
        logging: false,
        windowWidth: 794,
      });

      document.body.removeChild(clone);

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

        {/* Receipt card - this is what gets captured to PDF */}
        <div
          ref={receiptRef}
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
                  <td className="py-4 px-4 text-sm text-gray-800 border-b">
                    פגישה טיפולית{sessionDateStr ? ` - ${sessionDateStr}` : ""}
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
