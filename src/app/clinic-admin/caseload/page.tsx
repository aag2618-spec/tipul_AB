"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  AlertCircle,
  ArrowRight,
  UsersRound,
  Clock,
  CalendarDays,
  TrendingUp,
  Gauge,
} from "lucide-react";
import { toast } from "sonner";

type OverloadLevel = "low" | "normal" | "high";

interface CaseloadItem {
  therapistId: string;
  name: string | null;
  email: string;
  activeClients: number;
  sessionsThisWeek: number;
  hoursThisWeek: number;
  completedLast4Weeks: number;
  avgWeeklyHours: number;
  overloadLevel: OverloadLevel;
}

interface CaseloadThresholds {
  highWeeklyHours: number;
  lowWeeklyHours: number;
  lowMaxActiveClients: number;
}

interface CaseloadResponse {
  items: CaseloadItem[];
  generatedAt: string;
  thresholds: CaseloadThresholds;
}

const OVERLOAD_LABEL: Record<OverloadLevel, string> = {
  high: "עומס גבוה",
  normal: "עומס תקין",
  low: "עומס נמוך",
};

const OVERLOAD_BADGE: Record<OverloadLevel, string> = {
  high: "bg-red-500/20 text-red-700 dark:text-red-400",
  normal: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-400",
  low: "bg-amber-500/20 text-amber-700 dark:text-amber-400",
};

export default function CaseloadPage() {
  const [data, setData] = useState<CaseloadResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/clinic-admin/caseload-summary");
        if (cancelled) return;
        if (!res.ok) {
          if (res.status === 403) {
            setError("הגישה לדף זה זמינה רק לבעלי/ות קליניקה.");
          } else if (res.status === 400) {
            setError("אינך משויך/ת לקליניקה.");
          } else {
            setError("שגיאה בטעינת דוח העומס.");
          }
          return;
        }
        const json = (await res.json()) as CaseloadResponse;
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) {
          toast.error("שגיאת רשת בטעינת דוח העומס");
          setError("שגיאת רשת בטעינת דוח העומס");
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
      <div
        className="flex justify-center py-16"
        role="status"
        aria-live="polite"
      >
        <Loader2
          className="h-8 w-8 animate-spin text-primary"
          aria-hidden="true"
        />
        <span className="sr-only">טוען דוח עומס מטפלים…</span>
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
              <Link href="/clinic-admin/overview">
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                חזרה למבט ניהולי
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const highCount = data.items.filter((i) => i.overloadLevel === "high").length;
  const lowCount = data.items.filter((i) => i.overloadLevel === "low").length;
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
            <Gauge className="h-6 w-6 text-primary" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">עומס מטפלים</h1>
            <p className="text-sm text-muted-foreground">
              ריכוז מטופלים פעילים, פגישות השבוע וממוצע שעות שבועי לכל מטפל/ת.
            </p>
          </div>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href="/clinic-admin/overview">
            <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
            חזרה למבט ניהולי
          </Link>
        </Button>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">סך מטפלים</p>
            <p className="text-2xl font-bold mt-1">
              {data.items.length.toLocaleString("he-IL")}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">בעומס גבוה</p>
            <p className="text-2xl font-bold mt-1 text-red-600 dark:text-red-400">
              {highCount.toLocaleString("he-IL")}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">בעומס נמוך</p>
            <p className="text-2xl font-bold mt-1 text-amber-600 dark:text-amber-400">
              {lowCount.toLocaleString("he-IL")}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">סף &quot;עומס גבוה&quot;</p>
            <p className="text-2xl font-bold mt-1">
              {data.thresholds.highWeeklyHours.toLocaleString("he-IL")} ש&apos;/שבוע
            </p>
          </CardContent>
        </Card>
      </div>

      {data.items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <UsersRound
              className="h-10 w-10 text-muted-foreground mx-auto"
              aria-hidden="true"
            />
            <p className="font-medium">אין מטפלים פעילים בקליניקה כרגע.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {data.items.map((item) => {
            const displayName =
              item.name?.trim() || item.email || "מטפל/ת ללא שם";
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
                    <Badge className={OVERLOAD_BADGE[item.overloadLevel]}>
                      {OVERLOAD_LABEL[item.overloadLevel]}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <Stat
                      icon={UsersRound}
                      label="מטופלים פעילים"
                      value={item.activeClients.toLocaleString("he-IL")}
                    />
                    <Stat
                      icon={CalendarDays}
                      label="פגישות השבוע"
                      value={item.sessionsThisWeek.toLocaleString("he-IL")}
                    />
                    <Stat
                      icon={Clock}
                      label="שעות השבוע"
                      value={`${item.hoursThisWeek.toLocaleString("he-IL")} ש'`}
                    />
                    <Stat
                      icon={TrendingUp}
                      label="ממוצע 4 שבועות"
                      value={`${item.avgWeeklyHours.toLocaleString("he-IL")} ש'/שב'`}
                    />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <p className="text-xs text-muted-foreground">עודכן: {generatedLabel}</p>
    </div>
  );
}

function Stat({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-muted/30 rounded-md">
      <Icon className="h-4 w-4 text-muted-foreground shrink-0" aria-hidden={true} />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground truncate">{label}</p>
        <p className="font-bold truncate">{value}</p>
      </div>
    </div>
  );
}
