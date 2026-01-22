"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Building2, Save, Shield } from "lucide-react";
import { toast } from "sonner";

interface InsurerConfig {
  enabled: boolean;
  apiKey: string;
  secondaryField: string;
}

interface InsurerSettings {
  enabled: boolean;
  clalit: InsurerConfig;
  maccabi: InsurerConfig;
  meuhedet: { enabled: boolean; username: string; password: string };
  leumit: InsurerConfig;
  autoSubmit: boolean;
}

export default function HealthInsurersPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<InsurerSettings>({
    enabled: false,
    clalit: { enabled: false, apiKey: "", secondaryField: "" },
    maccabi: { enabled: false, apiKey: "", secondaryField: "" },
    meuhedet: { enabled: false, username: "", password: "" },
    leumit: { enabled: false, apiKey: "", secondaryField: "" },
    autoSubmit: false,
  });

  useEffect(() => {
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      const response = await fetch("/api/health-insurers/settings");
      if (response.ok) {
        const data = await response.json();
        setSettings({
          enabled: data.enabled,
          clalit: {
            enabled: data.clalitEnabled,
            apiKey: data.clalitApiKey || "",
            secondaryField: data.clalitFacilityId || "",
          },
          maccabi: {
            enabled: data.maccabiEnabled,
            apiKey: data.maccabiApiKey || "",
            secondaryField: data.maccabiProviderId || "",
          },
          meuhedet: {
            enabled: data.meuhedetEnabled,
            username: data.meuhedetUsername || "",
            password: data.meuhedetPassword || "",
          },
          leumit: {
            enabled: data.leumitEnabled,
            apiKey: data.leumitApiKey || "",
            secondaryField: data.leumitClinicCode || "",
          },
          autoSubmit: data.autoSubmit,
        });
      }
    } catch (error) {
      console.error("Error loading settings:", error);
      toast.error("שגיאה בטעינת הגדרות");
    } finally {
      setLoading(false);
    }
  }

  async function saveSettings() {
    setSaving(true);
    try {
      const response = await fetch("/api/health-insurers/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          enabled: settings.enabled,
          clalitEnabled: settings.clalit.enabled,
          clalitApiKey: settings.clalit.apiKey,
          clalitFacilityId: settings.clalit.secondaryField,
          maccabiEnabled: settings.maccabi.enabled,
          maccabiApiKey: settings.maccabi.apiKey,
          maccabiProviderId: settings.maccabi.secondaryField,
          meuhedetEnabled: settings.meuhedet.enabled,
          meuhedetUsername: settings.meuhedet.username,
          meuhedetPassword: settings.meuhedet.password,
          leumitEnabled: settings.leumit.enabled,
          leumitApiKey: settings.leumit.apiKey,
          leumitClinicCode: settings.leumit.secondaryField,
          autoSubmit: settings.autoSubmit,
        }),
      });

      if (response.ok) {
        toast.success("ההגדרות נשמרו בהצלחה");
      } else {
        toast.error("שגיאה בשמירת הגדרות");
      }
    } catch (error) {
      console.error("Error saving settings:", error);
      toast.error("שגיאה בשמירת הגדרות");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <div className="p-8">טוען...</div>;
  }

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center gap-2">
        <Building2 className="h-6 w-6" />
        <h1 className="text-2xl font-bold">שילוב קופות חולים</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>הגדרות כלליות</CardTitle>
          <CardDescription>
            הפעל שילוב עם קוחולים לדיווח אוטומטי על טיפולים
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>הפעל שילוב ק</Label>
              <p className="text-sm text-muted-foreground">
                אפשר שליחת דיווחים לקופות חולים
              </p>
            </div>
            <Switch
              checked={settings.enabled}
              onCheckedChange={(checked) =>
                setSettings((prev) => ({ ...prev, enabled: checked }))
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="space-y-0.5">
              <Label>שליחה אוטומטית</Label>
              <p className="text-sm text-muted-foreground">
                שלח דיווחים אוטומטית בסיום כל פגישה
              </p>
            </div>
            <Switch
              checked={settings.autoSubmit}
              onCheckedChange={(checked) =>
                setSettings((prev) => ({ ...prev, autoSubmit: checked }))
              }
              disabled={!settings.enabled}
            />
          </div>
        </CardContent>
      </Card>

      {/* Clalit */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-green-600" />
            כללית
          </CardTitle>
          <CardDescription>הגדרות שילוב עם קופת חולים כללית</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>הפעל שילוב עם כללית</Label>
            <Switch
              checked={settings.clalit.enabled}
              onCheckedChange={(checked) =>
                setSettings((prev) => ({
                  ...prev,
                  clalit: { ...prev.clalit, enabled: checked },
                }))
              }
              disabled={!settings.enabled}
            />
          </div>

          {settings.clalit.enabled && (
            <>
              <div className="space-y-2">
                <Label htmlFor="clalit-api-key">API Key</Label>
                <Input
                  id="clalit-api-key"
                  type="password"
                  value={settings.clalit.apiKey}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      clalit: { ...prev.clalit, apiKey: e.target.value },
                    }))
                  }
                  placeholder="הזן API Key מכללית"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="clalit-facility">קוד מוסד</Label>
                <Input
                  id="clalit-facility"
                  value={settings.clalit.secondaryField}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      clalit: { ...prev.clalit, secondaryField: e.target.value },
                    }))
                  }
                  placeholder="הזן קוד מוסד"
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Maccabi */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-blue-600" />
            מכבי
          </CardTitle>
          <CardDescription>הגדרות שילוב עם קופת חולים מכבי</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>הפעל שילוב עם מכבי</Label>
            <Switch
              checked={settings.maccabi.enabled}
              onCheckedChange={(checked) =>
                setSettings((prev) => ({
                  ...prev,
                  maccabi: { ...prev.maccabi, enabled: checked },
                }))
              }
              disabled={!settings.enabled}
            />
          </div>

          {settings.maccabi.enabled && (
            <>
              <div className="space-y-2">
                <Label htmlFor="maccabi-api-key">API Key</Label>
                <Input
                  id="maccabi-api-key"
                  type="password"
                  value={settings.maccabi.apiKey}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      maccabi: { ...prev.maccabi, apiKey: e.target.value },
                    }))
                  }
                  placeholder="הזן API Key ממכבי"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="maccabi-provider">קוד ספק</Label>
                <Input
                  id="maccabi-provider"
                  value={settings.maccabi.secondaryField}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      maccabi: { ...prev.maccabi, secondaryField: e.target.value },
                    }))
                  }
                  placeholder="הזן קוד ספק"
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Meuhedet */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-orange-600" />
            מאוחדת
          </CardTitle>
          <CardDescription>הגדרות שילוב עם קופת חולים מאוחדת</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>הפעל שילוב עם מאוחדת</Label>
            <Switch
              checked={settings.meuhedet.enabled}
              onCheckedChange={(checked) =>
                setSettings((prev) => ({
                  ...prev,
                  meuhedet: { ...prev.meuhedet, enabled: checked },
                }))
              }
              disabled={!settings.enabled}
            />
          </div>

          {settings.meuhedet.enabled && (
            <>
              <div className="space-y-2">
                <Label htmlFor="meuhedet-username">שם משתמש</Label>
                <Input
                  id="meuhedet-username"
                  value={settings.meuhedet.username}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      meuhedet: { ...prev.meuhedet, username: e.target.value },
                    }))
                  }
                  placeholder="הזן שם משתמש"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="meuhedet-password">סיסמה</Label>
                <Input
                  id="meuhedet-password"
                  type="password"
                  value={settings.meuhedet.password}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      meuhedet: { ...prev.meuhedet, password: e.target.value },
                    }))
                  }
                  placeholder="הזן סיסמה"
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Leumit */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-red-600" />
            לאומית
          </CardTitle>
          <CardDescription>הגדרות שילוב עם קופת חולים לאומית</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label>הפעל שילוב עם לאומית</Label>
            <Switch
              checked={settings.leumit.enabled}
              onCheckedChange={(checked) =>
                setSettings((prev) => ({
                  ...prev,
                  leumit: { ...prev.leumit, enabled: checked },
                }))
              }
              disabled={!settings.enabled}
            />
          </div>

          {settings.leumit.enabled && (
            <>
              <div className="space-y-2">
                <Label htmlFor="leumit-api-key">API Key</Label>
                <Input
                  id="leumit-api-key"
                  type="password"
                  value={settings.leumit.apiKey}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      leumit: { ...prev.leumit, apiKey: e.target.value },
                    }))
                  }
                  placeholder="הזן API Key מלאומית"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="leumit-clinic">קוד מרפאה</Label>
                <Input
                  id="leumit-clinic"
                  value={settings.leumit.secondaryField}
                  onChange={(e) =>
                    setSettings((prev) => ({
                      ...prev,
                      leumit: { ...prev.leumit, secondaryField: e.target.value },
                    }))
                  }
                  placeholder="הזן קוד מרפאה"
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={saveSettings} disabled={saving}>
          <Save className="h-4 w-4 ml-2" />
          {saving ? "שומר..." : "שמור הגדרות"}
        </Button>
      </div>
    </div>
  );
}
