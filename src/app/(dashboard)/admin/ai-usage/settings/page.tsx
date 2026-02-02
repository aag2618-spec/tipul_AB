"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { Loader2, Save, AlertTriangle } from "lucide-react";

export default function AdminAISettingsPage() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [settings, setSettings] = useState({
    dailyLimitPro: 30,
    dailyLimitEnterprise: 100,
    monthlyLimitPro: 600,
    monthlyLimitEnterprise: 2000,
    maxMonthlyCostBudget: 5000,
    alertThreshold: 4000,
    blockOnExceed: false,
    alertAdminOnExceed: true,
    enableCache: true,
    compressPrompts: true,
  });

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const response = await fetch('/api/admin/ai-settings');
      if (response.ok) {
        const data = await response.json();
        if (data) {
          setSettings(data);
        }
      }
    } catch (error) {
      console.error('Failed to fetch settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const response = await fetch('/api/admin/ai-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });

      if (response.ok) {
        toast.success('ההגדרות נשמרו בהצלחה');
      } else {
        throw new Error('Failed to save');
      }
    } catch (error) {
      toast.error('שגיאה בשמירת ההגדרות');
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold">⚙️ הגדרות AI גלובליות</h1>
        <p className="text-muted-foreground mt-1">
          שליטה מלאה על שימוש ב-AI במערכת
        </p>
      </div>

      {/* Rate Limits */}
      <Card>
        <CardHeader>
          <CardTitle>🔒 מגבלות שימוש (Rate Limits)</CardTitle>
          <CardDescription>הגדר מגבלות יומיות וחודשיות לכל תוכנית</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Pro Limits */}
          <div className="space-y-4 p-4 bg-blue-50 rounded-lg">
            <h3 className="font-semibold text-lg">🥈 Professional (120₪)</h3>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>מכסה יומית</Label>
                <Input
                  type="number"
                  value={settings.dailyLimitPro}
                  onChange={(e) => setSettings({ ...settings, dailyLimitPro: parseInt(e.target.value) })}
                />
                <p className="text-xs text-muted-foreground">קריאות AI מקסימליות ליום</p>
              </div>
              <div className="space-y-2">
                <Label>מכסה חודשית</Label>
                <Input
                  type="number"
                  value={settings.monthlyLimitPro}
                  onChange={(e) => setSettings({ ...settings, monthlyLimitPro: parseInt(e.target.value) })}
                />
                <p className="text-xs text-muted-foreground">קריאות AI מקסימליות לחודש</p>
              </div>
            </div>
          </div>

          {/* Enterprise Limits */}
          <div className="space-y-4 p-4 bg-purple-50 rounded-lg">
            <h3 className="font-semibold text-lg">🥇 Enterprise (150₪)</h3>
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>מכסה יומית</Label>
                <Input
                  type="number"
                  value={settings.dailyLimitEnterprise}
                  onChange={(e) => setSettings({ ...settings, dailyLimitEnterprise: parseInt(e.target.value) })}
                />
                <p className="text-xs text-muted-foreground">קריאות AI מקסימליות ליום</p>
              </div>
              <div className="space-y-2">
                <Label>מכסה חודשית</Label>
                <Input
                  type="number"
                  value={settings.monthlyLimitEnterprise}
                  onChange={(e) => setSettings({ ...settings, monthlyLimitEnterprise: parseInt(e.target.value) })}
                />
                <p className="text-xs text-muted-foreground">קריאות AI מקסימליות לחודש</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Budget Controls */}
      <Card>
        <CardHeader>
          <CardTitle>💰 בקרת תקציב</CardTitle>
          <CardDescription>הגדר תקציב מקסימלי והתראות</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>תקציב מקסימלי לחודש (₪)</Label>
            <Input
              type="number"
              value={settings.maxMonthlyCostBudget}
              onChange={(e) => setSettings({ ...settings, maxMonthlyCostBudget: parseInt(e.target.value) })}
            />
            <p className="text-xs text-muted-foreground">
              אם העלות החודשית עוברת את הסכום הזה - תקבל התראה
            </p>
          </div>

          <div className="space-y-2">
            <Label>סף התראה (₪)</Label>
            <Input
              type="number"
              value={settings.alertThreshold}
              onChange={(e) => setSettings({ ...settings, alertThreshold: parseInt(e.target.value) })}
            />
            <p className="text-xs text-muted-foreground">
              התרה כשהעלות מגיעה לסכום הזה (בדרך כלל 80% מהתקציב)
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Behavior Settings */}
      <Card>
        <CardHeader>
          <CardTitle>🚨 התנהגות בחריגה</CardTitle>
          <CardDescription>מה לעשות כשמשתמש חורג מהמכסה</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-red-50 rounded-lg">
            <div className="space-y-1">
              <Label>חסום משתמש בחריגה</Label>
              <p className="text-sm text-muted-foreground">
                אם משתמש חורג מהמכסה - חסום את הגישה ל-AI
              </p>
            </div>
            <Switch
              checked={settings.blockOnExceed}
              onCheckedChange={(checked) => setSettings({ ...settings, blockOnExceed: checked })}
            />
          </div>

          <div className="flex items-center justify-between p-4 bg-orange-50 rounded-lg">
            <div className="space-y-1">
              <Label>התרה למנהל בחריגה</Label>
              <p className="text-sm text-muted-foreground">
                שלח התראה למנהל המערכת כשמשתמש חורג
              </p>
            </div>
            <Switch
              checked={settings.alertAdminOnExceed}
              onCheckedChange={(checked) => setSettings({ ...settings, alertAdminOnExceed: checked })}
            />
          </div>
        </CardContent>
      </Card>

      {/* Optimization */}
      <Card>
        <CardHeader>
          <CardTitle>⚡ אופטימיזציה וחיסכון</CardTitle>
          <CardDescription>תכונות לחיסכון בעלויות</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg">
            <div className="space-y-1">
              <Label>Cache תוצאות זהות</Label>
              <p className="text-sm text-muted-foreground">
                שמור תוצאות זהות לחיסכון (חיסכון של ~30%)
              </p>
            </div>
            <Switch
              checked={settings.enableCache}
              onCheckedChange={(checked) => setSettings({ ...settings, enableCache: checked })}
            />
          </div>

          <div className="flex items-center justify-between p-4 bg-green-50 rounded-lg">
            <div className="space-y-1">
              <Label>דחוס prompts ארוכים</Label>
              <p className="text-sm text-muted-foreground">
                דחוס טקסטים ארוכים לחיסכון בtokens
              </p>
            </div>
            <Switch
              checked={settings.compressPrompts}
              onCheckedChange={(checked) => setSettings({ ...settings, compressPrompts: checked })}
            />
          </div>
        </CardContent>
      </Card>

      {/* Save Button */}
      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={fetchSettings}>
          ביטול
        </Button>
        <Button onClick={handleSave} disabled={isSaving}>
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

      {/* Warning */}
      <Card className="border-yellow-200 bg-yellow-50/50">
        <CardHeader>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-yellow-600" />
            <CardTitle className="text-yellow-900">שים לב</CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-yellow-900">
            שינויים בהגדרות אלו ישפיעו על כל המשתמשים במערכת. 
            מגבלות נמוכות מדי עלולות לפגוע בחוויית המשתמש.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
