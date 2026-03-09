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
        setPayments(data.filter((p: ReceiptPayment) => p.status === "PAID"));
      } else {
        toast.error("שגיאה בטעינת נתונים");
      }
    } catch {
      toast.error("שגיאה בטעינת נתונים");
    } finally {
      setIsLoading(false);
    }
  };

  const downloadReceiptPdf = (payment: ReceiptPayment) => {
    try {
      const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
      const pageWidth = doc.internal.pageSize.getWidth();
      
      doc.addFont("Helvetica", "Helvetica", "normal");
      doc.setFont("Helvetica");

      const businessName = therapist?.businessName || therapist?.name || "MyTipul";
      const dateStr = payment.paidAt
        ? format(new Date(payment.paidAt), "dd/MM/yyyy")
        : format(new Date(payment.createdAt), "dd/MM/yyyy");
      const methodLabel = METHOD_LABELS[payment.method] || payment.method;
      const receiptNum = payment.receiptNumber || payment.id.slice(0, 8).toUpperCase();

      // Header bar
      doc.setFillColor(15, 118, 110);
      doc.rect(0, 0, pageWidth, 35, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(22);
      doc.text("RECEIPT", pageWidth / 2, 16, { align: "center" });
      doc.setFontSize(11);
      doc.text(businessName, pageWidth / 2, 26, { align: "center" });

      // Receipt info
      doc.setTextColor(100, 100, 100);
      doc.setFontSize(10);
      doc.text(`Receipt #: ${receiptNum}`, pageWidth - 20, 45, { align: "right" });
      doc.text(`Date: ${dateStr}`, pageWidth - 20, 52, { align: "right" });

      // Business details
      let yPos = 45;
      doc.setTextColor(60, 60, 60);
      doc.setFontSize(10);
      if (therapist?.businessPhone) {
        doc.text(`Tel: ${therapist.businessPhone}`, 20, yPos);
        yPos += 7;
      }
      if (therapist?.businessAddress) {
        doc.text(`Address: ${therapist.businessAddress}`, 20, yPos);
        yPos += 7;
      }

      // Divider
      doc.setDrawColor(200, 200, 200);
      doc.line(20, 65, pageWidth - 20, 65);

      // Bill To
      doc.setFontSize(12);
      doc.setTextColor(15, 118, 110);
      doc.text("Bill To:", 20, 77);
      doc.setTextColor(30, 30, 30);
      doc.setFontSize(11);
      doc.text(payment.client.name, 20, 85);

      // Table header
      const tableY = 100;
      doc.setFillColor(240, 240, 240);
      doc.rect(20, tableY, pageWidth - 40, 10, "F");
      doc.setFontSize(10);
      doc.setTextColor(80, 80, 80);
      doc.text("Description", 25, tableY + 7);
      doc.text("Method", pageWidth / 2, tableY + 7, { align: "center" });
      doc.text("Amount", pageWidth - 25, tableY + 7, { align: "right" });

      // Table row
      doc.setTextColor(30, 30, 30);
      doc.setFontSize(11);
      const rowY = tableY + 18;
      const description = payment.session
        ? `Session - ${format(new Date(payment.session.startTime), "dd/MM/yyyy")}`
        : "Therapy session";
      doc.text(description, 25, rowY);
      doc.text(methodLabel, pageWidth / 2, rowY, { align: "center" });
      doc.setFontSize(12);
      doc.text(`${Number(payment.amount).toLocaleString()} ILS`, pageWidth - 25, rowY, { align: "right" });

      // Total
      doc.setDrawColor(15, 118, 110);
      doc.setLineWidth(0.5);
      doc.line(pageWidth / 2, rowY + 8, pageWidth - 20, rowY + 8);
      doc.setFontSize(14);
      doc.setTextColor(15, 118, 110);
      doc.text(`Total: ${Number(payment.amount).toLocaleString()} ILS`, pageWidth - 25, rowY + 18, { align: "right" });

      // Footer
      doc.setFontSize(9);
      doc.setTextColor(150, 150, 150);
      doc.text("This receipt was generated by MyTipul", pageWidth / 2, 270, { align: "center" });
      doc.text(`Generated: ${format(new Date(), "dd/MM/yyyy HH:mm")}`, pageWidth / 2, 276, { align: "center" });

      doc.save(`receipt_${receiptNum}_${payment.client.name}.pdf`);
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

    return filtered;
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
