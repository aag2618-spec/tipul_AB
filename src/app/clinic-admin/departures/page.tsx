"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  UserMinus,
  Loader2,
  AlertCircle,
  Clock,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  Users,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";

// C2: דשבורד תהליכי עזיבה לבעל/ת הקליניקה. שואב מ-/api/clinic-admin/departures
// (נדרש בעל קליניקה). מציג קלפי סטטוס + רשימה של כל התהליכים עם פירוט
// expandable של בחירות המטופלים. החיווי החזותי משלב urgency (deadline)
// והתקדמות (כמה החליטו עד עכשיו).

type DepartureStatus = "PENDING" | "COMPLETED" | "CANCELLED";

interface DepartureItem {
  id: string;
  status: DepartureStatus;
  decisionDeadline: string;
  daysLeft: number | null;
  isOverdue: boolean;
  reason: string | null;
  initiatedAt: string;
  completedAt: string | null;
  departingTherapist: {
    id: string;
    name: string;
    email: string | null;
  };
  counts: { total: number; stayed: number; followed: number; undecided: number };
  creditAtRiskIls: number;
}

interface DepartureSummary {
  pending: number;
  completed: number;
  cancelled: number;
  totalCreditAtRiskIls: number;
}

interface DeparturesResponse {
  count: number;
  summary: DepartureSummary;
  items: DepartureItem[];
}

const STATUS_LABEL: Record<DepartureStatus, string> = {
  PENDING: "פעיל",
  COMPLETED: "הושלם",
  CANCELLED: "בוטל",
};

const STATUS_BADGE: Record<DepartureStatus, string> = {
  PENDING: "bg-amber-500/20 text-amber-700 dark:text-amber-300",
  COMPLETED: "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300",
  CANCELLED: "bg-zinc-500/20 text-zinc-600 dark:text-zinc-300",
};

function formatHebrewDate(iso: string): string {
  return new Date(iso).toLocaleDateString("he-IL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Jerusalem",
  });
}

export default function ClinicDeparturesPage() {
  const [data, setData] = useState<DeparturesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/clinic-admin/departures");
        if (!res.ok) {
          if (res.status === 403) {
            setError("הגישה לדף זה זמינה רק לבעלי/ות קליניקה.");
            return;
          }
          if (res.status === 404) {
            setError("אינך משויך/ת לקליניקה.");
            return;
          }
          throw new Error();
        }
        const json: DeparturesResponse = await res.json();
        setData(json);
      } catch {
        toast.error("שגיאה בטעינת תהליכי העזיבה");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-4 max-w-2xl mx-auto" dir="rtl">
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <AlertCircle className="h-10 w-10 text-amber-500 mx-auto" />
            <p className="font-medium">{error || "לא נטענו נתונים"}</p>
            <Button asChild variant="outline" size="sm">
              <Link href="/clinic-admin">חזרה לסקירה</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-primary/15 rounded-lg">
          <UserMinus className="h-6 w-6 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">תהליכי עזיבה</h1>
          <p className="text-sm text-muted-foreground">
            מעקב אחר עזיבות מטפלות מהקליניקה ובחירות המטופלים
          </p>
        </div>
      </div>

      {/* כרטיסי סיכום */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">פעילים</p>
            <p className="text-2xl font-bold mt-1 flex items-center gap-2">
              <Clock className="h-5 w-5 text-amber-500" />
              {data.summary.pending}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">הושלמו</p>
            <p className="text-2xl font-bold mt-1 flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              {data.summary.completed}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">בוטלו</p>
            <p className="text-2xl font-bold mt-1 flex items-center gap-2">
              <XCircle className="h-5 w-5 text-zinc-500" />
              {data.summary.cancelled}
            </p>
          </CardContent>
        </Card>
        <Card className="bg-amber-500/5 border-amber-500/30">
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground">קרדיט בסיכון</p>
            <p className="text-2xl font-bold mt-1 flex items-center gap-2 text-amber-700 dark:text-amber-300">
              <Wallet className="h-5 w-5" />
              ₪{data.summary.totalCreditAtRiskIls.toLocaleString("he-IL")}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* רשימה */}
      {data.items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <UserMinus className="mx-auto h-10 w-10 mb-3 opacity-30" />
            <p>אין תהליכי עזיבה בקליניקה</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {data.items.map((d) => {
            const isOpen = expanded.has(d.id);
            const decidedPct =
              d.counts.total > 0
                ? Math.round(
                    ((d.counts.stayed + d.counts.followed) / d.counts.total) *
                      100
                  )
                : 0;
            return (
              <Card
                key={d.id}
                className={
                  d.isOverdue
                    ? "border-red-500/40 bg-red-500/5"
                    : d.status === "PENDING" && (d.daysLeft ?? 0) <= 3
                    ? "border-amber-500/40 bg-amber-500/5"
                    : undefined
                }
              >
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex flex-wrap items-center gap-2 justify-between">
                    <span className="inline-flex items-center gap-2">
                      <UserMinus className="h-4 w-4 text-muted-foreground" />
                      {d.departingTherapist.name}
                    </span>
                    <Badge className={STATUS_BADGE[d.status]}>
                      {STATUS_LABEL[d.status]}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* metadata */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">יזם ב-</p>
                      <p className="font-medium">
                        {formatHebrewDate(d.initiatedAt)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">מועד החלטה</p>
                      <p
                        className={
                          d.isOverdue
                            ? "font-medium text-red-600 dark:text-red-400"
                            : d.status === "PENDING" && (d.daysLeft ?? 0) <= 3
                            ? "font-medium text-amber-700 dark:text-amber-400"
                            : "font-medium"
                        }
                      >
                        {formatHebrewDate(d.decisionDeadline)}
                        {d.status === "PENDING" && d.daysLeft !== null && (
                          <span className="block text-xs">
                            {d.isOverdue
                              ? "פג תוקף"
                              : d.daysLeft === 0
                              ? "היום"
                              : `נותרו ${d.daysLeft} ימים`}
                          </span>
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">מטופלים</p>
                      <p className="font-medium inline-flex items-center gap-1">
                        <Users className="h-3.5 w-3.5 text-muted-foreground" />
                        {d.counts.total}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        קרדיט בסיכון
                      </p>
                      <p
                        className={
                          d.creditAtRiskIls > 0
                            ? "font-medium text-amber-700 dark:text-amber-300"
                            : "font-medium"
                        }
                      >
                        ₪{d.creditAtRiskIls.toLocaleString("he-IL")}
                      </p>
                    </div>
                  </div>

                  {/* progress bar — רק ל-PENDING (אחרי-deadline הסטטוס יסיים) */}
                  {d.status === "PENDING" && d.counts.total > 0 && (
                    <div className="space-y-1.5">
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>החליטו: {decidedPct}%</span>
                        <span>
                          {d.counts.stayed + d.counts.followed} / {d.counts.total}
                        </span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden flex">
                        <div
                          className="h-full bg-emerald-500"
                          style={{
                            width: `${
                              (d.counts.stayed / d.counts.total) * 100
                            }%`,
                          }}
                          title="נשארים בקליניקה"
                        />
                        <div
                          className="h-full bg-blue-500"
                          style={{
                            width: `${
                              (d.counts.followed / d.counts.total) * 100
                            }%`,
                          }}
                          title="עוזבים עם המטפלת"
                        />
                      </div>
                      <div className="flex gap-3 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" />
                          נשארים: {d.counts.stayed}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <span className="inline-block w-2 h-2 rounded-full bg-blue-500" />
                          עוזבים: {d.counts.followed}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <span className="inline-block w-2 h-2 rounded-full bg-muted-foreground/40" />
                          ממתינים: {d.counts.undecided}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* completed/cancelled — סיכום סטטי */}
                  {d.status !== "PENDING" && d.counts.total > 0 && (
                    <div className="text-sm text-muted-foreground">
                      תוצאה סופית: {d.counts.stayed} נשארו · {d.counts.followed}{" "}
                      עזבו עם המטפלת · {d.counts.undecided} לא החליטו
                      {d.completedAt && (
                        <span>
                          {" "}· הושלם ב-{formatHebrewDate(d.completedAt)}
                        </span>
                      )}
                    </div>
                  )}

                  {/* reason */}
                  {d.reason && (
                    <details
                      className="text-sm text-muted-foreground"
                      open={isOpen}
                      onToggle={() => toggle(d.id)}
                    >
                      <summary className="cursor-pointer inline-flex items-center gap-1 hover:text-foreground">
                        {isOpen ? (
                          <ChevronUp className="h-3.5 w-3.5" />
                        ) : (
                          <ChevronDown className="h-3.5 w-3.5" />
                        )}
                        סיבת העזיבה
                      </summary>
                      <p className="mt-2 pr-5 whitespace-pre-wrap">{d.reason}</p>
                    </details>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* הסבר תחתון */}
      <Card className="bg-muted/30">
        <CardContent className="py-4 text-xs text-muted-foreground leading-relaxed">
          <p>
            <strong>איך זה עובד?</strong> תהליך עזיבה נוצר כאשר מטפל/ת מבקש/ת
            לצאת מהקליניקה. כל מטופל/ת מקבל/ת קישור פרטי לבחור: להישאר בקליניקה
            (יישאר/תישאר אצל מטפל/ת אחר/ת) או ללכת עם המטפל/ת היוצא/ת. מטופלים
            שלא בחרו עד ה-deadline נשארים בקליניקה אוטומטית. עזיבה עם יתרת
            קרדיט פתוחה אצל המטפל/ת היוצא/ת מסומנת בנפרד בסקירה הראשית — לבצע
            הסדרה ידנית לפני ה-deadline.
          </p>
        </CardContent>
      </Card>

    </div>
  );
}
