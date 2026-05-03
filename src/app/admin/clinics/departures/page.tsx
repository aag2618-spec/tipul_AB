"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UserMinus, Construction } from "lucide-react";

export default function ClinicDeparturesPage() {
  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-primary/15 rounded-lg">
          <UserMinus className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">תהליכי עזיבה פעילים</h1>
          <p className="text-sm text-muted-foreground">
            כל המטפלות שיזמו עזיבה (TherapistDeparture) — מעקב patient-driven
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Construction className="h-5 w-5 text-amber-500" />
            דף בבנייה — תלוי ב-PR5
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm">
            ה-DB מוכן (טבלאות TherapistDeparture + ClientDepartureChoice עם
            decisionToken). העמוד יושלם ב-PR5 (זרימת עזיבת מטפלת) ויכלול:
          </p>
          <ul className="text-sm list-disc pr-5 space-y-1 text-muted-foreground">
            <li>רשימת כל תהליכי העזיבה לפי סטטוס (PENDING/COMPLETED/CANCELLED)</li>
            <li>מעקב decisionDeadline והתראות לפני סיום</li>
            <li>פירוט בחירות מטופלים: כמה בוחרים להישאר vs ללכת</li>
            <li>אפשרות אדמין להתערב/לבטל תהליך עזיבה</li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
