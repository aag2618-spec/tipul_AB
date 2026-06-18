"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  ChevronRight,
  ChevronLeft,
  Loader2,
  DoorOpen,
  BellRing,
  BadgeCheck,
  CalendarDays,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import type { CalendarSession } from "@/hooks/use-calendar-data";
import { mapSessions } from "@/lib/calendar/session-mapper";
import { getTherapistAccent } from "@/lib/calendar/event-colors";
import { ContactActions } from "@/components/contact-actions";

const STATUS_LABEL: Record<string, string> = {
  SCHEDULED: "מתוכננת",
  COMPLETED: "הושלמה",
  CANCELLED: "בוטלה",
  NO_SHOW: "לא הגיע/ה",
  PENDING_APPROVAL: "ממתינה לאישור",
  PENDING_CANCELLATION: "בקשת ביטול",
};
const STATUS_BADGE: Record<string, string> = {
  SCHEDULED: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  COMPLETED: "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300",
  CANCELLED: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
  NO_SHOW: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300",
  PENDING_APPROVAL: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  PENDING_CANCELLATION: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
};
const TYPE_LABEL: Record<string, string> = {
  IN_PERSON: "פרונטלי",
  ONLINE: "אונליין",
  PHONE: "טלפון",
  BREAK: "הפסקה",
};

function todayIsrael(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem" }).format(
    new Date(),
  );
}
function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function formatDayHeader(dateStr: string): string {
  return new Date(`${dateStr}T12:00:00Z`).toLocaleDateString("he-IL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Asia/Jerusalem",
  });
}
function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("he-IL", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Asia/Jerusalem",
  });
}

/** סטטוס תשלום לתצוגה — מוחזר רק כשיש payment (השרת מסנן למזכירה ללא הרשאה). */
function paymentInfo(
  s: CalendarSession,
): { text: string; cls: string } | null {
  const p = s.payment;
  if (!p) return null;
  const paid = typeof p.paidAmount === "number" ? p.paidAmount : 0;
  if (p.status === "PAID" || (paid > 0 && paid >= s.price)) {
    return { text: "שולם", cls: "text-emerald-600" };
  }
  if (paid > 0) return { text: "שולם חלקית", cls: "text-amber-600" };
  return { text: "ממתין לתשלום", cls: "text-muted-foreground" };
}

/**
 * תצוגת "סדר יום" — רשימה יומית עשירה לדלפק הקבלה: לכל פגישה שעה, מטופל
 * (עם חיוג/WhatsApp), מטפל, חדר, סטטוס, תשלום, וחיווי תזכורת — + ניווט בין ימים
 * וקפיצה ליומן. מידע אדמיניסטרטיבי בלבד (השרת מסנן topic/notes/payment לפי הרשאה).
 */
export function DayAgendaView() {
  const router = useRouter();
  const [day, setDay] = useState(todayIsrael);
  const [sessions, setSessions] = useState<CalendarSession[]>([]);
  const [loading, setLoading] = useState(true);

  // היום המבוקש האחרון — guard נגד מרוץ-תגובות בניווט מהיר (prev/next): תגובה
  // של יום ישן שמגיעה אחרי שעברנו ליום אחר נזרקת, כך שהרשימה תמיד תואמת ל-day.
  const reqDayRef = useRef("");

  // ה-setState נעשה רק ב-callbacks של ה-fetch (לא סינכרונית ב-effect — תואם
  // react-hooks/set-state-in-effect). חיווי הטעינה מופעל ב-goToDay (event handler).
  const fetchDay = useCallback((d: string) => {
    reqDayRef.current = d;
    fetch(`/api/sessions/calendar?startDate=${d}T00:00&endDate=${d}T23:59`, {
      cache: "no-store",
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => {
        if (reqDayRef.current === d) setSessions(mapSessions(data));
      })
      .catch(() => {
        if (reqDayRef.current === d) {
          setSessions([]);
          toast.error("שגיאה בטעינת סדר היום");
        }
      })
      .finally(() => {
        if (reqDayRef.current === d) setLoading(false);
      });
  }, []);

  useEffect(() => {
    fetchDay(day);
  }, [day, fetchDay]);

  // מעבר יום — מפעיל ספינר (event handler) ואז משנה את היום (ה-effect טוען).
  const goToDay = (d: string) => {
    setLoading(true);
    setDay(d);
  };

  // ממוין לפי שעה; הפסקות בסוף הרשימה (פחות חשובות לדלפק).
  const ordered = useMemo(() => {
    return [...sessions].sort((a, b) => {
      if (a.startTime !== b.startTime)
        return a.startTime < b.startTime ? -1 : 1;
      return 0;
    });
  }, [sessions]);

  const clientSessions = ordered.filter((s) => s.type !== "BREAK");
  const distinctTherapists = new Set(
    ordered.map((s) => s.therapistId).filter(Boolean),
  );
  const showTherapist = distinctTherapists.size > 1;

  const isToday = day === todayIsrael();

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <CalendarDays className="h-6 w-6 text-primary" />
            סדר יום
          </h1>
          <p className="text-muted-foreground">
            {formatDayHeader(day)}
            {clientSessions.length > 0 && ` · ${clientSessions.length} פגישות`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => goToDay(addDays(day, -1))} aria-label="יום קודם">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button
            variant={isToday ? "default" : "outline"}
            size="sm"
            onClick={() => goToDay(todayIsrael())}
          >
            היום
          </Button>
          <Button variant="outline" size="sm" onClick={() => goToDay(addDays(day, 1))} aria-label="יום הבא">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Input
            type="date"
            dir="ltr"
            value={day}
            onChange={(e) => e.target.value && goToDay(e.target.value)}
            className="w-auto"
          />
          <Button variant="outline" size="sm" asChild>
            <Link href={`/dashboard/calendar?date=${day}`}>ליומן</Link>
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-3">
          {loading ? (
            <div className="flex justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : ordered.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <CalendarDays className="mx-auto h-12 w-12 mb-3 opacity-40" />
              אין פגישות ביום זה.
            </div>
          ) : (
            <div className="space-y-1.5">
              {ordered.map((s) => {
                const accent = getTherapistAccent(s.therapistId);
                const pay = paymentInfo(s);
                const isBreak = s.type === "BREAK";
                return (
                  <div
                    key={s.id}
                    className={`flex items-center gap-3 rounded-lg border p-2.5 transition-colors ${
                      isBreak ? "bg-muted/40" : "hover:bg-muted/40"
                    }`}
                  >
                    <span
                      className="h-10 w-1.5 rounded-full shrink-0"
                      style={{ backgroundColor: isBreak ? "#94a3b8" : accent }}
                      aria-hidden
                    />
                    {/* שעה */}
                    <div className="flex flex-col items-center justify-center w-24 shrink-0 text-center">
                      <span className="text-sm font-bold" dir="ltr">
                        {fmtTime(s.startTime)}–{fmtTime(s.endTime)}
                      </span>
                      <span className="text-[10px] text-muted-foreground">
                        {TYPE_LABEL[s.type] || "פרונטלי"}
                      </span>
                    </div>
                    {/* מטופל + מטפל */}
                    <div className="min-w-0 flex-1">
                      {isBreak ? (
                        <span className="font-medium text-muted-foreground">הפסקה</span>
                      ) : s.client ? (
                        <Link
                          href={`/dashboard/clients/${s.client.id}`}
                          className="font-medium truncate hover:text-primary hover:underline inline-block max-w-full"
                        >
                          {s.client.name || "מטופל/ת"}
                        </Link>
                      ) : (
                        <span className="font-medium text-muted-foreground">ללא מטופל</span>
                      )}
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        {showTherapist && s.therapistName && (
                          <span className="flex items-center gap-1">
                            <span
                              className="inline-block h-2 w-2 rounded-full shrink-0"
                              style={{ backgroundColor: accent }}
                              aria-hidden
                            />
                            {s.therapistName}
                          </span>
                        )}
                        {s.location && (
                          <span className="flex items-center gap-0.5">
                            <DoorOpen className="h-3 w-3" aria-hidden />
                            {s.location}
                          </span>
                        )}
                        {s.reminderSent && (
                          <span className="flex items-center gap-0.5" title="תזכורת נשלחה">
                            <BellRing className="h-3 w-3" aria-hidden />
                          </span>
                        )}
                        {pay && (
                          <span className={`flex items-center gap-0.5 ${pay.cls}`}>
                            <BadgeCheck className="h-3 w-3" aria-hidden />
                            {pay.text}
                          </span>
                        )}
                      </div>
                    </div>
                    {/* סטטוס + פעולות */}
                    <div className="flex items-center gap-2 shrink-0">
                      {!isBreak && (
                        <span
                          className={`rounded-md px-2 py-0.5 text-xs font-medium ${
                            STATUS_BADGE[s.status] || STATUS_BADGE.SCHEDULED
                          }`}
                        >
                          {STATUS_LABEL[s.status] || s.status}
                        </span>
                      )}
                      {!isBreak && <ContactActions phone={s.client?.phone} />}
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 text-muted-foreground"
                        title="פתח ביומן"
                        aria-label="פתח ביומן"
                        onClick={() =>
                          router.push(
                            `/dashboard/calendar?date=${day}&highlight=${s.id}`,
                          )
                        }
                      >
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
