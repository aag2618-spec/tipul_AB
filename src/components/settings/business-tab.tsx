"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Loader2, Building2, Receipt, Save, Calendar, FileText } from "lucide-react";

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
  const [defaultSessionDuration, setDefaultSessionDuration] = useState(50);
  const [settings, setSettings] = useState<BusinessSettings>({
    businessType: "NONE",
    businessName: "",
    businessPhone: "",
    businessAddress: "",
    nextReceiptNumber: 1,
    receiptDefaultMode: "ASK",
  });
  const [receiptEmailSettings, setReceiptEmailSettings] = useState({
    sendPaymentReceipt: false,
    sendReceiptToClient: true,
    sendReceiptToTherapist: false,
  });
  const [fullCommSettings, setFullCommSettings] = useState<Record<string, unknown> | null>(null);

  useEffect(() => {
    Promise.all([
      fetch("/api/user/business-settings", { cache: "no-store" }).then((res) => res.json()),
      fetch("/api/user/profile", { cache: "no-store" }).then((res) => res.json()),
      fetch("/api/user/communication-settings", { cache: "no-store" }).then(r => r.ok ? r.json() : null),
    ]).then(([bizData, profileData, commData]) => {
      setSettings({
        businessType: bizData.businessType || "NONE",
        businessName: bizData.businessName || "",
        businessPhone: bizData.businessPhone || "",
        businessAddress: bizData.businessAddress || "",
        nextReceiptNumber: bizData.nextReceiptNumber || 1,
        receiptDefaultMode: bizData.receiptDefaultMode || "ASK",
      });
      setDefaultSessionDuration(profileData.defaultSessionDuration || 50);
      if (commData?.settings) {
        setFullCommSettings(commData.settings);
        setReceiptEmailSettings({
          sendPaymentReceipt: commData.settings.sendPaymentReceipt ?? false,
          sendReceiptToClient: commData.settings.sendReceiptToClient ?? true,
          sendReceiptToTherapist: commData.settings.sendReceiptToTherapist ?? false,
        });
      }
    })
      .catch(() => toast.error("שגיאה בטעינת ההגדרות"))
      .finally(() => setIsLoading(false));
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const promises: Promise<Response>[] = [
        fetch("/api/user/business-settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(settings),
        }),
        fetch("/api/user/profile", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ defaultSessionDuration }),
        }),
      ];
      if (fullCommSettings) {
        promises.push(
          fetch("/api/user/communication-settings", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ...fullCommSettings, ...receiptEmailSettings }),
          })
        );
      }
      const results = await Promise.all(promises);
      if (results.some(r => !r.ok)) throw new Error();
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
      <Card className="border-primary/20 bg-gradient-to-br from-sky-50/50 to-indigo-50/50 dark:from-sky-950/20 dark:to-indigo-950/20">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            <CardTitle>הגדרות יומן ופגישות</CardTitle>
          </div>
          <CardDescription>
            הגדרות כלליות החלות על כל היומן וכל הפגישות שתיצור
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="sessionDuration" className="text-base font-semibold">
              משך זמן ברירת מחדל לפגישה
            </Label>
            <p className="text-xs text-muted-foreground">כשתיצור פגישה חדשה, משך הזמן יוגדר אוטומטית לערך הזה. ניתן לשנות לכל פגישה בנפרד.</p>
            <div className="flex items-center gap-3">
              <Input
                id="sessionDuration"
                type="number"
                min="15"
                max="180"
                step="5"
                value={defaultSessionDuration}
                onChange={(e) => setDefaultSessionDuration(parseInt(e.target.value) || 50)}
                disabled={isSaving}
                className="max-w-[120px] text-lg font-semibold"
              />
              <span className="text-muted-foreground">דקות</span>
            </div>
            <p className="text-sm text-muted-foreground">
              מומלץ: 45-50 דקות (משך טיפול סטנדרטי)
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            סוג עסק
          </CardTitle>
          <CardDescription>בחר את סוג העסק שלך - זה קובע כיצד מופקות קבלות עבור תשלומי מטופלים</CardDescription>
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
                <p className="text-sm text-muted-foreground">המערכת תפיק קבלות פנימיות עם מספור רץ אוטומטי. מתאים לעוסקים פטורים שלא צריכים חשבונית מס.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 border rounded-lg hover:bg-slate-50 transition-colors">
              <RadioGroupItem value="LICENSED" id="licensed" />
              <div className="flex-1">
                <Label htmlFor="licensed" className="font-semibold cursor-pointer">עוסק מורשה / חברה</Label>
                <p className="text-sm text-muted-foreground">הקבלות יופקו דרך מערכת חיצונית (כמו iCount או חשבונית ירוקה). חבר את הספק בטאב &quot;חיבורים&quot;.</p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 border rounded-lg hover:bg-slate-50 transition-colors">
              <RadioGroupItem value="NONE" id="none" />
              <div className="flex-1">
                <Label htmlFor="none" className="font-semibold cursor-pointer">לא רוצה קבלות</Label>
                <p className="text-sm text-muted-foreground">רק תיעוד תשלומים פנימי במערכת, ללא הפקת קבלות.</p>
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
            <CardDescription>הפרטים האלו יופיעו על כל קבלה שתופק למטופלים</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>שם העסק</Label>
                <p className="text-xs text-muted-foreground">שם הקליניקה או העסק שיופיע בכותרת הקבלה</p>
                <Input value={settings.businessName} onChange={(e) => setSettings({ ...settings, businessName: e.target.value })} placeholder="לדוגמה: קליניקה לטיפול רגשי" />
              </div>
              <div className="space-y-2">
                <Label>טלפון</Label>
                <p className="text-xs text-muted-foreground">טלפון העסק שיופיע בקבלה</p>
                <Input value={settings.businessPhone} onChange={(e) => setSettings({ ...settings, businessPhone: e.target.value })} placeholder="050-1234567" />
              </div>
            </div>
            <div className="space-y-2">
              <Label>כתובת</Label>
              <p className="text-xs text-muted-foreground">כתובת העסק שתופיע בקבלה</p>
              <Input value={settings.businessAddress} onChange={(e) => setSettings({ ...settings, businessAddress: e.target.value })} placeholder="רחוב, עיר" />
            </div>
            <div className="space-y-2">
              <Label>מספר קבלה הבא</Label>
              <p className="text-xs text-muted-foreground">הקבלה הבאה שתופק תקבל את המספר הזה. המערכת מעלה אוטומטית ב-1 אחרי כל קבלה.</p>
              <Input type="number" min={1} value={settings.nextReceiptNumber} onChange={(e) => setSettings({ ...settings, nextReceiptNumber: parseInt(e.target.value) || 1 })} className="w-32" />
            </div>
          </CardContent>
        </Card>
      )}

      {settings.businessType !== "NONE" && (
        <Card>
          <CardHeader>
            <CardTitle>ברירת מחדל בתשלום</CardTitle>
            <CardDescription>מה יקרה כשתרשום תשלום של מטופל?</CardDescription>
          </CardHeader>
          <CardContent>
            <RadioGroup
              value={settings.receiptDefaultMode}
              onValueChange={(value) => setSettings({ ...settings, receiptDefaultMode: value as BusinessSettings["receiptDefaultMode"] })}
              className="space-y-2"
            >
              <div className="flex items-start gap-3 p-2">
                <RadioGroupItem value="ALWAYS" id="always" />
                <div>
                  <Label htmlFor="always" className="cursor-pointer">תמיד להוציא קבלה</Label>
                  <p className="text-xs text-muted-foreground">בכל תשלום שתרשום, קבלה תופק אוטומטית ללא שאלות</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-2">
                <RadioGroupItem value="ASK" id="ask" />
                <div>
                  <Label htmlFor="ask" className="cursor-pointer">לשאול בכל תשלום (מומלץ)</Label>
                  <p className="text-xs text-muted-foreground">בכל תשלום תישאל האם להפיק קבלה - מאפשר גמישות</p>
                </div>
              </div>
              <div className="flex items-start gap-3 p-2">
                <RadioGroupItem value="NEVER" id="never" />
                <div>
                  <Label htmlFor="never" className="cursor-pointer">לא להוציא קבלה</Label>
                  <p className="text-xs text-muted-foreground">תשלומים יתועדו במערכת בלבד, ללא הפקת קבלות</p>
                </div>
              </div>
            </RadioGroup>
          </CardContent>
        </Card>
      )}

      {settings.businessType !== "NONE" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              קבלות תשלום אוטומטיות
            </CardTitle>
            <CardDescription>שליחת קבלות במייל אוטומטית אחרי כל תשלום</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <div className="space-y-0.5">
                <Label>שלח קבלה למטופל</Label>
                <p className="text-xs text-muted-foreground">המטופל יקבל את הקבלה אוטומטית למייל שלו אחרי כל תשלום</p>
              </div>
              <Switch
                checked={receiptEmailSettings.sendReceiptToClient}
                onCheckedChange={(checked) => setReceiptEmailSettings({
                  ...receiptEmailSettings,
                  sendReceiptToClient: checked,
                  sendPaymentReceipt: checked || receiptEmailSettings.sendReceiptToTherapist,
                })}
              />
            </div>
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <div className="space-y-0.5">
                <Label>שלח עותק אלי (למטפל)</Label>
                <p className="text-xs text-muted-foreground">תקבל עותק של כל קבלה למייל שלך לצורך תיעוד ומעקב</p>
              </div>
              <Switch
                checked={receiptEmailSettings.sendReceiptToTherapist}
                onCheckedChange={(checked) => setReceiptEmailSettings({
                  ...receiptEmailSettings,
                  sendReceiptToTherapist: checked,
                  sendPaymentReceipt: checked || receiptEmailSettings.sendReceiptToClient,
                })}
              />
            </div>
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
