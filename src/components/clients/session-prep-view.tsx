"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowRight,
  CalendarClock,
  Clock,
  FileText,
  NotebookPen,
  Repeat,
  Tag,
} from "lucide-react";
import { format } from "date-fns";
import { he } from "date-fns/locale";

interface NextSession {
  id: string;
  startTime: string;
  endTime: string;
  type: string;
  topic: string | null;
}

interface TopicCount {
  topic: string;
  count: number;
}

interface PrepSummary {
  id: string;
  startTime: string;
  endTime: string;
  type: string;
  /** HTML שכבר עבר סניטציה בשרת (sanitizeUserHtml). מוצג דרך dangerouslySetInnerHTML. */
  contentHtml: string;
}

interface SessionPrepViewProps {
  clientId: string;
  clientName: string;
  nextSession: NextSession | null;
  topicCounts: TopicCount[];
  summaries: PrepSummary[];
}

type RangeMode = "last5" | "all" | "custom";

// תווית סוג פגישה — תואם ל-TodaySessionCard (BREAK כבר סונן בשרת).
function sessionTypeLabel(type: string): string {
  if (type === "ONLINE") return "אונליין";
  if (type === "PHONE") return "טלפון";
  return "פרונטלי";
}

export function SessionPrepView({
  clientId,
  clientName,
  nextSession,
  topicCounts,
  summaries,
}: SessionPrepViewProps) {
  const [range, setRange] = useState<RangeMode>("last5");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  // מספור כרונולוגי (הישנה ביותר = #1) לכל הסיכומים — נשמר יציב גם בעת סינון.
  const numberById = useMemo(() => {
    const map = new Map<string, number>();
    [...summaries]
      .sort(
        (a, b) =>
          new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
      )
      .forEach((s, i) => map.set(s.id, i + 1));
    return map;
  }, [summaries]);

  // summaries מגיע כבר ממוין מהחדש לישן (מהשרת). הסינון בלבד בצד הלקוח.
  const filteredSummaries = useMemo(() => {
    if (range === "last5") return summaries.slice(0, 5);
    if (range === "custom") {
      const from = fromDate ? new Date(`${fromDate}T00:00:00`) : null;
      const to = toDate ? new Date(`${toDate}T23:59:59`) : null;
      return summaries.filter((s) => {
        const d = new Date(s.startTime);
        if (from && d < from) return false;
        if (to && d > to) return false;
        return true;
      });
    }
    return summaries; // all
  }, [range, fromDate, toDate, summaries]);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* כותרת */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
            <NotebookPen className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">הכנה לפגישה</h1>
            <p className="text-muted-foreground">{clientName}</p>
          </div>
        </div>
        <Button variant="outline" asChild>
          <Link href={`/dashboard/clients/${clientId}`}>
            <ArrowRight className="ml-2 h-4 w-4" />
            חזרה לתיק המטופל
          </Link>
        </Button>
      </div>

      {/* הפגישה הבאה */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <CalendarClock className="h-5 w-5 text-primary" />
            הפגישה הבאה
          </CardTitle>
        </CardHeader>
        <CardContent>
          {nextSession ? (
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="space-y-1">
                <p className="text-base font-semibold">
                  {format(new Date(nextSession.startTime), "EEEE, d בMMMM yyyy", {
                    locale: he,
                  })}
                </p>
                <p className="text-sm text-muted-foreground flex items-center gap-2">
                  <Clock className="h-3.5 w-3.5" />
                  {format(new Date(nextSession.startTime), "HH:mm")} -{" "}
                  {format(new Date(nextSession.endTime), "HH:mm")}
                  <span className="mx-1">·</span>
                  {sessionTypeLabel(nextSession.type)}
                </p>
                {nextSession.topic && (
                  <p className="text-sm flex items-center gap-2 pt-1">
                    <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                    <span className="text-muted-foreground">נושא מתוכנן:</span>
                    <span className="font-medium">{nextSession.topic}</span>
                  </p>
                )}
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/dashboard/sessions/${nextSession.id}`}>
                  פתח את הפגישה
                </Link>
              </Button>
            </div>
          ) : (
            <div className="text-center py-6 text-muted-foreground">
              <CalendarClock className="mx-auto h-10 w-10 mb-2 opacity-40" />
              <p>אין פגישה עתידית מתוכננת</p>
              <Button variant="link" asChild className="mt-1">
                <Link href={`/dashboard/calendar?client=${clientId}`}>
                  קבע פגישה
                </Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* נושאים חוזרים */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Repeat className="h-5 w-5 text-primary" />
            נושאים חוזרים
          </CardTitle>
          <CardDescription>
            לפי שדה &quot;נושא הפגישה&quot; שמילאת בסיכומים — כמה פעמים חזר כל נושא
          </CardDescription>
        </CardHeader>
        <CardContent>
          {topicCounts.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {topicCounts.map(({ topic, count }) => (
                <Badge
                  key={topic}
                  variant="secondary"
                  className="gap-1.5 py-1.5 px-3 text-sm font-medium"
                >
                  <Tag className="h-3.5 w-3.5 text-muted-foreground" />
                  {topic}
                  <span className="inline-flex items-center justify-center min-w-5 h-5 px-1 rounded-full bg-primary/10 text-primary text-xs font-semibold">
                    {count}
                  </span>
                </Badge>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 text-muted-foreground">
              <Tag className="mx-auto h-10 w-10 mb-2 opacity-40" />
              <p>עדיין לא תויגו נושאים</p>
              <p className="text-sm">
                כשממלאים את שדה &quot;נושא הפגישה&quot; במסך הסיכום, הנושאים החוזרים
                יופיעו כאן
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* סיכומי טיפול */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <FileText className="h-5 w-5 text-primary" />
                סיכומי טיפול
              </CardTitle>
              <CardDescription>
                {summaries.length} פגישות מסוכמות · מוצגות {filteredSummaries.length}
              </CardDescription>
            </div>
            <Select
              value={range}
              onValueChange={(v) => setRange(v as RangeMode)}
            >
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="last5">5 פגישות אחרונות</SelectItem>
                <SelectItem value="all">כל הפגישות</SelectItem>
                <SelectItem value="custom">טווח מותאם</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {range === "custom" && (
            <div className="flex items-end gap-3 pt-3 flex-wrap">
              <div className="space-y-1 flex-1 sm:flex-none">
                <Label htmlFor="prep-from" className="text-xs">
                  מתאריך
                </Label>
                <Input
                  id="prep-from"
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="w-full sm:w-[160px]"
                />
              </div>
              <div className="space-y-1 flex-1 sm:flex-none">
                <Label htmlFor="prep-to" className="text-xs">
                  עד תאריך
                </Label>
                <Input
                  id="prep-to"
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="w-full sm:w-[160px]"
                />
              </div>
            </div>
          )}
        </CardHeader>
        <CardContent className="space-y-4">
          {filteredSummaries.length > 0 ? (
            filteredSummaries.map((s) => (
              <div key={s.id} className="rounded-xl border bg-card">
                <div className="flex items-center justify-between gap-3 border-b bg-muted/30 px-4 py-2.5 rounded-t-xl">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="inline-flex items-center justify-center h-6 min-w-6 px-1.5 rounded-md bg-emerald-50 text-emerald-600 text-xs font-semibold">
                      #{numberById.get(s.id)}
                    </span>
                    <span className="text-sm font-medium">
                      {format(new Date(s.startTime), "EEEE, d בMMMM yyyy", {
                        locale: he,
                      })}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {format(new Date(s.startTime), "HH:mm")}
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    asChild
                    className="text-xs shrink-0"
                  >
                    <Link
                      href={`/dashboard/sessions/${s.id}?from=client&clientId=${clientId}`}
                    >
                      <FileText className="h-3.5 w-3.5 ml-1.5" />
                      צפה / ערוך
                    </Link>
                  </Button>
                </div>
                <div
                  className="prose prose-sm prose-slate max-w-none px-4 py-3 leading-relaxed [&_p]:my-1.5"
                  dir="rtl"
                  dangerouslySetInnerHTML={{ __html: s.contentHtml }}
                />
              </div>
            ))
          ) : (
            <div className="text-center py-10 text-muted-foreground">
              <FileText className="mx-auto h-12 w-12 mb-3 opacity-40" />
              <p>
                {summaries.length === 0
                  ? "אין סיכומים עדיין"
                  : "אין סיכומים בטווח שנבחר"}
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
