"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Loader2, MessageSquare } from "lucide-react";

interface SMSSettings {
  enabled: boolean;
  hoursBeforeReminder: number;
  customMessage: string | null;
  sendOnWeekends: boolean;
}

export default function SMSSettingsPage() {
  const [settings, setSettings] = useState<SMSSettings>({
    enabled: false,
    hoursBeforeReminder: 24,
    customMessage: null,
    sendOnWeekends: true,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await fetch("/api/sms/settings");
      if (response.ok) {
        const data = await response.json();
        setSettings(data);
      }
    } catch (error) {
      console.error("Failed to fetch SMS settings:", error);
      toast.error("שגיאה בטעינת ההגדרות");
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await fetch("/api/sms/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });

      if (response.ok) {
        toast.success("ההגדרות נשמרו בהצלחה");
      } else {
        throw new Error("Failed to save settings");
      }
    } catch (error) {
      console.error("Failed to save SMS settings:", error);
      toast.error("שגיאה בשמירת ההגדרות");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const defaultMessage = `שלום {שם},
זוהי תזכורת לפגישה שלך ב{תאריך} בשעה {שעה}.
במידה ואינך יכול/ה להגיע, נא לעדכן מראש.
תודה!`;

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">הגדרות SMS</h1>
        <p className="text-muted-foreground">
          נהל תזכורות אוטומטיות למטופלים
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <MessageSquare className="h-5 w-5 text-primary" />
              <div>
                <CardTitle>תזכורות SMS</CardTitle>
                <CardDescription>
                  שלח תזכורות אוטומטיות למטופלים לפני הפגישה
                </CardDescription>
              </div>
            </div>
            <Switch
              checked={settings.enabled}
              onCheckedChange={(checked) =>
                setSettings({ ...settings, enabled: checked })
              }
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="hours">זמן שליחת התזכורת</Label>
            <div className="flex items-center gap-2">
              <Input
                id="hours"
                type="number"
                min="1"
                max="72"
                value={settings.hoursBeforeReminder}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    hoursBeforeReminder: parseInt(e.target.value) || 24,
                  })
                }
                disabled={!settings.enabled}
                className="w-24"
              />
              <span className="text-sm text-muted-foreground">
                שעות לפני הפגישה
              </span>
            </div>
            <p className="text-xs text-muted-foreground">
              אפשרויות נפוצות: 24 שעות, 48 שעות
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="message">טקסט ההודעה (אופציונלי)</Label>
            <Textarea
              id="message"
              placeholder={defaultMessage}
              value={settings.customMessage || ""}
              onChange={(e) =>
                setSettings({ ...settings, customMessage: e.target.value || null })
              }
              disabled={!settings.enabled}
              rows={6}
              className="font-mono text-sm"
            />
            <div className="text-xs text-muted-foreground space-y-1">
              <p>משתנים זמינים:</p>
              <ul className="list-disc list-inside mr-4">
                <li>{"{שם}"} - שם המטופל</li>
                <li>{"{תאריך}"} - תאריך הפגישה</li>
                <li>{"{שעה}"} - שעת הפגישה</li>
              </ul>
              <p className="mt-2">השאר ריק לשימוש בטקסט ברירת המחדל</p>
            </div>
          </div>

          <div className="flex items-center justify-between rounded-lg border p-4">
            <div>
              <p className="font-medium">שלח גם בסופי שבוע</p>
              <p className="text-sm text-muted-foreground">
                שלח תזכורות גם בימי שישי ושבת
              </p>
            </div>
            <Switch
              checked={settings.sendOnWeekends}
              onCheckedChange={(checked) =>
                setSettings({ ...settings, sendOnWeekends: checked })
              }
              disabled={!settings.enabled}
            />
          </div>

          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <p className="text-sm text-amber-900 font-medium mb-1">
              ⚠️ שים לב
            </p>
            <p className="text-sm text-amber-800">
              שירות SMS דורש הגדרת ספק SMS (Twilio או אחר) ועשוי לכלול עלויות נוספות.
              לקבלת פרטים נוספים, פנה לתמיכה.
            </p>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={fetchSettings}
              disabled={isSaving}
            >
              ביטול
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              שמור הגדרות
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
