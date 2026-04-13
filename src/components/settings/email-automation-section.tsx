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
  // New email toggles
  sendCancellationEmail: boolean;
  sendSessionChangeEmail: boolean;
  sendNoShowEmail: boolean;
}

interface EmailAutomationSectionProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  commSettings: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setCommSettings: any;
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
          <div className="bg-emerald-50 rounded-xl p-5 border border-emerald-200 space-y-2">
            <p className="font-semibold text-emerald-800 text-base">המיילים נשלחים אוטומטית</p>
            <p className="text-sm text-emerald-700">
              כשנקבעת פגישה, מתבטלת, או מגיע מועד תזכורת — המערכת שולחת מייל למטופל אוטומטית.
              השם, התאריך והשעה נכנסים מעצמם.
            </p>
            <p className="text-sm text-emerald-700 font-medium">
              אתה לא צריך לעשות כלום — רק לבחור אילו מיילים לשלוח.
            </p>
          </div>
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

          <div className="border-t pt-4 mt-4">
            <p className="text-sm font-medium text-muted-foreground mb-3">הודעות אירוע</p>
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>הודעת ביטול פגישה</Label>
              <p className="text-sm text-muted-foreground">כשאתה מבטל פגישה מאושרת — המטופל יקבל מייל</p>
            </div>
            <Switch
              checked={commSettings.sendCancellationEmail}
              onCheckedChange={(checked) => setCommSettings({ ...commSettings, sendCancellationEmail: checked })}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>הודעת שינוי שעה/תאריך</Label>
              <p className="text-sm text-muted-foreground">כשאתה מזיז פגישה לזמן אחר — המטופל יקבל מייל עם המועד החדש</p>
            </div>
            <Switch
              checked={commSettings.sendSessionChangeEmail}
              onCheckedChange={(checked) => setCommSettings({ ...commSettings, sendSessionChangeEmail: checked })}
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>הודעת &quot;לא הגיע&quot;</Label>
              <p className="text-sm text-muted-foreground">כשאתה מסמן מטופל כ&quot;לא הגיע&quot; — ישלח לו מייל</p>
            </div>
            <Switch
              checked={commSettings.sendNoShowEmail}
              onCheckedChange={(checked) => setCommSettings({ ...commSettings, sendNoShowEmail: checked })}
            />
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
          <p className="text-xs text-muted-foreground bg-amber-50 rounded-lg p-3 border border-amber-100">
            כשמופעל — המטופלים עצמם יקבלו <strong>מייל ישיר</strong> עם פירוט החוב שלהם ואפשרות לשלם. המייל יישלח פעם בחודש ביום שתבחר.
          </p>
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>הפעל תזכורות חוב אוטומטיות</Label>
              <p className="text-xs text-muted-foreground">שלח מייל אוטומטי ישירות למטופלים עם חוב פתוח</p>
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
                <p className="text-xs text-muted-foreground">באיזה יום בחודש לשלוח מייל תזכורת חוב ישירות למטופלים (מייל אוטומטי למטופל עם פירוט החוב)</p>
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
            <span className="font-semibold">איך המיילים שלך נראים</span>
          </div>
        </AccordionTrigger>
        <AccordionContent className="space-y-5 pb-4">
          <div className="text-sm text-muted-foreground bg-violet-50 rounded-lg p-4 border border-violet-100 space-y-2">
            <p className="font-medium text-violet-800">מה זה?</p>
            <p>כאן אתה קובע איך המיילים שלך למטופלים ייראו — הברכה בתחילת המייל, החתימה בסוף, והוראות התשלום. ההגדרות חלות על <strong>כל</strong> המיילים: אישורי תור, תזכורות פגישה, קבלות ותזכורות חוב.</p>
            <p>אם לא תמלא כלום — המערכת תשתמש בברירות מחדל סבירות ואפשר לשנות בכל עת.</p>
          </div>

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
        </AccordionContent>
      </AccordionItem>
    </>
  );
}
