"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
} from "lucide-react";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { toast } from "sonner";
import { AssignTaskDialog } from "@/components/clinic-admin/assign-task-dialog";
import {
  TemplateDialog,
  type TaskTemplateData,
} from "@/components/clinic-admin/template-dialog";

type Assignee = {
  taskId: string;
  userId: string;
  name: string | null;
  status: string;
  seenAt: string | null;
  completedAt: string | null;
  completionNote: string | null;
  overdue: boolean;
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

export default function ClinicTasksPage() {
  const [groups, setGroups] = useState<TaskGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [view, setView] = useState<"tasks" | "templates">("tasks");
  const [templates, setTemplates] = useState<TaskTemplateData[]>([]);
  const [tplDialogOpen, setTplDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] =
    useState<TaskTemplateData | null>(null);

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

      {/* ===== תצוגת מטלות ===== */}
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
        ) : (
          <div className="space-y-4">
            {groups.map((g) => (
              <Card key={g.batchId}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle className="text-base">{g.title}</CardTitle>
                      {g.description && (
                        <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">
                          {g.description}
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-xs text-muted-foreground">
                        <span className={PRIORITY_COLORS[g.priority]}>
                          עדיפות: {PRIORITY_LABELS[g.priority] || g.priority}
                        </span>
                        {g.dueDate && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            יעד:{" "}
                            {format(new Date(g.dueDate), "d/M/yyyy", {
                              locale: he,
                            })}
                          </span>
                        )}
                        {g.assignedByName && (
                          <span>נשלח ע&quot;י {g.assignedByName}</span>
                        )}
                      </div>
                    </div>
                    <div className="text-center shrink-0">
                      <p className="text-lg font-semibold text-emerald-600 leading-none">
                        {g.counts.completed}
                        <span className="text-sm text-muted-foreground">
                          /{g.counts.total}
                        </span>
                      </p>
                      <p className="text-[11px] text-muted-foreground mt-1">
                        בוצעו
                      </p>
                      {g.counts.overdue > 0 && (
                        <p className="text-[11px] text-red-500 mt-0.5">
                          {g.counts.overdue} באיחור
                        </p>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
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
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ))}

      {/* ===== תצוגת תבניות ===== */}
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
        ) : (
          <div className="space-y-3">
            {templates.map((t) => (
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
