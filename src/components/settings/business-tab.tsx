"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { Loader2, Building2, Receipt, Save } from "lucide-react";
import Link from "next/link";

interface BusinessSettings {
  businessType: "NONE" | "EXEMPT" | "LICENSED";
  businessName: string;
  businessPhone: string;
  businessAddress: string;
  nextReceiptNumber: number;
  receiptDefaultMode: "ALWAYS" | "ASK" | "NEVER";
}

export function BusinessTab() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [settings, setSettings] = useState<BusinessSettings>({
    businessType: "NONE",
    businessName: "",
    businessPhone: "",
    businessAddress: "",
    nextReceiptNumber: 1,
    receiptDefaultMode: "ASK",
  });

  useEffect(() => {
    fetch("/api/user/business-settings")
      .then((res) => res.json())
      .then((data) => {
        setSettings({
          businessType: data.businessType || "NONE",
          businessName: data.businessName || "",
          businessPhone: data.businessPhone || "",
          businessAddress: data.businessAddress || "",
          nextReceiptNumber: data.nextReceiptNumber || 1,
          receiptDefaultMode: data.receiptDefaultMode || "ASK",
        });
      })
      .catch(() => toast.error("שגיאה בטעינת ההגדרות"))
      .finally(() => setIsLoading(false));
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await fetch("/api/user/business-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!response.ok) throw new Error();
      toast.success("ההגדרות נשמרו");
    } catch {
      toast.error("שגיאה בשמירה");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return <div className="h-[30vh] flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            סוג עסק
          </CardTitle>
          <CardDescription>בחר את סוג העסק לקביעת אופן הפקת הקבלות</CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup
            value={settings.businessType}
            onValueChange={(value) => setSettings({ ...settings, businessType: value as BusinessSettings["businessType"] })}
            className="space-y-3"
          >
            <div className="flex items-start gap-3 p-3 border rounded-lg hover:bg-slate-50 transition-colors">
              <RadioGroupItem value="EXEMPT" id="exempt" />
              <div className="flex-1">
                <Label htmlFor="exempt" className="font-semibold cursor-pointer">עוסק פטור</Label>
                <p className="text-sm text-muted-foreground">קבלות פנימיות עם מספור אוטומטי</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 border rounded-lg hover:bg-slate-50 transition-colors">
              <RadioGroupItem value="LICENSED" id="licensed" />
              <div className="flex-1">
                <Label htmlFor="licensed" className="font-semibold cursor-pointer">עוסק מורשה / חברה</Label>
                <p className="text-sm text-muted-foreground">חיבור למערכת קבלות חיצונית (הגדר בטאב "חיבורים")</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 border rounded-lg hover:bg-slate-50 transition-colors">
              <RadioGroupItem value="NONE" id="none" />
              <div className="flex-1">
                <Label htmlFor="none" className="font-semibold cursor-pointer">לא רוצה קבלות</Label>
                <p className="text-sm text-muted-foreground">רק תיעוד תשלומים פנימי</p>
              </div>
            </div>
          </RadioGroup>
        </CardContent>
      </Card>

      {settings.businessType === "EXEMPT" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="h-5 w-5" />
              פרטי עסק לקבלה
            </CardTitle>
            <CardDescription>פרטים אלו יופיעו על הקבלות</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>שם העסק</Label>
                <Input value={settings.businessName} onChange={(e) => setSettings({ ...settings, businessName: e.target.value })} placeholder="לדוגמה: קליניקה לטיפול רגשי" />
              </div>
              <div className="space-y-2">
                <Label>טלפון</Label>
                <Input value={settings.businessPhone} onChange={(e) => setSettings({ ...settings, businessPhone: e.target.value })} placeholder="050-1234567" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>כתובת</Label>
              <Input value={settings.businessAddress} onChange={(e) => setSettings({ ...settings, businessAddress: e.target.value })} placeholder="רחוב, עיר" />
            </div>
            <div className="space-y-2">
              <Label>מספר קבלה הבא</Label>
              <Input type="number" min={1} value={settings.nextReceiptNumber} onChange={(e) => setSettings({ ...settings, nextReceiptNumber: parseInt(e.target.value) || 1 })} className="w-32" />
            </div>
          </CardContent>
        </Card>
      )}

      {settings.businessType !== "NONE" && (
        <Card>
          <CardHeader>
            <CardTitle>ברירת מחדל בתשלום</CardTitle>
            <CardDescription>האם להוציא קבלה אוטומטית?</CardDescription>
          </CardHeader>
          <CardContent>
            <RadioGroup
              value={settings.receiptDefaultMode}
              onValueChange={(value) => setSettings({ ...settings, receiptDefaultMode: value as BusinessSettings["receiptDefaultMode"] })}
              className="space-y-2"
            >
              <div className="flex items-center gap-3">
                <RadioGroupItem value="ALWAYS" id="always" />
                <Label htmlFor="always" className="cursor-pointer">תמיד להוציא קבלה</Label>
              </div>
              <div className="flex items-center gap-3">
                <RadioGroupItem value="ASK" id="ask" />
                <Label htmlFor="ask" className="cursor-pointer">לשאול בכל תשלום (מומלץ)</Label>
              </div>
              <div className="flex items-center gap-3">
                <RadioGroupItem value="NEVER" id="never" />
                <Label htmlFor="never" className="cursor-pointer">לא להוציא קבלה</Label>
              </div>
            </RadioGroup>
          </CardContent>
        </Card>
      )}

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={isSaving} size="lg" className="gap-2">
          {isSaving ? <Loader2 className="h-5 w-5 animate-spin" /> : <Save className="h-5 w-5" />}
          שמור
        </Button>
      </div>
    </div>
  );
}
