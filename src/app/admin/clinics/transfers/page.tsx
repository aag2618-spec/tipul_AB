"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeftRight, Construction } from "lucide-react";

export default function ClinicTransfersPage() {
  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-primary/15 rounded-lg">
          <ArrowLeftRight className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">העברות מטופלים</h1>
          <p className="text-sm text-muted-foreground">
            לוג כל ההעברות בין מטפלים בכל הקליניקות (ClientTransferLog)
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
            טבלת ClientTransferLog מוכנה ב-DB עם snapshot של שמות מטפלים. עמוד זה
            יוצג ב-PR3 חלק ב&apos;2 ויכלול:
          </p>
          <ul className="text-sm list-disc pr-5 space-y-1 text-muted-foreground">
            <li>טבלה של כל העברות המטופלים בכל הקליניקות</li>
            <li>סינון לפי קליניקה / מטפל מקור / מטפל יעד / תאריך</li>
            <li>פירוט הסיבה והאדם שביצע</li>
            <li>קישור למטופל ולקליניקה</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
