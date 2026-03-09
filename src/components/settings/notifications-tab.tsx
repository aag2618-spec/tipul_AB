"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Save, Bell, Mail, MessageSquare, Clock, CreditCard, Sparkles, FileText } from "lucide-react";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";

interface NotificationSettings {
  emailEnabled: boolean;
  pushEnabled: boolean;
  morningTime: string;
  eveningTime: string;
  debtThresholdDays: number;
  monthlyReminderDay: number | null;
}

interface SMSSettings {
  enabled: boolean;
  hoursBeforeReminder: number;
  customMessage: string | null;
  sendOnWeekends: boolean;
}

interface CommunicationSettings {
  sendConfirmationEmail: boolean;
  send24hReminder: boolean;
  send2hReminder: boolean;
  customReminderEnabled: boolean;
  customReminderHours: number;
  allowClientCancellation: boolean;
  minCancellationHours: number;
  sendDebtReminders: boolean;
  debtReminderDayOfMonth: number;
  debtReminderMinAmount: number;
  sendPaymentReceipt: boolean;
  sendReceiptToClient: boolean;
  sendReceiptToTherapist: boolean;
  receiptEmailTemplate: string | null;
  paymentInstructions: string | null;
  paymentLink: string | null;
  emailSignature: string | null;
  logoUrl: string | null;
  customGreeting: string | null;
  customClosing: string | null;
  businessHours: string | null;
}

export function NotificationsTab() {
  const [notifSettings, setNotifSettings] = useState<NotificationSettings>({
    emailEnabled: true,
    pushEnabled: true,
    morningTime: "08:00",
    eveningTime: "20:00",
    debtThresholdDays: 30,
    monthlyReminderDay: null,
  });
  const [smsSettings, setSmsSettings] = useState<SMSSettings>({
    enabled: false,
    hoursBeforeReminder: 24,
    customMessage: null,
    sendOnWeekends: false,
  });
  const [commSettings, setCommSettings] = useState<CommunicationSettings>({
    sendConfirmationEmail: true,
    send24hReminder: true,
    send2hReminder: false,
    customReminderEnabled: false,
    customReminderHours: 2,
    allowClientCancellation: true,
    minCancellationHours: 24,
    sendDebtReminders: false,
    debtReminderDayOfMonth: 1,
    debtReminderMinAmount: 50,
    sendPaymentReceipt: false,
    sendReceiptToClient: true,
    sendReceiptToTherapist: false,
    receiptEmailTemplate: null,
    paymentInstructions: null,
    paymentLink: null,
    emailSignature: null,
    logoUrl: null,
    customGreeting: null,
    customClosing: null,
    businessHours: null,
  });

  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/user/notification-settings").then(r => r.ok ? r.json() : []),
      fetch("/api/sms/settings").then(r => r.ok ? r.json() : null),
      fetch("/api/user/communication-settings").then(r => r.ok ? r.json() : null),
    ]).then(([notifData, smsData, commData]) => {
      if (notifData && notifData.length > 0) {
        const emailSetting = notifData.find((s: { channel: string }) => s.channel === "email");
        const pushSetting = notifData.find((s: { channel: string }) => s.channel === "push");
        setNotifSettings({
          emailEnabled: emailSetting?.enabled ?? true,
          pushEnabled: pushSetting?.enabled ?? true,
          morningTime: emailSetting?.morningTime || "08:00",
          eveningTime: emailSetting?.eveningTime || "20:00",
          debtThresholdDays: emailSetting?.debtThresholdDays || 30,
          monthlyReminderDay: emailSetting?.monthlyReminderDay || null,
        });
      }
      if (smsData) setSmsSettings({ ...smsData, sendOnWeekends: false });
      if (commData?.settings) setCommSettings(commData.settings);
    }).catch(err => console.error("Failed to load settings:", err))
      .finally(() => setIsLoading(false));
  }, []);

  const handleSaveAll = async () => {
    setIsSaving(true);
    try {
      await Promise.all([
        fetch("/api/user/notification-settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(notifSettings),
        }),
        fetch("/api/sms/settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...smsSettings, sendOnWeekends: false }),
        }),
        fetch("/api/user/communication-settings", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(commSettings),
        }),
      ]);
      toast.success("כל ההגדרות נשמרו בהצלחה");
    } catch {
      toast.error("שגיאה בשמירת ההגדרות");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="h-[30vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const defaultSmsMessage = `שלום {שם},\nזוהי תזכורת לפגישה שלך ב{תאריך} בשעה {שעה}.\nתודה!`;

  return (
    <div className="space-y-6">
      <Accordion type="multiple" defaultValue={["notifications", "sms", "automation"]} className="space-y-4">
        {/* Notification Channels */}
        <AccordionItem value="notifications" className="border rounded-lg px-4">
          <AccordionTrigger className="hover:no-underline">
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-primary" />
              <span className="font-semibold">התראות</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-6 pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Mail className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">אימייל</p>
                  <p className="text-sm text-muted-foreground">קבל סיכום יומי של פגישות ומשימות להיום ולמחר</p>
                </div>
              </div>
              <Switch
                checked={notifSettings.emailEnabled}
                onCheckedChange={(checked) => setNotifSettings({ ...notifSettings, emailEnabled: checked })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>תזכורת בוקר</Label>
                <p className="text-xs text-muted-foreground">שעה שבה תקבל סיכום של הפגישות היומיות שלך</p>
                <Input
                  type="time"
                  value={notifSettings.morningTime}
                  onChange={(e) => setNotifSettings({ ...notifSettings, morningTime: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>תזכורת ערב</Label>
                <p className="text-xs text-muted-foreground">שעה שבה תקבל תזכורת על פגישות מחר</p>
                <Input
                  type="time"
                  value={notifSettings.eveningTime}
                  onChange={(e) => setNotifSettings({ ...notifSettings, eveningTime: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>ימים לתזכורת חוב</Label>
                <p className="text-xs text-muted-foreground">אחרי כמה ימים ללא תשלום תקבל התראה על חוב פתוח</p>
                <Input
                  type="number"
                  min={1}
                  max={90}
                  value={notifSettings.debtThresholdDays}
                  onChange={(e) => setNotifSettings({ ...notifSettings, debtThresholdDays: parseInt(e.target.value) || 30 })}
                  className="w-24"
                />
              </div>
              <div className="space-y-2">
                <Label>תזכורת גבייה חודשית (יום)</Label>
                <p className="text-xs text-muted-foreground">באיזה יום בחודש לקבל תזכורת לגבות חובות פתוחים</p>
                <Input
                  type="number"
                  min={1}
                  max={31}
                  value={notifSettings.monthlyReminderDay || ""}
                  onChange={(e) => setNotifSettings({ ...notifSettings, monthlyReminderDay: e.target.value ? parseInt(e.target.value) : null })}
                  className="w-24"
                  placeholder="--"
                />
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* SMS */}
        <AccordionItem value="sms" className="border rounded-lg px-4">
          <AccordionTrigger className="hover:no-underline">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-primary" />
              <span className="font-semibold">תזכורות SMS</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${smsSettings.enabled ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                {smsSettings.enabled ? "פעיל" : "כבוי"}
              </span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pb-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>הפעל תזכורות SMS</Label>
                <p className="text-xs text-muted-foreground">שלח הודעת SMS אוטומטית למטופלים לפני הפגישה (בימים א&apos;-ה&apos; בלבד)</p>
              </div>
              <Switch
                checked={smsSettings.enabled}
                onCheckedChange={(checked) => setSmsSettings({ ...smsSettings, enabled: checked })}
              />
            </div>
            {smsSettings.enabled && (
              <>
                <div className="space-y-2">
                  <Label>שעות לפני הפגישה</Label>
                  <p className="text-xs text-muted-foreground">כמה שעות לפני הפגישה לשלוח את התזכורת</p>
                  <Input
                    type="number"
                    min="1"
                    max="72"
                    value={smsSettings.hoursBeforeReminder}
                    onChange={(e) => setSmsSettings({ ...smsSettings, hoursBeforeReminder: parseInt(e.target.value) || 24 })}
                    className="w-24"
                  />
                </div>
                <div className="space-y-2">
                  <Label>טקסט ההודעה (אופציונלי)</Label>
                  <p className="text-xs text-muted-foreground">התאם אישית את נוסח ההודעה. השאר ריק לטקסט ברירת המחדל.</p>
                  <Textarea
                    placeholder={defaultSmsMessage}
                    value={smsSettings.customMessage || ""}
                    onChange={(e) => setSmsSettings({ ...smsSettings, customMessage: e.target.value || null })}
                    rows={4}
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-muted-foreground">
                    משתנים זמינים: {"{שם}"} = שם המטופל, {"{תאריך}"} = תאריך הפגישה, {"{שעה}"} = שעת הפגישה
                  </p>
                </div>
              </>
            )}
          </AccordionContent>
        </AccordionItem>

        {/* Email Automation */}
        <AccordionItem value="automation" className="border rounded-lg px-4">
          <AccordionTrigger className="hover:no-underline">
            <div className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" />
              <span className="font-semibold">מיילים אוטומטיים</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-6 pb-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>מייל אישור קביעת תור</Label>
                <p className="text-sm text-muted-foreground">המטופל יקבל מייל אוטומטי עם פרטי הפגישה ברגע שנקבעת</p>
              </div>
              <Switch
                checked={commSettings.sendConfirmationEmail}
                onCheckedChange={(checked) => setCommSettings({ ...commSettings, sendConfirmationEmail: checked })}
              />
            </div>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>תזכורת 24 שעות לפני</Label>
                <p className="text-sm text-muted-foreground">המטופל יקבל תזכורת במייל יום לפני הפגישה</p>
              </div>
              <Switch
                checked={commSettings.send24hReminder}
                onCheckedChange={(checked) => setCommSettings({ ...commSettings, send24hReminder: checked })}
              />
            </div>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <Label>תזכורת מותאמת אישית</Label>
                  <p className="text-sm text-muted-foreground">הגדר תזכורת נוספת במרחק זמן מותאם אישית מהפגישה</p>
                </div>
                <Switch
                  checked={commSettings.customReminderEnabled}
                  onCheckedChange={(checked) => setCommSettings({ ...commSettings, customReminderEnabled: checked, send2hReminder: checked })}
                />
              </div>
              {commSettings.customReminderEnabled && (
                <div className="flex items-center gap-2 pr-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <Input
                    type="number"
                    min={1}
                    max={72}
                    value={commSettings.customReminderHours}
                    onChange={(e) => setCommSettings({ ...commSettings, customReminderHours: parseInt(e.target.value) || 2 })}
                    className="w-20"
                  />
                  <span className="text-sm text-muted-foreground">שעות לפני הפגישה</span>
                </div>
              )}
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Debt Reminders */}
        <AccordionItem value="debt" className="border rounded-lg px-4">
          <AccordionTrigger className="hover:no-underline">
            <div className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-primary" />
              <span className="font-semibold">תזכורות חוב</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${commSettings.sendDebtReminders ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                {commSettings.sendDebtReminders ? "פעיל" : "כבוי"}
              </span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pb-4">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label>הפעל תזכורות חוב אוטומטיות</Label>
                <p className="text-xs text-muted-foreground">שלח מייל אוטומטי למטופלים עם חוב פתוח מעל הסכום המינימלי</p>
              </div>
              <Switch
                checked={commSettings.sendDebtReminders}
                onCheckedChange={(checked) => setCommSettings({ ...commSettings, sendDebtReminders: checked })}
              />
            </div>
            {commSettings.sendDebtReminders && (
              <>
                <div className="space-y-2">
                  <Label>יום בחודש לשליחה</Label>
                  <p className="text-xs text-muted-foreground">באיזה יום בחודש לשלוח את תזכורות החוב למטופלים</p>
                  <Select
                    value={commSettings.debtReminderDayOfMonth.toString()}
                    onValueChange={(value) => setCommSettings({ ...commSettings, debtReminderDayOfMonth: parseInt(value) })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                        <SelectItem key={day} value={day.toString()}>{day} לחודש</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>סכום מינימלי (₪)</Label>
                  <p className="text-xs text-muted-foreground">תזכורת תישלח רק כשהחוב מעל סכום זה</p>
                  <Input
                    type="number"
                    min={0}
                    step={10}
                    value={commSettings.debtReminderMinAmount}
                    onChange={(e) => setCommSettings({ ...commSettings, debtReminderMinAmount: parseFloat(e.target.value) || 0 })}
                    className="w-32"
                  />
                </div>
              </>
            )}
          </AccordionContent>
        </AccordionItem>

        {/* Payment Receipts */}
        <AccordionItem value="receipts" className="border rounded-lg px-4">
          <AccordionTrigger className="hover:no-underline">
            <div className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              <span className="font-semibold">קבלות תשלום אוטומטיות</span>
              <span className={`text-xs px-2 py-0.5 rounded-full ${commSettings.sendPaymentReceipt ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
                {commSettings.sendPaymentReceipt ? "פעיל" : "כבוי"}
              </span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pb-4">
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <div className="space-y-0.5">
                <Label>שלח קבלה למטופל</Label>
                <p className="text-xs text-muted-foreground">המטופל יקבל את הקבלה אוטומטית למייל שלו אחרי כל תשלום</p>
              </div>
              <Switch
                checked={commSettings.sendReceiptToClient}
                onCheckedChange={(checked) => setCommSettings({ ...commSettings, sendReceiptToClient: checked, sendPaymentReceipt: checked || commSettings.sendReceiptToTherapist })}
              />
            </div>
            <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
              <div className="space-y-0.5">
                <Label>שלח עותק אלי (למטפל)</Label>
                <p className="text-xs text-muted-foreground">תקבל עותק של כל קבלה למייל שלך לצורך תיעוד ומעקב</p>
              </div>
              <Switch
                checked={commSettings.sendReceiptToTherapist}
                onCheckedChange={(checked) => setCommSettings({ ...commSettings, sendReceiptToTherapist: checked, sendPaymentReceipt: checked || commSettings.sendReceiptToClient })}
              />
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Email Customization */}
        <AccordionItem value="customization" className="border rounded-lg px-4">
          <AccordionTrigger className="hover:no-underline">
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <span className="font-semibold">התאמה אישית של מיילים</span>
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pb-4">
            <div className="space-y-2">
              <Label>הוראות תשלום</Label>
              <p className="text-xs text-muted-foreground">טקסט שיופיע במייל תזכורת חוב - כמו פרטי חשבון בנק או אמצעי תשלום</p>
              <Textarea
                placeholder="השאר ריק לטקסט סטנדרטי..."
                value={commSettings.paymentInstructions || ""}
                onChange={(e) => setCommSettings({ ...commSettings, paymentInstructions: e.target.value || null })}
                rows={3}
                className="resize-none"
              />
            </div>
            <div className="space-y-2">
              <Label>קישור לתשלום ישיר</Label>
              <p className="text-xs text-muted-foreground">קישור לדף תשלום (ביט, פייבוקס וכדומה) - יופיע כלחצן במייל</p>
              <Input
                type="url"
                placeholder="https://..."
                value={commSettings.paymentLink || ""}
                onChange={(e) => setCommSettings({ ...commSettings, paymentLink: e.target.value || null })}
              />
            </div>
            <div className="space-y-2">
              <Label>חתימה אישית</Label>
              <p className="text-xs text-muted-foreground">חתימה שתופיע בתחתית כל מייל שנשלח מהמערכת</p>
              <Textarea
                placeholder="שם, תואר, טלפון..."
                value={commSettings.emailSignature || ""}
                onChange={(e) => setCommSettings({ ...commSettings, emailSignature: e.target.value || null })}
                rows={2}
                className="resize-none"
              />
            </div>
            <div className="space-y-2">
              <Label>ברכת פתיחה</Label>
              <p className="text-xs text-muted-foreground">פתיחת המייל - השתמש ב-{"{שם}"} כדי להכניס את שם המטופל אוטומטית</p>
              <Input
                placeholder='ברירת מחדל: "שלום {שם},"'
                value={commSettings.customGreeting || ""}
                onChange={(e) => setCommSettings({ ...commSettings, customGreeting: e.target.value || null })}
              />
            </div>
            <div className="space-y-2">
              <Label>ברכת סיום</Label>
              <p className="text-xs text-muted-foreground">הטקסט שיופיע לפני החתימה בסוף כל מייל</p>
              <Input
                placeholder='ברירת מחדל: "בברכה,"'
                value={commSettings.customClosing || ""}
                onChange={(e) => setCommSettings({ ...commSettings, customClosing: e.target.value || null })}
              />
            </div>
            <div className="space-y-2">
              <Label>שעות פעילות</Label>
              <p className="text-xs text-muted-foreground">שעות הפעילות שלך - יופיעו בתחתית המיילים למטופלים</p>
              <Textarea
                placeholder="ראשון-חמישי: 9:00-20:00"
                value={commSettings.businessHours || ""}
                onChange={(e) => setCommSettings({ ...commSettings, businessHours: e.target.value || null })}
                rows={2}
                className="resize-none"
              />
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <div className="flex justify-end">
        <Button onClick={handleSaveAll} disabled={isSaving} size="lg" className="gap-2">
          {isSaving ? (
            <><Loader2 className="h-5 w-5 animate-spin" />שומר...</>
          ) : (
            <><Save className="h-5 w-5" />שמור הכל</>
          )}
        </Button>
      </div>
    </div>
  );
}
