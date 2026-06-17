"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  AlertCircle,
  ArrowRight,
  CalendarX2,
  TrendingUp,
  Gauge,
  Users,
  Receipt,
  BarChart3,
} from "lucide-react";
import { toast } from "sonner";

interface MonthRow {
  label: string;
  completed: number;
  noShow: number;
  cancelled: number;
  total: number;
  noShowRate: number;
}

interface AnalyticsResponse {
  months: MonthRow[];
  totals: { completed: number; noShow: number; cancelled: number; noShowRate: number };
  generatedAt: string;
}

export default function ClinicAnalyticsPage() {
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/clinic-admin/analytics");
        if (cancelled) return;
        if (!res.ok) {
          if (res.status === 403) {
            setError("הגישה לדף זה זמינה רק לבעלי/ות קליניקה.");
          } else if (res.status === 400) {
            setError("אינך משויך/ת לקליניקה.");
          } else {
            setError("שגיאה בטעינת האנליטיקה.");
          }
          return;
        }
        const json = (await res.json()) as AnalyticsResponse;
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) {
          toast.error("שגיאת רשת בטעינת האנליטיקה");
          setError("שגיאת רשת בטעינת האנליטיקה");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex justify-center py-16" role="status" aria-live="polite">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
        <span className="sr-only">טוען אנליטיקה…</span>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-4 max-w-2xl mx-auto" dir="rtl">
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <AlertCircle className="h-10 w-10 text-amber-500 mx-auto" aria-hidden="true" />
            <p className="font-medium">{error || "לא נטענו נתונים"}</p>
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

  const maxTotal = Math.max(...data.months.map((m) => m.total), 1);
  const hasData = data.months.some((m) => m.total > 0);
  const generatedLabel = (() => {
    try {
      return new Date(data.generatedAt).toLocaleString("he-IL", {
        timeZone: "Asia/Jerusalem",
        dateStyle: "short",
        timeStyle: "short",
      });
    } catch {
      return data.generatedAt;
    }
  })();

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/15 rounded-lg">
            <TrendingUp className="h-6 w-6 text-primary" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">מגמות ואי-הגעות</h1>
            <p className="text-sm text-muted-foreground">
              6 החודשים האחרונים — פגישות שהושלמו, אי-הגעות וביטולים בכל הקליניקה.
            </p>
          </div>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/clinic-admin">
            <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
            חזרה לסקירה
          </Link>
        </Button>
      </div>

      {/* KPIs — 6 חודשים */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">פגישות שהושלמו</p>
            <p className="text-2xl font-bold mt-1">
              {data.totals.completed.toLocaleString("he-IL")}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">אי-הגעות (שיעור)</p>
            <p
              className={`text-2xl font-bold mt-1 flex items-center gap-2 ${
                data.totals.noShow > 0 ? "text-red-600 dark:text-red-400" : ""
              }`}
            >
              <CalendarX2 className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
              {data.totals.noShow.toLocaleString("he-IL")}
              <span className="text-sm font-normal text-muted-foreground">
                ({data.totals.noShowRate}%)
              </span>
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">ביטולים</p>
            <p className="text-2xl font-bold mt-1">
              {data.totals.cancelled.toLocaleString("he-IL")}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* מגמה חודשית */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Gauge className="h-4 w-4 text-primary" aria-hidden="true" />
            פילוח חודשי
          </CardTitle>
          {/* מקרא */}
          <div className="flex flex-wrap gap-3 pt-1 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" aria-hidden="true" />
              הושלמו
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500" aria-hidden="true" />
              לא הגיעו
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-2.5 w-2.5 rounded-full bg-gray-400" aria-hidden="true" />
              בוטלו
            </span>
          </div>
        </CardHeader>
        <CardContent>
          {hasData ? (
            <div className="space-y-4">
              {data.months.map((m) => (
                <div key={m.label} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{m.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {m.total.toLocaleString("he-IL")} פגישות
                      {m.completed + m.noShow > 0 && (
                        <>
                          {" · "}
                          <span
                            className={
                              m.noShow > 0 ? "text-red-600 dark:text-red-400" : ""
                            }
                          >
                            אי-הגעה {m.noShowRate}%
                          </span>
                        </>
                      )}
                    </span>
                  </div>
                  <div
                    className="flex h-3 w-full overflow-hidden rounded-full bg-muted"
                    role="img"
                    aria-label={`${m.label}: הושלמו ${m.completed}, לא הגיעו ${m.noShow}, בוטלו ${m.cancelled}`}
                  >
                    <div
                      className="bg-emerald-500"
                      style={{ width: `${(m.completed / maxTotal) * 100}%` }}
                    />
                    <div
                      className="bg-red-500"
                      style={{ width: `${(m.noShow / maxTotal) * 100}%` }}
                    />
                    <div
                      className="bg-gray-400"
                      style={{ width: `${(m.cancelled / maxTotal) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              <BarChart3 className="mx-auto h-10 w-10 mb-2 opacity-50" aria-hidden="true" />
              <p>אין נתוני פגישות ב-6 החודשים האחרונים</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* קישור לדוחות המפורטים הקיימים — הלוח הזה הוא נקודת-כניסה מאחדת */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">דוחות מפורטים</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2 sm:grid-cols-3">
          <Button asChild variant="outline" className="justify-start">
            <Link href="/clinic-admin/caseload">
              <Users className="ml-2 h-4 w-4" aria-hidden="true" />
              עומס מטפלים
            </Link>
          </Button>
          <Button asChild variant="outline" className="justify-start">
            <Link href="/clinic-admin/revenue">
              <Receipt className="ml-2 h-4 w-4" aria-hidden="true" />
              פיצול הכנסות
            </Link>
          </Button>
          <Button asChild variant="outline" className="justify-start">
            <Link href="/dashboard/reports">
              <BarChart3 className="ml-2 h-4 w-4" aria-hidden="true" />
              מגמות מלאות
            </Link>
          </Button>
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">עודכן: {generatedLabel}</p>
    </div>
  );
}
