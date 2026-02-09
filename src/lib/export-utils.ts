"use client";

import * as XLSX from "xlsx";
import { jsPDF } from "jspdf";
import "jspdf-autotable";
import { format } from "date-fns";
import { he } from "date-fns/locale";

// Extend jsPDF with autoTable
declare module "jspdf" {
  interface jsPDF {
    autoTable: (options: {
      head?: string[][];
      body?: (string | number)[][];
      startY?: number;
      styles?: Record<string, unknown>;
      headStyles?: Record<string, unknown>;
      bodyStyles?: Record<string, unknown>;
      columnStyles?: Record<string, unknown>;
      margin?: { right?: number; left?: number };
      tableWidth?: string | number;
      theme?: string;
    }) => jsPDF;
  }
}

export interface PaymentExportData {
  id: string;
  clientName: string;
  amount: number;
  expectedAmount: number;
  method: string;
  status: string;
  paidAt: Date | null;
  createdAt: Date;
  sessionDate?: Date | null;
  sessionType?: string | null;
  receiptNumber?: string | null;
  hasReceipt: boolean;
}

// Helper to get method label in Hebrew
function getMethodLabel(method: string): string {
  const labels: Record<string, string> = {
    CASH: "מזומן",
    CREDIT_CARD: "אשראי",
    BANK_TRANSFER: "העברה בנקאית",
    CHECK: "צ'ק",
    CREDIT: "קרדיט",
    OTHER: "אחר",
  };
  return labels[method] || method;
}

// Helper to format date
function formatDate(date: Date | null): string {
  if (!date) return "-";
  return format(new Date(date), "dd/MM/yyyy", { locale: he });
}

// ============ DETAILED EXPORT (Excel) ============
export function exportDetailedExcel(
  payments: PaymentExportData[],
  title: string = "דוח תשלומים מפורט"
) {
  // Prepare data
  const data = payments.map((p) => ({
    "תאריך תשלום": formatDate(p.paidAt),
    "שם מטופל": p.clientName,
    "סכום": `₪${p.amount}`,
    "סכום מצופה": `₪${p.expectedAmount}`,
    "אמצעי תשלום": getMethodLabel(p.method),
    "סטטוס": p.status === "PAID" ? "שולם" : "ממתין",
    "תאריך פגישה": p.sessionDate ? formatDate(p.sessionDate) : "-",
    "סוג פגישה": p.sessionType || "-",
    "מס' קבלה": p.receiptNumber || "-",
    "קבלה": p.hasReceipt ? "כן" : "לא",
  }));

  const ws = XLSX.utils.json_to_sheet(data, { header: [
    "תאריך תשלום",
    "שם מטופל",
    "סכום",
    "סכום מצופה",
    "אמצעי תשלום",
    "סטטוס",
    "תאריך פגישה",
    "סוג פגישה",
    "מס' קבלה",
    "קבלה",
  ]});

  // Set RTL and column widths
  ws["!cols"] = [
    { wch: 12 }, { wch: 20 }, { wch: 10 }, { wch: 12 },
    { wch: 15 }, { wch: 10 }, { wch: 12 }, { wch: 12 },
    { wch: 10 }, { wch: 8 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "תשלומים");

  // Download
  const fileName = `${title}_${format(new Date(), "yyyy-MM-dd")}.xlsx`;
  XLSX.writeFile(wb, fileName);
}

// ============ ACCOUNTANT EXPORT (Excel with multiple sheets) ============
export function exportAccountantExcel(
  payments: PaymentExportData[],
  year: number,
  quarter?: number
) {
  const wb = XLSX.utils.book_new();

  // Filter by year/quarter
  let filtered = payments.filter((p) => {
    if (!p.paidAt) return false;
    const paidDate = new Date(p.paidAt);
    if (paidDate.getFullYear() !== year) return false;
    if (quarter) {
      const month = paidDate.getMonth();
      const pQuarter = Math.floor(month / 3) + 1;
      if (pQuarter !== quarter) return false;
    }
    return true;
  });

  // Sheet 1: Summary
  const summaryData = [
    { "": "סיכום", "סכום": "" },
    { "": "סה\"כ הכנסות", "סכום": `₪${filtered.reduce((sum, p) => sum + p.amount, 0)}` },
    { "": "מספר תשלומים", "סכום": filtered.length.toString() },
    { "": "עם קבלה", "סכום": filtered.filter(p => p.hasReceipt).length.toString() },
    { "": "ללא קבלה", "סכום": filtered.filter(p => !p.hasReceipt).length.toString() },
  ];
  const summaryWs = XLSX.utils.json_to_sheet(summaryData);
  XLSX.utils.book_append_sheet(wb, summaryWs, "סיכום");

  // Sheet 2: All payments
  const allData = filtered.map((p) => ({
    "תאריך": formatDate(p.paidAt),
    "מטופל": p.clientName,
    "סכום": p.amount,
    "אמצעי תשלום": getMethodLabel(p.method),
    "מס' קבלה": p.receiptNumber || "-",
    "סטטוס קבלה": p.hasReceipt ? "עם קבלה" : "ללא קבלה",
  }));
  const allWs = XLSX.utils.json_to_sheet(allData);
  XLSX.utils.book_append_sheet(wb, allWs, "כל התשלומים");

  // Sheet 3: With receipts only
  const withReceiptData = filtered.filter(p => p.hasReceipt).map((p) => ({
    "תאריך": formatDate(p.paidAt),
    "מטופל": p.clientName,
    "סכום": p.amount,
    "אמצעי תשלום": getMethodLabel(p.method),
    "מס' קבלה": p.receiptNumber || "-",
  }));
  const withReceiptWs = XLSX.utils.json_to_sheet(withReceiptData);
  XLSX.utils.book_append_sheet(wb, withReceiptWs, "עם קבלה");

  // Sheet 4: Without receipts
  const withoutReceiptData = filtered.filter(p => !p.hasReceipt).map((p) => ({
    "תאריך": formatDate(p.paidAt),
    "מטופל": p.clientName,
    "סכום": p.amount,
    "אמצעי תשלום": getMethodLabel(p.method),
  }));
  const withoutReceiptWs = XLSX.utils.json_to_sheet(withoutReceiptData);
  XLSX.utils.book_append_sheet(wb, withoutReceiptWs, "ללא קבלה");

  // Sheet 5: By month
  const byMonth: Record<string, number> = {};
  filtered.forEach((p) => {
    if (p.paidAt) {
      const monthKey = format(new Date(p.paidAt), "yyyy-MM");
      byMonth[monthKey] = (byMonth[monthKey] || 0) + p.amount;
    }
  });
  const byMonthData = Object.entries(byMonth)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, total]) => ({
      "חודש": month,
      "סה\"כ": `₪${total}`,
    }));
  const byMonthWs = XLSX.utils.json_to_sheet(byMonthData);
  XLSX.utils.book_append_sheet(wb, byMonthWs, "לפי חודש");

  // Sheet 6: By payment method
  const byMethod: Record<string, number> = {};
  filtered.forEach((p) => {
    const method = getMethodLabel(p.method);
    byMethod[method] = (byMethod[method] || 0) + p.amount;
  });
  const byMethodData = Object.entries(byMethod).map(([method, total]) => ({
    "אמצעי תשלום": method,
    "סה\"כ": `₪${total}`,
  }));
  const byMethodWs = XLSX.utils.json_to_sheet(byMethodData);
  XLSX.utils.book_append_sheet(wb, byMethodWs, "לפי אמצעי תשלום");

  // Download
  const periodLabel = quarter ? `Q${quarter}_${year}` : year.toString();
  const fileName = `דוח_רואה_חשבון_${periodLabel}.xlsx`;
  XLSX.writeFile(wb, fileName);
}

// ============ PDF EXPORT ============
export function exportDetailedPDF(
  payments: PaymentExportData[],
  title: string = "דוח תשלומים"
) {
  const doc = new jsPDF({
    orientation: "landscape",
    unit: "mm",
    format: "a4",
  });

  // Add Hebrew font support (basic)
  doc.setFont("helvetica");
  
  // Title
  doc.setFontSize(18);
  doc.text(title, doc.internal.pageSize.getWidth() - 15, 15, { align: "right" });
  
  // Date
  doc.setFontSize(10);
  doc.text(
    `תאריך הפקה: ${format(new Date(), "dd/MM/yyyy")}`,
    doc.internal.pageSize.getWidth() - 15,
    22,
    { align: "right" }
  );

  // Table data
  const tableData = payments.map((p) => [
    p.hasReceipt ? "כן" : "לא",
    p.receiptNumber || "-",
    getMethodLabel(p.method),
    `${p.amount}`,
    p.clientName,
    formatDate(p.paidAt),
  ]);

  // Add table
  doc.autoTable({
    head: [["קבלה", "מס' קבלה", "אמצעי", "סכום", "מטופל", "תאריך"]],
    body: tableData,
    startY: 30,
    styles: { 
      font: "helvetica",
      fontSize: 10,
      halign: "right",
    },
    headStyles: {
      fillColor: [16, 185, 129],
      textColor: 255,
      halign: "right",
    },
    margin: { right: 15, left: 15 },
    tableWidth: "auto",
  });

  // Summary
  const total = payments.reduce((sum, p) => sum + p.amount, 0);
  const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY || 100;
  doc.setFontSize(12);
  doc.text(
    `סה"כ: ₪${total} | ${payments.length} תשלומים`,
    doc.internal.pageSize.getWidth() - 15,
    finalY + 10,
    { align: "right" }
  );

  // Download
  const fileName = `${title}_${format(new Date(), "yyyy-MM-dd")}.pdf`;
  doc.save(fileName);
}

// ============ ACCOUNTANT PDF ============
export function exportAccountantPDF(
  payments: PaymentExportData[],
  year: number,
  quarter?: number
) {
  // Filter by year/quarter
  let filtered = payments.filter((p) => {
    if (!p.paidAt) return false;
    const paidDate = new Date(p.paidAt);
    if (paidDate.getFullYear() !== year) return false;
    if (quarter) {
      const month = paidDate.getMonth();
      const pQuarter = Math.floor(month / 3) + 1;
      if (pQuarter !== quarter) return false;
    }
    return true;
  });

  const periodLabel = quarter ? `רבעון ${quarter} ${year}` : `שנת ${year}`;
  
  const doc = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });

  doc.setFont("helvetica");
  
  // Title
  doc.setFontSize(18);
  doc.text(`דוח לרואה חשבון - ${periodLabel}`, doc.internal.pageSize.getWidth() - 15, 20, { align: "right" });
  
  // Summary section
  doc.setFontSize(12);
  const total = filtered.reduce((sum, p) => sum + p.amount, 0);
  const withReceipt = filtered.filter(p => p.hasReceipt);
  const withoutReceipt = filtered.filter(p => !p.hasReceipt);
  
  let yPos = 35;
  doc.text(`סה"כ הכנסות: ₪${total}`, doc.internal.pageSize.getWidth() - 15, yPos, { align: "right" });
  yPos += 8;
  doc.text(`מספר תשלומים: ${filtered.length}`, doc.internal.pageSize.getWidth() - 15, yPos, { align: "right" });
  yPos += 8;
  doc.text(`עם קבלה: ${withReceipt.length} (₪${withReceipt.reduce((s, p) => s + p.amount, 0)})`, doc.internal.pageSize.getWidth() - 15, yPos, { align: "right" });
  yPos += 8;
  doc.text(`ללא קבלה: ${withoutReceipt.length} (₪${withoutReceipt.reduce((s, p) => s + p.amount, 0)})`, doc.internal.pageSize.getWidth() - 15, yPos, { align: "right" });

  // By month table
  yPos += 15;
  doc.setFontSize(14);
  doc.text("פירוט לפי חודש:", doc.internal.pageSize.getWidth() - 15, yPos, { align: "right" });
  
  const byMonth: Record<string, { total: number; count: number }> = {};
  filtered.forEach((p) => {
    if (p.paidAt) {
      const monthKey = format(new Date(p.paidAt), "MM/yyyy");
      if (!byMonth[monthKey]) {
        byMonth[monthKey] = { total: 0, count: 0 };
      }
      byMonth[monthKey].total += p.amount;
      byMonth[monthKey].count += 1;
    }
  });

  const monthData = Object.entries(byMonth)
    .sort(([a], [b]) => {
      const [mA, yA] = a.split("/").map(Number);
      const [mB, yB] = b.split("/").map(Number);
      return yA !== yB ? yA - yB : mA - mB;
    })
    .map(([month, data]) => [data.count.toString(), `₪${data.total}`, month]);

  doc.autoTable({
    head: [["תשלומים", "סכום", "חודש"]],
    body: monthData,
    startY: yPos + 5,
    styles: { 
      font: "helvetica",
      fontSize: 10,
      halign: "right",
    },
    headStyles: {
      fillColor: [59, 130, 246],
      textColor: 255,
      halign: "right",
    },
    margin: { right: 15, left: 15 },
  });

  // By payment method
  const finalY1 = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable?.finalY || 100;
  doc.setFontSize(14);
  doc.text("פירוט לפי אמצעי תשלום:", doc.internal.pageSize.getWidth() - 15, finalY1 + 15, { align: "right" });

  const byMethod: Record<string, number> = {};
  filtered.forEach((p) => {
    const method = getMethodLabel(p.method);
    byMethod[method] = (byMethod[method] || 0) + p.amount;
  });

  const methodData = Object.entries(byMethod).map(([method, total]) => [`₪${total}`, method]);

  doc.autoTable({
    head: [["סכום", "אמצעי תשלום"]],
    body: methodData,
    startY: finalY1 + 20,
    styles: { 
      font: "helvetica",
      fontSize: 10,
      halign: "right",
    },
    headStyles: {
      fillColor: [59, 130, 246],
      textColor: 255,
      halign: "right",
    },
    margin: { right: 15, left: 15 },
  });

  // Download
  const fileName = `דוח_רואה_חשבון_${quarter ? `Q${quarter}_` : ""}${year}.pdf`;
  doc.save(fileName);
}
