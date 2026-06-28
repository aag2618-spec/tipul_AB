"use client";

import { useCallback, useState } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  NotebookPen,
  ChevronDown,
  Maximize2,
  Repeat,
  Tag,
  Loader2,
} from "lucide-react";
import { format } from "date-fns";
import { he } from "date-fns/locale";

interface PrepRow {
  sessionId: string;
  /** ISO — שעת הפגישה היום. */
  startTime: string;
  clientId: string;
  clientName: string;
}

interface Summary {
  id: string;
  startTime: string;
  endTime: string;
  type: string;
  /** HTML שכבר עבר סניטציה בשרת. */
  contentHtml: string;
}

interface TopicCount {
  topic: string;
  count: number;
}

interface PrepData {
  topicCounts: TopicCount[];
  summaries: Summary[];
}

type CacheEntry = { status: "loading" | "ready" | "error"; data?: PrepData };
type TabKey = "last" | "all";

export function TodayPrepCard({ sessions }: { sessions: PrepRow[] }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("last");
  const [enlarged, setEnlarged] = useState(false);
  // נטען פעם אחת לכל מטופל ונשמר במטמון מקומי כל עוד הדף פתוח.
  const [cache, setCache] = useState<Record<string, CacheEntry>>({});

  const load = useCallback(async (clientId: string) => {
    setCache((prev) => ({ ...prev, [clientId]: { status: "loading" } }));
    try {
      const res = await fetch(`/api/clients/${clientId}/prep`);
      if (!res.ok) throw new Error("failed");
      const data = (await res.json()) as PrepData;
      setCache((prev) => ({ ...prev, [clientId]: { status: "ready", data } }));
    } catch {
      setCache((prev) => ({ ...prev, [clientId]: { status: "error" } }));
    }
  }, []);

  const toggle = (row: PrepRow) => {
    if (openId === row.sessionId) {
      setOpenId(null);
      return;
    }
    setOpenId(row.sessionId);
    setTab("last");
    if (cache[row.clientId]?.status !== "ready") load(row.clientId);
  };

  const openRow = sessions.find((s) => s.sessionId === openId) ?? null;

  // גוף ההכנה — סיכום/ים לפי הטאב. משותף לתצוגה inline ולמלבן המוגדל.
  const renderBody = (clientId: string, large: boolean) => {
    const entry = cache[clientId];
    if (!entry || entry.status === "loading") {
      return (
        <div className="flex items-center justify-center gap-2 py-6 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          טוען…
        </div>
      );
    }
    if (entry.status === "error" || !entry.data) {
      return (
        <div className="text-center py-4 text-sm text-muted-foreground">
          <p>שגיאה בטעינת ההכנה</p>
          <Button
            variant="link"
            size="sm"
            className="mt-1"
            onClick={() => load(clientId)}
          >
            נסה שוב
          </Button>
        </div>
      );
    }

    const { summaries } = entry.data;
    const shown = tab === "last" ? summaries.slice(0, 1) : summaries;
    const scrollClass = large
      ? "overflow-y-auto flex-1"
      : tab === "last"
        ? "max-h-44 overflow-y-auto"
        : "max-h-60 overflow-y-auto";

    if (shown.length === 0) {
      return (
        <p className="text-xs text-muted-foreground text-center py-4">
          {tab === "last" ? "אין סיכום קודם למטופל זה" : "אין סיכומים עדיין"}
        </p>
      );
    }

    return (
      <div className={`space-y-2 ${scrollClass}`}>
        {shown.map((s) => (
          <div
            key={s.id}
            className="rounded-md border bg-card overflow-hidden"
          >
            <div className="bg-muted/30 border-b px-3 py-1.5 text-xs font-medium text-muted-foreground">
              {format(new Date(s.startTime), "EEEE, d בMMMM yyyy", { locale: he })}
              <span className="mx-1">·</span>
              {format(new Date(s.startTime), "HH:mm")}
            </div>
            <div
              className="prose prose-sm prose-slate max-w-none px-3 py-2 leading-relaxed [&_p]:my-1.5"
              dir="rtl"
              dangerouslySetInnerHTML={{ __html: s.contentHtml }}
            />
          </div>
        ))}
      </div>
    );
  };

  // נושאים חוזרים — מוצגים תמיד בתחתית הפאנל (גם inline וגם במלבן המוגדל).
  const renderTopics = (clientId: string) => {
    const entry = cache[clientId];
    if (entry?.status !== "ready" || !entry.data) return null;
    const { topicCounts } = entry.data;
    return (
      <div className="space-y-1.5">
        <p className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5">
          <Repeat className="h-3.5 w-3.5" />
          נושאים חוזרים
        </p>
        {topicCounts.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {topicCounts.map(({ topic, count }) => (
              <Badge
                key={topic}
                variant="secondary"
                className="gap-1.5 py-1 px-2 text-xs font-medium"
              >
                <Tag className="h-3 w-3 text-muted-foreground" />
                {topic}
                <span className="inline-flex items-center justify-center min-w-4 h-4 px-1 rounded-full bg-primary/10 text-primary text-[10px] font-semibold">
                  {count}
                </span>
              </Badge>
            ))}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">עדיין לא תויגו נושאים</p>
        )}
      </div>
    );
  };

  // שני הטאבים: הסיכום האחרון / כל הסיכומים.
  const renderTabs = () => (
    <div className="inline-flex rounded-md border p-0.5 bg-muted/40">
      <button
        onClick={() => setTab("last")}
        className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
          tab === "last"
            ? "bg-background shadow-sm text-foreground"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        הסיכום האחרון
      </button>
      <button
        onClick={() => setTab("all")}
        className={`px-2.5 py-1 text-xs font-medium rounded transition-colors ${
          tab === "all"
            ? "bg-background shadow-sm text-foreground"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        כל הסיכומים
      </button>
    </div>
  );

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="flex items-center gap-2">
            <NotebookPen className="h-5 w-5 text-primary" />
            הכנה לפגישה
          </CardTitle>
          <CardDescription>סיכומים ונושאים חוזרים לפני כל פגישה</CardDescription>
        </div>
      </CardHeader>
      <CardContent>
        {sessions.length > 0 ? (
          <div className="space-y-3">
            {sessions.map((s) => {
              const isOpen = openId === s.sessionId;
              return (
                <div
                  key={s.sessionId}
                  className="rounded-lg border bg-card overflow-hidden"
                >
                  {/* שורת הפגישה: זמן + שם + כפתור "הכנה" */}
                  <div className="flex items-center justify-between gap-3 p-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex flex-col items-center justify-center w-12 h-12 rounded-lg bg-primary/10 text-primary shrink-0">
                        <span className="text-sm font-bold">
                          {format(new Date(s.startTime), "HH:mm")}
                        </span>
                      </div>
                      <p className="text-sm font-semibold truncate">
                        👤 {s.clientName}
                      </p>
                    </div>
                    <Button
                      variant={isOpen ? "secondary" : "outline"}
                      size="sm"
                      className="shrink-0 gap-1.5"
                      onClick={() => toggle(s)}
                    >
                      <NotebookPen className="h-4 w-4" />
                      הכנה
                      <ChevronDown
                        className={`h-4 w-4 transition-transform ${
                          isOpen ? "rotate-180" : ""
                        }`}
                      />
                    </Button>
                  </div>

                  {/* פאנל ההכנה — נפתח בשורה מתחת */}
                  {isOpen && (
                    <div className="border-t bg-muted/20 p-3 space-y-3">
                      <div className="flex items-center justify-between gap-2">
                        {renderTabs()}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 shrink-0"
                          title="הגדלה"
                          onClick={() => setEnlarged(true)}
                        >
                          <Maximize2 className="h-4 w-4" />
                          <span className="sr-only">הגדלה</span>
                        </Button>
                      </div>

                      {renderBody(s.clientId, false)}
                      {renderTopics(s.clientId)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            <NotebookPen className="mx-auto h-12 w-12 mb-3 opacity-50" />
            <p>אין פגישות להכנה היום</p>
          </div>
        )}
      </CardContent>

      {/* מלבן מוגדל במרכז המסך (X לסגירה מובנה ב-DialogContent) */}
      <Dialog open={enlarged} onOpenChange={setEnlarged}>
        <DialogContent className="sm:max-w-2xl max-h-[85vh] flex flex-col gap-3">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 pl-6">
              <NotebookPen className="h-5 w-5 text-primary shrink-0" />
              <span className="truncate">
                הכנה לפגישה · {openRow?.clientName}
              </span>
            </DialogTitle>
          </DialogHeader>

          {openRow && (
            <>
              <div className="flex items-center justify-between gap-2">
                {renderTabs()}
              </div>
              {renderBody(openRow.clientId, true)}
              {renderTopics(openRow.clientId)}
            </>
          )}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
