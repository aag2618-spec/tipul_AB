"use client";

import { useState, useEffect, useRef, use } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  ArrowRight,
  CheckCircle,
  Clock,
  Download,
  Loader2,
  PenTool,
  Printer,
  Send,
  Trash2,
} from "lucide-react";
import { useCallback } from "react";
import { CONSENT_TYPE_LABELS } from "@/lib/consent-templates";
import DOMPurify from "dompurify";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import Link from "next/link";
import { toast } from "sonner";
import type { ConsentType } from "@prisma/client";

function InlineSignaturePad({ onSave, onCancel }: { onSave: (data: string) => void; onCancel: () => void }) {
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
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
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

  const handleSave = () => {
    const canvas = canvasRef.current;
    if (canvas && hasDrawn) {
      onSave(canvas.toDataURL("image/png"));
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
      <p className="text-sm text-muted-foreground text-center">חתום/י כאן באמצעות העכבר או המגע</p>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>ביטול</Button>
        <Button variant="outline" onClick={handleClear} disabled={!hasDrawn}>נקה</Button>
        <Button onClick={handleSave} disabled={!hasDrawn}>אשר חתימה</Button>
      </div>
    </div>
  );
}

interface ConsentFormData {
  id: string;
  type: string;
  title: string;
  content: string;
  isTemplate: boolean;
  signedAt: string | null;
  signatureData: string | null;
  createdAt: string;
  client: { id: string; name: string } | null;
}

export default function ConsentFormDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();
  const contentRef = useRef<HTMLDivElement>(null);

  const [form, setForm] = useState<ConsentFormData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showSignDialog, setShowSignDialog] = useState(false);
  const [signing, setSigning] = useState(false);
  const [showSendDialog, setShowSendDialog] = useState(false);
  const [sendChannel, setSendChannel] = useState<"sms" | "email" | "both">("sms");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    fetch(`/api/consent-forms/${id}`)
      .then((res) => {
        if (!res.ok) throw new Error("not found");
        return res.json();
      })
      .then(setForm)
      .catch(() => {
        toast.error("הטופס לא נמצא");
        router.push("/dashboard/consent-forms");
      })
      .finally(() => setIsLoading(false));
  }, [id, router]);

  const handleSign = async (signatureData: string) => {
    setSigning(true);
    try {
      const res = await fetch(`/api/consent-forms/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signatureData }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "שגיאה בחתימה");
      }

      const updated = await res.json();
      setForm(updated);
      setShowSignDialog(false);
      toast.success("הטופס נחתם בהצלחה");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "שגיאה בחתימה");
    } finally {
      setSigning(false);
    }
  };

  const handleSendLink = async () => {
    setSending(true);
    try {
      const res = await fetch(`/api/consent-forms/${id}/send-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channel: sendChannel }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "שגיאה בשליחה");
      }

      setShowSendDialog(false);
      toast.success("הלינק נשלח בהצלחה");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "שגיאה בשליחה");
    } finally {
      setSending(false);
    }
  };

  const handleDelete = async () => {
    if (!form) return;
    if (form.signedAt) {
      toast.error("לא ניתן למחוק טופס שנחתם");
      return;
    }
    if (!confirm("האם ברצונך למחוק טופס זה?")) return;

    try {
      const res = await fetch(`/api/consent-forms/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      toast.success("הטופס נמחק");
      router.push("/dashboard/consent-forms");
    } catch {
      toast.error("שגיאה במחיקת הטופס");
    }
  };

  const handlePrint = () => {
    window.print();
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

      const fileName = `${form.title}_${form.client?.name || "תבנית"}_${format(new Date(), "yyyy-MM-dd")}.pdf`;

      const blob = pdf.output("blob");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch {
      toast.error("שגיאה ביצירת PDF — נסה להדפיס במקום");
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!form) return null;

  const isSigned = !!form.signedAt;
  const typeLabel = CONSENT_TYPE_LABELS[form.type as ConsentType] || form.type;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between print:hidden">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight">{form.title}</h1>
          <div className="flex items-center gap-2 text-muted-foreground">
            <span>{typeLabel}</span>
            {form.client && (
              <>
                <span>•</span>
                <span>{form.client.name}</span>
              </>
            )}
            {form.isTemplate && (
              <Badge variant="secondary">תבנית</Badge>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isSigned ? (
            <Badge className="bg-green-50 text-green-700 border-green-200" variant="outline">
              <CheckCircle className="ml-1 h-3 w-3" />
              נחתם {format(new Date(form.signedAt!), "dd/MM/yyyy", { locale: he })}
            </Badge>
          ) : (
            <Badge className="bg-amber-50 text-amber-700 border-amber-200" variant="outline">
              <Clock className="ml-1 h-3 w-3" />
              ממתין לחתימה
            </Badge>
          )}
          <Button variant="outline" asChild>
            <Link href="/dashboard/consent-forms">
              <ArrowRight className="ml-2 h-4 w-4" />
              חזרה
            </Link>
          </Button>
        </div>
      </div>

      {/* Form content */}
      <Card>
        <CardHeader className="print:hidden">
          <CardTitle>תוכן הטופס</CardTitle>
        </CardHeader>
        <CardContent>
          <div
            ref={contentRef}
            className="prose prose-sm max-w-none rtl bg-white p-6 rounded-lg border print:border-0"
            style={{ fontFamily: "'Heebo', 'Segoe UI', Arial, sans-serif" }}
          >
            <div
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(form.content),
              }}
            />

            {/* Signature display */}
            {isSigned && form.signatureData && (
              <div className="mt-8 pt-6 border-t-2 border-gray-300">
                <p className="text-sm text-gray-600 mb-2">חתימה:</p>
                <img
                  src={form.signatureData}
                  alt="חתימה"
                  className="max-h-24 border rounded"
                />
                <p className="text-xs text-gray-500 mt-1">
                  נחתם בתאריך {format(new Date(form.signedAt!), "dd/MM/yyyy בשעה HH:mm", { locale: he })}
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex items-center gap-3 flex-wrap print:hidden">
        {!isSigned && !form.isTemplate && (
          <>
            <Button onClick={() => setShowSignDialog(true)}>
              <PenTool className="ml-2 h-4 w-4" />
              חתום עכשיו
            </Button>
            {form.client && (
              <Button variant="outline" onClick={() => setShowSendDialog(true)}>
                <Send className="ml-2 h-4 w-4" />
                שלח לחתימה מרחוק
              </Button>
            )}
          </>
        )}

        {isSigned && (
          <>
            <Button onClick={handlePrint}>
              <Printer className="ml-2 h-4 w-4" />
              הדפס / שמור PDF
            </Button>
          </>
        )}

        {!isSigned && (
          <Button variant="ghost" className="text-destructive" onClick={handleDelete}>
            <Trash2 className="ml-2 h-4 w-4" />
            מחק
          </Button>
        )}
      </div>

      {/* Sign dialog */}
      <Dialog open={showSignDialog} onOpenChange={setShowSignDialog}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>חתימה על הטופס</DialogTitle>
            <DialogDescription>
              חתום/י באמצעות העכבר או המגע
            </DialogDescription>
          </DialogHeader>
          {signing ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin" />
              <span className="mr-2">שומר חתימה...</span>
            </div>
          ) : (
            <InlineSignaturePad
              onSave={handleSign}
              onCancel={() => setShowSignDialog(false)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Send link dialog */}
      <Dialog open={showSendDialog} onOpenChange={setShowSendDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>שליחת טופס לחתימה מרחוק</DialogTitle>
            <DialogDescription>
              {form.client?.name} יקבל/תקבל קישור לחתימה דיגיטלית על הטופס.
              הקישור תקף ל-7 ימים.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>ערוץ שליחה</Label>
              <Select
                value={sendChannel}
                onValueChange={(v) => setSendChannel(v as "sms" | "email" | "both")}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sms">SMS</SelectItem>
                  <SelectItem value="email">אימייל</SelectItem>
                  <SelectItem value="both">SMS + אימייל</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSendDialog(false)}>
              ביטול
            </Button>
            <Button onClick={handleSendLink} disabled={sending}>
              {sending ? (
                <>
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  שולח...
                </>
              ) : (
                <>
                  <Send className="ml-2 h-4 w-4" />
                  שלח
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
