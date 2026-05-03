"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MessageSquare, Construction } from "lucide-react";

export default function SmsPackagesPage() {
  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-primary/15 rounded-lg">
          <MessageSquare className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">חבילות SMS</h1>
          <p className="text-sm text-muted-foreground">
            ניהול ה-Package הקיימים (CRUD על מודל Package שכבר במערכת)
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
            מודל Package כבר קיים בסכמה (לא נדרש שינוי DB). עמוד זה יושלם ב-PR3
            חלק ב&apos;2 ויכלול:
          </p>
          <ul className="text-sm list-disc pr-5 space-y-1 text-muted-foreground">
            <li>CRUD על חבילות SMS ניתנות לרכישה (כמות SMS, מחיר, תוקף)</li>
            <li>היסטוריית רכישות (UserPackagePurchase)</li>
            <li>סטטיסטיקות שימוש</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
