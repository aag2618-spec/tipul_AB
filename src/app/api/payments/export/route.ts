// src/app/api/payments/export/route.ts
// API לייצוא תשלומים לקובץ CSV/Excel עבור רו"ח

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "לא מורשה" }, { status: 401 });
    }

    // קבלת פרמטרים מ-URL
    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const status = searchParams.get("status"); // PAID, PENDING, ALL
    const format = searchParams.get("format") || "csv"; // csv or json

    // בניית query
    const where: any = {
      client: {
        therapistId: session.user.id,
      },
    };

    // סינון לפי תאריך
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) {
        where.createdAt.gte = new Date(startDate);
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        where.createdAt.lte = end;
      }
    }

    // סינון לפי סטטוס
    if (status && status !== "ALL") {
      where.status = status;
    }

    // שליפת התשלומים
    const payments = await prisma.payment.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: {
        client: {
          select: {
            name: true,
            email: true,
            phone: true,
          },
        },
        session: {
          select: {
            startTime: true,
          },
        },
      },
    });

    // המרת שיטת תשלום לעברית
    const methodNames: Record<string, string> = {
      CASH: "מזומן",
      CREDIT_CARD: "אשראי",
      BANK_TRANSFER: "העברה בנקאית",
      CHECK: "צ'ק",
      CREDIT: "קרדיט",
      OTHER: "אחר",
    };

    const statusNames: Record<string, string> = {
      PENDING: "ממתין",
      PAID: "שולם",
      CANCELLED: "בוטל",
      REFUNDED: "הוחזר",
    };

    const typeNames: Record<string, string> = {
      FULL: "מלא",
      PARTIAL: "חלקי",
      ADVANCE: "מקדמה",
    };

    if (format === "json") {
      // החזרת JSON
      const data = payments.map((p) => ({
        תאריך: p.paidAt ? new Date(p.paidAt).toLocaleDateString("he-IL") : new Date(p.createdAt).toLocaleDateString("he-IL"),
        שם_מטופל: p.client.name,
        סכום: Number(p.amount),
        סכום_צפוי: Number(p.expectedAmount || p.amount),
        שיטת_תשלום: methodNames[p.method] || p.method,
        סוג: typeNames[p.paymentType] || p.paymentType,
        סטטוס: statusNames[p.status] || p.status,
        מספר_קבלה: p.receiptNumber || "-",
        קישור_קבלה: p.receiptUrl || "-",
        הערות: p.notes || "-",
      }));

      return NextResponse.json(data);
    }

    // יצירת CSV
    const headers = [
      "תאריך",
      "שם מטופל",
      "אימייל",
      "טלפון",
      "סכום",
      "סכום צפוי",
      "שיטת תשלום",
      "סוג תשלום",
      "סטטוס",
      "מספר קבלה",
      "קישור לקבלה",
      "תאריך פגישה",
      "הערות",
    ];

    const rows = payments.map((p) => [
      p.paidAt ? new Date(p.paidAt).toLocaleDateString("he-IL") : new Date(p.createdAt).toLocaleDateString("he-IL"),
      p.client.name,
      p.client.email || "-",
      p.client.phone || "-",
      Number(p.amount).toFixed(2),
      Number(p.expectedAmount || p.amount).toFixed(2),
      methodNames[p.method] || p.method,
      typeNames[p.paymentType] || p.paymentType,
      statusNames[p.status] || p.status,
      p.receiptNumber || "-",
      p.receiptUrl || "-",
      p.session?.startTime ? new Date(p.session.startTime).toLocaleDateString("he-IL") : "-",
      p.notes?.replace(/[\n\r,]/g, " ") || "-",
    ]);

    // בניית CSV עם BOM לתמיכה בעברית ב-Excel
    const BOM = "\uFEFF";
    const csvContent = BOM + 
      headers.join(",") + "\n" + 
      rows.map((row) => row.map((cell) => `"${cell}"`).join(",")).join("\n");

    // סיכום
    const totalAmount = payments.reduce((sum, p) => sum + Number(p.amount), 0);
    const paidAmount = payments
      .filter((p) => p.status === "PAID")
      .reduce((sum, p) => sum + Number(p.amount), 0);

    // הוספת שורת סיכום
    const summaryRow = `\n\n"סה"כ תשלומים","${payments.length}","","","${totalAmount.toFixed(2)}","","","","",""`;
    const paidSummaryRow = `\n"סה"כ ששולם","${payments.filter(p => p.status === "PAID").length}","","","${paidAmount.toFixed(2)}","","","","",""`;

    const finalCsv = csvContent + summaryRow + paidSummaryRow;

    // יצירת שם קובץ
    const fileName = `payments_${new Date().toISOString().split("T")[0]}.csv`;

    return new NextResponse(finalCsv, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${fileName}"`,
      },
    });
  } catch (error) {
    console.error("Export payments error:", error);
    return NextResponse.json(
      { error: "שגיאה בייצוא התשלומים" },
      { status: 500 }
    );
  }
}
