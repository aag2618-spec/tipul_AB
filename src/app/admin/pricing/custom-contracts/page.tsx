"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FileSignature, Construction } from "lucide-react";

export default function CustomContractsPage() {
  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-primary/15 rounded-lg">
          <FileSignature className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">חוזים מותאמים</h1>
          <p className="text-sm text-muted-foreground">
            CustomContract — חוזה מותאם פר-קליניקה שגובר על תוכנית התמחור
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Construction className="h-5 w-5 text-amber-500" />
            דף בבנייה
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm">
            טבלת CustomContract מוכנה (1-1 לכל Organization, גובר על
            ClinicPricingPlan). העמוד יושלם ב-PR3 חלק ב&apos;2 ויכלול:
          </p>
          <ul className="text-sm list-disc pr-5 space-y-1 text-muted-foreground">
            <li>רשימת כל החוזים הפעילים והעבר</li>
            <li>יצירת חוזה חדש (קליניקה + מחיר חודשי + טווח תאריכים + auto-renew)</li>
            <li>התראות חידוש (60/30/14/7 ימים לפני endDate)</li>
            <li>העלאת PDF חתום (signedDocumentUrl)</li>
            <li>עליית מחיר שנתית (annualIncreasePct) אוטומטית</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
