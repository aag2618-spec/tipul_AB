'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Mail, Bell, Clock, Shield, Save, CreditCard, FileText, Sparkles } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface CommunicationSettings {
  sendConfirmationEmail: boolean;
  send24hReminder: boolean;
  send2hReminder: boolean;
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

export default function CommunicationSettingsPage() {
  const [settings, setSettings] = useState<CommunicationSettings>({
    sendConfirmationEmail: true,
    send24hReminder: true,
    send2hReminder: false,
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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showExamples, setShowExamples] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/user/communication-settings');
      if (res.ok) {
        const data = await res.json();
        if (data.settings) {
          setSettings(data.settings);
        }
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveSettings = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/user/communication-settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });

      if (res.ok) {
        toast.success('ההגדרות נשמרו בהצלחה');
      } else {
        toast.error('שגיאה בשמירת ההגדרות');
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      toast.error('שגיאה בשמירת ההגדרות');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">הגדרות תקשורת</h1>
        <p className="text-muted-foreground">
          ניהול הגדרות מיילים אוטומטיים ומדיניות ביטולים
        </p>
      </div>

      <div className="grid gap-6">
        {/* Email Notifications */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" />
              <CardTitle>מיילים אוטומטיים</CardTitle>
            </div>
            <CardDescription>
              הגדר אילו מיילים יישלחו אוטומטית למטופלים
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="confirmation">מייל אישור קביעת תור</Label>
                <p className="text-sm text-muted-foreground">
                  שלח מייל אישור כאשר נקבעת פגישה חדשה
                </p>
              </div>
              <Switch
                id="confirmation"
                checked={settings.sendConfirmationEmail}
                onCheckedChange={(checked) =>
                  setSettings({ ...settings, sendConfirmationEmail: checked })
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="reminder24h">תזכורת 24 שעות לפני</Label>
                <p className="text-sm text-muted-foreground">
                  שלח תזכורת יום לפני הפגישה
                </p>
              </div>
              <Switch
                id="reminder24h"
                checked={settings.send24hReminder}
                onCheckedChange={(checked) =>
                  setSettings({ ...settings, send24hReminder: checked })
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="reminder2h">תזכורת 2 שעות לפני</Label>
                <p className="text-sm text-muted-foreground">
                  שלח תזכורת שעתיים לפני הפגישה
                </p>
              </div>
              <Switch
                id="reminder2h"
                checked={settings.send2hReminder}
                onCheckedChange={(checked) =>
                  setSettings({ ...settings, send2hReminder: checked })
                }
              />
            </div>
          </CardContent>
        </Card>

        {/* Cancellation Policy */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary" />
              <CardTitle>מדיניות ביטולים</CardTitle>
            </div>
            <CardDescription>
              הגדר את מדיניות ביטול התורים עבור המטופלים
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="allowCancellation">אפשר למטופלים לבקש ביטול</Label>
                <p className="text-sm text-muted-foreground">
                  מטופלים יוכלו לשלוח בקשות ביטול דרך המערכת
                </p>
              </div>
              <Switch
                id="allowCancellation"
                checked={settings.allowClientCancellation}
                onCheckedChange={(checked) =>
                  setSettings({ ...settings, allowClientCancellation: checked })
                }
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="minHours">זמן מינימלי לביטול (שעות)</Label>
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-muted-foreground" />
                <Input
                  id="minHours"
                  type="number"
                  min={1}
                  max={168}
                  value={settings.minCancellationHours}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      minCancellationHours: parseInt(e.target.value) || 24,
                    })
                  }
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">שעות לפני הפגישה</span>
              </div>
              <p className="text-sm text-muted-foreground">
                מטופלים לא יוכלו לבקש ביטול פחות מ-{settings.minCancellationHours} שעות לפני הפגישה
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Debt Reminders */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-primary" />
              <CardTitle>תזכורות חוב אוטומטיות</CardTitle>
            </div>
            <CardDescription>
              שלח תזכורות חוב אוטומטיות למטופלים בעלי חובות
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="debtReminders">הפעל תזכורות חוב אוטומטיות</Label>
                <p className="text-sm text-muted-foreground">
                  המערכת תשלח מייל אוטומטי למטופלים עם חובות
                </p>
              </div>
              <Switch
                id="debtReminders"
                checked={settings.sendDebtReminders}
                onCheckedChange={(checked) =>
                  setSettings({ ...settings, sendDebtReminders: checked })
                }
              />
            </div>

            {settings.sendDebtReminders && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="dayOfMonth">יום בחודש לשליחה</Label>
                  <Select
                    value={settings.debtReminderDayOfMonth.toString()}
                    onValueChange={(value) =>
                      setSettings({
                        ...settings,
                        debtReminderDayOfMonth: parseInt(value),
                      })
                    }
                  >
                    <SelectTrigger id="dayOfMonth">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                        <SelectItem key={day} value={day.toString()}>
                          {day} לחודש
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-sm text-muted-foreground">
                    בחר איזה יום בחודש לשלוח את התזכורות (1-28)
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="minAmount">סכום מינימלי לשליחה (₪)</Label>
                  <Input
                    id="minAmount"
                    type="number"
                    min={0}
                    step={10}
                    value={settings.debtReminderMinAmount}
                    onChange={(e) =>
                      setSettings({
                        ...settings,
                        debtReminderMinAmount: parseFloat(e.target.value) || 0,
                      })
                    }
                    className="w-32"
                  />
                  <p className="text-sm text-muted-foreground">
                    שלח תזכורת רק למטופלים עם חוב מעל ₪{settings.debtReminderMinAmount}
                  </p>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-sm text-blue-800">
                    <strong>💡 מה יקרה:</strong> ב-{settings.debtReminderDayOfMonth} לכל חודש, המערכת תשלח מייל אוטומטי
                    לכל מטופל עם חוב מעל ₪{settings.debtReminderMinAmount}. המייל יכלול פירוט של כל הפגישות שטרם שולמו,
                    התאריכים, הסטטוס (הופיע/ביטל/אי הופעה), והסכום הכולל.
                  </p>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Payment Receipt Email */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" />
              <CardTitle>קבלות תשלום אוטומטיות</CardTitle>
            </div>
            <CardDescription>
              שלח מייל קבלה למטופל אחרי כל תשלום
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="paymentReceipt">שלח קבלה אוטומטית במייל</Label>
                <p className="text-sm text-muted-foreground">
                  כאשר תרשום תשלום, המטופל יקבל מייל עם קבלה
                </p>
              </div>
              <Switch
                id="paymentReceipt"
                checked={settings.sendPaymentReceipt}
                onCheckedChange={(checked) =>
                  setSettings({ ...settings, sendPaymentReceipt: checked })
                }
              />
            </div>

            {settings.sendPaymentReceipt && (
              <div className="space-y-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 dark:bg-blue-950/20 dark:border-blue-800">
                  <p className="text-sm text-blue-800 dark:text-blue-300">
                    <strong>💡 מה יקרה:</strong> כאשר תרשום תשלום במערכת (מזומן/אשראי/העברה), המערכת תשלח קבלה אוטומטית:
                  </p>
                </div>

                {/* שליחה למטופל */}
                <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div className="flex items-center gap-3">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <Label htmlFor="sendReceiptToClient" className="font-medium cursor-pointer">
                        שלח קבלה למטופל
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        המטופל יקבל קבלה למייל שלו
                      </p>
                    </div>
                  </div>
                  <Switch
                    id="sendReceiptToClient"
                    checked={settings.sendReceiptToClient}
                    onCheckedChange={(checked) =>
                      setSettings({ ...settings, sendReceiptToClient: checked })
                    }
                  />
                </div>

                {/* עותק למטפל */}
                <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
                  <div className="flex items-center gap-3">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <Label htmlFor="sendReceiptToTherapist" className="font-medium cursor-pointer">
                        שלח עותק אלי (למטפל)
                      </Label>
                      <p className="text-xs text-muted-foreground">
                        תקבל עותק של הקבלה למייל שלך
                      </p>
                    </div>
                  </div>
                  <Switch
                    id="sendReceiptToTherapist"
                    checked={settings.sendReceiptToTherapist}
                    onCheckedChange={(checked) =>
                      setSettings({ ...settings, sendReceiptToTherapist: checked })
                    }
                  />
                </div>

                {/* תבנית מותאמת אישית */}
                <div className="space-y-2">
                  <Label htmlFor="receiptEmailTemplate">תבנית מייל קבלה (אופציונלי)</Label>
                  <Textarea
                    id="receiptEmailTemplate"
                    value={settings.receiptEmailTemplate || ''}
                    onChange={(e) =>
                      setSettings({ ...settings, receiptEmailTemplate: e.target.value })
                    }
                    placeholder="תודה רבה על התשלום!\n\nמצורפת קבלה על סך {סכום}.\n\nבברכה,\n{שם_מטפל}"
                    rows={5}
                  />
                  <p className="text-xs text-muted-foreground">
                    משתנים זמינים: {'{שם_מטופל}'}, {'{סכום}'}, {'{תאריך}'}, {'{שם_מטפל}'}
                  </p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Email Customization Card */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <CardTitle>התאמה אישית של מיילים</CardTitle>
            </div>
            <CardDescription>
              התאם אישית את תוכן המיילים - הכל אופציונלי
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Payment Instructions */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="paymentInstructions">💳 הוראות תשלום מותאמות</Label>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowExamples(!showExamples)}
                  className="text-xs"
                >
                  <FileText className="h-3 w-3 ml-1" />
                  {showExamples ? 'הסתר דוגמאות' : 'הצג דוגמאות'}
                </Button>
              </div>
              <Textarea
                id="paymentInstructions"
                placeholder="השאר ריק לטקסט סטנדרטי, או הוסף הוראות משלך..."
                value={settings.paymentInstructions || ''}
                onChange={(e) =>
                  setSettings({ ...settings, paymentInstructions: e.target.value || null })
                }
                rows={4}
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground">
                הוראות אלו יופיעו במיילי תזכורת חוב וקבלות תשלום
              </p>

              {/* Examples */}
              {showExamples && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
                  <p className="text-sm font-semibold text-blue-900">💡 דוגמאות:</p>
                  
                  <div className="space-y-2">
                    <button
                      onClick={() => setSettings({ ...settings, paymentInstructions: 'להעברה בנקאית:\nבנק לאומי, סניף 123, חשבון 456789\nנא לציין את שמך בהעברה' })}
                      className="w-full text-right bg-white p-3 rounded border hover:border-blue-400 text-xs"
                    >
                      <strong className="block text-blue-900 mb-1">העברה בנקאית:</strong>
                      <span className="text-gray-700">להעברה בנקאית:<br/>בנק לאומי, סניף 123, חשבון 456789<br/>נא לציין את שמך בהעברה</span>
                    </button>

                    <button
                      onClick={() => setSettings({ ...settings, paymentInstructions: 'תשלום מהיר:\n• ביט: 050-1234567\n• פייבוקס: bit.ly/pay-therapist\n• מזומן בפגישה' })}
                      className="w-full text-right bg-white p-3 rounded border hover:border-blue-400 text-xs"
                    >
                      <strong className="block text-blue-900 mb-1">אפשרויות מרובות:</strong>
                      <span className="text-gray-700">תשלום מהיר:<br/>• ביט: 050-1234567<br/>• פייבוקס: bit.ly/pay<br/>• מזומן בפגישה</span>
                    </button>

                    <button
                      onClick={() => setSettings({ ...settings, paymentInstructions: 'מקבל תשלום במזומן בלבד\nבסיום כל פגישה' })}
                      className="w-full text-right bg-white p-3 rounded border hover:border-blue-400 text-xs"
                    >
                      <strong className="block text-blue-900 mb-1">מזומן בלבד:</strong>
                      <span className="text-gray-700">מקבל תשלום במזומן בלבד<br/>בסיום כל פגישה</span>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Payment Link */}
            <div className="space-y-2">
              <Label htmlFor="paymentLink">🔗 קישור לתשלום ישיר (אופציונלי)</Label>
              <Input
                id="paymentLink"
                type="url"
                placeholder="https://bit.ly/pay-therapist או קישור ביט/פייבוקס"
                value={settings.paymentLink || ''}
                onChange={(e) =>
                  setSettings({ ...settings, paymentLink: e.target.value || null })
                }
              />
              <p className="text-xs text-muted-foreground">
                קישור לתשלום מקוון - יופיע כפתור במיילים
              </p>
            </div>

            {/* Email Signature */}
            <div className="space-y-2">
              <Label htmlFor="emailSignature">✍️ חתימה אישית (אופציונלי)</Label>
              <Textarea
                id="emailSignature"
                placeholder="ד״ר שרה כהן&#10;פסיכולוגית קלינית&#10;050-1234567"
                value={settings.emailSignature || ''}
                onChange={(e) =>
                  setSettings({ ...settings, emailSignature: e.target.value || null })
                }
                rows={3}
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground">
                תחליף את החתימה הסטנדרטית בשמך
              </p>
            </div>

            {/* Custom Greeting */}
            <div className="space-y-2">
              <Label htmlFor="customGreeting">👋 ברכת פתיחה מותאמת (אופציונלי)</Label>
              <Input
                id="customGreeting"
                placeholder='ברירת מחדל: "שלום {שם},"'
                value={settings.customGreeting || ''}
                onChange={(e) =>
                  setSettings({ ...settings, customGreeting: e.target.value || null })
                }
              />
              <p className="text-xs text-muted-foreground">
                השתמש ב-{"{שם}"} לשם המטופל. דוגמה: "היי {"{שם}"}, מקווה שהשבוע עבר עליך בטוב"
              </p>
            </div>

            {/* Custom Closing */}
            <div className="space-y-2">
              <Label htmlFor="customClosing">🙏 ברכת סיום מותאמת (אופציונלי)</Label>
              <Input
                id="customClosing"
                placeholder='ברירת מחדל: "בברכה,"'
                value={settings.customClosing || ''}
                onChange={(e) =>
                  setSettings({ ...settings, customClosing: e.target.value || null })
                }
              />
              <p className="text-xs text-muted-foreground">
                דוגמה: "תודה ומחכה לראותך" או "בחום,"
              </p>
            </div>

            {/* Business Hours */}
            <div className="space-y-2">
              <Label htmlFor="businessHours">⏰ שעות פעילות (אופציונלי)</Label>
              <Textarea
                id="businessHours"
                placeholder="ראשון-חמישי: 9:00-20:00&#10;שישי: 9:00-13:00"
                value={settings.businessHours || ''}
                onChange={(e) =>
                  setSettings({ ...settings, businessHours: e.target.value || null })
                }
                rows={2}
                className="resize-none"
              />
              <p className="text-xs text-muted-foreground">
                יופיע במיילים - למשל "מענה טלפוני: א׳-ה׳ 9:00-20:00"
              </p>
            </div>

            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <p className="text-sm text-gray-700">
                <strong>📌 שים לב:</strong> כל השדות אופציונליים. אם תשאיר ריק, המערכת תשתמש בטקסט הסטנדרטי.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Info Card */}
        <Card className="bg-muted/50">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-primary" />
              <CardTitle className="text-base">איך מערכת הביטולים עובדת?</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>• מטופלים לא יכולים לבטל תורים ישירות - רק לשלוח בקשה</li>
              <li>• כאשר מטופל שולח בקשת ביטול, תקבל מייל והתראה במערכת</li>
              <li>• את/ה מאשר/ת או דוחה את הבקשה</li>
              <li>• המטופל מקבל מייל עם התוצאה</li>
              <li>• כל התקשורת מתועדת בלוג המערכת</li>
            </ul>
          </CardContent>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button onClick={saveSettings} disabled={saving} className="gap-2">
          <Save className="h-4 w-4" />
          {saving ? 'שומר...' : 'שמור הגדרות'}
        </Button>
      </div>
    </div>
  );
}
