"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Loader2,
  AlertCircle,
  ArrowRight,
  CreditCard,
  Save,
  CheckCircle2,
  Clock,
  Building2,
  FlaskConical,
} from "lucide-react";
import { toast } from "sonner";

type BillingMode = "CLINIC" | "OWN";

interface TherapistRow {
  id: string;
  name: string | null;
  email: string;
  clinicBillingMode: BillingMode;
  revenueSharePct: number | null;
  cardcom: { connected: boolean; mode: "sandbox" | "production" | null };
}

interface SettingsResponse {
  therapistDebtTracking: boolean;
  orgDefaultPct: number | null;
  therapists: TherapistRow[];
}

// אחוז שהמטפל/ת צריך/ה להעביר לקליניקה = 100% פחות חלקו/ה. ריק = יורש מברירת
// המחדל של הקליניקה; בהיעדר → 100% למטפל/ת (כלומר 0% לקליניקה).
function clinicSharePct(
  therapistPct: number | null,
  orgDefaultPct: number | null
): number {
  const effective = therapistPct ?? orgDefaultPct ?? 100;
  return Math.max(0, Math.min(100, 100 - effective));
}

export default function TherapistPaymentsPage() {
  const [therapists, setTherapists] = useState<TherapistRow[]>([]);
  const [modes, setModes] = useState<Record<string, BillingMode>>({});
  const [debtTracking, setDebtTracking] = useState(false);
  const [orgDefaultPct, setOrgDefaultPct] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [initialModes, setInitialModes] = useState<Record<string, BillingMode>>(
    {}
  );
  const [initialDebtTracking, setInitialDebtTracking] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/clinic-admin/therapist-payments");
        if (cancelled) return;
        if (!res.ok) {
          if (res.status === 403) {
            setError("הגישה לדף זה זמינה רק לבעלי/ות קליניקה.");
          } else if (res.status === 400) {
            setError("אינך משויך/ת לקליניקה.");
          } else {
            setError("שגיאה בטעינת הסדרי הסליקה.");
          }
          return;
        }
        const json = (await res.json()) as SettingsResponse;
        if (!cancelled) {
          const modeMap = Object.fromEntries(
            json.therapists.map((t) => [t.id, t.clinicBillingMode])
          );
          setTherapists(json.therapists);
          setModes(modeMap);
          setInitialModes(modeMap);
          setDebtTracking(json.therapistDebtTracking);
          setInitialDebtTracking(json.therapistDebtTracking);
          setOrgDefaultPct(json.orgDefaultPct);
        }
      } catch {
        if (!cancelled) {
          toast.error("שגיאת רשת בטעינת ההגדרות");
          setError("שגיאת רשת בטעינת ההגדרות");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const isDirty = useMemo(() => {
    if (debtTracking !== initialDebtTracking) return true;
    for (const t of therapists) {
      if (modes[t.id] !== initialModes[t.id]) return true;
    }
    return false;
  }, [debtTracking, initialDebtTracking, therapists, modes, initialModes]);

  async function onSave() {
    setSaving(true);
    try {
      const body = {
        therapistDebtTracking: debtTracking,
        therapists: therapists.map((t) => ({
          id: t.id,
          clinicBillingMode: modes[t.id] ?? "CLINIC",
        })),
      };
      const res = await fetch("/api/clinic-admin/therapist-payments", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        toast.error(data?.message || "שגיאה בשמירה");
        return;
      }
      toast.success("ההגדרות נשמרו בהצלחה");
      setInitialModes(modes);
      setInitialDebtTracking(debtTracking);
    } catch {
      toast.error("שגיאת רשת בשמירה");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div
        className="flex justify-center py-16"
        role="status"
        aria-live="polite"
        dir="rtl"
      >
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
        <span className="sr-only">טוען הסדרי סליקה…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4 max-w-2xl mx-auto" dir="rtl">
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <AlertCircle className="h-10 w-10 text-amber-500 mx-auto" aria-hidden="true" />
            <p className="font-medium">{error}</p>
            <Button asChild variant="outline">
              <Link href="/clinic-admin">
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                חזרה לסקירה
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/15 rounded-lg">
            <CreditCard className="h-6 w-6 text-primary" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">סליקה למטפלים</h1>
            <p className="text-sm text-muted-foreground max-w-xl">
              כאן קובעים לכל מטפל/ת אם תשלומי המטופלים נגבים דרך מסוף הקליניקה
              או דרך מסוף סליקה פרטי שלו/ה.{" "}
              <strong>זה לא קשור לתשלום מנוי התוכנה</strong> — רק לאן נכנס הכסף
              מהמטופלים.
            </p>
          </div>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/clinic-admin/revenue">
            <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
            לדוח החודשי
          </Link>
        </Button>
      </div>

      {/* מתג מעקב חוב לקליניקה */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" aria-hidden="true" />
            מעקב העברות מטפלים לקליניקה
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground max-w-2xl leading-relaxed">
            כשמטפל/ת גובה לחשבון העצמאי שלו/ה — האם המערכת תחשב ותציג כמה צריך
            להעביר לקליניקה (לפי אחוז הפיצול שהוגדר ב
            <Link
              href="/clinic-admin/revenue-settings"
              className="text-primary hover:underline mx-1"
            >
              הגדרות פיצול הכנסות
            </Link>
            ), או שזה מנוהל ידנית מחוץ למערכת.
          </p>
          <div className="flex gap-2 max-w-md">
            <Button
              type="button"
              variant={debtTracking ? "default" : "outline"}
              size="sm"
              className="flex-1"
              onClick={() => setDebtTracking(true)}
            >
              מעקב אוטומטי
            </Button>
            <Button
              type="button"
              variant={!debtTracking ? "default" : "outline"}
              size="sm"
              className="flex-1"
              onClick={() => setDebtTracking(false)}
            >
              ניהול ידני
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* מצב סליקה לכל מטפל/ת */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">מצב סליקה לכל מטפל/ת</CardTitle>
        </CardHeader>
        <CardContent className="space-y-1">
          {therapists.length === 0 ? (
            <p className="text-sm text-muted-foreground py-2">
              אין מטפלים פעילים בקליניקה כרגע.
            </p>
          ) : (
            therapists.map((t) => {
              const mode = modes[t.id] ?? "CLINIC";
              const displayName = t.name?.trim() || t.email || "מטפל/ת ללא שם";
              const cPct = clinicSharePct(t.revenueSharePct, orgDefaultPct);
              return (
                <div
                  key={t.id}
                  className="flex flex-wrap items-center gap-3 py-3 border-b border-border last:border-b-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{displayName}</p>
                    {t.name && t.email && (
                      <p className="text-xs text-muted-foreground truncate">
                        {t.email}
                      </p>
                    )}
                    <div className="mt-1">
                      <StatusBadge mode={mode} cardcom={t.cardcom} />
                    </div>
                    {debtTracking && mode === "OWN" && (
                      <p className="text-xs text-muted-foreground mt-1">
                        להעברה לקליניקה: {cPct}% מהנגבה ·{" "}
                        <Link
                          href="/clinic-admin/revenue"
                          className="text-primary hover:underline"
                        >
                          לסכומים בדוח
                        </Link>
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2 shrink-0">
                    <Button
                      type="button"
                      variant={mode === "CLINIC" ? "default" : "outline"}
                      size="sm"
                      className="text-xs"
                      onClick={() =>
                        setModes((p) => ({ ...p, [t.id]: "CLINIC" }))
                      }
                    >
                      חשבון הקליניקה
                    </Button>
                    <Button
                      type="button"
                      variant={mode === "OWN" ? "default" : "outline"}
                      size="sm"
                      className="text-xs"
                      onClick={() => setModes((p) => ({ ...p, [t.id]: "OWN" }))}
                    >
                      חשבון עצמאי
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground max-w-xl">
          השינוי חל על חיובים עתידיים בלבד. מטפל/ת ב״חשבון עצמאי״ שעדיין לא חיבר/ה
          מסוף — לא יוכל/תוכל לגבות עד שיחבר/תחבר אותו ב״הגדרות ← חיבורים״.
        </p>
        <Button onClick={onSave} disabled={saving || !isDirty} aria-busy={saving}>
          {saving ? (
            <>
              <Loader2 className="ml-2 h-4 w-4 animate-spin" aria-hidden="true" />
              שומר…
            </>
          ) : (
            <>
              <Save className="ml-2 h-4 w-4" aria-hidden="true" />
              שמור הגדרות
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function StatusBadge({
  mode,
  cardcom,
}: {
  mode: BillingMode;
  cardcom: { connected: boolean; mode: "sandbox" | "production" | null };
}) {
  const base =
    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium";

  if (mode === "CLINIC") {
    return (
      <span className={`${base} bg-muted text-muted-foreground`}>
        <Building2 className="h-3 w-3" aria-hidden="true" />
        גובה דרך הקליניקה
      </span>
    );
  }

  // mode === OWN
  if (!cardcom.connected) {
    return (
      <span
        className={`${base} bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300`}
      >
        <Clock className="h-3 w-3" aria-hidden="true" />
        ממתין — על המטפל/ת לחבר סליקה בהגדרות שלו/ה
      </span>
    );
  }
  if (cardcom.mode === "sandbox") {
    return (
      <span
        className={`${base} bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300`}
      >
        <FlaskConical className="h-3 w-3" aria-hidden="true" />
        מצב בדיקה (לא כסף אמיתי)
      </span>
    );
  }
  return (
    <span
      className={`${base} bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300`}
    >
      <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
      מחובר ✓ (מסוף פרטי)
    </span>
  );
}
