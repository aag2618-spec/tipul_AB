"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Receipt, Construction } from "lucide-react";

export default function ClinicBillingPage() {
  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-primary/15 rounded-lg">
          <Receipt className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">חיוב ומחיר</h1>
          <p className="text-sm text-muted-foreground">
            פירוט המחיר החודשי האפקטיבי, היסטוריית חיוב, חוזה מותאם
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
            עמוד זה יושלם בקרוב. בינתיים — לחצ/י על &ldquo;פירוט מלא&rdquo; בעמוד הסקירה
            הראשית כדי לראות את התמחור החודשי האפקטיבי.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
