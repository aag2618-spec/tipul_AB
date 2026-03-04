"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { Loader2, Building2, Receipt, Save, ArrowRight } from "lucide-react";
import Link from "next/link";

interface BusinessSettings {
  businessType: "NONE" | "EXEMPT" | "LICENSED";
  businessName: string;
  businessPhone: string;
  businessAddress: string;
  nextReceiptNumber: number;
  receiptDefaultMode: "ALWAYS" | "ASK" | "NEVER";
}

export default function BusinessSettingsPage() {
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

  // Fetch settings on load
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
      .catch((err) => {
        console.error("Failed to fetch settings:", err);
        toast.error("שגיאה בטעינת ההגדרות");
      })
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

      if (!response.ok) throw new Error("Failed to save");

      toast.success("ההגדרות נשמרו בהצלחה");
    } catch (err) {
      console.error("Failed to save settings:", err);
      toast.error("שגיאה בשמירת ההגדרות");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 max-w-4xl" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/dashboard/settings">
            <ArrowRight className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="h-6 w-6 text-primary" />
            הגדרות עסק וקבלות
          </h1>
          <p className="text-muted-foreground">
            הגדר את פרטי העסק ואופן הפקת הקבלות
          </p>
        </div>
      </div>

      <div className="space-y-6">
        {/* סוג עסק */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5" />
              סוג עסק
            </CardTitle>
            <CardDescription>
              בחר את סוג העסק שלך לקביעת אופן הפקת הקבלות
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RadioGroup
              value={settings.businessType}
              onValueChange={(value) =>
                setSettings({ ...settings, businessType: value as BusinessSettings["businessType"] })
              }
              className="space-y-4"
            >
              <div className="flex items-start gap-3 p-4 border rounded-lg hover:bg-slate-50 transition-colors">
                <RadioGroupItem value="EXEMPT" id="exempt" />
                <div className="flex-1">
                  <Label htmlFor="exempt" className="font-semibold cursor-pointer">
                    עוסק פטור
                  </Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    קבלות פנימיות עם מספור אוטומטי. מתאים לעוסקים פטורים שלא חייבים במערכת חיצונית.
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-4 border rounded-lg hover:bg-slate-50 transition-colors">
                <RadioGroupItem value="LICENSED" id="licensed" />
                <div className="flex-1">
                  <Label htmlFor="licensed" className="font-semibold cursor-pointer">
                    עוסק מורשה / חברה
                  </Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    חיבור למערכת קבלות חיצונית (iCount, חשבונית ירוקה, וכו'). 
                    <Link href="/dashboard/settings/integrations" className="text-primary hover:underline mr-1">
                      הגדר חיבור
                    </Link>
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3 p-4 border rounded-lg hover:bg-slate-50 transition-colors">
                <RadioGroupItem value="NONE" id="none" />
                <div className="flex-1">
                  <Label htmlFor="none" className="font-semibold cursor-pointer">
                    לא רוצה להוציא קבלות
                  </Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    רק תיעוד תשלומים פנימי, ללא הפקת קבלות.
                  </p>
                </div>
              </div>
            </RadioGroup>
          </CardContent>
        </Card>

        {/* פרטי עסק - מוצג רק לעוסק פטור */}
        {settings.businessType === "EXEMPT" && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Receipt className="h-5 w-5" />
                פרטי עסק לקבלה
              </CardTitle>
              <CardDescription>
                פרטים אלה יופיעו על הקבלות שתפיק
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="businessName">שם העסק</Label>
                  <Input
                    id="businessName"
                    value={settings.businessName}
                    onChange={(e) => setSettings({ ...settings, businessName: e.target.value })}
                    placeholder="לדוגמה: קליניקה לטיפול רגשי"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="businessPhone">טלפון</Label>
                  <Input
                    id="businessPhone"
                    value={settings.businessPhone}
                    onChange={(e) => setSettings({ ...settings, businessPhone: e.target.value })}
                    placeholder="050-1234567"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="businessAddress">כתובת</Label>
                <Input
                  id="businessAddress"
                  value={settings.businessAddress}
                  onChange={(e) => setSettings({ ...settings, businessAddress: e.target.value })}
                  placeholder="רחוב, עיר"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="nextReceiptNumber">מספר קבלה הבא</Label>
                <Input
                  id="nextReceiptNumber"
                  type="number"
                  min={1}
                  value={settings.nextReceiptNumber}
                  onChange={(e) => setSettings({ ...settings, nextReceiptNumber: parseInt(e.target.value) || 1 })}
                  className="w-32"
                />
                <p className="text-xs text-muted-foreground">
                  הקבלה הבאה תקבל את המספר: {new Date().getFullYear()}-{String(settings.nextReceiptNumber).padStart(4, "0")}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* ברירת מחדל לקבלות - מוצג רק אם לא NONE */}
        {settings.businessType !== "NONE" && (
          <Card>
            <CardHeader>
              <CardTitle>ברירת מחדל בתשלום</CardTitle>
              <CardDescription>
                האם להוציא קבלה אוטומטית בכל תשלום?
              </CardDescription>
            </CardHeader>
            <CardContent>
              <RadioGroup
                value={settings.receiptDefaultMode}
                onValueChange={(value) =>
                  setSettings({ ...settings, receiptDefaultMode: value as BusinessSettings["receiptDefaultMode"] })
                }
                className="space-y-3"
              >
                <div className="flex items-center gap-3">
                  <RadioGroupItem value="ALWAYS" id="always" />
                  <Label htmlFor="always" className="cursor-pointer">
                    תמיד להוציא קבלה
                  </Label>
                </div>
                <div className="flex items-center gap-3">
                  <RadioGroupItem value="ASK" id="ask" />
                  <Label htmlFor="ask" className="cursor-pointer">
                    לשאול בכל תשלום (מומלץ)
                  </Label>
                </div>
                <div className="flex items-center gap-3">
                  <RadioGroupItem value="NEVER" id="never" />
                  <Label htmlFor="never" className="cursor-pointer">
                    לעולם לא להוציא קבלה
                  </Label>
                </div>
              </RadioGroup>
            </CardContent>
          </Card>
        )}

        {/* כפתור שמירה */}
        <div className="flex justify-end">
          <Button onClick={handleSave} disabled={isSaving} className="gap-2">
            {isSaving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            שמור הגדרות
          </Button>
        </div>
      </div>
    </div>
  );
}
