"use client";

import { useState, useEffect, useRef, useCallback, use } from "react";
import DOMPurify from "dompurify";
import { format } from "date-fns";
import { he } from "date-fns/locale";

function SimpleSignaturePad({ onSave, onCancel }: { onSave: (data: string) => void; onCancel: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [drawing, setDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  const getPos = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    if ("touches" in e) {
      return { x: e.touches[0].clientX - rect.left, y: e.touches[0].clientY - rect.top };
    }
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }, []);

  const startDraw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    setDrawing(true);
    setHasDrawn(true);
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
  }, [getPos]);

  const draw = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!drawing) return;
    e.preventDefault();
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const pos = getPos(e);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#000";
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  }, [drawing, getPos]);

  const endDraw = useCallback(() => { setDrawing(false); }, []);

  const handleClear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (ctx && canvas) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setHasDrawn(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="border-2 border-dashed border-gray-300 rounded-lg bg-white touch-none">
        <canvas
          ref={canvasRef}
          width={500}
          height={180}
          style={{ width: "100%", height: "180px", cursor: "crosshair" }}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={endDraw}
          onMouseLeave={endDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={endDraw}
        />
      </div>
      <p className="text-sm text-gray-500 text-center">חתום/י כאן באמצעות האצבע או העכבר</p>
      <div className="flex justify-center gap-3">
        <button onClick={onCancel} className="border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 px-5 py-2.5 rounded-lg font-medium transition-colors">ביטול</button>
        <button onClick={handleClear} disabled={!hasDrawn} className="border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 px-5 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-40">נקה</button>
        <button onClick={() => { if (canvasRef.current && hasDrawn) onSave(canvasRef.current.toDataURL("image/png")); }} disabled={!hasDrawn} className="bg-teal-600 hover:bg-teal-700 text-white px-5 py-2.5 rounded-lg font-medium transition-colors disabled:opacity-40">אשר חתימה</button>
      </div>
    </div>
  );
}

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

    // הטוקן נשלח ב-header (לא ב-URL) כדי שלא יופיע ביומני-שרת/Referer.
    fetch(`/api/consent-forms/${id}/public`, {
      headers: { "x-consent-token": token },
    })
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
        `/api/consent-forms/${id}/public`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            "x-consent-token": tokenRef.current,
          },
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

      const el = contentRef.current;

      const canvas = await h2c(el, {
        scale: 2,
        useCORS: true,
        allowTaint: true,
        backgroundColor: "#ffffff",
        logging: false,
      });

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
      window.print();
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

  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4" dir="rtl">
      <div className="max-w-2xl mx-auto">
        {/* Success banner */}
        {signed && (
          <div
            className="bg-white rounded-xl shadow-lg p-8 text-center mb-6"
            style={{ fontFamily: "'Heebo', 'Segoe UI', Arial, sans-serif" }}
          >
            <div className="text-5xl mb-4">&#9989;</div>
            <h1 className="text-2xl font-bold text-green-700 mb-2">
              הטופס נחתם בהצלחה
            </h1>
            <p className="text-gray-600 mb-4">{form.title}</p>
            <p className="text-sm text-gray-500 mb-6">נחתם כרגע</p>
            <button
              onClick={() => window.print()}
              className="bg-teal-600 hover:bg-teal-700 text-white px-6 py-3 rounded-lg font-medium transition-colors shadow-md"
            >
              הדפס / שמור PDF
            </button>
          </div>
        )}

        {/* Header */}
        {!signed && (
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-lg font-semibold text-gray-700">{form.title}</h1>
            {form.therapistName && (
              <span className="text-sm text-gray-500">{form.therapistName}</span>
            )}
          </div>
        )}

        {/* Form content — always in DOM so contentRef works for PDF */}
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
        {!signed && (
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
                  <SimpleSignaturePad
                    onSave={handleSign}
                    onCancel={() => setShowSignPad(false)}
                />
              )}
            </div>
          )}
          </div>
        )}
      </div>
    </div>
  );
}
