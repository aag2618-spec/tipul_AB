"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Settings, Construction } from "lucide-react";

export default function ClinicSettingsPage() {
  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-primary/15 rounded-lg">
          <Settings className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">הגדרות קליניקה</h1>
          <p className="text-sm text-muted-foreground">
            פרטי עסק, לוגו, פרטי חיוב, הגדרות תקשורת
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
            עמוד זה יאפשר לבעלי הקליניקה לערוך את פרטי העסק, ללא צורך בפנייה לאדמין.
            בינתיים — אדמין יכול לערוך מהממשק שלו.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
