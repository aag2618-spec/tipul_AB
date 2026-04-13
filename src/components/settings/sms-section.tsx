"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { MessageSquare, Clock, ArrowLeftRight, CreditCard, Lightbulb, ChevronDown, ChevronUp } from "lucide-react";
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

const SMS_GROUPS = [
  {
    id: "reminders",
    title: "תזכורות פגישה",
    icon: Clock,
    types: [
      {
        key: "sendBookingConfirmationSMS",
        templateKey: "templateBookingConfirmSMS",
        label: "אישור הזמנה",
        desc: "כשמטופל מזמין פגישה דרך זימון עצמי",
        tip: "מומלץ להפעיל גם מייל וגם SMS — המטופל מקבל אישור מיידי בטלפון ותיעוד מלא במייל",
        defaultTemplate: "שלום {שם}, ההזמנה התקבלה! פגישה ב-{תאריך} ב-{שעה}",
        vars: ["{שם}", "{תאריך}", "{שעה}"],
      },
      {
        key: "sendReminder24hSMS",
        templateKey: "templateReminder24hSMS",
        label: "תזכורת 24 שעות",
        desc: "יום לפני הפגישה",
        tip: "מספיק ערוץ אחד — שניהם ביחד עלולים להרגיש כמו הרבה הודעות",
        defaultTemplate: "שלום {שם}, תזכורת לפגישה מחר ({יום}) ב-{שעה}",
        vars: ["{שם}", "{תאריך}", "{שעה}", "{יום}"],
      },
      {
        key: "sendReminderCustomSMS",
        templateKey: "templateReminderCustomSMS",
        label: "תזכורת מותאמת",
        desc: "לפי מספר השעות שהגדרת",
        tip: "הודעה קצרה ודחופה — SMS מתאים במיוחד",
        defaultTemplate: "שלום {שם}, פגישה בעוד {שעות} שעות ב-{שעה}",
        vars: ["{שם}", "{שעה}", "{שעות}"],
      },
    ],
  },
  {
    id: "changes",
    title: "הודעות על שינויים",
    icon: ArrowLeftRight,
    types: [
      {
        key: "sendCancellationSMS",
        templateKey: "templateCancellationSMS",
        label: "הודעת ביטול פגישה",
        desc: "כשאתה מבטל פגישה מאושרת",
        tip: "מומלץ שניהם — זו הודעה דחופה שחשוב שתגיע בוודאות",
        defaultTemplate: "שלום {שם}, הפגישה ב-{תאריך} ב-{שעה} בוטלה",
        vars: ["{שם}", "{תאריך}", "{שעה}"],
      },
      {
        key: "sendSessionChangeSMS",
        templateKey: "templateSessionChangeSMS",
        label: "הודעת שינוי שעה/תאריך",
        desc: "כשאתה מזיז פגישה למועד אחר",
        tip: "מומלץ שניהם — חשוב שהמטופל יגיע בזמן הנכון",
        defaultTemplate: "שלום {שם}, הפגישה הועברה ל-{תאריך} ב-{שעה}",
        vars: ["{שם}", "{תאריך}", "{שעה}"],
      },
      {
        key: "sendNoShowSMS",
        templateKey: "templateNoShowSMS",
        label: 'הודעת "לא הגיע"',
        desc: 'כשאתה מסמן מטופל כ"לא הגיע"',
        tip: "מספיק ערוץ אחד — שתי הודעות עלולות להרגיש כלחץ מיותר",
        defaultTemplate: "שלום {שם}, חבל שלא הגעת היום. ליצירת קשר: {טלפון}",
        vars: ["{שם}", "{טלפון}"],
      },
    ],
  },
  {
    id: "financial",
    title: "כספים",
    icon: CreditCard,
    types: [
      {
        key: "sendDebtReminderSMS",
        templateKey: "templateDebtReminderSMS",
        label: "תזכורת חוב",
        desc: "תזכורת חוב אוטומטית או ידנית",
        tip: "המייל מכיל פירוט מלא של החוב. ה-SMS רק מזכיר לפתוח את המייל",
        defaultTemplate: "שלום {שם}, יש יתרה פתוחה של {סכום}. פרטים נשלחו במייל",
        vars: ["{שם}", "{סכום}"],
      },
    ],
  },
];

export function SmsSection({
  smsSettings,
  setSmsSettings,
  commSettings,
  setCommSettings,
}: SmsSectionProps) {
  const [openTemplates, setOpenTemplates] = useState<Set<string>>(new Set());
  const usage = commSettings.smsMonthlyUsage ?? 0;
  const quota = commSettings.smsMonthlyQuota ?? 200;
  const percentUsed = quota > 0 ? Math.round((usage / quota) * 100) : 0;

  const toggleTemplate = (key: string) => {
    setOpenTemplates(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

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

        {/* Hero explanation */}
        <div className="bg-emerald-50 rounded-xl p-5 border border-emerald-200 space-y-2">
          <p className="font-semibold text-emerald-800 text-base">הודעות SMS נשלחות אוטומטית — בדיוק כמו המיילים</p>
          <p className="text-sm text-emerald-700">
            בכל פעם שנקבעת פגישה, מתבטלת, או מגיע מועד תזכורת — המערכת שולחת SMS לטלפון של המטופל אוטומטית.
            השם, התאריך והשעה נכנסים מעצמם — אתה לא צריך להקליד כלום.
          </p>
          <p className="text-sm text-emerald-700">
            כל הודעה אפשר לשלוח במייל, ב-SMS, או בשניהם — אתה בוחר.
          </p>
          <p className="text-sm text-emerald-700 font-medium">
            למטה יש נוסח ברירת מחדל לכל הודעה. אם לא תשנה — המערכת תשתמש בנוסח הזה ותמלא אוטומטית את הפרטים.
          </p>
        </div>

        {/* Master switch */}
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label className="text-base font-semibold">הפעל SMS</Label>
            <p className="text-sm text-muted-foreground">שליחת הודעות SMS למטופלים</p>
          </div>
          <Switch
            checked={smsSettings.enabled}
            onCheckedChange={(checked) => setSmsSettings({ ...smsSettings, enabled: checked })}
          />
        </div>

        {smsSettings.enabled && (
          <>
            {/* Visual example */}
            <div className="rounded-lg border p-4 bg-gray-50 space-y-3">
              <p className="text-sm font-medium text-gray-700">איך זה עובד? המערכת ממלאת את הפרטים אוטומטית:</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="rounded-lg bg-white border p-3 space-y-1">
                  <p className="text-xs font-medium text-gray-500">תבנית:</p>
                  <p className="text-sm" dir="rtl">
                    שלום <span className="bg-amber-100 text-amber-800 px-1 rounded">{"{שם}"}</span>, תזכורת לפגישה מחר (<span className="bg-amber-100 text-amber-800 px-1 rounded">{"{יום}"}</span>) ב-<span className="bg-amber-100 text-amber-800 px-1 rounded">{"{שעה}"}</span>
                  </p>
                </div>
                <div className="rounded-lg bg-white border p-3 space-y-1">
                  <p className="text-xs font-medium text-gray-500">מה המטופל מקבל:</p>
                  <p className="text-sm" dir="rtl">
                    שלום <span className="bg-green-100 text-green-800 px-1 rounded">דנה</span>, תזכורת לפגישה מחר (<span className="bg-green-100 text-green-800 px-1 rounded">שלישי</span>) ב-<span className="bg-green-100 text-green-800 px-1 rounded">16:00</span>
                  </p>
                </div>
              </div>
            </div>

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

            {/* SMS type groups */}
            {SMS_GROUPS.map((group) => (
              <div key={group.id}>
                <div className="flex items-center gap-2 mb-3 mt-2">
                  <group.icon className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-semibold text-muted-foreground">{group.title}</span>
                </div>

                <div className="space-y-3">
                  {group.types.map((smsType) => {
                    const isEnabled = !!commSettings[smsType.key];
                    const isTemplateOpen = openTemplates.has(smsType.key);
                    const customTemplate = (commSettings[smsType.templateKey] as string) || "";

                    return (
                      <div key={smsType.key} className="rounded-lg border p-4 space-y-3">
                        {/* Toggle row */}
                        <div className="flex items-center justify-between">
                          <div className="space-y-0.5">
                            <Label>{smsType.label}</Label>
                            <p className="text-xs text-muted-foreground">{smsType.desc}</p>
                          </div>
                          <Switch
                            checked={isEnabled}
                            onCheckedChange={(checked) => setCommSettings({ ...commSettings, [smsType.key]: checked })}
                          />
                        </div>

                        {/* Prominent tip */}
                        <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
                          <Lightbulb className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                          <p className="text-sm text-amber-800">{smsType.tip}</p>
                        </div>

                        {/* Template section (collapsed by default) */}
                        {isEnabled && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              className="gap-1.5 text-xs"
                              onClick={() => toggleTemplate(smsType.key)}
                            >
                              {isTemplateOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                              {isTemplateOpen ? "סגור" : "ערוך נוסח"}
                            </Button>

                            {isTemplateOpen && (
                              <div className="space-y-3 border-t pt-3">
                                {/* Default template preview */}
                                <div>
                                  <Label className="text-xs text-muted-foreground">נוסח ברירת מחדל (נשלח אוטומטית אם לא תשנה):</Label>
                                  <div className="bg-muted/50 rounded-lg p-3 mt-1 text-sm" dir="rtl">
                                    {smsType.defaultTemplate}
                                  </div>
                                </div>

                                {/* Custom template textarea */}
                                <div>
                                  <Label className="text-xs">רוצה לשנות? כתוב כאן (אם ריק — ישלח הנוסח שלמעלה):</Label>
                                  <Textarea
                                    value={customTemplate}
                                    onChange={(e) => setCommSettings({ ...commSettings, [smsType.templateKey]: e.target.value || null })}
                                    placeholder={smsType.defaultTemplate}
                                    rows={2}
                                    className="resize-none text-sm mt-1"
                                    maxLength={201}
                                  />
                                </div>

                                {/* Variables as badges + char count */}
                                <div className="flex items-center justify-between flex-wrap gap-2">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    <span className="text-xs text-muted-foreground">משתנים:</span>
                                    {smsType.vars.map((v) => (
                                      <Badge key={v} variant="secondary" className="text-xs">{v}</Badge>
                                    ))}
                                  </div>
                                  <span className="text-xs text-muted-foreground">
                                    {(customTemplate || smsType.defaultTemplate).length}/201
                                  </span>
                                </div>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </>
        )}
      </AccordionContent>
    </AccordionItem>
  );
}
