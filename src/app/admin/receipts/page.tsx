// src/app/admin/receipts/page.tsx
// רשימת כל קבלות Cardcom של ADMIN — חיפוש/סינון/ניקיון.

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import prisma from "@/lib/prisma";
import { ReceiptsTable } from "./receipts-table";

export const dynamic = "force-dynamic";

export default async function ReceiptsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  if (!hasPermission(session.user.role, "receipts.view")) redirect("/admin");

  const isAdmin = session.user.role === "ADMIN";

  // Initial page load — first 50 receipts
  const receipts = await prisma.cardcomInvoice.findMany({
    take: 50,
    orderBy: { issuedAt: "desc" },
    select: {
      id: true,
      cardcomDocumentNumber: true,
      cardcomDocumentType: true,
      pdfUrl: true,
      localPdfPath: true,
      allocationNumber: true,
      amount: true,
      currency: true,
      description: true,
      status: true,
      issuedAt: true,
      subscriberNameSnapshot: true,
      subscriberEmailSnapshot: true,
      issuerBusinessType: true,
      vatAmount: true,
    },
  });

  // Aggregate totals (current year + current month)
  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [yearAggregate, monthAggregate] = await Promise.all([
    prisma.cardcomInvoice.aggregate({
      where: { issuedAt: { gte: yearStart }, status: "ISSUED" },
      _sum: { amount: true },
      _count: true,
    }),
    prisma.cardcomInvoice.aggregate({
      where: { issuedAt: { gte: monthStart }, status: "ISSUED" },
      _sum: { amount: true },
      _count: true,
    }),
  ]);

  const totals = {
    yearAmount: Number(yearAggregate._sum.amount ?? 0),
    yearCount: yearAggregate._count,
    monthAmount: Number(monthAggregate._sum.amount ?? 0),
    monthCount: monthAggregate._count,
  };

  const items = receipts.map((r) => ({
    id: r.id,
    documentNumber: r.cardcomDocumentNumber,
    documentType: r.cardcomDocumentType,
    pdfUrl: r.pdfUrl,
    hasLocalBackup: !!r.localPdfPath,
    allocationNumber: r.allocationNumber,
    amount: Number(r.amount) || 0,
    currency: r.currency,
    description: r.description,
    status: r.status,
    issuedAt: r.issuedAt.toISOString(),
    subscriberName: r.subscriberNameSnapshot,
    subscriberEmail: r.subscriberEmailSnapshot,
    issuerBusinessType: r.issuerBusinessType,
    vatAmount: r.vatAmount ? Number(r.vatAmount) : null,
  }));

  return (
    <div className="container mx-auto py-8 px-4 max-w-7xl" dir="rtl">
      <h1 className="text-2xl font-bold mb-2">קבלות וחשבוניות</h1>
      <p className="text-sm text-gray-600 mb-6">
        רשימת כל הקבלות והחשבוניות שהונפקו דרך Cardcom. ה-PDF נשמר אצל Cardcom (ולגיבוי גם מקומית).
      </p>

      {/* סיכום */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow-sm border p-4">
          <div className="text-sm text-gray-500">סה"כ השנה</div>
          <div className="text-2xl font-bold mt-1">
            ₪{totals.yearAmount.toLocaleString("he-IL", { maximumFractionDigits: 2 })}
          </div>
          <div className="text-xs text-gray-500 mt-1">{totals.yearCount} קבלות</div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border p-4">
          <div className="text-sm text-gray-500">החודש</div>
          <div className="text-2xl font-bold mt-1">
            ₪{totals.monthAmount.toLocaleString("he-IL", { maximumFractionDigits: 2 })}
          </div>
          <div className="text-xs text-gray-500 mt-1">{totals.monthCount} קבלות</div>
        </div>
      </div>

      <ReceiptsTable initialItems={items} canVoid={isAdmin} />
    </div>
  );
}
