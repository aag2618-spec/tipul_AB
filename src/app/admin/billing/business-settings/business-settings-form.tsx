"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { AdminBusinessProfile } from "@/lib/site-settings";

interface Props {
  initialProfile: AdminBusinessProfile;
}

export function BusinessSettingsForm({ initialProfile }: Props) {
  const [profile, setProfile] = useState(initialProfile);
  const [pendingTypeChange, setPendingTypeChange] = useState<"EXEMPT" | "LICENSED" | null>(null);
  const [saving, setSaving] = useState(false);

  const updateField = <K extends keyof AdminBusinessProfile>(key: K, value: AdminBusinessProfile[K]) => {
    setProfile((prev) => ({ ...prev, [key]: value }));
  };

  const handleTypeClick = (newType: "EXEMPT" | "LICENSED") => {
    if (newType === profile.type) return;
    setPendingTypeChange(newType);
  };

  const confirmTypeChange = () => {
    if (!pendingTypeChange) return;
    setProfile((prev) => ({
      ...prev,
      type: pendingTypeChange,
      vatRate: pendingTypeChange === "LICENSED" ? prev.vatRate || 18 : 0,
    }));
    setPendingTypeChange(null);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/business-settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? `HTTP ${res.status}`);
      }
      const updated = (await res.json()) as AdminBusinessProfile;
      setProfile(updated);
      toast.success("הגדרות העסק נשמרו");
    } catch (err) {
      const message = err instanceof Error ? err.message : "שגיאה בשמירה";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 bg-white p-6 rounded-lg shadow-sm border">
      {/* סוג עסק */}
      <div>
        <Label className="block mb-2 font-semibold">סוג עסק</Label>
        <div className="flex gap-3">
          <button
            type="button"
            onClick={() => handleTypeClick("EXEMPT")}
            className={`flex-1 px-4 py-3 rounded-lg border-2 transition ${
              profile.type === "EXEMPT"
                ? "border-blue-500 bg-blue-50 font-bold"
                : "border-gray-200 hover:border-gray-300"
            }`}
          >
            עוסק פטור
            <div className="text-xs text-gray-500 mt-1">קבלה רגילה, ללא מע"מ</div>
          </button>
          <button
            type="button"
            onClick={() => handleTypeClick("LICENSED")}
            className={`flex-1 px-4 py-3 rounded-lg border-2 transition ${
              profile.type === "LICENSED"
                ? "border-blue-500 bg-blue-50 font-bold"
                : "border-gray-200 hover:border-gray-300"
            }`}
          >
            עוסק מורשה
            <div className="text-xs text-gray-500 mt-1">חשבונית מס-קבלה, עם מע"מ</div>
          </button>
        </div>
      </div>

      {/* פרטי עסק */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="name">שם העסק</Label>
          <Input
            id="name"
            value={profile.name}
            onChange={(e) => updateField("name", e.target.value)}
            placeholder="MyTipul"
          />
        </div>
        <div>
          <Label htmlFor="idNumber">מספר ת.ז / עוסק</Label>
          <Input
            id="idNumber"
            value={profile.idNumber}
            onChange={(e) => updateField("idNumber", e.target.value)}
            placeholder="123456789"
          />
        </div>
        <div className="md:col-span-2">
          <Label htmlFor="address">כתובת</Label>
          <Input
            id="address"
            value={profile.address}
            onChange={(e) => updateField("address", e.target.value)}
          />
        </div>
        <div>
          <Label htmlFor="phone">טלפון</Label>
          <Input
            id="phone"
            value={profile.phone}
            onChange={(e) => updateField("phone", e.target.value)}
            placeholder="054-1234567"
          />
        </div>
        <div>
          <Label htmlFor="email">מייל</Label>
          <Input
            id="email"
            type="email"
            value={profile.email}
            onChange={(e) => updateField("email", e.target.value)}
            placeholder="info@mytipul.co.il"
          />
        </div>
      </div>

      {profile.type === "LICENSED" && (
        <div className="max-w-xs">
          <Label htmlFor="vatRate">אחוז מע"מ</Label>
          <Input
            id="vatRate"
            type="number"
            min={0}
            max={100}
            value={profile.vatRate}
            onChange={(e) => updateField("vatRate", Number(e.target.value))}
          />
        </div>
      )}

      {/* תבנית קבלה */}
      <div>
        <Label htmlFor="logoUrl">קישור ללוגו (אופציונלי)</Label>
        <Input
          id="logoUrl"
          value={profile.logoUrl ?? ""}
          onChange={(e) => updateField("logoUrl", e.target.value || null)}
          placeholder="https://..."
        />
      </div>

      <div>
        <Label htmlFor="footerText">טקסט בתחתית הקבלה</Label>
        <Input
          id="footerText"
          value={profile.footerText ?? ""}
          onChange={(e) => updateField("footerText", e.target.value || null)}
          placeholder="תודה על הבחירה במערכת"
        />
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "שומר..." : "שמור הגדרות"}
        </Button>
      </div>

      {/* דיאלוג אישור מעבר פטור↔מורשה */}
      <AlertDialog open={pendingTypeChange !== null} onOpenChange={(open) => !open && setPendingTypeChange(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>
              מעבר ל{pendingTypeChange === "LICENSED" ? "עוסק מורשה" : "עוסק פטור"}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                <strong>שים לב:</strong> מסמכים שכבר הופקו לא ישתנו — זוהי דרישה חוקית. רק מסמכים חדשים
                שיופקו לאחר השינוי יושפעו.
              </p>
              {pendingTypeChange === "LICENSED" && (
                <p className="text-amber-700">
                  לאחר השמירה, יש לוודא דיווח לרשות המסים על תחילת פעילות כעוסק מורשה.
                </p>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>ביטול</AlertDialogCancel>
            <AlertDialogAction onClick={confirmTypeChange}>אשר ועבור</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
