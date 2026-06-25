"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ListTodo,
  Bell,
  Loader2,
  ChevronDown,
  ChevronUp,
  History,
  CheckCircle2,
  X,
  Pencil,
  Sun,
  Moon,
} from "lucide-react";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { toast } from "sonner";
import { AddCustomTask } from "./add-custom-task";
import { TaskCommentsThread } from "./task-comments-thread";
import { CompletionCelebration, useCompletionCelebration } from "./completion-celebration";
import { useShabbat } from "@/hooks/useShabbat";

interface Task {
  id: string;
  type: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  reminderAt: string | null;
  createdAt: string;
  updatedAt?: string;
  // מטלות צוות (STAFF_TASK): מי הקצה, אישור צפייה, והערת ביצוע.
  assignedById?: string | null;
  assignedBy?: { id: string; name: string | null } | null;
  seenAt?: string | null;
  completionNote?: string | null;
}

interface Reminder {
  id: string;
  type: string;
  title: string;
  content: string;
  createdAt: string;
  status?: string;
}

const MAX_VISIBLE = 8;

const PRIORITY_LABELS: Record<string, string> = {
  LOW: "נמוכה",
  MEDIUM: "בינונית",
  HIGH: "גבוהה",
  URGENT: "דחופה",
};

export function PersonalTasksWidget() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [historyTasks, setHistoryTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({ title: "", description: "" });
  const [saving, setSaving] = useState(false);
  const [selectedReminder, setSelectedReminder] = useState<Reminder | null>(null);
  const [highlight, setHighlight] = useState(false);
  const [readReminders, setReadReminders] = useState<Set<string>>(new Set());
  const processedNotificationRef = useRef<string | null>(null);
  const { celebration, trigger: triggerCelebration, dismiss: dismissCelebration } = useCompletionCelebration();
  // מטלת צוות בתהליך סימון "בוצע" — פותח דיאלוג עם הערת ביצוע אופציונלית.
  const [completingTask, setCompletingTask] = useState<Task | null>(null);
  const [completionNote, setCompletionNote] = useState("");

  const fetchTasks = useCallback(async () => {
    try {
      const response = await fetch("/api/tasks?status=PENDING");
      if (response.ok) {
        const data = await response.json();
        // CUSTOM = משימה אישית; STAFF_TASK = מטלה שהוקצתה ע"י המנהלת/מזכירה.
        setTasks(data.filter((t: Task) => t.type === "CUSTOM" || t.type === "STAFF_TASK"));
      }
    } catch (error) {
      console.error("Failed to fetch tasks:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const fetchReminders = useCallback(async () => {
    try {
      // שולפים את כל ההתראות (לא רק unread) כדי שסיכומים שנקראו עדיין יופיעו בווידג'ט
      const response = await fetch("/api/notifications");
      if (response.ok) {
        const data = await response.json();
        const summaryTypes = ["MORNING_SUMMARY", "EVENING_SUMMARY"];
        const oneDayMs = 24 * 60 * 60 * 1000;
        const now = Date.now();
        // סיכומים מ-24 השעות האחרונות שלא נדחקו (DISMISSED) - נשארים בווידג'ט
        const active = (data.notifications || []).filter((n: Reminder) => {
          if (!summaryTypes.includes(n.type)) return false;
          if (n.status === "DISMISSED") return false;
          const age = now - new Date(n.createdAt).getTime();
          return age <= oneDayMs;
        });
        setReminders(active);
        // סימון תזכורות שכבר נקראו בשרת — ככה לא מהבהבות אחרי רענון
        const alreadyRead = active
          .filter((n: Reminder) => n.status === "READ")
          .map((n: Reminder) => n.id);
        if (alreadyRead.length > 0) {
          setReadReminders(prev => {
            const next = new Set(prev);
            alreadyRead.forEach((id: string) => next.add(id));
            return next;
          });
        }
      }
    } catch (error) {
      console.error("Failed to fetch reminders:", error);
    }
  }, []);

  const dismissReminder = async (id: string) => {
    try {
      // מוחק את ההתראה לגמרי כדי שלא תחזור בריענון
      await fetch(`/api/notifications/${id}`, { method: "DELETE" });
      setReminders(prev => prev.filter(r => r.id !== id));
      // שידור אירוע כדי שהפעמון בהדר יתעדכן מיד
      window.dispatchEvent(new CustomEvent("notification-read"));
    } catch { /* ignore */ }
  };

  const fetchHistory = useCallback(async () => {
    try {
      const response = await fetch("/api/tasks?history=true");
      if (response.ok) {
        const data = await response.json();
        setHistoryTasks(data);
      }
    } catch (error) {
      console.error("Failed to fetch history:", error);
    }
  }, []);

  useEffect(() => { fetchTasks(); fetchReminders(); }, [fetchTasks, fetchReminders]);

  // כשהעמון למעלה מסמן התראה כנקראה — לעדכן גם את הדשבורד
  useEffect(() => {
    const handler = () => fetchReminders();
    window.addEventListener("notification-read", handler);
    return () => window.removeEventListener("notification-read", handler);
  }, [fetchReminders]);

  useEffect(() => {
    if (showHistory && historyTasks.length === 0) {
      fetchHistory();
    }
  }, [showHistory, historyTasks.length, fetchHistory]);

  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  // כשמגיעים מהפעמון עם notificationId - שולפים את ההתראה הספציפית,
  // מוסיפים אותה לרשימה אם חסרה, ופותחים את הדיאלוג אוטומטית
  useEffect(() => {
    const notificationId = searchParams.get("notificationId");
    if (!notificationId || isLoading) return;
    // מונע עיבוד כפול של אותו notificationId
    if (processedNotificationRef.current === notificationId) return;
    processedNotificationRef.current = notificationId;

    const existing = reminders.find(r => r.id === notificationId);
    if (existing) {
      // ההתראה כבר ברשימה - פותחים את הדיאלוג ישר
      setSelectedReminder(existing);
    } else {
      // ההתראה לא ברשימה (נסמנה כנקראה מהפעמון או ישנה) - שולפים בלי סינון
      fetch("/api/notifications")
        .then(res => res.ok ? res.json() : null)
        .then(data => {
          if (!data) return;
          const notification = (data.notifications || []).find(
            (n: Reminder) => n.id === notificationId
          );
          if (notification) {
            setReminders(prev => {
              if (prev.find(r => r.id === notification.id)) return prev;
              return [notification, ...prev];
            });
            setSelectedReminder(notification);
          }
        })
        .catch(() => {});
    }
  }, [isLoading, searchParams]);

  // גלילה מיידית כשמגיעים מהפעמון עם ?scrollTo=personal-tasks או #personal-tasks
  useEffect(() => {
    const shouldScroll =
      searchParams.get("scrollTo") === "personal-tasks" ||
      window.location.hash === "#personal-tasks";
    if (!isLoading && shouldScroll) {
      const timerId = setTimeout(() => {
        const el = document.getElementById("personal-tasks");
        if (el) {
          el.scrollIntoView({ behavior: "instant" });
          setHighlight(true);
          setTimeout(() => setHighlight(false), 10000);
        }
        // ניקוי הפרמטרים מה-URL בלי רענון
        const url = new URL(window.location.href);
        url.searchParams.delete("scrollTo");
        url.searchParams.delete("notificationId");
        url.hash = "";
        window.history.replaceState(null, "", url.pathname + url.search);
      }, 300);
      return () => clearTimeout(timerId);
    }
  }, [isLoading, searchParams]);


  const [activeReminders, setActiveReminders] = useState<Set<string>>(new Set());

  const getAcknowledged = (): string[] => {
    try { return JSON.parse(localStorage.getItem("acknowledged_reminders") || "[]"); }
    catch { return []; }
  };

  const addAcknowledged = (taskId: string) => {
    const list = getAcknowledged();
    if (!list.includes(taskId)) {
      localStorage.setItem("acknowledged_reminders", JSON.stringify([...list, taskId]));
    }
  };

  useEffect(() => {
    const now = new Date();
    const acknowledged = getAcknowledged();
    const active = new Set<string>();
    tasks.forEach(task => {
      if (task.reminderAt && !acknowledged.includes(task.id)) {
        const reminderTime = new Date(task.reminderAt);
        const elapsed = now.getTime() - reminderTime.getTime();
        // הבהוב רק עד 5 דקות מרגע התזכורת
        if (elapsed >= 0 && elapsed < 5 * 60 * 1000) {
          active.add(task.id);
        }
      }
    });
    setActiveReminders(active);

    // עצירת הבהוב אוטומטית אחרי 5 דקות
    const timer = setTimeout(() => {
      setActiveReminders(new Set());
    }, 5 * 60 * 1000);
    return () => clearTimeout(timer);
  }, [tasks]);

  const { isShabbat: isShabbatMode, tooltip: shabbatTooltip } = useShabbat();

  // כשמסירים תזכורת בוקר/ערב מהפעמון (header) — להסיר אותה גם מהווידג'ט מיד
  // ולהפעיל את אנימציית העידוד, בדיוק כמו הסרה מתוך הווידג'ט עצמו (אחידות).
  // ⭐ בשבת/חג — לא מפעילים עידוד (קונפטי), עקבי עם שאר התנהגות השבת בווידג'ט.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { id?: string; celebrate?: boolean } | undefined;
      if (detail?.id) {
        // מסירים רק אם התזכורת באמת ברשימה — מונע re-render מיותר בהתראות שאינן תזכורת בוקר/ערב.
        setReminders(prev => (prev.some(r => r.id === detail.id) ? prev.filter(r => r.id !== detail.id) : prev));
      }
      if (detail?.celebrate && !isShabbatMode) {
        triggerCelebration();
      }
    };
    window.addEventListener("reminder-dismissed", handler);
    return () => window.removeEventListener("reminder-dismissed", handler);
  }, [triggerCelebration, isShabbatMode]);

  useEffect(() => {
    const checkReminders = () => {
      // בשבת/חג — לא להבהב, לא להציג toast, לא להפעיל Notification API.
      if (isShabbatMode) return;

      const now = new Date();
      const notifiedKey = "notified_reminders";
      const notified = JSON.parse(localStorage.getItem(notifiedKey) || "[]");
      tasks.forEach((task) => {
        if (task.reminderAt && !notified.includes(task.id)) {
          const reminderTime = new Date(task.reminderAt);
          const timeDiff = now.getTime() - reminderTime.getTime();
          if (timeDiff >= 0 && timeDiff < 5 * 60 * 1000) {
            if ("Notification" in window && Notification.permission === "granted") {
              new Notification("תזכורת: " + task.title, { body: task.description || "יש לך משימה", icon: "/favicon.ico" });
            }
            localStorage.setItem(notifiedKey, JSON.stringify([...notified, task.id]));
            toast.info(`תזכורת: ${task.title}`, { duration: 10000 });

            setActiveReminders(prev => new Set(prev).add(task.id));

            fetch("/api/notifications", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                type: "PENDING_TASKS",
                title: `תזכורת: ${task.title}`,
                content: task.description || "יש לך מטלה שדורשת טיפול",
              }),
            }).catch(() => {});
          }
        }
      });
    };
    const interval = setInterval(checkReminders, 60000);
    checkReminders();
    return () => clearInterval(interval);
  }, [tasks, isShabbatMode]);

  const handleComplete = async (taskId: string, note?: string) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "COMPLETED", ...(note ? { completionNote: note } : {}) }),
      });
      if (res.ok) {
        setTasks(prev => prev.filter(t => t.id !== taskId));
        triggerCelebration();
      }
    } catch { toast.error("שגיאה"); }
  };

  const handleSaveEdit = async () => {
    if (!selectedTask) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/tasks/${selectedTask.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: editForm.title, description: editForm.description || null }),
      });
      if (res.ok) {
        setTasks(prev => prev.map(t =>
          t.id === selectedTask.id
            ? { ...t, title: editForm.title, description: editForm.description || null }
            : t
        ));
        setSelectedTask({ ...selectedTask, title: editForm.title, description: editForm.description || null });
        setIsEditing(false);
        toast.success("עודכן בהצלחה");
      }
    } catch { toast.error("שגיאה בשמירה"); }
    finally { setSaving(false); }
  };

  const openTask = (task: Task) => {
    setSelectedTask(task);
    setEditForm({ title: task.title, description: task.description || "" });
    setIsEditing(false);
    // מטלת צוות שטרם נצפתה — רישום אישור צפייה (לא חוסם UI; עדכון אופטימי מקומי).
    if (task.type === "STAFF_TASK" && !task.seenAt) {
      fetch(`/api/tasks/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markSeen: true }),
      }).catch(() => {});
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, seenAt: new Date().toISOString() } : t));
    }
  };

  if (isLoading) {
    return <Card><CardContent className="py-6 flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></CardContent></Card>;
  }

  function renderReminders() {
    if (reminders.length === 0) return null;
    return (
      <div className="space-y-2 mb-3">
        {reminders.map(reminder => (
          <div
            key={reminder.id}
            className={`flex items-start gap-2 py-2 px-3 rounded-lg bg-amber-100 border border-amber-300 shadow-sm cursor-pointer ${readReminders.has(reminder.id) ? "" : "animate-pulse"}`}
            onClick={() => {
              setReadReminders(prev => new Set(prev).add(reminder.id));
              setSelectedReminder(reminder);
              // שומר ב-DB שההתראה נקראה — ככה לא חוזרת להבהב אחרי רענון
              fetch(`/api/notifications/${reminder.id}/read`, { method: "POST" })
                .then(() => window.dispatchEvent(new CustomEvent("notification-read")))
                .catch(() => {});
            }}
          >
            {reminder.type === "MORNING_SUMMARY" ? (
              <Sun className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
            ) : (
              <Moon className="h-4 w-4 text-indigo-500 shrink-0 mt-0.5" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium truncate">{reminder.title}</p>
              <p className="text-xs text-muted-foreground line-clamp-2 whitespace-pre-line">{reminder.content}</p>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); triggerCelebration(); dismissReminder(reminder.id); }}
              className="shrink-0 h-8 w-8 rounded-full bg-emerald-500 hover:bg-emerald-600 hover:scale-110 flex items-center justify-center shadow-md transition-all"
              title="סמן כהושלם"
            >
              <CheckCircle2 className="h-5 w-5 text-white" />
            </button>
          </div>
        ))}
      </div>
    );
  }

  const highlightClass = highlight ? "ring-2 ring-teal-400 dark:ring-teal-500 ring-offset-2 ring-offset-background transition-all duration-500" : "transition-all duration-500";

  // ⭐ בשבת/חג — widget מוסתר ובמקומו הודעת "שבת שלום" שלווה (בלי מטלות/תזכורות).
  if (isShabbatMode) {
    return (
      <Card id="personal-tasks" className={highlightClass}>
        <CardHeader className="pb-2">
          <div className="flex items-center gap-2">
            <ListTodo className="h-4 w-4 text-primary/60" />
            <CardTitle className="text-sm font-medium text-muted-foreground">מטלות ותזכורות</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="py-6 text-center space-y-1">
          <p className="text-lg font-semibold text-primary">{shabbatTooltip?.split(" — ")[0] ?? "שבת שלום"}</p>
          <p className="text-sm text-muted-foreground">המטלות יחזרו להופיע במוצאי שבת/חג</p>
        </CardContent>
      </Card>
    );
  }

  if (tasks.length === 0 && reminders.length === 0 && !showHistory) {
    return (
      <>
        <Card id="personal-tasks" className={highlightClass}>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <div className="flex items-center gap-2">
              <ListTodo className="h-4 w-4 text-primary" />
              <CardTitle className="text-sm font-medium">מטלות ותזכורות</CardTitle>
            </div>
            <div className="flex items-center gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1 text-muted-foreground"
                onClick={() => setShowHistory(!showHistory)}
              >
                <History className="h-3 w-3" />
                היסטוריה
              </Button>
              <AddCustomTask onTaskAdded={fetchTasks} />
            </div>
          </CardHeader>
          <CardContent className="pb-4">
            {showHistory ? renderHistory() : (
              <p className="text-sm text-muted-foreground text-center py-2">אין מטלות ותזכורות</p>
            )}
          </CardContent>
        </Card>
        <CompletionCelebration celebration={celebration} onDismiss={dismissCelebration} />
      </>
    );
  }

  function renderHistory() {
    if (historyTasks.length === 0) {
      return <p className="text-sm text-muted-foreground text-center py-2">אין היסטוריה ב-30 הימים האחרונים</p>;
    }
    return (
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground mb-2">30 ימים אחרונים</p>
        {historyTasks.map(task => (
          <div
            key={task.id}
            className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-muted/50 cursor-pointer"
            onClick={() => openTask(task)}
          >
            {task.status === "COMPLETED" ? (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
            ) : (
              <X className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            )}
            <span className="text-sm flex-1 truncate line-through text-muted-foreground">{task.title}</span>
            {task.updatedAt && (
              <span className="text-[11px] text-muted-foreground shrink-0">
                {format(new Date(task.updatedAt), "d/M")}
              </span>
            )}
          </div>
        ))}
      </div>
    );
  }

  const visibleTasks = showAll ? tasks : tasks.slice(0, MAX_VISIBLE);
  const hasMore = tasks.length > MAX_VISIBLE;

  return (
    <>
      <Card id="personal-tasks" className={highlightClass}>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div className="flex items-center gap-2">
            <ListTodo className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-medium">מטלות ותזכורות</CardTitle>
            <span className="text-xs text-muted-foreground">({tasks.length + reminders.length})</span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1 text-muted-foreground"
              onClick={() => { setShowHistory(!showHistory); }}
            >
              <History className="h-3 w-3" />
              {showHistory ? "מטלות" : "היסטוריה"}
            </Button>
            <AddCustomTask onTaskAdded={fetchTasks} />
          </div>
        </CardHeader>
        <CardContent className="pb-3">
          {showHistory ? renderHistory() : (
            <>
              {renderReminders()}
              <div className="space-y-2">
                {visibleTasks.map(task => (
                  <div
                    key={task.id}
                    className={`flex items-center gap-2 py-2 px-3 rounded-lg group cursor-pointer transition-all ${
                      activeReminders.has(task.id)
                        ? "animate-pulse bg-amber-100 border border-amber-300 shadow-sm"
                        : task.type === "STAFF_TASK"
                          ? "bg-violet-100/70 hover:bg-violet-100 border border-violet-300 dark:bg-violet-900/20 dark:border-violet-800"
                          : "bg-sky-100/60 hover:bg-sky-100 border border-sky-200"
                    }`}
                    onClick={() => {
                      if (activeReminders.has(task.id)) {
                        addAcknowledged(task.id);
                        setActiveReminders(prev => {
                          const next = new Set(prev);
                          next.delete(task.id);
                          return next;
                        });
                      }
                      openTask(task);
                    }}
                  >
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        // מטלת צוות → דיאלוג עם הערת ביצוע אופציונלית; אישית → סימון מיידי.
                        if (task.type === "STAFF_TASK") {
                          setCompletingTask(task);
                          setCompletionNote("");
                        } else {
                          handleComplete(task.id);
                        }
                      }}
                      className="shrink-0 h-8 w-8 rounded-full bg-emerald-500 hover:bg-emerald-600 hover:scale-110 flex items-center justify-center shadow-md transition-all"
                      title="סמן כהושלם"
                    >
                      <CheckCircle2 className="h-5 w-5 text-white" />
                    </button>
                    <span className="text-sm flex-1 truncate">
                      {task.title}
                      {task.type === "STAFF_TASK" && (
                        <span className="ms-1.5 inline-flex items-center rounded-full bg-violet-200 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 align-middle dark:bg-violet-900/40 dark:text-violet-300">
                          מהנהלת הקליניקה
                        </span>
                      )}
                    </span>
                    {task.reminderAt && <Bell className="h-3 w-3 text-amber-500 shrink-0" />}
                    {task.dueDate && (
                      <span className="text-[11px] text-muted-foreground shrink-0">
                        {format(new Date(task.dueDate), "d/M")}
                      </span>
                    )}
                  </div>
                ))}
              </div>
              {hasMore && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="w-full mt-2 text-xs gap-1"
                  onClick={() => setShowAll(!showAll)}
                >
                  {showAll ? <><ChevronUp className="h-3 w-3" />הצג פחות</> : <><ChevronDown className="h-3 w-3" />עוד {tasks.length - MAX_VISIBLE} מטלות</>}
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Task Detail / Edit Dialog */}
      <Dialog open={!!selectedTask} onOpenChange={(o) => { if (!o) { setSelectedTask(null); setIsEditing(false); } }}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ListTodo className="h-5 w-5 text-primary" />
              {isEditing ? "עריכת מטלה" : "פרטי מטלה"}
            </DialogTitle>
          </DialogHeader>

          {selectedTask && !isEditing && (
            <div className="space-y-4 py-2">
              <div>
                <Label className="text-xs text-muted-foreground">כותרת</Label>
                <p className="text-sm font-medium mt-1">{selectedTask.title}</p>
              </div>

              {selectedTask.description && (
                <div>
                  <Label className="text-xs text-muted-foreground">תיאור</Label>
                  <p className="text-sm mt-1 whitespace-pre-wrap bg-muted/30 p-3 rounded-lg">{selectedTask.description}</p>
                </div>
              )}

              {selectedTask.type === "STAFF_TASK" && (
                <div>
                  <Label className="text-xs text-muted-foreground">נשלח ע״י</Label>
                  <p className="text-sm mt-1">{selectedTask.assignedBy?.name || "הקליניקה"}</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs text-muted-foreground">עדיפות</Label>
                  <p className="text-sm mt-1">{PRIORITY_LABELS[selectedTask.priority] || selectedTask.priority}</p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">סטטוס</Label>
                  <p className="text-sm mt-1">
                    {selectedTask.status === "PENDING" ? "פעילה" : selectedTask.status === "COMPLETED" ? "הושלמה" : "נמחקה"}
                  </p>
                </div>
              </div>

              {selectedTask.dueDate && (
                <div>
                  <Label className="text-xs text-muted-foreground">תאריך יעד</Label>
                  <p className="text-sm mt-1">{format(new Date(selectedTask.dueDate), "EEEE, d בMMMM yyyy", { locale: he })}</p>
                </div>
              )}

              {selectedTask.reminderAt && (
                <div>
                  <Label className="text-xs text-muted-foreground">תזכורת</Label>
                  <p className="text-sm mt-1">{format(new Date(selectedTask.reminderAt), "EEEE, d/M בשעה HH:mm", { locale: he })}</p>
                </div>
              )}

              <div>
                <Label className="text-xs text-muted-foreground">נוצרה</Label>
                <p className="text-sm mt-1">{format(new Date(selectedTask.createdAt), "d/M/yyyy HH:mm", { locale: he })}</p>
              </div>

              {/* שרשור הערות דו-כיווני — מטלת צוות בלבד. העובד מגיב/שואל בלי לדרוס
                  את הטקסט שהמנהלת כתבה; המנהלת רואה ועונה בלוח /clinic-admin/tasks. */}
              {selectedTask.type === "STAFF_TASK" && (
                <TaskCommentsThread
                  taskId={selectedTask.id}
                  canPost
                  className="border-t pt-3"
                />
              )}
            </div>
          )}

          {selectedTask && isEditing && (
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>כותרת</Label>
                <Input
                  value={editForm.title}
                  onChange={e => setEditForm(f => ({ ...f, title: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>תיאור</Label>
                <Textarea
                  value={editForm.description}
                  onChange={e => setEditForm(f => ({ ...f, description: e.target.value }))}
                  rows={5}
                  className="resize-none"
                  placeholder="פרטים נוספים..."
                />
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            {selectedTask?.status === "PENDING" && !isEditing && (
              <>
                {/* מטלת צוות נעולה לעריכה אצל העובד — הוא מגיב בהערות, לא דורס.
                    משימה אישית (CUSTOM) נשארת ניתנת לעריכה ע"י הבעלים. */}
                {selectedTask.type !== "STAFF_TASK" && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    onClick={() => setIsEditing(true)}
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    ערוך
                  </Button>
                )}
                <Button
                  size="sm"
                  className="gap-1 bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => {
                    // מטלת צוות → דיאלוג הערת ביצוע; אישית → סימון מיידי.
                    if (selectedTask.type === "STAFF_TASK") {
                      setCompletingTask(selectedTask);
                      setCompletionNote("");
                      setSelectedTask(null);
                    } else {
                      handleComplete(selectedTask.id);
                      setSelectedTask(null);
                    }
                  }}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  סמן כהושלם
                </Button>
              </>
            )}
            {isEditing && (
              <>
                <Button variant="outline" size="sm" onClick={() => setIsEditing(false)} disabled={saving}>
                  ביטול
                </Button>
                <Button size="sm" onClick={handleSaveEdit} disabled={saving}>
                  {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin ml-1" /> : null}
                  שמור
                </Button>
              </>
            )}
            {selectedTask?.status !== "PENDING" && !isEditing && (
              <Button variant="outline" size="sm" onClick={() => setSelectedTask(null)}>
                סגור
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reminder Detail Dialog */}
      <Dialog open={!!selectedReminder} onOpenChange={(o) => { if (!o) setSelectedReminder(null); }}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedReminder?.type === "MORNING_SUMMARY" ? (
                <Sun className="h-5 w-5 text-amber-500" />
              ) : (
                <Moon className="h-5 w-5 text-indigo-500" />
              )}
              {selectedReminder?.title}
            </DialogTitle>
          </DialogHeader>
          {selectedReminder && (
            <div className="space-y-3 py-2">
              <div className="text-sm whitespace-pre-line bg-muted/30 p-4 rounded-lg leading-relaxed">
                {selectedReminder.content}
              </div>
              <p className="text-xs text-muted-foreground">
                {format(new Date(selectedReminder.createdAt), "EEEE, d בMMMM yyyy בשעה HH:mm", { locale: he })}
              </p>
            </div>
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setSelectedReminder(null)}
            >
              סגור
            </Button>
            <Button
              size="sm"
              className="gap-1 bg-emerald-600 hover:bg-emerald-700"
              onClick={() => {
                if (selectedReminder) {
                  triggerCelebration();
                  dismissReminder(selectedReminder.id);
                }
                setSelectedReminder(null);
              }}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              הסר מהרשימה
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* דיאלוג השלמת מטלת צוות — הערת "מה ביצעתי ואיך" אופציונלית */}
      <Dialog open={!!completingTask} onOpenChange={(o) => { if (!o) setCompletingTask(null); }}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
              סימון מטלה כבוצעה
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm font-medium">{completingTask?.title}</p>
            <div className="space-y-2">
              <Label className="text-sm">מה ביצעת ואיך? (אופציונלי)</Label>
              <Textarea
                value={completionNote}
                onChange={(e) => setCompletionNote(e.target.value)}
                rows={3}
                className="resize-none"
                placeholder="אפשר להוסיף פירוט קצר על מה שעשית..."
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" size="sm" onClick={() => setCompletingTask(null)}>
              ביטול
            </Button>
            <Button
              size="sm"
              className="gap-1 bg-emerald-600 hover:bg-emerald-700"
              onClick={() => {
                if (completingTask) handleComplete(completingTask.id, completionNote.trim() || undefined);
                setCompletingTask(null);
              }}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              סמן כבוצע
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CompletionCelebration celebration={celebration} onDismiss={dismissCelebration} />
    </>
  );
}
