"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

export interface LandingSettings {
  privatePrice: string;
  priceNote: string;
  priceVisible: boolean;
}

interface Props {
  initial: LandingSettings;
}

export function LandingSettingsForm({ initial }: Props) {
  const [settings, setSettings] = useState(initial);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/landing-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? `HTTP ${res.status}`);
      }
      const updated = (await res.json()) as LandingSettings;
      setSettings(updated);
      toast.success("הגדרות דף הנחיתה נשמרו");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "שגיאה בשמירה");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 bg-white p-6 rounded-lg shadow-sm border">
      {/* מתג ניראות מחיר */}
      <div className="flex items-center justify-between gap-4 p-4 rounded-lg border bg-gray-50">
        <div>
          <Label className="font-semibold">הצג מחיר בדף הנחיתה</Label>
          <p className="text-xs text-gray-500 mt-1">
            כבוי → יוצג &quot;פנו לפרטים&quot;. דלוק → יוצגו המחיר וההערה שלמטה.
          </p>
        </div>
        <Switch
          checked={settings.priceVisible}
          onCheckedChange={(checked) =>
            setSettings((p) => ({ ...p, priceVisible: checked }))
          }
        />
      </div>

      {/* מחיר */}
      <div>
        <Label htmlFor="privatePrice">מחיר מסלול &quot;מטפל פרטי&quot;</Label>
        <Input
          id="privatePrice"
          value={settings.privatePrice}
          onChange={(e) =>
            setSettings((p) => ({ ...p, privatePrice: e.target.value }))
          }
          placeholder='למשל: 49 או "מחיר השקה"'
        />
        <p className="text-xs text-gray-500 mt-1">
          הטקסט שיוצג כמחיר. אפשר מספר (&quot;49&quot;) או טקסט חופשי. ריק → &quot;פנו לפרטים&quot;.
        </p>
      </div>

      {/* הערת מחיר */}
      <div>
        <Label htmlFor="priceNote">הערת מחיר (טקסט מבצע)</Label>
        <Input
          id="priceNote"
          value={settings.priceNote}
          onChange={(e) =>
            setSettings((p) => ({ ...p, priceNote: e.target.value }))
          }
          placeholder='למשל: "מחיר השקה מוזל · לזמן מוגבל"'
        />
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "שומר..." : "שמור הגדרות"}
        </Button>
      </div>
    </div>
  );
}
