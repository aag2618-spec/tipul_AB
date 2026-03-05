"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Calendar, Clock, Link2, Copy, Check, Loader2, ExternalLink, Settings } from "lucide-react";

interface WorkingDay { start: string; end: string; enabled: boolean; }

interface BookingSettings {
  id?: string;
  enabled: boolean;
  slug?: string;
  workingHours: Record<string, WorkingDay>;
  breaks: Array<{ start: string; end: string }>;
  sessionDuration: number;
  bufferBetween: number;
  maxAdvanceDays: number;
  minAdvanceHours: number;
  requireApproval: boolean;
  welcomeMessage: string;
  confirmationMessage: string;
  defaultSessionType: string;
  defaultPrice: number | null;
}

const DAY_NAMES: Record<string, string> = {
  "0": "ראשון", "1": "שני", "2": "שלישי", "3": "רביעי", "4": "חמישי",
  "5": "שישי (עד 17:30)", "6": "מוצ״ש (מ-17:45)",
};

const DEFAULT_SETTINGS: BookingSettings = {
  enabled: false,
  workingHours: {
    "0": { start: "09:00", end: "18:00", enabled: true },
    "1": { start: "09:00", end: "18:00", enabled: true },
    "2": { start: "09:00", end: "18:00", enabled: true },
    "3": { start: "09:00", end: "18:00", enabled: true },
    "4": { start: "09:00", end: "18:00", enabled: true },
    "5": { start: "09:00", end: "17:30", enabled: true },
    "6": { start: "17:45", end: "21:00", enabled: true },
  },
  breaks: [], sessionDuration: 50, bufferBetween: 10, maxAdvanceDays: 30,
  minAdvanceHours: 24, requireApproval: true, welcomeMessage: "",
  confirmationMessage: "", defaultSessionType: "IN_PERSON", defaultPrice: null,
};

export default function BookingSettingsPage() {
  const [settings, setSettings] = useState<BookingSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/user/booking-settings");
        const data = await res.json();
        if (data && data.id) {
          setSettings({ ...DEFAULT_SETTINGS, ...data, welcomeMessage: data.welcomeMessage || "", confirmationMessage: data.confirmationMessage || "", defaultPrice: data.defaultPrice ? Number(data.defaultPrice) : null });
        }
      } catch { toast.error("שגיאה בטעינת ההגדרות"); }
      finally { setLoading(false); }
    }
    load();
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await fetch("/api/user/booking-settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...settings, defaultPrice: settings.defaultPrice || undefined }) });
      const data = await res.json();
      if (res.ok) { setSettings((prev) => ({ ...prev, ...data, slug: data.slug })); toast.success("ההגדרות נשמרו בהצלחה"); }
      else { toast.error("שגיאה בשמירת ההגדרות"); }
    } catch { toast.error("שגיאה בשמירת ההגדרות"); }
    finally { setSaving(false); }
  }

  function copyLink() {
    if (!settings.slug) return;
    navigator.clipboard.writeText(`${window.location.origin}/booking/${settings.slug}`);
    setCopied(true);
    toast.success("הקישור הועתק!");
    setTimeout(() => setCopied(false), 2000);
  }

  function updateDay(day: string, field: keyof WorkingDay, value: string | boolean) {
    setSettings((prev) => ({ ...prev, workingHours: { ...prev.workingHours, [day]: { ...prev.workingHours[day], [field]: value } } }));
  }

  if (loading) return (<div className="flex items-center justify-center min-h-[400px]"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>);

  const bookingUrl = settings.slug ? `${typeof window !== "undefined" ? window.location.origin : ""}/booking/${settings.slug}` : null;

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">זימון עצמי</h1>
        <p className="text-muted-foreground">אפשר למטופלים לקבוע תורים בעצמם דרך קישור ייחודי</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Link2 className="h-5 w-5 text-primary" />הפעלת זימון עצמי</CardTitle>
          <CardDescription>כשמופעל, מטופלים יכולים לקבוע תורים דרך הקישור שלך</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="enabled" className="text-base font-medium">{settings.enabled ? "פעיל" : "לא פעיל"}</Label>
            <Switch id="enabled" checked={settings.enabled} onCheckedChange={(v) => setSettings((p) => ({ ...p, enabled: v }))} />
          </div>
          {bookingUrl && (
            <div className="flex items-center gap-2 bg-muted/50 rounded-lg p-3">
              <Input value={bookingUrl} readOnly className="bg-transparent border-0 text-sm" dir="ltr" />
              <Button variant="outline" size="icon" onClick={copyLink}>{copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}</Button>
              <Button variant="outline" size="icon" asChild><a href={bookingUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-4 w-4" /></a></Button>
            </div>
          )}
          {!settings.slug && <p className="text-sm text-muted-foreground">שמור את ההגדרות כדי ליצור קישור זימון ייחודי</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5 text-primary" />שעות עבודה</CardTitle>
          <CardDescription>הגדר באילו ימים ושעות מטופלים יכולים לקבוע תורים</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {Object.entries(DAY_NAMES).map(([day, name]) => {
            const config = settings.workingHours[day];
            if (!config) return null;
            const isFriday = day === "5";
            const isSaturday = day === "6";
            return (
              <div key={day} className="flex items-center gap-3 flex-wrap">
                <Switch checked={config.enabled} onCheckedChange={(v) => updateDay(day, "enabled", v)} />
                <span className="w-32 text-sm font-medium">{name}</span>
                {config.enabled && (
                  <div className="flex items-center gap-2">
                    <Input type="time" value={config.start} onChange={(e) => updateDay(day, "start", e.target.value)} className="w-28" dir="ltr" min={isSaturday ? "17:45" : undefined} />
                    <span className="text-muted-foreground">עד</span>
                    <Input type="time" value={config.end} onChange={(e) => updateDay(day, "end", e.target.value)} className="w-28" dir="ltr" max={isFriday ? "17:30" : undefined} />
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Settings className="h-5 w-5 text-primary" />הגדרות פגישה</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>משך פגישה (דקות)</Label><Input type="number" value={settings.sessionDuration} onChange={(e) => setSettings((p) => ({ ...p, sessionDuration: Number(e.target.value) }))} min={15} max={120} /></div>
            <div className="space-y-2"><Label>הפסקה בין פגישות (דקות)</Label><Input type="number" value={settings.bufferBetween} onChange={(e) => setSettings((p) => ({ ...p, bufferBetween: Number(e.target.value) }))} min={0} max={60} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>זימון מראש עד (ימים)</Label><Input type="number" value={settings.maxAdvanceDays} onChange={(e) => setSettings((p) => ({ ...p, maxAdvanceDays: Number(e.target.value) }))} min={1} max={90} /></div>
            <div className="space-y-2"><Label>מינימום שעות מראש</Label><Input type="number" value={settings.minAdvanceHours} onChange={(e) => setSettings((p) => ({ ...p, minAdvanceHours: Number(e.target.value) }))} min={1} max={72} /></div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>סוג פגישה</Label><Select value={settings.defaultSessionType} onValueChange={(v) => setSettings((p) => ({ ...p, defaultSessionType: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="IN_PERSON">פרונטלית</SelectItem><SelectItem value="ONLINE">אונליין</SelectItem><SelectItem value="PHONE">טלפונית</SelectItem></SelectContent></Select></div>
            <div className="space-y-2"><Label>מחיר ברירת מחדל (₪)</Label><Input type="number" value={settings.defaultPrice ?? ""} onChange={(e) => setSettings((p) => ({ ...p, defaultPrice: e.target.value ? Number(e.target.value) : null }))} placeholder="לא מוגדר" min={0} /></div>
          </div>
          <div className="flex items-center justify-between pt-2">
            <div><Label className="text-base font-medium">אישור ידני</Label><p className="text-sm text-muted-foreground">{settings.requireApproval ? "תורים ממתינים לאישור שלך" : "תורים נקבעים אוטומטית"}</p></div>
            <Switch checked={settings.requireApproval} onCheckedChange={(v) => setSettings((p) => ({ ...p, requireApproval: v }))} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><Calendar className="h-5 w-5 text-primary" />הודעות</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>הודעת פתיחה (מוצגת בראש דף הזימון)</Label>
            <textarea value={settings.welcomeMessage} onChange={(e) => setSettings((p) => ({ ...p, welcomeMessage: e.target.value }))} placeholder="ברוכים הבאים! כאן תוכלו לקבוע תור לפגישה..." className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
          <div className="space-y-2">
            <Label>הודעת אישור (מוצגת אחרי קביעת תור)</Label>
            <textarea value={settings.confirmationMessage} onChange={(e) => setSettings((p) => ({ ...p, confirmationMessage: e.target.value }))} placeholder="הבקשה התקבלה! אאשר את התור בהקדם." className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring" />
          </div>
        </CardContent>
      </Card>

      <Button onClick={handleSave} disabled={saving} size="lg" className="w-full">
        {saving ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : null}
        {saving ? "שומר..." : "שמירת הגדרות"}
      </Button>
    </div>
  );
}
