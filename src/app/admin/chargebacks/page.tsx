// src/app/admin/chargebacks/page.tsx
// רשימת ChargebackEvent — חיובים שהוחזרו על ידי Cardcom או הלקוח (לא ע"י המנהל).
// משמש לניטור אצלנו והתאמת ספרים מקומית (refund/void) מול Cardcom.

import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { hasPermission } from "@/lib/permissions";
import prisma from "@/lib/prisma";
import { ChargebacksTable } from "./chargebacks-table";

export const dynamic = "force-dynamic";

export default async function ChargebacksPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  if (!hasPermission(session.user.role, "billing.cardcom.view_transactions")) {
    redirect("/admin");
  }

  const canReview = hasPermission(session.user.role, "payments.refund");

  // Initial load — first 50, newest first
  const rows = await prisma.chargebackEvent.findMany({
    take: 50,
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      cardcomTransactionId: true,
      tenant: true,
      operation: true,
      amount: true,
      currency: true,
      reviewedAt: true,
      reviewNote: true,
      reconciled: true,
      createdAt: true,
      cardcomTransaction: {
        select: {
          transactionId: true,
          cardLast4: true,
          cardHolder: true,
          paymentId: true,
          subscriptionPaymentId: true,
          user: { select: { id: true, name: true, email: true } },
        },
      },
    },
  });

  // Aggregate counters for at-a-glance health
  const [openCount, unreconciledCount, totalAmountAgg] = await Promise.all([
    prisma.chargebackEvent.count({ where: { reviewedAt: null } }),
    prisma.chargebackEvent.count({ where: { reconciled: false } }),
    prisma.chargebackEvent.aggregate({
      where: { reconciled: false },
      _sum: { amount: true },
    }),
  ]);

  const items = rows.map((r) => ({
    id: r.id,
    transactionId: r.cardcomTransactionId,
    cardcomTransactionExternalId: r.cardcomTransaction?.transactionId ?? null,
    tenant: r.tenant,
    operation: r.operation,
    amount: Number(r.amount) || 0,
    currency: r.currency,
    reviewedAt: r.reviewedAt?.toISOString() ?? null,
    reviewNote: r.reviewNote,
    reconciled: r.reconciled,
    createdAt: r.createdAt.toISOString(),
    cardLast4: r.cardcomTransaction?.cardLast4 ?? null,
    cardHolder: r.cardcomTransaction?.cardHolder ?? null,
    userName: r.cardcomTransaction?.user?.name ?? null,
    userEmail: r.cardcomTransaction?.user?.email ?? null,
    userId: r.cardcomTransaction?.user?.id ?? null,
    paymentId: r.cardcomTransaction?.paymentId ?? null,
    subscriptionPaymentId: r.cardcomTransaction?.subscriptionPaymentId ?? null,
  }));

  const totalUnreconciledAmount = Number(totalAmountAgg._sum.amount ?? 0);

  return (
    <div className="container mx-auto py-8 px-4 max-w-7xl" dir="rtl">
      <h1 className="text-2xl font-bold mb-2">החזרות חיוב (Chargebacks)</h1>
      <p className="text-sm text-gray-600 mb-6">
        רשימת אירועי החזרת חיוב שזוהו מ-Cardcom. כל שורה דורשת בדיקה והתאמה (refund/void) בצד שלנו
        כדי להתאים את הספרים. שורות שלא הותאמו עדיין מסומנות באדום.
      </p>

      {/* קופסת סטטוס */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-lg shadow-sm border p-4">
          <div className="text-sm text-gray-500">ממתין לבדיקה</div>
          <div className={`text-2xl font-bold mt-1 ${openCount > 0 ? "text-amber-700" : ""}`}>
            {openCount}
          </div>
          <div className="text-xs text-gray-500 mt-1">לא נסקרו על ידי מנהל</div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border p-4">
          <div className="text-sm text-gray-500">לא הותאמו</div>
          <div className={`text-2xl font-bold mt-1 ${unreconciledCount > 0 ? "text-red-700" : ""}`}>
            {unreconciledCount}
          </div>
          <div className="text-xs text-gray-500 mt-1">דורשים ביטול חיוב או החזר כספי בצד שלנו</div>
        </div>
        <div className="bg-white rounded-lg shadow-sm border p-4">
          <div className="text-sm text-gray-500">סכום לא מותאם</div>
          <div className="text-2xl font-bold mt-1">
            <span dir="ltr">
              ₪{totalUnreconciledAmount.toLocaleString("he-IL", { maximumFractionDigits: 2 })}
            </span>
          </div>
          <div className="text-xs text-gray-500 mt-1">סכום כולל של החזרות חיוב פתוחות</div>
        </div>
      </div>

      <ChargebacksTable initialItems={items} canReview={canReview} />
    </div>
  );
}
