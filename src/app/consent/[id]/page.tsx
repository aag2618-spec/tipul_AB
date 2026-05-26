"use client";

import { useState, useEffect, useRef, use } from "react";
import { SignaturePad } from "@/components/ui/signature-pad";
import DOMPurify from "dompurify";
import { format } from "date-fns";
import { he } from "date-fns/locale";

interface ConsentFormPublic {
  id: string;
  title: string;
  content: string;
  signedAt: string | null;
  therapistName: string;
}

export default function PublicConsentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [form, setForm] = useState<ConsentFormPublic | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [showSignPad, setShowSignPad] = useState(false);
  const [signing, setSigning] = useState(false);
  const [signed, setSigned] = useState(false);
  const tokenRef = useRef<string | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const url = new URL(window.location.href);
    const hash = url.hash;
    if (!hash.startsWith("#t=")) {
      setError("קישור לא תקין");
      setLoading(false);
      return;
    }
    const token = decodeURIComponent(hash.substring("#t=".length));
    window.history.replaceState(null, "", window.location.pathname);

    if (!token || !/^[0-9a-f]{32}$/.test(token)) {
      setError("קישור לא תקין");
      setLoading(false);
      return;
    }

    tokenRef.current = token;

    fetch(`/api/consent-forms/${id}/public?t=${encodeURIComponent(token)}`)
      .then((res) => {
        if (!res.ok) throw new Error("not found");
        return res.json();
      })
      .then((data) => {
        setForm(data);
        if (data.signedAt) setSigned(true);
      })
      .catch(() => setError("הקישור לא תקין או שפג תוקפו"))
      .finally(() => setLoading(false));
  }, [id]);

  const handleSign = async (signatureData: string) => {
    if (!tokenRef.current) return;
    setSigning(true);

    try {
      const res = await fetch(
        `/api/consent-forms/${id}/public?t=${encodeURIComponent(tokenRef.current)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ signatureData }),
        }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "שגיאה בחתימה");
      }

      setSigned(true);
      setShowSignPad(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : "שגיאה בחתימה. נסה שוב.");
    } finally {
      setSigning(false);
    }
  };

  const handleDownloadPdf = async () => {
    if (!contentRef.current || !form) return;

    try {
      await document.fonts.ready;

      const html2canvasModule = await import("html2canvas");
      const h2c = html2canvasModule.default ?? html2canvasModule;
      const { jsPDF } = await import("jspdf");

      const clone = contentRef.current.cloneNode(true) as HTMLElement;
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

      const blob = pdf.output("blob");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${form.title}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      alert("שגיאה ביצירת PDF. נסה שוב.");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-teal-600" />
      </div>
    );
  }

  if (error || !form) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50" dir="rtl">
        <div className="bg-white rounded-xl shadow-lg p-10 text-center max-w-md">
          <div className="text-5xl mb-4">&#128274;</div>
          <h1 className="text-xl font-bold text-gray-800 mb-2">
            {error || "הטופס לא נמצא"}
          </h1>
          <p className="text-gray-500 text-sm">
            הקישור שגוי או שפג תוקפו. פנה/י למטפל/ת לקבלת קישור חדש.
          </p>
        </div>
      </div>
    );
  }

  if (signed) {
    return (
      <div className="min-h-screen bg-gray-50 py-8 px-4" dir="rtl">
        <div className="max-w-2xl mx-auto">
          <div
            className="bg-white rounded-xl shadow-lg p-10 text-center"
            style={{ fontFamily: "'Heebo', 'Segoe UI', Arial, sans-serif" }}
          >
            <div className="text-5xl mb-4">&#9989;</div>
            <h1 className="text-2xl font-bold text-green-700 mb-2">
              הטופס נחתם בהצלחה
            </h1>
            <p className="text-gray-600 mb-4">{form.title}</p>
            <p className="text-sm text-gray-500 mb-6">
              {form.signedAt
                ? `נחתם בתאריך ${format(new Date(form.signedAt), "dd/MM/yyyy בשעה HH:mm", { locale: he })}`
                : "נחתם כרגע"}
            </p>
            <button
              onClick={handleDownloadPdf}
              className="bg-teal-600 hover:bg-teal-700 text-white px-6 py-3 rounded-lg font-medium transition-colors shadow-md"
            >
              הורד PDF
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4" dir="rtl">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-lg font-semibold text-gray-700">{form.title}</h1>
          {form.therapistName && (
            <span className="text-sm text-gray-500">{form.therapistName}</span>
          )}
        </div>

        {/* Form content */}
        <div
          ref={contentRef}
          className="bg-white rounded-xl shadow-lg overflow-hidden"
          style={{ fontFamily: "'Heebo', 'Segoe UI', Arial, sans-serif" }}
        >
          {/* Header bar */}
          <div
            className="text-center py-6 px-6"
            style={{ background: "linear-gradient(135deg, #0f766e, #14b8a6)" }}
          >
            <h2 className="text-white text-2xl font-bold m-0">{form.title}</h2>
            {form.therapistName && (
              <p className="text-white/90 text-sm mt-1">{form.therapistName}</p>
            )}
          </div>

          {/* Content */}
          <div className="p-6 leading-relaxed text-sm text-gray-800">
            <div
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(form.content),
              }}
            />
          </div>
        </div>

        {/* Sign section */}
        <div className="mt-6">
          {!showSignPad ? (
            <button
              onClick={() => setShowSignPad(true)}
              className="w-full bg-teal-600 hover:bg-teal-700 text-white py-4 rounded-xl font-bold text-lg transition-colors shadow-md"
            >
              חתום/י על הטופס
            </button>
          ) : (
            <div className="bg-white rounded-xl shadow-lg p-6">
              <h3 className="text-lg font-bold text-gray-800 mb-4 text-center">
                חתום/י כאן
              </h3>
              {signing ? (
                <div className="flex items-center justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-teal-600" />
                  <span className="mr-3 text-gray-600">שומר חתימה...</span>
                </div>
              ) : (
                <SignaturePad
                  onSave={handleSign}
                  onCancel={() => setShowSignPad(false)}
                />
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
