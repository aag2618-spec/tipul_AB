"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { MessageSquare, Info } from "lucide-react";
import {
  AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";

interface SMSSettings {
  enabled: boolean;
  hoursBeforeReminder: number;
  customMessage: string | null;
  sendOnWeekends: boolean;
}

interface SmsSectionProps {
  smsSettings: SMSSettings;
  setSmsSettings: React.Dispatch<React.SetStateAction<SMSSettings>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  commSettings: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setCommSettings: any;
}

const SMS_TYPES = [
  {
    key: "sendBookingConfirmationSMS",
    templateKey: "templateBookingConfirmSMS",
    label: "אישור הזמנה",
    desc: "כשמטופל מזמין פגישה דרך זימון עצמי",
    tip: "מומלץ שניהם — אישור מיידי ב-SMS ותיעוד מלא במייל",
    defaultTemplate: "שלום {שם}, ההזמנה התקבלה! פגישה ב-{תאריך} ב-{שעה}",
    vars: "{שם} {תאריך} {שעה}",
  },
  {
    key: "sendReminder24hSMS",
    templateKey: "templateReminder24hSMS",
    label: "תזכורת 24 שעות",
    desc: "יום לפני הפגישה",
    tip: "מומלץ ערוץ אחד — שניהם עלולים להרגיש מעיקים",
    defaultTemplate: "שלום {שם}, תזכורת לפגישה מחר ({יום}) ב-{שעה}",
    vars: "{שם} {תאריך} {שעה} {יום}",
  },
  {
    key: "sendReminderCustomSMS",
    templateKey: "templateReminderCustomSMS",
    label: "תזכורת מותאמת",
    desc: "לפי מספר השעות שהגדרת",
    tip: "מומלץ SMS בלבד — קצר ודחוף",
    defaultTemplate: "שלום {שם}, פגישה בעוד {שעות} שעות ב-{שעה}",
    vars: "{שם} {שעה} {שעות}",
  },
  {
    key: "sendCancellationSMS",
    templateKey: "templateCancellationSMS",
    label: "הודעת ביטול פגישה",
    desc: "כשאתה מבטל פגישה מאושרת",
    tip: "מומלץ שניהם — הודעה דחופה שחשוב שתגיע",
    defaultTemplate: "שלום {שם}, הפגישה ב-{תאריך} ב-{שעה} בוטלה",
    vars: "{שם} {תאריך} {שעה}",
  },
  {
    key: "sendSessionChangeSMS",
    templateKey: "templateSessionChangeSMS",
    label: "הודעת שינוי שעה/תאריך",
    desc: "כשאתה מזיז פגישה למועד אחר",
    tip: "מומלץ שניהם — חשוב שיגיע בזמן הנכון",
    defaultTemplate: "שלום {שם}, הפגישה הועברה ל-{תאריך} ב-{שעה}",
    vars: "{שם} {תאריך} {שעה}",
  },
  {
    key: "sendNoShowSMS",
    templateKey: "templateNoShowSMS",
    label: 'הודעת "לא הגיע"',
    desc: 'כשאתה מסמן מטופל כ"לא הגיע"',
    tip: "מומלץ ערוץ אחד — שניהם עלולים להרגיש לחץ",
    defaultTemplate: "שלום {שם}, חבל שלא הגעת היום. ליצירת קשר: {טלפון}",
    vars: "{שם} {טלפון}",
  },
  {
    key: "sendDebtReminderSMS",
    templateKey: "templateDebtReminderSMS",
    label: "תזכורת חוב",
    desc: "תזכורת חוב אוטומטית או ידנית",
    tip: "המייל מכיל פירוט מלא, ה-SMS מזכיר לפתוח אותו",
    defaultTemplate: "שלום {שם}, יש יתרה פתוחה של {סכום}. פרטים נשלחו במייל",
    vars: "{שם} {סכום}",
  },
] as const;

export function SmsSection({
  smsSettings,
  setSmsSettings,
  commSettings,
  setCommSettings,
}: SmsSectionProps) {
  const usage = commSettings.smsMonthlyUsage ?? 0;
  const quota = commSettings.smsMonthlyQuota ?? 200;
  const percentUsed = quota > 0 ? Math.round((usage / quota) * 100) : 0;

  return (
    <AccordionItem value="sms" className="border rounded-lg px-4">
      <AccordionTrigger className="hover:no-underline">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-primary" />
          <span className="font-semibold">הודעות SMS</span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${smsSettings.enabled ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"}`}>
            {smsSettings.enabled ? "פעיל" : "כבוי"}
          </span>
        </div>
      </AccordionTrigger>
      <AccordionContent className="space-y-6 pb-4">

        {/* Master switch */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-base font-semibold">הפעל SMS</Label>
            <p className="text-sm text-muted-foreground">שליחת הודעות SMS למטופלים (Pulseem)</p>
          </div>
          <Switch
            checked={smsSettings.enabled}
            onCheckedChange={(checked) => setSmsSettings({ ...smsSettings, enabled: checked })}
          />
        </div>

        {smsSettings.enabled && (
          <>
            {/* Quota display */}
            <div className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <Label className="text-sm font-medium">מכסה חודשית</Label>
                <span className="text-sm font-semibold">{usage}/{quota} ({percentUsed}%)</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5">
                <div
                  className={`h-2.5 rounded-full transition-all ${
                    percentUsed >= 90 ? "bg-red-500" : percentUsed >= 70 ? "bg-amber-500" : "bg-green-500"
                  }`}
                  style={{ width: `${Math.min(percentUsed, 100)}%` }}
                />
              </div>
              <div className="flex gap-4">
                <div className="space-y-1">
                  <Label className="text-xs">מכסה</Label>
                  <Input
                    type="number"
                    min={10}
                    value={quota}
                    onChange={(e) => setCommSettings({ ...commSettings, smsMonthlyQuota: parseInt(e.target.value) || 200 })}
                    className="w-24 h-8 text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">התראה ב-%</Label>
                  <Input
                    type="number"
                    min={50}
                    max={99}
                    value={commSettings.smsAlertAtPercent ?? 80}
                    onChange={(e) => setCommSettings({ ...commSettings, smsAlertAtPercent: parseInt(e.target.value) || 80 })}
                    className="w-24 h-8 text-sm"
                  />
                </div>
              </div>
            </div>

            {/* SMS type toggles */}
            <div className="space-y-1">
              <Label className="text-base font-semibold">סוגי הודעות SMS</Label>
              <p className="text-xs text-muted-foreground">בחר אילו הודעות לשלוח ב-SMS. כל סוג עצמאי ממייל.</p>
            </div>

            {SMS_TYPES.map((smsType) => (
              <div key={smsType.key} className="rounded-lg border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label>{smsType.label}</Label>
                    <p className="text-xs text-muted-foreground">{smsType.desc}</p>
                  </div>
                  <Switch
                    checked={!!commSettings[smsType.key]}
                    onCheckedChange={(checked) => setCommSettings({ ...commSettings, [smsType.key]: checked })}
                  />
                </div>
                <div className="flex items-start gap-1.5">
                  <Info className="h-3.5 w-3.5 text-blue-500 mt-0.5 shrink-0" />
                  <p className="text-xs text-blue-600">{smsType.tip}</p>
                </div>
                {commSettings[smsType.key] && (
                  <div className="space-y-2">
                    <Label className="text-xs">תבנית הודעה</Label>
                    <Textarea
                      value={(commSettings[smsType.templateKey] as string) || ""}
                      onChange={(e) => setCommSettings({ ...commSettings, [smsType.templateKey]: e.target.value || null })}
                      placeholder={smsType.defaultTemplate}
                      rows={2}
                      className="resize-none text-sm"
                      maxLength={201}
                    />
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>משתנים: {smsType.vars}</span>
                      <span>{((commSettings[smsType.templateKey] as string) || smsType.defaultTemplate).length}/201</span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </>
        )}
      </AccordionContent>
    </AccordionItem>
  );
}
