'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Mail, Bell, Clock, Shield, Save, CreditCard } from 'lucide-react';
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
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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
                    התאריכים, הסטטוס (הופיע/ביטל/לא הופיע), והסכום הכולל.
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
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-800">
                  <strong>💡 מה יקרה:</strong> כאשר תרשום תשלום במערכת, המטופל יקבל מייל אוטומטי עם:
                </p>
                <ul className="text-sm text-blue-800 mt-2 mr-4 space-y-1">
                  <li>✓ סכום התשלום ואמצעי התשלום</li>
                  <li>✓ תאריך ושעת הפגישה</li>
                  <li>✓ פירוט יתרת חוב (אם קיימת)</li>
                  <li>✓ קרדיט זמין (אם קיים)</li>
                </ul>
              </div>
            )}
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
