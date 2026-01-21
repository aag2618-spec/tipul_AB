"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ArrowRight, Loader2, Save, Bell, Mail, Smartphone } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

interface NotificationSettings {
  emailEnabled: boolean;
  pushEnabled: boolean;
  morningTime: string;
  eveningTime: string;
  debtThresholdDays: number;
  monthlyReminderDay: number | null;
}

export default function NotificationSettingsPage() {
  const [settings, setSettings] = useState<NotificationSettings>({
    emailEnabled: true,
    pushEnabled: true,
    morningTime: "08:00",
    eveningTime: "20:00",
    debtThresholdDays: 30,
    monthlyReminderDay: null,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const response = await fetch("/api/user/notification-settings");
        if (response.ok) {
          const data = await response.json();
          if (data.length > 0) {
            const emailSetting = data.find((s: { channel: string }) => s.channel === "email");
            const pushSetting = data.find((s: { channel: string }) => s.channel === "push");
            setSettings({
              emailEnabled: emailSetting?.enabled ?? true,
              pushEnabled: pushSetting?.enabled ?? true,
              morningTime: emailSetting?.morningTime || "08:00",
              eveningTime: emailSetting?.eveningTime || "20:00",
              debtThresholdDays: emailSetting?.debtThresholdDays || 30,
              monthlyReminderDay: emailSetting?.monthlyReminderDay || null,
            });
          }
        }
      } catch (error) {
        console.error("Failed to fetch settings:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchSettings();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);

    try {
      const response = await fetch("/api/user/notification-settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });

      if (!response.ok) throw new Error();

      toast.success("הגדרות ההתראות עודכנו בהצלחה");
    } catch {
      toast.error("שגיאה בעדכון ההגדרות");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="h-[50vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-2xl">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/dashboard/settings">
            <ArrowRight className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight">הגדרות התראות</h1>
          <p className="text-muted-foreground">ניהול תזכורות והתראות</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Notification Channels */}
        <Card>
          <CardHeader>
            <CardTitle>ערוצי התראה</CardTitle>
            <CardDescription>בחר איך תרצה לקבל התראות</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Mail className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">אימייל</p>
                  <p className="text-sm text-muted-foreground">קבל התראות באימייל</p>
                </div>
              </div>
              <Switch
                checked={settings.emailEnabled}
                onCheckedChange={(checked) =>
                  setSettings({ ...settings, emailEnabled: checked })
                }
              />
            </div>

            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <Smartphone className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">Push Notifications</p>
                  <p className="text-sm text-muted-foreground">התראות בדפדפן ובמובייל</p>
                </div>
              </div>
              <Switch
                checked={settings.pushEnabled}
                onCheckedChange={(checked) =>
                  setSettings({ ...settings, pushEnabled: checked })
                }
              />
            </div>
          </CardContent>
        </Card>

        {/* Schedule */}
        <Card>
          <CardHeader>
            <CardTitle>זמני התראות</CardTitle>
            <CardDescription>קבע מתי תקבל את ההתראות היומיות</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="morningTime">
                  <div className="flex items-center gap-2">
                    <Bell className="h-4 w-4" />
                    תזכורת בוקר
                  </div>
                </Label>
                <Input
                  id="morningTime"
                  type="time"
                  value={settings.morningTime}
                  onChange={(e) =>
                    setSettings({ ...settings, morningTime: e.target.value })
                  }
                  disabled={isSaving}
                />
                <p className="text-xs text-muted-foreground">
                  סיכום יומי של פגישות ומשימות להיום
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="eveningTime">
                  <div className="flex items-center gap-2">
                    <Bell className="h-4 w-4" />
                    תזכורת ערב
                  </div>
                </Label>
                <Input
                  id="eveningTime"
                  type="time"
                  value={settings.eveningTime}
                  onChange={(e) =>
                    setSettings({ ...settings, eveningTime: e.target.value })
                  }
                  disabled={isSaving}
                />
                <p className="text-xs text-muted-foreground">
                  סיכום יום מחר והתחייבויות
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Thresholds */}
        <Card>
          <CardHeader>
            <CardTitle>ספי התראה</CardTitle>
            <CardDescription>הגדר מתי לקבל התראות על חריגות</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="debtThreshold">ימים לתזכורת חוב</Label>
              <div className="flex items-center gap-3">
                <Input
                  id="debtThreshold"
                  type="number"
                  min={1}
                  max={90}
                  value={settings.debtThresholdDays}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      debtThresholdDays: parseInt(e.target.value) || 30,
                    })
                  }
                  disabled={isSaving}
                  className="w-24"
                />
                <span className="text-sm text-muted-foreground">ימים</span>
              </div>
              <p className="text-xs text-muted-foreground">
                קבל התראה על חובות שלא שולמו מעל מספר הימים הזה
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="monthlyReminder">תזכורת גבייה חודשית</Label>
              <div className="flex items-center gap-3">
                <Input
                  id="monthlyReminder"
                  type="number"
                  min={1}
                  max={31}
                  value={settings.monthlyReminderDay || ""}
                  onChange={(e) =>
                    setSettings({
                      ...settings,
                      monthlyReminderDay: e.target.value ? parseInt(e.target.value) : null,
                    })
                  }
                  disabled={isSaving}
                  className="w-24"
                  placeholder="--"
                />
                <span className="text-sm text-muted-foreground">לחודש</span>
              </div>
              <p className="text-xs text-muted-foreground">
                קבל תזכורת בתאריך קבוע בכל חודש לגבות תשלומים. השאר ריק לביטול.
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end">
          <Button type="submit" disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                שומר...
              </>
            ) : (
              <>
                <Save className="ml-2 h-4 w-4" />
                שמור הגדרות
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}







