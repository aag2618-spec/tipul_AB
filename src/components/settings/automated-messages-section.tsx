"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  MessageSquare, Mail, Clock, ArrowLeftRight, CreditCard,
  Lightbulb, ChevronDown, ChevronUp, Sparkles,
} from "lucide-react";
import {
  AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";

interface SMSSettings {
  enabled: boolean;
  hoursBeforeReminder: number;
  customMessage: string | null;
  sendOnWeekends: boolean;
}

interface AutomatedMessagesSectionProps {
  smsSettings: SMSSettings;
  setSmsSettings: React.Dispatch<React.SetStateAction<SMSSettings>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  commSettings: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setCommSettings: any;
}

interface MessageType {
  id: string;
  label: string;
  desc: string;
  tip: string;
  emailKey: string;
  smsKey: string;
  templateKey: string;
  defaultTemplate: string;
  vars: string[];
  extraConfig?: "customReminderHours" | "debtReminder";
}

interface MessageGroup {
  id: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  types: MessageType[];
}

const MESSAGE_GROUPS: MessageGroup[] = [
  {
    id: "reminders",
    title: "תזכורות פגישה",
    icon: Clock,
    types: [
      {
        id: "bookingConfirmation",
        label: "אישור הזמנה",
        desc: "כשמטופל מזמין פגישה דרך זימון עצמי",
        tip: "מומלץ להפעיל גם מייל וגם SMS — המטופל מקבל אישור מיידי בטלפון ותיעוד מלא במייל",
        emailKey: "sendConfirmationEmail",
        smsKey: "sendBookingConfirmationSMS",
        templateKey: "templateBookingConfirmSMS",
        defaultTemplate: "שלום {שם}, ההזמנה התקבלה! פגישה ב-{תאריך} ב-{שעה}",
        vars: ["{שם}", "{תאריך}", "{שעה}"],
      },
      {
        id: "reminder24h",
        label: "תזכורת 24 שעות",
        desc: "יום לפני הפגישה",
        tip: "מספיק ערוץ אחד — שניהם ביחד עלולים להרגיש כמו הרבה הודעות",
        emailKey: "send24hReminder",
        smsKey: "sendReminder24hSMS",
        templateKey: "templateReminder24hSMS",
        defaultTemplate: "שלום {שם}, תזכורת לפגישה מחר ({יום}) ב-{שעה}",
        vars: ["{שם}", "{תאריך}", "{שעה}", "{יום}"],
      },
      {
        id: "reminderCustom",
        label: "תזכורת מותאמת",
        desc: "לפי מספר השעות שהגדרת",
        tip: "הודעה קצרה ודחופה — SMS מתאים במיוחד",
        emailKey: "customReminderEnabled",
        smsKey: "sendReminderCustomSMS",
        templateKey: "templateReminderCustomSMS",
        defaultTemplate: "שלום {שם}, פגישה בעוד {שעות} שעות ב-{שעה}",
        vars: ["{שם}", "{שעה}", "{שעות}"],
        extraConfig: "customReminderHours",
      },
    ],
  },
  {
    id: "changes",
    title: "הודעות על שינויים",
    icon: ArrowLeftRight,
    types: [
      {
        id: "cancellation",
        label: "הודעת ביטול פגישה",
        desc: "כשאתה מבטל פגישה מאושרת",
        tip: "מומלץ שניהם — זו הודעה דחופה שחשוב שתגיע בוודאות",
        emailKey: "sendCancellationEmail",
        smsKey: "sendCancellationSMS",
        templateKey: "templateCancellationSMS",
        defaultTemplate: "שלום {שם}, הפגישה ב-{תאריך} ב-{שעה} בוטלה",
        vars: ["{שם}", "{תאריך}", "{שעה}"],
      },
      {
        id: "sessionChange",
        label: "הודעת שינוי שעה/תאריך",
        desc: "כשאתה מזיז פגישה למועד אחר",
        tip: "מומלץ שניהם — חשוב שהמטופל יגיע בזמן הנכון",
        emailKey: "sendSessionChangeEmail",
        smsKey: "sendSessionChangeSMS",
        templateKey: "templateSessionChangeSMS",
        defaultTemplate: "שלום {שם}, הפגישה הועברה ל-{תאריך} ב-{שעה}",
        vars: ["{שם}", "{תאריך}", "{שעה}"],
      },
      {
        id: "noShow",
        label: 'הודעת "לא הגיע"',
        desc: 'כשאתה מסמן מטופל כ"לא הגיע"',
        tip: "מספיק ערוץ אחד — שתי הודעות עלולות להרגיש כלחץ מיותר",
        emailKey: "sendNoShowEmail",
        smsKey: "sendNoShowSMS",
        templateKey: "templateNoShowSMS",
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
        id: "debtReminder",
        label: "תזכורת חוב",
        desc: "תזכורת חוב אוטומטית או ידנית",
        tip: "המייל מכיל פירוט מלא של החוב. ה-SMS רק מזכיר לפתוח את המייל",
        emailKey: "sendDebtReminders",
        smsKey: "sendDebtReminderSMS",
        templateKey: "templateDebtReminderSMS",
        defaultTemplate: "שלום {שם}, יש יתרה פתוחה של {סכום}. פרטים נשלחו במייל",
        vars: ["{שם}", "{סכום}"],
        extraConfig: "debtReminder",
      },
    ],
  },
];

export function AutomatedMessagesSection({
  smsSettings,
  setSmsSettings,
  commSettings,
  setCommSettings,
}: AutomatedMessagesSectionProps) {
  const [openTemplates, setOpenTemplates] = useState<Set<string>>(new Set());
  const usage = commSettings.smsMonthlyUsage ?? 0;
  const quota = commSettings.smsMonthlyQuota ?? 200;
  const percentUsed = quota > 0 ? Math.round((usage / quota) * 100) : 0;

  const toggleTemplate = (key: string) => {
    setOpenTemplates((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleEmailToggle = (msgType: MessageType, checked: boolean) => {
    const update: Record<string, unknown> = { [msgType.emailKey]: checked };
    if (msgType.id === "reminderCustom") {
      update.send2hReminder = checked;
    }
    setCommSettings({ ...commSettings, ...update });
  };

  const handleSmsToggle = (msgType: MessageType, checked: boolean) => {
    setCommSettings({ ...commSettings, [msgType.smsKey]: checked });
  };

  return (
    <AccordionItem value="automated-messages" className="border rounded-lg px-4">
      <AccordionTrigger className="hover:no-underline">
        <div className="flex items-center gap-2">
          <Mail className="h-5 w-5 text-primary" />
          <span className="font-semibold">הודעות אוטומטיות</span>
        </div>
      </AccordionTrigger>
      <AccordionContent className="space-y-6 pb-4">

        {/* Hero */}
        <div className="bg-emerald-50 rounded-xl p-5 border border-emerald-200 space-y-2">
          <p className="font-semibold text-emerald-800 text-base">המערכת שולחת הודעות אוטומטיות — מייל, SMS, או שניהם</p>
          <p className="text-sm text-emerald-700">
            כל סוג הודעה (תזכורת, ביטול, שינוי שעה...) אפשר להפעיל בנפרד לכל ערוץ.
            השם, התאריך והשעה נכנסים מעצמם — אתה לא צריך להקליד כלום.
          </p>
          <p className="text-sm text-emerald-700 font-medium">
            בכל שורה יש שני מתגים: אחד למייל ואחד ל-SMS. הפעל את מה שמתאים לך.
          </p>
        </div>

        {/* SMS Infrastructure */}
        <div className="rounded-xl border-2 border-emerald-200 p-5 space-y-4 bg-emerald-50/30">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-emerald-600" />
              <div className="space-y-0.5">
                <Label className="text-base font-semibold">הפעל SMS</Label>
                <p className="text-sm text-muted-foreground">שליחת הודעות SMS למטופלים</p>
              </div>
            </div>
            <Switch
              checked={smsSettings.enabled}
              onCheckedChange={(checked) => setSmsSettings({ ...smsSettings, enabled: checked })}
              aria-label="הפעל SMS"
            />
          </div>

          {smsSettings.enabled && (
            <>
              {/* Visual example */}
              <div className="rounded-lg border p-4 bg-white space-y-3">
                <p className="text-sm font-medium text-gray-700">איך זה עובד? המערכת ממלאת את הפרטים אוטומטית:</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="rounded-lg bg-gray-50 border p-3 space-y-1">
                    <p className="text-xs font-medium text-gray-500">תבנית:</p>
                    <p className="text-sm" dir="rtl">
                      שלום <span className="bg-amber-100 text-amber-800 px-1 rounded">{"{שם}"}</span>, תזכורת לפגישה מחר (<span className="bg-amber-100 text-amber-800 px-1 rounded">{"{יום}"}</span>) ב-<span className="bg-amber-100 text-amber-800 px-1 rounded">{"{שעה}"}</span>
                    </p>
                  </div>
                  <div className="rounded-lg bg-gray-50 border p-3 space-y-1">
                    <p className="text-xs font-medium text-gray-500">מה המטופל מקבל:</p>
                    <p className="text-sm" dir="rtl">
                      שלום <span className="bg-green-100 text-green-800 px-1 rounded">דנה</span>, תזכורת לפגישה מחר (<span className="bg-green-100 text-green-800 px-1 rounded">שלישי</span>) ב-<span className="bg-green-100 text-green-800 px-1 rounded">16:00</span>
                    </p>
                  </div>
                </div>
              </div>

              {/* Quota */}
              <div className="rounded-lg border p-4 bg-white space-y-3">
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
            </>
          )}

          {!smsSettings.enabled && (
            <p className="text-sm text-muted-foreground bg-gray-50 rounded-lg p-3 border">
              כשה-SMS כבוי, רק מיילים יישלחו. הפעל SMS כדי לשלוח גם הודעות לטלפון.
            </p>
          )}
        </div>

        {/* Message type groups */}
        {MESSAGE_GROUPS.map((group) => (
          <div key={group.id}>
            <div className="flex items-center gap-2 mb-3 mt-2">
              <group.icon className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-semibold text-muted-foreground">{group.title}</span>
            </div>

            <div className="space-y-3">
              {group.types.map((msgType) => {
                const emailEnabled = !!commSettings[msgType.emailKey];
                const smsEnabled = !!commSettings[msgType.smsKey];
                const isTemplateOpen = openTemplates.has(msgType.id);
                const customTemplate = (commSettings[msgType.templateKey] as string) || "";
                const smsGloballyOff = !smsSettings.enabled;
                const eitherEnabled = emailEnabled || smsEnabled;

                return (
                  <div key={msgType.id} className="rounded-lg border p-4 space-y-3">
                    {/* Header row with dual toggles */}
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 sm:gap-4">
                      <div className="space-y-0.5 flex-1">
                        <Label className="text-sm font-semibold">{msgType.label}</Label>
                        <p className="text-xs text-muted-foreground">{msgType.desc}</p>
                      </div>
                      <div className="flex items-center gap-4 shrink-0">
                        {/* Email toggle */}
                        <div className="flex items-center gap-1.5">
                          <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">מייל</span>
                          <Switch
                            checked={emailEnabled}
                            onCheckedChange={(checked) => handleEmailToggle(msgType, checked)}
                            aria-label={`${msgType.label} — מייל`}
                          />
                        </div>
                        {/* SMS toggle */}
                        <div className={`flex items-center gap-1.5 ${smsGloballyOff ? "opacity-40" : ""}`}>
                          <MessageSquare className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-xs text-muted-foreground">SMS</span>
                          <Switch
                            checked={smsEnabled}
                            disabled={smsGloballyOff}
                            onCheckedChange={(checked) => handleSmsToggle(msgType, checked)}
                            aria-label={`${msgType.label} — SMS`}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Tip */}
                    <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg p-3">
                      <Lightbulb className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                      <p className="text-sm text-amber-800">{msgType.tip}</p>
                    </div>

                    {/* Extra config: custom reminder hours */}
                    {msgType.extraConfig === "customReminderHours" && eitherEnabled && (
                      <div className="flex items-center gap-2 pr-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <Input
                          type="number"
                          min={1}
                          max={72}
                          value={commSettings.customReminderHours}
                          onChange={(e) => setCommSettings({ ...commSettings, customReminderHours: parseInt(e.target.value) || 2 })}
                          className="w-20"
                          aria-label="שעות לפני הפגישה"
                        />
                        <span className="text-sm text-muted-foreground">שעות לפני הפגישה</span>
                      </div>
                    )}

                    {/* Extra config: debt reminder */}
                    {msgType.extraConfig === "debtReminder" && eitherEnabled && (
                      <div className="space-y-3 border-t pt-3">
                        <p className="text-xs text-muted-foreground bg-amber-50 rounded-lg p-3 border border-amber-100">
                          כשמופעל — המטופלים יקבלו הודעה עם פירוט החוב שלהם. ההודעה נשלחת פעם בחודש ביום שתבחר.
                        </p>
                        <div className="space-y-2">
                          <Label>יום בחודש לשליחה</Label>
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
                      </div>
                    )}

                    {/* SMS template editor */}
                    {smsEnabled && !smsGloballyOff && (
                      <>
                        <Button
                          variant="outline"
                          size="sm"
                          className="gap-1.5 text-xs"
                          onClick={() => toggleTemplate(msgType.id)}
                        >
                          {isTemplateOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                          {isTemplateOpen ? "סגור" : "ערוך נוסח SMS"}
                        </Button>

                        {isTemplateOpen && (
                          <div className="space-y-3 border-t pt-3">
                            <div>
                              <Label className="text-xs text-muted-foreground">נוסח ברירת מחדל (נשלח אוטומטית אם לא תשנה):</Label>
                              <div className="bg-muted/50 rounded-lg p-3 mt-1 text-sm" dir="rtl">
                                {msgType.defaultTemplate}
                              </div>
                            </div>
                            <div>
                              <Label className="text-xs">רוצה לשנות? כתוב כאן (אם ריק — ישלח הנוסח שלמעלה):</Label>
                              <Textarea
                                value={customTemplate}
                                onChange={(e) => setCommSettings({ ...commSettings, [msgType.templateKey]: e.target.value || null })}
                                placeholder={msgType.defaultTemplate}
                                rows={2}
                                className="resize-none text-sm mt-1"
                                maxLength={201}
                              />
                            </div>
                            <div className="flex items-center justify-between flex-wrap gap-2">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="text-xs text-muted-foreground">משתנים:</span>
                                {msgType.vars.map((v) => (
                                  <Badge key={v} variant="secondary" className="text-xs">{v}</Badge>
                                ))}
                              </div>
                              <span className="text-xs text-muted-foreground">
                                {(customTemplate || msgType.defaultTemplate).length}/201
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

        {/* ── Email Customization ── */}
        <div className="border-t-2 border-dashed border-violet-200 pt-6 mt-6">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="h-5 w-5 text-violet-600" />
            <span className="text-base font-semibold">איך המיילים שלך נראים</span>
          </div>

          <div className="text-sm text-muted-foreground bg-violet-50 rounded-lg p-4 border border-violet-100 space-y-2 mb-5">
            <p className="font-medium text-violet-800">מה זה?</p>
            <p>כאן אתה קובע איך המיילים שלך למטופלים ייראו — הברכה בתחילת המייל, החתימה בסוף, והוראות התשלום. ההגדרות חלות על <strong>כל</strong> המיילים: אישורי תור, תזכורות פגישה, קבלות ותזכורות חוב.</p>
            <p>אם לא תמלא כלום — המערכת תשתמש בברירות מחדל סבירות ואפשר לשנות בכל עת.</p>
          </div>

          <div className="space-y-5">
            <div className="space-y-2 rounded-lg border p-4">
              <Label className="text-base font-semibold">ברכת פתיחה</Label>
              <p className="text-xs text-muted-foreground">השורה הראשונה בכל מייל למטופל. כתוב &#123;שם&#125; והמערכת תכניס את שם המטופל.</p>
              <p className="text-xs text-muted-foreground"><strong>ברירת מחדל:</strong> &quot;שלום [שם המטופל],&quot;</p>
              <p className="text-xs text-muted-foreground"><strong>דוגמה:</strong> &quot;היי &#123;שם&#125;,&quot; / &quot;שלום לך &#123;שם&#125;,&quot;</p>
              <Input
                placeholder='שלום {שם},'
                value={commSettings.customGreeting || ""}
                onChange={(e) => setCommSettings({ ...commSettings, customGreeting: e.target.value || null })}
              />
            </div>

            <div className="space-y-2 rounded-lg border p-4">
              <Label className="text-base font-semibold">ברכת סיום</Label>
              <p className="text-xs text-muted-foreground">הטקסט שמופיע לפני החתימה שלך בסוף המייל.</p>
              <p className="text-xs text-muted-foreground"><strong>ברירת מחדל:</strong> &quot;בברכה,&quot;</p>
              <p className="text-xs text-muted-foreground"><strong>דוגמה:</strong> &quot;בהצלחה ובריאות,&quot; / &quot;תודה,&quot;</p>
              <Input
                placeholder='בברכה,'
                value={commSettings.customClosing || ""}
                onChange={(e) => setCommSettings({ ...commSettings, customClosing: e.target.value || null })}
              />
            </div>

            <div className="space-y-2 rounded-lg border p-4">
              <Label className="text-base font-semibold">חתימה</Label>
              <p className="text-xs text-muted-foreground">השם (או הטקסט) שמופיע בסוף כל מייל, אחרי ברכת הסיום.</p>
              <p className="text-xs text-muted-foreground"><strong>ברירת מחדל:</strong> השם שלך מהפרופיל</p>
              <p className="text-xs text-muted-foreground"><strong>דוגמה:</strong> &quot;יוסי כהן, מטפל רגשי מוסמך&quot;</p>
              <Textarea
                placeholder="השם שלך"
                value={commSettings.emailSignature || ""}
                onChange={(e) => setCommSettings({ ...commSettings, emailSignature: e.target.value || null })}
                rows={2}
                className="resize-none"
              />
            </div>

            <div className="space-y-2 rounded-lg border p-4">
              <Label className="text-base font-semibold">הוראות תשלום</Label>
              <p className="text-xs text-muted-foreground">יופיע במיילי חוב ובקבלות — פרטי חשבון בנק, ביט, או כל אמצעי תשלום.</p>
              <p className="text-xs text-muted-foreground"><strong>ברירת מחדל:</strong> &quot;ניתן לשלם באמצעות העברה בנקאית, אשראי, מזומן או צ&apos;ק. לתיאום תשלום, נא ליצור קשר.&quot;</p>
              <p className="text-xs text-muted-foreground"><strong>דוגמה:</strong> &quot;ניתן לשלם בביט: 050-1234567 או בהעברה: בנק לאומי חשבון 12345&quot;</p>
              <Textarea
                placeholder="ניתן לשלם בהעברה בנקאית / ביט / מזומן..."
                value={commSettings.paymentInstructions || ""}
                onChange={(e) => setCommSettings({ ...commSettings, paymentInstructions: e.target.value || null })}
                rows={3}
                className="resize-none"
              />
            </div>

            <div className="space-y-2 rounded-lg border p-4">
              <Label className="text-base font-semibold">קישור לתשלום ישיר</Label>
              <p className="text-xs text-muted-foreground">קישור לדף תשלום (ביט, פייבוקס וכדומה). אם תמלא — יופיע כפתור &quot;שלם עכשיו&quot; בולט במייל.</p>
              <p className="text-xs text-muted-foreground"><strong>ברירת מחדל:</strong> לא מופיע כפתור תשלום (אין קישור)</p>
              <p className="text-xs text-muted-foreground"><strong>דוגמה:</strong> הכנס כאן את הקישור שלך לביט, לפייבוקס, או לכל דף תשלום אונליין</p>
              <Input
                type="url"
                placeholder="https://..."
                value={commSettings.paymentLink || ""}
                onChange={(e) => setCommSettings({ ...commSettings, paymentLink: e.target.value || null })}
              />
            </div>

            <div className="space-y-2 rounded-lg border p-4">
              <Label className="text-base font-semibold">שעות פעילות</Label>
              <p className="text-xs text-muted-foreground">יופיע בתחתית המיילים — כדי שהמטופלים ידעו מתי אפשר ליצור קשר.</p>
              <p className="text-xs text-muted-foreground"><strong>ברירת מחדל:</strong> לא מופיע (אם לא תמלא)</p>
              <p className="text-xs text-muted-foreground"><strong>דוגמה:</strong> &quot;ראשון-חמישי: 9:00-20:00, שישי: 9:00-13:00&quot;</p>
              <Textarea
                placeholder="ראשון-חמישי: 9:00-20:00"
                value={commSettings.businessHours || ""}
                onChange={(e) => setCommSettings({ ...commSettings, businessHours: e.target.value || null })}
                rows={2}
                className="resize-none"
              />
            </div>
          </div>
        </div>

      </AccordionContent>
    </AccordionItem>
  );
}
