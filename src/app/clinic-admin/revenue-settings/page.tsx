"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Loader2,
  AlertCircle,
  ArrowRight,
  PercentCircle,
  Save,
  Building2,
} from "lucide-react";
import { toast } from "sonner";

interface TherapistRow {
  id: string;
  name: string | null;
  email: string;
  revenueSharePct: number | null;
}

interface SettingsResponse {
  orgDefaultPct: number | null;
  therapists: TherapistRow[];
}

// קלט שדה אחוז: מחזיר number | null. ריק → null (יורש מהארגון/ברירת מחדל).
// טווח: 0-100. ערכים מחוץ לתחום מוחזקים כ-null עם הודעה מתאימה בולידציה.
function parsePctInput(raw: string): { value: number | null; error?: string } {
  if (raw.trim() === "") return { value: null };
  const n = Number(raw);
  if (!Number.isFinite(n)) return { value: null, error: "ערך לא מספרי" };
  if (n < 0) return { value: null, error: "האחוז חייב להיות 0 ומעלה" };
  if (n > 100) return { value: null, error: "האחוז חייב להיות 100 או פחות" };
  return { value: n };
}

function pctToString(n: number | null): string {
  return n === null || n === undefined ? "" : String(n);
}

export default function RevenueSettingsPage() {
  const [orgDefaultRaw, setOrgDefaultRaw] = useState<string>("");
  const [therapists, setTherapists] = useState<TherapistRow[]>([]);
  const [therapistRaw, setTherapistRaw] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // B5: ה-dirty-state נגזר מהשוואה לערכים שנטענו במקור (initial*) — ולא
  // מ-flag דביק. כך שעריכה שחוזרת לערך המקורי מכבה את כפתור השמירה.
  const [initialOrgDefaultRaw, setInitialOrgDefaultRaw] = useState<string>("");
  const [initialTherapistRaw, setInitialTherapistRaw] = useState<
    Record<string, string>
  >({});

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/clinic-admin/revenue-settings");
        if (cancelled) return;
        if (!res.ok) {
          if (res.status === 403) {
            setError("הגישה לדף זה זמינה רק לבעלי/ות קליניקה.");
          } else if (res.status === 400) {
            setError("אינך משויך/ת לקליניקה.");
          } else {
            setError("שגיאה בטעינת הגדרות פיצול הכנסות.");
          }
          return;
        }
        const json = (await res.json()) as SettingsResponse;
        if (!cancelled) {
          const orgRaw = pctToString(json.orgDefaultPct);
          const therapistRawMap = Object.fromEntries(
            json.therapists.map((t) => [t.id, pctToString(t.revenueSharePct)])
          );
          setOrgDefaultRaw(orgRaw);
          setTherapists(json.therapists);
          setTherapistRaw(therapistRawMap);
          setInitialOrgDefaultRaw(orgRaw);
          setInitialTherapistRaw(therapistRawMap);
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

  const orgValidation = useMemo(() => parsePctInput(orgDefaultRaw), [
    orgDefaultRaw,
  ]);
  const therapistsValidation = useMemo(() => {
    const map: Record<string, { value: number | null; error?: string }> = {};
    for (const t of therapists) {
      map[t.id] = parsePctInput(therapistRaw[t.id] ?? "");
    }
    return map;
  }, [therapists, therapistRaw]);

  const hasAnyError =
    !!orgValidation.error ||
    Object.values(therapistsValidation).some((v) => v.error);

  // B5: dirty אמיתי — משווים את הערכים המספריים הנוכחיים לאלו שנטענו.
  // החזרת שדה לערכו המקורי מבטלת את מצב ה-dirty (כפתור השמירה נכבה).
  const isDirty = useMemo(() => {
    if (orgValidation.value !== parsePctInput(initialOrgDefaultRaw).value) {
      return true;
    }
    for (const t of therapists) {
      const current = therapistsValidation[t.id]?.value ?? null;
      const initial = parsePctInput(initialTherapistRaw[t.id] ?? "").value;
      if (current !== initial) return true;
    }
    return false;
  }, [
    orgValidation.value,
    initialOrgDefaultRaw,
    therapists,
    therapistsValidation,
    initialTherapistRaw,
  ]);

  async function onSave() {
    if (hasAnyError) {
      toast.error("יש שדות עם ערכים לא תקינים");
      return;
    }
    setSaving(true);
    try {
      const body = {
        orgDefaultPct: orgValidation.value,
        therapists: therapists.map((t) => ({
          id: t.id,
          revenueSharePct: therapistsValidation[t.id]?.value ?? null,
        })),
      };
      const res = await fetch("/api/clinic-admin/revenue-settings", {
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
      // אחרי שמירה מוצלחת — הערכים הנוכחיים הם ה"מקור" החדש (dirty מתאפס).
      setInitialOrgDefaultRaw(orgDefaultRaw);
      setInitialTherapistRaw(therapistRaw);
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
        <Loader2
          className="h-8 w-8 animate-spin text-primary"
          aria-hidden="true"
        />
        <span className="sr-only">טוען הגדרות פיצול הכנסות…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4 max-w-2xl mx-auto" dir="rtl">
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <AlertCircle
              className="h-10 w-10 text-amber-500 mx-auto"
              aria-hidden="true"
            />
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
            <PercentCircle className="h-6 w-6 text-primary" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">הגדרות פיצול הכנסות</h1>
            <p className="text-sm text-muted-foreground">
              קביעת אחוז ההכנסה לכל מטפל/ת. ריק = יורש מברירת המחדל של הקליניקה.
              ברירת המחדל ריקה = 100% למטפל/ת (אין פיצול — תאימות אחורית).
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" aria-hidden="true" />
            ברירת מחדל לקליניקה
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label htmlFor="org-default-pct">אחוז למטפל/ת (0-100)</Label>
              <Input
                id="org-default-pct"
                type="number"
                inputMode="decimal"
                min={0}
                max={100}
                step={0.01}
                value={orgDefaultRaw}
                onChange={(e) => {
                  setOrgDefaultRaw(e.target.value);
                }}
                placeholder="ריק = 100%"
                className="w-40"
                aria-invalid={!!orgValidation.error}
                aria-describedby={
                  orgValidation.error ? "org-default-pct-err" : undefined
                }
              />
              {orgValidation.error && (
                <p
                  id="org-default-pct-err"
                  className="text-xs text-red-600 dark:text-red-400"
                >
                  {orgValidation.error}
                </p>
              )}
            </div>
            <p className="text-xs text-muted-foreground max-w-md leading-relaxed">
              ערך זה משמש כברירת מחדל לכל מטפל/ת שלא הוגדר/ה לו/ה אחוז מפורש
              למטה. <strong>ריק</strong> = 100% למטפל/ת (אין פיצול);{" "}
              <strong>0</strong> = 0% למטפל/ת (כל ההכנסה לקליניקה).
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">אחוז פר-מטפל/ת</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {therapists.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              אין מטפלים פעילים בקליניקה כרגע.
            </p>
          ) : (
            therapists.map((t) => {
              const validation = therapistsValidation[t.id];
              const displayName =
                t.name?.trim() || t.email || "מטפל/ת ללא שם";
              const inputId = `t-pct-${t.id}`;
              return (
                <div
                  key={t.id}
                  className="flex flex-wrap items-end gap-3 py-2 border-b border-border last:border-b-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{displayName}</p>
                    {t.name && t.email && (
                      <p className="text-xs text-muted-foreground truncate">
                        {t.email}
                      </p>
                    )}
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={inputId} className="text-xs">
                      אחוז (ריק = ברירת מחדל)
                    </Label>
                    <Input
                      id={inputId}
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={100}
                      step={0.01}
                      value={therapistRaw[t.id] ?? ""}
                      onChange={(e) => {
                        setTherapistRaw((prev) => ({
                          ...prev,
                          [t.id]: e.target.value,
                        }));
                      }}
                      placeholder="ברירת מחדל"
                      className="w-32"
                      aria-invalid={!!validation?.error}
                      aria-describedby={
                        validation?.error ? `${inputId}-err` : undefined
                      }
                    />
                    {validation?.error && (
                      <p
                        id={`${inputId}-err`}
                        className="text-xs text-red-600 dark:text-red-400"
                      >
                        {validation.error}
                      </p>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          השמירה משפיעה רק על תשלומים עתידיים. תשלומים קיימים שכבר חושבו בדוח
          (החודש הנוכחי) ישקפו את ההגדרות החדשות בריענון הבא של הדוח.
        </p>
        <Button
          onClick={onSave}
          disabled={saving || hasAnyError || !isDirty}
          aria-busy={saving}
        >
          {saving ? (
            <>
              <Loader2
                className="ml-2 h-4 w-4 animate-spin"
                aria-hidden="true"
              />
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
