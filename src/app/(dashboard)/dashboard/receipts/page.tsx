"use client";

import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  Search,
  FileText,
  Download,
  ExternalLink,
  Calendar as CalendarIcon,
  FileDown,
} from "lucide-react";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { toast } from "sonner";
import html2canvas from "html2canvas";
import { jsPDF } from "jspdf";

interface ReceiptPayment {
  id: string;
  amount: number;
  expectedAmount: number;
  method: string;
  status: string;
  paidAt: string | null;
  createdAt: string;
  receiptNumber: string | null;
  receiptUrl: string | null;
  hasReceipt: boolean;
  client: {
    id: string;
    name: string;
  };
  session: {
    id: string;
    startTime: string;
  } | null;
}

const METHOD_LABELS: Record<string, string> = {
  CASH: "מזומן",
  CREDIT_CARD: "אשראי",
  BANK_TRANSFER: "העברה בנקאית",
  CHECK: "המחאה",
  CREDIT: "קרדיט",
  OTHER: "אחר",
};

interface TherapistInfo {
  name: string;
  businessName: string | null;
  businessPhone: string | null;
  businessAddress: string | null;
  businessType: string;
}

export default function ReceiptsPage() {
  const [payments, setPayments] = useState<ReceiptPayment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [filterType, setFilterType] = useState<"all" | "with" | "without">("all");
  const [therapist, setTherapist] = useState<TherapistInfo | null>(null);

  useEffect(() => {
    fetchPayments();
    fetchTherapist();
  }, []);

  const fetchTherapist = async () => {
    try {
      const res = await fetch("/api/user/business-settings");
      if (res.ok) {
        const data = await res.json();
        setTherapist(data);
      }
    } catch { /* ignore */ }
  };

  const fetchPayments = async () => {
    try {
      setIsLoading(true);
      const response = await fetch("/api/payments");
      if (response.ok) {
        const data = await response.json();
        setPayments(data.filter((p: ReceiptPayment) => p.status === "PAID" || p.hasReceipt));
      } else {
        toast.error("שגיאה בטעינת נתונים");
      }
    } catch {
      toast.error("שגיאה בטעינת נתונים");
    } finally {
      setIsLoading(false);
    }
  };

  const downloadReceiptPdf = async (payment: ReceiptPayment) => {
    try {
      const businessName = therapist?.businessName || therapist?.name || "MyTipul";
      const dateStr = payment.paidAt
        ? format(new Date(payment.paidAt), "dd בMMMM yyyy", { locale: he })
        : format(new Date(payment.createdAt), "dd בMMMM yyyy", { locale: he });
      const methodLabel = METHOD_LABELS[payment.method] || payment.method;
      const receiptNum = payment.receiptNumber || `R-${payment.id.slice(0, 8).toUpperCase()}`;
      const sessionDate = payment.session
        ? format(new Date(payment.session.startTime), "dd/MM/yyyy")
        : null;
      const isPartial = Number(payment.amount) < Number(payment.expectedAmount);

      const container = document.createElement("div");
      container.style.position = "fixed";
      container.style.left = "-9999px";
      container.style.top = "0";
      container.style.width = "794px";
      container.style.background = "white";

      container.innerHTML = `
        <div style="padding: 40px; direction: rtl; font-family: 'Heebo', 'Segoe UI', Arial, sans-serif; color: #1a1a1a;">
          <div style="background: linear-gradient(135deg, #0f766e, #14b8a6); padding: 30px; text-align: center; color: white; border-radius: 8px 8px 0 0;">
            <h1 style="margin: 0; font-size: 30px; font-weight: 700;">קבלה</h1>
            <p style="margin: 10px 0 0; font-size: 16px; opacity: 0.9;">${businessName}</p>
          </div>

          <div style="border: 1px solid #e5e7eb; border-top: none; padding: 20px 25px; display: flex; justify-content: space-between;">
            <div style="font-size: 13px; color: #6b7280;">
              ${therapist?.businessPhone ? `<p style="margin: 0 0 4px;">טלפון: ${therapist.businessPhone}</p>` : ""}
              ${therapist?.businessAddress ? `<p style="margin: 0;">כתובת: ${therapist.businessAddress}</p>` : ""}
            </div>
            <div style="text-align: left; font-size: 13px; color: #6b7280;">
              <p style="margin: 0 0 4px;">קבלה מס׳: ${receiptNum}</p>
              <p style="margin: 0;">תאריך: ${dateStr}</p>
            </div>
          </div>

          <div style="border: 1px solid #e5e7eb; border-top: none; padding: 18px 25px;">
            <p style="margin: 0 0 4px; font-size: 12px; color: #0f766e; font-weight: 600;">התקבל מאת:</p>
            <p style="margin: 0; font-size: 17px; font-weight: 600;">${payment.client.name}</p>
          </div>

          <table style="width: 100%; border-collapse: collapse; border: 1px solid #e5e7eb; border-top: none;">
            <thead>
              <tr style="background: #f3f4f6;">
                <th style="padding: 12px 16px; text-align: right; font-size: 13px; color: #6b7280; font-weight: 600; border-bottom: 1px solid #e5e7eb;">תיאור</th>
                <th style="padding: 12px 16px; text-align: center; font-size: 13px; color: #6b7280; font-weight: 600; border-bottom: 1px solid #e5e7eb;">אמצעי תשלום</th>
                <th style="padding: 12px 16px; text-align: left; font-size: 13px; color: #6b7280; font-weight: 600; border-bottom: 1px solid #e5e7eb;">סכום</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style="padding: 14px 16px; font-size: 14px; border-bottom: 1px solid #e5e7eb;">פגישה טיפולית${sessionDate ? ` - ${sessionDate}` : ""}</td>
                <td style="padding: 14px 16px; font-size: 14px; text-align: center; border-bottom: 1px solid #e5e7eb;">${methodLabel}</td>
                <td style="padding: 14px 16px; font-size: 14px; text-align: left; font-weight: 600; border-bottom: 1px solid #e5e7eb;">₪${Number(payment.amount).toLocaleString()}</td>
              </tr>
            </tbody>
          </table>

          <div style="border: 1px solid #e5e7eb; border-top: 2px solid #0f766e; padding: 16px 25px; background: #f9fafb; border-radius: 0 0 ${isPartial ? "0 0" : "8px 8px"};">
            <span style="font-size: 20px; font-weight: 700; color: #0f766e;">סה״כ שולם: ₪${Number(payment.amount).toLocaleString()}</span>
          </div>

          ${isPartial ? `
          <div style="border: 1px solid #e5e7eb; border-top: none; padding: 14px 25px; background: #fffbeb; border-radius: 0 0 8px 8px;">
            <p style="margin: 0 0 6px; font-size: 13px; color: #92400e; font-weight: 600;">* תשלום חלקי</p>
            <div style="display: flex; justify-content: space-between; font-size: 13px; color: #78716c; margin-bottom: 4px;">
              <span>סכום מלא לפגישה:</span>
              <span style="font-weight: 600;">₪${Number(payment.expectedAmount).toLocaleString()}</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 13px; color: #ea580c;">
              <span>נותר לתשלום:</span>
              <span style="font-weight: 600;">₪${(Number(payment.expectedAmount) - Number(payment.amount)).toLocaleString()}</span>
            </div>
          </div>
          ` : ""}

          <div style="text-align: center; margin-top: 35px; padding-top: 15px; border-top: 1px solid #e5e7eb;">
            <p style="margin: 0; font-size: 11px; color: #9ca3af;">הופק על ידי MyTipul | ${format(new Date(), "dd/MM/yyyy HH:mm")}</p>
          </div>
        </div>
      `;

      document.body.appendChild(container);

      const canvas = await html2canvas(container, {
        scale: 2,
        useCORS: true,
        backgroundColor: "#ffffff",
      });

      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF("portrait", "mm", "a4");
      const pageWidth = 210;
      const imgHeight = (canvas.height * pageWidth) / canvas.width;
      pdf.addImage(imgData, "PNG", 0, 0, pageWidth, imgHeight);
      pdf.save(`קבלה_${receiptNum}.pdf`);

      document.body.removeChild(container);
      toast.success("הקבלה הורדה בהצלחה");
    } catch (err) {
      console.error("PDF generation error:", err);
      toast.error("שגיאה ביצירת הקבלה");
    }
  };

  const filteredPayments = useMemo(() => {
    let filtered = payments;

    if (filterType === "with") {
      filtered = filtered.filter((p) => p.hasReceipt);
    } else if (filterType === "without") {
      filtered = filtered.filter((p) => !p.hasReceipt);
    }

    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (p) =>
          p.client.name.toLowerCase().includes(search) ||
          (p.receiptNumber && p.receiptNumber.toLowerCase().includes(search))
      );
    }

    return filtered.sort((a, b) => {
      const dateA = new Date(a.paidAt || a.createdAt).getTime();
      const dateB = new Date(b.paidAt || b.createdAt).getTime();
      return dateB - dateA;
    });
  }, [payments, filterType, searchTerm]);

  const totalWithReceipt = payments.filter((p) => p.hasReceipt).length;
  const totalAmount = filteredPayments.reduce((sum, p) => sum + Number(p.amount), 0);

  const handleExportCSV = () => {
    const headers = ["תאריך", "מטופל", "סכום", "אמצעי תשלום", "מספר קבלה", "קבלה"];
    const rows = filteredPayments.map((p) => [
      p.paidAt ? format(new Date(p.paidAt), "dd/MM/yyyy") : "",
      p.client.name,
      `₪${Number(p.amount)}`,
      METHOD_LABELS[p.method] || p.method,
      p.receiptNumber || "",
      p.hasReceipt ? "כן" : "לא",
    ]);

    const bom = "\uFEFF";
    const csv = bom + [headers, ...rows].map((r) => r.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `קבלות_${format(new Date(), "yyyy-MM-dd")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("הקובץ הורד בהצלחה");
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">קבלות</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {totalWithReceipt} קבלות מתוך {payments.length} תשלומים
          </p>
        </div>
        <Button variant="outline" className="gap-2" onClick={handleExportCSV} disabled={filteredPayments.length === 0}>
          <Download className="h-4 w-4" />
          ייצוא CSV
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white dark:bg-background border rounded-lg p-4 text-center">
          <p className="text-sm text-muted-foreground">סה״כ תשלומים</p>
          <p className="text-2xl font-bold">{filteredPayments.length}</p>
        </div>
        <div className="bg-white dark:bg-background border rounded-lg p-4 text-center">
          <p className="text-sm text-muted-foreground">עם קבלה</p>
          <p className="text-2xl font-bold text-green-600">{filteredPayments.filter((p) => p.hasReceipt).length}</p>
        </div>
        <div className="bg-white dark:bg-background border rounded-lg p-4 text-center">
          <p className="text-sm text-muted-foreground">סה״כ סכום</p>
          <p className="text-2xl font-bold">₪{totalAmount.toLocaleString()}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="חפש לפי שם מטופל או מספר קבלה..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pr-10"
          />
        </div>
        <Select value={filterType} onValueChange={(v) => setFilterType(v as "all" | "with" | "without")}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">הכל</SelectItem>
            <SelectItem value="with">עם קבלה</SelectItem>
            <SelectItem value="without">ללא קבלה</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-background rounded-lg border overflow-hidden">
        {filteredPayments.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <FileText className="h-10 w-10 mb-3 opacity-30" />
            <p className="text-sm">{searchTerm ? "לא נמצאו תוצאות" : "אין עדיין תשלומים ששולמו"}</p>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b bg-muted/30">
                <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">תאריך</th>
                <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">מטופל</th>
                <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">סכום</th>
                <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">אמצעי</th>
                <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">מספר קבלה</th>
                <th className="text-right py-3 px-4 text-sm font-medium text-muted-foreground">קבלה</th>
              </tr>
            </thead>
            <tbody>
              {filteredPayments.map((payment) => (
                <tr key={payment.id} className="border-b last:border-b-0 hover:bg-muted/20 transition-colors">
                  <td className="py-3 px-4 text-sm">
                    <div className="flex items-center gap-1.5">
                      <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
                      {payment.paidAt
                        ? format(new Date(payment.paidAt), "dd/MM/yyyy", { locale: he })
                        : format(new Date(payment.createdAt), "dd/MM/yyyy", { locale: he })}
                    </div>
                  </td>
                  <td className="py-3 px-4 text-sm font-medium">{payment.client.name}</td>
                  <td className="py-3 px-4 text-sm font-semibold">₪{Number(payment.amount).toLocaleString()}</td>
                  <td className="py-3 px-4 text-sm text-muted-foreground">
                    {METHOD_LABELS[payment.method] || payment.method}
                  </td>
                  <td className="py-3 px-4 text-sm">
                    {payment.receiptNumber ? (
                      <span className="font-mono text-xs bg-muted px-2 py-1 rounded">{payment.receiptNumber}</span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-sm">
                    <div className="flex items-center gap-2">
                      {payment.hasReceipt ? (
                        payment.receiptUrl ? (
                          <a
                            href={payment.receiptUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-teal-600 hover:text-teal-700 font-medium"
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                            צפה
                          </a>
                        ) : (
                          <Badge variant="secondary" className="text-xs">הופקה</Badge>
                        )
                      ) : (
                        <span className="text-muted-foreground text-xs">לא הופקה</span>
                      )}
                      <button
                        onClick={() => downloadReceiptPdf(payment)}
                        className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 hover:underline"
                        title="הורד PDF"
                      >
                        <FileDown className="h-3.5 w-3.5" />
                        PDF
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
