"use client";

import { Card, CardContent } from "@/components/ui/card";
import { AlertCircle, CheckCircle, ArrowRight } from "lucide-react";
import { format } from "date-fns";
import { he } from "date-fns/locale";

interface PaymentSummaryViewProps {
  totalDebt: number;
  totalCredit: number;
  paidThisMonth: number;
  clientsWithDebtCount: number;
  onViewClients: () => void;
}

export function PaymentSummaryView({
  totalDebt,
  totalCredit,
  paidThisMonth,
  clientsWithDebtCount,
  onViewClients,
}: PaymentSummaryViewProps) {
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">תשלומים וחובות</h1>
        <p className="text-muted-foreground">סיכום כללי של כל המטופלים</p>
      </div>

      {/* 2 מלבנים ראשיים */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* מלבן חוב/קרדיט - לחיץ */}
        <Card
          className="cursor-pointer hover:shadow-lg transition-all hover:scale-[1.02] bg-gradient-to-br from-red-50 to-orange-50 border-red-200"
          onClick={onViewClients}
        >
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 rounded-full bg-red-100">
                <AlertCircle className="h-6 w-6 text-red-600" />
              </div>
              <h2 className="text-lg font-semibold">חובות וקרדיט</h2>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">סך חובות:</span>
                <span className="text-2xl font-bold text-red-600">₪{totalDebt.toFixed(0)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">סך קרדיט:</span>
                <span className="text-xl font-bold text-green-600">₪{totalCredit.toFixed(0)}</span>
              </div>
              <div className="pt-2 border-t">
                <p className="text-sm text-muted-foreground">
                  {clientsWithDebtCount} מטופלים עם חוב
                </p>
              </div>
            </div>
            <div className="mt-4 text-sm text-primary flex items-center gap-1">
              לחץ לצפייה בפירוט
              <ArrowRight className="h-4 w-4" />
            </div>
          </CardContent>
        </Card>

        {/* מלבן שולם החודש */}
        <Card className="bg-gradient-to-br from-green-50 to-emerald-50 border-green-200">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 rounded-full bg-green-100">
                <CheckCircle className="h-6 w-6 text-green-600" />
              </div>
              <h2 className="text-lg font-semibold">שולם החודש</h2>
            </div>
            <div className="space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground">סה"כ:</span>
                <span className="text-2xl font-bold text-green-600">₪{paidThisMonth.toFixed(0)}</span>
              </div>
              <div className="pt-2 border-t">
                <p className="text-sm text-muted-foreground">
                  {format(new Date(), "MMMM yyyy", { locale: he })}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
