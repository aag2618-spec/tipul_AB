"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Building2, Plus, Construction } from "lucide-react";
import Link from "next/link";

export default function AdminClinicsListPage() {
  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-wrap gap-4 items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/15 rounded-lg">
            <Building2 className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">קליניקות רב-מטפלים</h1>
            <p className="text-sm text-muted-foreground">
              רשימת כל ה-Organizations במערכת
            </p>
          </div>
        </div>
        <Button disabled title="ייוצר ב-PR3 חלק ב'2">
          <Plus className="ml-2 h-4 w-4" />
          קליניקה חדשה
        </Button>
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
            תשתית ה-DB מוכנה (טבלאות Organization + ClinicPricingPlan נוצרו).
            עמוד זה יושלם בחלק ב&apos;2 של PR3 ויכלול:
          </p>
          <ul className="text-sm list-disc pr-5 space-y-1 text-muted-foreground">
            <li>רשימת כל הקליניקות עם חיפוש וסינון לפי תוכנית/סטטוס מנוי</li>
            <li>יצירת קליניקה חדשה (שיוך בעלים + תוכנית תמחור)</li>
            <li>תצוגת קליניקה: חברים, חיוב, היסטוריית פעולות</li>
            <li>עריכה: שינוי תוכנית, החלפת בעלות, הענקת חוזה מותאם</li>
          </ul>
          <div className="flex gap-2 pt-2 flex-wrap">
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/pricing/clinic-plans">
                <Plus className="ml-2 h-3.5 w-3.5" />
                ניהול תוכניות תמחור
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
