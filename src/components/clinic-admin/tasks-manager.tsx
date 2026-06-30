"use client";

// TasksManager — מסך ניהול מטלות הצוות (הקצאה + מעקב ביצוע + תבניות). רכיב
// משותף המרונדר בשתי מעטפות זהות מבחינת נתונים:
//   • /clinic-admin/tasks         — מעטפת ניהול הקליניקה (בעלים / מנהלת)
//   • /dashboard/staff-tasks      — מעטפת הדשבורד (מזכיר/ה עם canAssignTasks)
// כך מזכיר/ה מנהלת מטלות בלי להיזרק למסך ניהול הקליניקה (שנראה כמו חשבון
// המנהלת). כל הנתונים מגיעים מאותם נתיבי /api/clinic-admin/tasks + /api/task-
// templates, וה-scope נאכף בשרת (בעלים=כל הארגון, מזכיר/ה=מה שהקצתה) — כך
// שהמנהלת רואה אוטומטית את מה שכולם ענו, בלי תלות במעטפת שבה צופים.

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion";
import {
  Loader2,
  Plus,
  ClipboardList,
  CheckCircle2,
  Eye,
  Clock,
  AlertTriangle,
  Repeat,
  Pencil,
  Trash2,
  MessageCircle,
  ChevronDown,
  ChevronUp,
  Search,
} from "lucide-react";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { toast } from "sonner";
import { AssignTaskDialog } from "@/components/clinic-admin/assign-task-dialog";
import {
  TemplateDialog,
  type TaskTemplateData,
} from "@/components/clinic-admin/template-dialog";
import { TaskCommentsThread } from "@/components/tasks/task-comments-thread";

type Assignee = {
  taskId: string;
  userId: string;
  name: string | null;
  status: string;
  seenAt: string | null;
  completedAt: string | null;
  completionNote: string | null;
  overdue: boolean;
  commentCount: number;
};
type TaskGroup = {
  batchId: string;
  title: string;
  description: string | null;
  priority: string;
  dueDate: string | null;
  createdAt: string;
  assignedByName: string | null;
  assignees: Assignee[];
  counts: { total: number; completed: number; seen: number; overdue: number };
};

const PRIORITY_LABELS: Record<string, string> = {
  LOW: "נמוכה",
  MEDIUM: "בינונית",
  HIGH: "גבוהה",
  URGENT: "דחופה",
};
const PRIORITY_COLORS: Record<string, string> = {
  LOW: "text-muted-foreground",
  MEDIUM: "text-sky-600",
  HIGH: "text-amber-600",
  URGENT: "text-red-600",
};
const ASSIGN_MODE_LABELS: Record<string, string> = {
  SPECIFIC: "עובדים נבחרים",
  ALL_THERAPISTS: "כל המטפלים",
  ALL_SECRETARIES: "כל המזכירות",
  ALL_STAFF: "כל הצוות",
};
const WEEKDAY_NAMES = [
  "ראשון",
  "שני",
  "שלישי",
  "רביעי",
  "חמישי",
  "שישי",
  "שבת",
];

function recurrenceLabel(t: TaskTemplateData): string {
  if (t.recurrence === "DAILY") return "חוזרת כל יום";
  if (t.recurrence === "WEEKLY")
    return `חוזרת כל יום ${WEEKDAY_NAMES[t.recurrenceWeekday ?? 0] ?? ""}`;
  if (t.recurrence === "MONTHLY")
    return `חוזרת ב-${t.recurrenceMonthday ?? 1} לכל חודש`;
  return "שליחה ידנית";
}

function TasksManagerInner() {
  const searchParams = useSearchParams();
  const [groups, setGroups] = useState<TaskGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [view, setView] = useState<"tasks" | "templates">("tasks");
  const [templates, setTemplates] = useState<TaskTemplateData[]>([]);
  const [tplDialogOpen, setTplDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] =
    useState<TaskTemplateData | null>(null);
  // איזו מטלה פתוחה כרגע לתצוגת שרשור ההערות (collapse — אחת בכל פעם).
  const [openThreadTaskId, setOpenThreadTaskId] = useState<string | null>(null);
  // אילו מטלות פתוחות ב-Accordion (controlled — לפתיחה אוטומטית לפי ?task=).
  const [openItems, setOpenItems] = useState<string[]>([]);
  // צילום-מצב של מטלות עם פעילות חדשה שלא נקראה (הערה/ביצוע), נשלף בכניסה.
  // נשמר בנפרד מה-badge: גם אחרי סימון-נקרא, החיווי "חדש" נשאר גלוי עד רענון.
  const [newTaskIds, setNewTaskIds] = useState<Set<string>>(new Set());
  // חיפוש חופשי — מסנן את הרשימה של הלשונית הפעילה (מטלות/תבניות).
  const [query, setQuery] = useState("");

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch("/api/clinic-admin/tasks", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setGroups(Array.isArray(data) ? data : []);
      }
    } catch {
      // שקט — נטען מחדש ברענון
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch("/api/task-templates", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setTemplates(Array.isArray(data) ? data : []);
      }
    } catch {
      // שקט
    }
  }, []);

  useEffect(() => {
    fetchTasks();
    fetchTemplates();
  }, [fetchTasks, fetchTemplates]);

  // צילום-מצב חיוויי "חדש" בכניסה + סימון נקרא (מאפס את ה-badge בטאב). מקור
  // האמת הוא ה-inbox (אותו endpoint של ה-badge), כך ש"חדש" עקבי עם המספר.
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/api/clinic-admin/tasks/inbox", {
          cache: "no-store",
        });
        if (!res.ok || !active) return;
        const data = await res.json();
        const refs: string[] = (data.items || [])
          .map((it: { taskRef: string | null }) => it.taskRef)
          .filter((r: string | null): r is string => !!r);
        if (refs.length > 0) setNewTaskIds(new Set(refs));
        if ((data.unreadCount || 0) > 0) {
          // best-effort — מסמן את כל חיוויי המטלות כנקראו (גוף ריק).
          fetch("/api/clinic-admin/tasks/inbox", { method: "POST" }).catch(
            () => {}
          );
        }
      } catch {
        // שקט
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // פתיחה אוטומטית + גלילה למטלה ספציפית (מלחיצה במלבן/פעמון: ?task=<id>).
  useEffect(() => {
    const taskId = searchParams.get("task");
    if (!taskId || groups.length === 0) return;
    const g = groups.find((grp) =>
      grp.assignees.some((a) => a.taskId === taskId)
    );
    if (!g) return;
    setView("tasks");
    setOpenItems((prev) =>
      prev.includes(g.batchId) ? prev : [...prev, g.batchId]
    );
    const t = setTimeout(() => {
      document
        .getElementById(`tg-${g.batchId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 150);
    return () => clearTimeout(t);
  }, [searchParams, groups]);

  const groupHasNew = (g: TaskGroup) =>
    g.assignees.some((a) => newTaskIds.has(a.taskId));

  const handleDeleteTemplate = async (id: string) => {
    if (!confirm("למחוק את התבנית?")) return;
    try {
      const res = await fetch(`/api/task-templates/${id}`, { method: "DELETE" });
      if (res.ok) {
        toast.success("התבנית נמחקה");
        fetchTemplates();
      } else {
        toast.error("שגיאה במחיקת התבנית");
      }
    } catch {
      toast.error("שגיאה במחיקת התבנית");
    }
  };

  const q = query.trim().toLowerCase();
  const filteredGroups = q
    ? groups.filter(
        (g) =>
          (g.title || "").toLowerCase().includes(q) ||
          (g.description || "").toLowerCase().includes(q) ||
          g.assignees.some((a) => (a.name || "").toLowerCase().includes(q))
      )
    : groups;
  const filteredTemplates = q
    ? templates.filter(
        (t) =>
          (t.title || "").toLowerCase().includes(q) ||
          (t.description || "").toLowerCase().includes(q)
      )
    : templates;

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ClipboardList className="h-6 w-6 text-primary" /> מטלות צוות
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            הקצאת מטלות לעובדים ומעקב אחר הביצוע
          </p>
        </div>
        {view === "tasks" ? (
          <Button onClick={() => setDialogOpen(true)}>
            <Plus className="ml-2 h-4 w-4" /> מטלה חדשה
          </Button>
        ) : (
          <Button
            onClick={() => {
              setEditingTemplate(null);
              setTplDialogOpen(true);
            }}
          >
            <Plus className="ml-2 h-4 w-4" /> תבנית חדשה
          </Button>
        )}
      </div>

      {/* מתג בין מטלות פעילות לתבניות */}
      <div className="flex gap-1 border-b">
        <button
          onClick={() => setView("tasks")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            view === "tasks"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          מטלות
        </button>
        <button
          onClick={() => setView("templates")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
            view === "templates"
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
        >
          תבניות {templates.length > 0 && `(${templates.length})`}
        </button>
      </div>

      {/* חיפוש — מסנן את הרשימה של הלשונית הפעילה */}
      {((view === "tasks" && groups.length > 0) ||
        (view === "templates" && templates.length > 0)) && (
        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={view === "tasks" ? "חיפוש מטלה…" : "חיפוש תבנית…"}
            className="pr-9"
          />
        </div>
      )}

      {/* ===== תצוגת מטלות — כרטיסים מתקפלים, 3 בשורה ===== */}
      {view === "tasks" &&
        (loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : groups.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <ClipboardList className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p>עדיין לא נשלחו מטלות צוות.</p>
              <p className="text-sm">לחצ/י &quot;מטלה חדשה&quot; כדי להתחיל.</p>
            </CardContent>
          </Card>
        ) : filteredGroups.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Search className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p>לא נמצאו מטלות התואמות לחיפוש.</p>
            </CardContent>
          </Card>
        ) : (
          <Accordion
            type="multiple"
            value={openItems}
            onValueChange={setOpenItems}
            className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-start"
          >
            {filteredGroups.map((g) => (
              <AccordionItem
                key={g.batchId}
                value={g.batchId}
                id={`tg-${g.batchId}`}
                className="rounded-lg border bg-card shadow-sm px-4 last:border-b"
              >
                    <AccordionTrigger className="hover:no-underline py-3">
                      {/* שורה מקופלת: כותרת + עדיפות/יעד + חיווי "חדש" + מונה */}
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        {groupHasNew(g) && (
                          <span className="shrink-0 inline-flex items-center rounded-full bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300 px-2 py-0.5 text-[10px] font-medium">
                            חדש
                          </span>
                        )}
                        <div className="min-w-0">
                          <div className="font-medium truncate">{g.title}</div>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-0.5 text-[11px] font-normal text-muted-foreground">
                            <span className={PRIORITY_COLORS[g.priority]}>
                              {PRIORITY_LABELS[g.priority] || g.priority}
                            </span>
                            {g.dueDate && (
                              <span className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                {format(new Date(g.dueDate), "d/M", {
                                  locale: he,
                                })}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center shrink-0 me-2 text-center leading-none">
                        <div>
                          <span className="text-base font-semibold text-emerald-600">
                            {g.counts.completed}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            /{g.counts.total}
                          </span>
                          {g.counts.overdue > 0 && (
                            <div className="text-[10px] text-red-500 mt-0.5 font-normal">
                              {g.counts.overdue} באיחור
                            </div>
                          )}
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      {g.description && (
                        <p className="text-sm text-muted-foreground mb-2 whitespace-pre-wrap">
                          {g.description}
                        </p>
                      )}
                      {g.assignedByName && (
                        <p className="text-[11px] text-muted-foreground mb-2">
                          נשלח ע&quot;י {g.assignedByName}
                        </p>
                      )}
                      <div className="space-y-1.5">
                        {g.assignees.map((a) => (
                          <div
                            key={a.taskId}
                            className="flex items-start gap-2 py-1.5 px-2 rounded-md bg-muted/30"
                          >
                            {a.status === "COMPLETED" ? (
                              <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                            ) : a.overdue ? (
                              <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                            ) : a.seenAt ? (
                              <Eye className="h-4 w-4 text-sky-500 shrink-0 mt-0.5" />
                            ) : (
                              <Clock className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-medium">
                                  {a.name || "ללא שם"}
                                </span>
                                <span className="text-xs text-muted-foreground">
                                  {a.status === "COMPLETED"
                                    ? "בוצע"
                                    : a.overdue
                                      ? "באיחור"
                                      : a.seenAt
                                        ? "נצפה"
                                        : "ממתין"}
                                  {a.completedAt &&
                                    ` · ${format(new Date(a.completedAt), "d/M HH:mm", { locale: he })}`}
                                </span>
                              </div>
                              {a.completionNote && (
                                <p className="text-xs text-foreground/80 mt-1 whitespace-pre-wrap bg-background rounded p-1.5 border">
                                  {a.completionNote}
                                </p>
                              )}

                              {/* שקיפות דו-כיוונית — כפתור "הערות (N)" + שרשור (collapse).
                                  המנהל/מזכירה רואה את התכתבות העובד ועונה לו ישירות. */}
                              <button
                                type="button"
                                onClick={() =>
                                  setOpenThreadTaskId(
                                    openThreadTaskId === a.taskId
                                      ? null
                                      : a.taskId
                                  )
                                }
                                className={`mt-1 inline-flex items-center gap-1 text-[11px] ${
                                  a.commentCount > 0
                                    ? "text-primary font-medium"
                                    : "text-muted-foreground hover:text-foreground"
                                }`}
                              >
                                <MessageCircle className="h-3 w-3" />
                                הערות
                                {a.commentCount > 0 ? ` (${a.commentCount})` : ""}
                                {openThreadTaskId === a.taskId ? (
                                  <ChevronUp className="h-3 w-3" />
                                ) : (
                                  <ChevronDown className="h-3 w-3" />
                                )}
                              </button>
                              {openThreadTaskId === a.taskId && (
                                <TaskCommentsThread
                                  taskId={a.taskId}
                                  canPost
                                  onPosted={() =>
                                    setGroups((prev) =>
                                      prev.map((grp) => ({
                                        ...grp,
                                        assignees: grp.assignees.map((x) =>
                                          x.taskId === a.taskId
                                            ? {
                                                ...x,
                                                commentCount: x.commentCount + 1,
                                              }
                                            : x
                                        ),
                                      }))
                                    )
                                  }
                                  className="mt-2"
                                />
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
          </Accordion>
        ))}

      {/* ===== תצוגת תבניות — 3 בשורה ===== */}
      {view === "templates" &&
        (templates.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Repeat className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p>אין תבניות עדיין.</p>
              <p className="text-sm">
                תבנית חוסכת הקלדה חוזרת, ויכולה לשלוח מטלה אוטומטית כל יום/שבוע/חודש.
              </p>
            </CardContent>
          </Card>
        ) : filteredTemplates.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              <Search className="h-10 w-10 mx-auto mb-3 opacity-40" />
              <p>לא נמצאו תבניות התואמות לחיפוש.</p>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 items-start">
            {filteredTemplates.map((t) => (
              <Card key={t.id} className={t.active ? "" : "opacity-60"}>
                <CardContent className="py-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-medium">{t.title}</p>
                    {t.description && (
                      <p className="text-sm text-muted-foreground mt-0.5 line-clamp-2 whitespace-pre-wrap">
                        {t.description}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1.5 text-xs text-muted-foreground">
                      <span
                        className={`flex items-center gap-1 ${t.recurrence !== "NONE" ? "text-primary" : ""}`}
                      >
                        {t.recurrence !== "NONE" && <Repeat className="h-3 w-3" />}
                        {recurrenceLabel(t)}
                      </span>
                      <span>
                        {ASSIGN_MODE_LABELS[t.assignMode] || t.assignMode}
                      </span>
                      {!t.active && <span className="text-amber-600">מושהית</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      title="ערוך"
                      onClick={() => {
                        setEditingTemplate(t);
                        setTplDialogOpen(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-red-500 hover:text-red-600"
                      title="מחק"
                      onClick={() => handleDeleteTemplate(t.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ))}

      <AssignTaskDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={fetchTasks}
      />
      <TemplateDialog
        open={tplDialogOpen}
        onOpenChange={setTplDialogOpen}
        onSaved={fetchTemplates}
        template={editingTemplate}
      />
    </div>
  );
}

export function TasksManager() {
  // useSearchParams דורש גבול Suspense ב-App Router.
  return (
    <Suspense
      fallback={
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      }
    >
      <TasksManagerInner />
    </Suspense>
  );
}
