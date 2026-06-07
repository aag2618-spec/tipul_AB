"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  AlertCircle,
  ArrowRight,
  Wallet,
  Receipt,
  TrendingUp,
  Coins,
  PercentCircle,
  Settings,
} from "lucide-react";
import { toast } from "sonner";
import type {
  TherapistRevenueRow,
  RevenueReportSummary,
} from "@/lib/clinic/revenue-share";

// ה-route עוטף את התוצאה של computeMonthlyRevenueReport במעטפת עם
// metadata של החודש. שומרים יישור 1:1 עם ה-helper (TherapistRevenueRow
// + RevenueReportSummary.totals) כדי שלא ייווצר drift. ה-route מוסיף לכל
// item את clinicBillingMode (תצוגה בלבד — מצב הסליקה של המטפל/ת).
type RevenueItem = TherapistRevenueRow & {
  clinicBillingMode?: "CLINIC" | "OWN";
};

interface RevenueResponse {
  month: string;
  monthStartUtc: string;
  monthEndUtc: string;
  orgDefaultPct: number | null;
  // האם להציג עבור מטפל/ת ב-OWN את "חלק הקליניקה" כסכום שעליו/ה להעביר.
  therapistDebtTracking: boolean;
  items: RevenueItem[];
  totals: RevenueReportSummary["totals"];
  generatedAt: string;
}

function currentIsraelYearMonth(): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")?.value ?? "2026";
  const m = parts.find((p) => p.type === "month")?.value ?? "01";
  return `${y}-${m}`;
}

function formatIls(n: number): string {
  return `${n.toLocaleString("he-IL", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })} ₪`;
}

export default function RevenueReportPage() {
  const [month, setMonth] = useState<string>(currentIsraelYearMonth);
  const [data, setData] = useState<RevenueResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/clinic-admin/revenue-report?month=${encodeURIComponent(month)}`
        );
        if (cancelled) return;
        if (!res.ok) {
          if (res.status === 403) {
            setError("הגישה לדף זה זמינה רק לבעלי/ות קליניקה.");
          } else if (res.status === 400) {
            setError("פרמטר חודש לא תקין או שאינך משויך/ת לקליניקה.");
          } else {
            setError("שגיאה בטעינת דוח פיצול הכנסות.");
          }
          setData(null);
          return;
        }
        const json = (await res.json()) as RevenueResponse;
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) {
          toast.error("שגיאת רשת בטעינת הדוח");
          setError("שגיאת רשת בטעינת הדוח");
          setData(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [month]);

  const monthLabel = useMemo(() => {
    const [y, m] = month.split("-").map((s) => parseInt(s, 10));
    if (!Number.isInteger(y) || !Number.isInteger(m)) return month;
    try {
      return new Intl.DateTimeFormat("he-IL", {
        timeZone: "Asia/Jerusalem",
        month: "long",
        year: "numeric",
      }).format(new Date(Date.UTC(y, m - 1, 15)));
    } catch {
      return month;
    }
  }, [month]);

  const generatedLabel = useMemo(() => {
    if (!data?.generatedAt) return "";
    try {
      return new Date(data.generatedAt).toLocaleString("he-IL", {
        timeZone: "Asia/Jerusalem",
        dateStyle: "short",
        timeStyle: "short",
      });
    } catch {
      return data.generatedAt;
    }
  }, [data]);

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-primary/15 rounded-lg">
            <Wallet className="h-6 w-6 text-primary" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">פיצול הכנסות</h1>
            <p className="text-sm text-muted-foreground">
              סיכום חודשי של הכנסות הקליניקה ופירוט פר-מטפל/ת לפי אחוז הפיצול.
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/clinic-admin/revenue-settings">
              <Settings className="ml-2 h-4 w-4" aria-hidden="true" />
              הגדרות פיצול
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/clinic-admin">
              <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
              חזרה לסקירה
            </Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-4 flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <label
              htmlFor="month-picker"
              className="text-xs text-muted-foreground"
            >
              בחר/י חודש
            </label>
            <input
              id="month-picker"
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
          </div>
          <p className="text-sm text-muted-foreground">
            מציג נתונים עבור: <strong>{monthLabel}</strong>
          </p>
          {data?.orgDefaultPct !== null && data?.orgDefaultPct !== undefined && (
            <p className="text-xs text-muted-foreground ms-auto">
              ברירת מחדל ארגונית: {data.orgDefaultPct}%
            </p>
          )}
        </CardContent>
      </Card>

      {loading ? (
        <div
          className="flex justify-center py-16"
          role="status"
          aria-live="polite"
        >
          <Loader2
            className="h-8 w-8 animate-spin text-primary"
            aria-hidden="true"
          />
          <span className="sr-only">טוען דוח פיצול הכנסות…</span>
        </div>
      ) : error || !data ? (
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <AlertCircle
              className="h-10 w-10 text-amber-500 mx-auto"
              aria-hidden="true"
            />
            <p className="font-medium">{error || "לא נטענו נתונים"}</p>
            <Button asChild variant="outline">
              <Link href="/clinic-admin">
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                חזרה לסקירה
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <SummaryCard
              label="סה״כ ששולם"
              value={formatIls(data.totals.totalPaidIls)}
              icon={Coins}
            />
            <SummaryCard
              label="חלק המטפלים"
              value={formatIls(data.totals.therapistRevenueIls)}
              icon={TrendingUp}
              valueClass="text-blue-600 dark:text-blue-400"
            />
            <SummaryCard
              label="חלק הקליניקה"
              value={formatIls(data.totals.clinicRevenueIls)}
              icon={Receipt}
              valueClass="text-emerald-600 dark:text-emerald-400"
            />
            <SummaryCard
              label="פגישות ששולמו"
              value={data.totals.paidSessions.toLocaleString("he-IL")}
              icon={PercentCircle}
            />
          </div>

          {data.items.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center space-y-3">
                <Receipt
                  className="h-10 w-10 text-muted-foreground mx-auto"
                  aria-hidden="true"
                />
                <p className="font-medium">אין מטפלים פעילים בקליניקה כרגע.</p>
              </CardContent>
            </Card>
          ) : data.totals.paidSessions === 0 ? (
            <Card>
              <CardContent className="py-12 text-center space-y-3">
                <Receipt
                  className="h-10 w-10 text-muted-foreground mx-auto"
                  aria-hidden="true"
                />
                <p className="font-medium">
                  לא נרשמו תשלומים ב{monthLabel}. נסה/י חודש אחר.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {data.items.map((item) => {
                const displayName =
                  item.name?.trim() || item.email || "מטפל/ת ללא שם";
                const sharePct = item.sharePct;
                const isOwn = item.clinicBillingMode === "OWN";
                // מטפל/ת ב-OWN גבה/תה את הכסף לחשבונו/ה — "חלק הקליניקה" הוא
                // סכום שעליו/ה להעביר לקליניקה. מדגישים זאת רק כשהמעקב פעיל.
                const showOwed = data.therapistDebtTracking && isOwn;
                return (
                  <Card key={item.therapistId}>
                    <CardHeader className="pb-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0">
                          <CardTitle className="text-base truncate">
                            {displayName}
                          </CardTitle>
                          {item.name && item.email && (
                            <p className="text-xs text-muted-foreground truncate">
                              {item.email}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          {isOwn && (
                            <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                              חשבון עצמאי
                            </Badge>
                          )}
                          <Badge className="bg-primary/15 text-primary">
                            {sharePct}% למטפל/ת
                          </Badge>
                        </div>
                      </div>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <Stat
                          icon={Receipt}
                          label="פגישות ששולמו"
                          value={item.paidSessions.toLocaleString("he-IL")}
                        />
                        <Stat
                          icon={Coins}
                          label="סה״כ ששולם"
                          value={formatIls(item.totalPaidIls)}
                        />
                        <Stat
                          icon={TrendingUp}
                          label="חלק המטפל/ת"
                          value={formatIls(item.therapistRevenueIls)}
                          valueClass="text-blue-600 dark:text-blue-400"
                        />
                        {showOwed ? (
                          <Stat
                            icon={Wallet}
                            label="להעברה לקליניקה"
                            value={formatIls(item.clinicRevenueIls)}
                            valueClass="text-amber-600 dark:text-amber-400"
                          />
                        ) : (
                          <Stat
                            icon={Wallet}
                            label="חלק הקליניקה"
                            value={formatIls(item.clinicRevenueIls)}
                            valueClass="text-emerald-600 dark:text-emerald-400"
                          />
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            עודכן: {generatedLabel}. החישוב לפי תאריך התשלום בפועל בזמן ישראל;
            אם אין מוגדר אחוז פיצול פר-מטפל/ת — ברירת המחדל הארגונית תקפה
            (ובהיעדרה — 100% למטפל/ת).
            {data.therapistDebtTracking && (
              <>
                {" "}
                מטפל/ת המסומן/ת <strong>״חשבון עצמאי״</strong> גובה/ת את הכסף
                לחשבונו/ה — ״להעברה לקליניקה״ הוא הסכום שעליו/ה להעביר.
              </>
            )}
          </p>
        </>
      )}
    </div>
  );
}

function SummaryCard({
  label,
  value,
  icon: Icon,
  valueClass,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  valueClass?: string;
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground inline-flex items-center gap-1">
          <Icon className="h-3.5 w-3.5" aria-hidden={true} />
          {label}
        </p>
        <p className={`text-2xl font-bold mt-1 ${valueClass ?? ""}`}>{value}</p>
      </CardContent>
    </Card>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
  valueClass,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-muted/30 rounded-md">
      <Icon
        className="h-4 w-4 text-muted-foreground shrink-0"
        aria-hidden={true}
      />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground truncate">{label}</p>
        <p className={`font-bold truncate ${valueClass ?? ""}`}>{value}</p>
      </div>
    </div>
  );
}
