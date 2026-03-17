"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Mail, Clock, CreditCard, Sparkles } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";

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

interface EmailAutomationSectionProps {
  commSettings: CommunicationSettings;
  setCommSettings: React.Dispatch<React.SetStateAction<CommunicationSettings>>;
}

export function EmailAutomationSection({
  commSettings,
  setCommSettings,
}: EmailAutomationSectionProps) {
  return (
    <>
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
    </>
  );
}
