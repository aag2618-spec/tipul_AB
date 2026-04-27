"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

interface Props {
  initialMode: "sandbox" | "production";
  productionConfigured: boolean;
}

export function CardcomSetupForm({ initialMode, productionConfigured }: Props) {
  const [mode, setMode] = useState(initialMode);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);

  const handleSave = async () => {
    if (mode === "production" && !productionConfigured) {
      toast.error("פרטי Cardcom של פרודקשן לא הוגדרו ב-env. אי אפשר לעבור ל-production.");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch("/api/admin/cardcom/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? `HTTP ${res.status}`);
      }
      toast.success("המצב נשמר בהצלחה");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "שגיאה בשמירה");
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const res = await fetch("/api/admin/cardcom/setup/test", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as { ok?: boolean; message?: string };
      if (!res.ok || !body.ok) {
        throw new Error(body.message ?? "החיבור נכשל");
      }
      toast.success("החיבור ל-Cardcom תקין");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "החיבור נכשל");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="space-y-6 bg-white p-6 rounded-lg shadow-sm border">
      <div>
        <Label className="block mb-2 font-semibold">מצב המסוף</Label>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => setMode("sandbox")}
            className={`flex-1 px-4 py-3 rounded-lg border-2 transition ${
              mode === "sandbox"
                ? "border-blue-500 bg-blue-50 font-bold"
                : "border-gray-200 hover:border-gray-300"
            }`}
          >
            Sandbox (בדיקה)
            <div className="text-xs text-gray-500 mt-1">לא נגבה כסף אמיתי. לפיתוח ובדיקות.</div>
          </button>
          <button
            type="button"
            onClick={() => setMode("production")}
            disabled={!productionConfigured}
            className={`flex-1 px-4 py-3 rounded-lg border-2 transition disabled:opacity-50 disabled:cursor-not-allowed ${
              mode === "production"
                ? "border-green-500 bg-green-50 font-bold"
                : "border-gray-200 hover:border-gray-300"
            }`}
          >
            Production (חי)
            <div className="text-xs text-gray-500 mt-1">
              {productionConfigured ? "מסוף אמיתי, גביית כסף בפועל." : "לא הוגדר ב-env. צור קשר עם המפתח."}
            </div>
          </button>
        </div>
      </div>

      <div className="bg-gray-50 p-4 rounded-md text-sm space-y-2">
        <p className="font-semibold">סטטוס תצורה:</p>
        <ul className="list-disc list-inside space-y-1 text-gray-700">
          <li>Sandbox — תמיד זמין (Cardcom מספקים פרטים ציבוריים)</li>
          <li>
            Production —{" "}
            {productionConfigured ? (
              <span className="text-green-700 font-semibold">הוגדר ✓</span>
            ) : (
              <span className="text-amber-700 font-semibold">דרושה תצורת env</span>
            )}
          </li>
        </ul>
      </div>

      <div className="flex flex-wrap gap-3 pt-4 border-t">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "שומר..." : "שמור מצב"}
        </Button>
        <Button variant="outline" onClick={handleTest} disabled={testing}>
          {testing ? "בודק..." : "בדוק חיבור"}
        </Button>
      </div>
    </div>
  );
}
