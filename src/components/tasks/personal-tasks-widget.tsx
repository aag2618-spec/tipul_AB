"use client";

import { useEffect, useState, useCallback } from "react";
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
  Trash2,
  ChevronDown,
  ChevronUp,
  History,
  CheckCircle2,
  X,
  Pencil,
} from "lucide-react";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { toast } from "sonner";
import { AddCustomTask } from "./add-custom-task";

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
}

const MAX_VISIBLE = 8;

const PRIORITY_LABELS: Record<string, string> = {
  LOW: "נמוכה",
  MEDIUM: "בינונית",
  HIGH: "גבוהה",
  URGENT: "דחופה",
};

export function PersonalTasksWidget() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [historyTasks, setHistoryTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({ title: "", description: "" });
  const [saving, setSaving] = useState(false);

  const fetchTasks = useCallback(async () => {
    try {
      const response = await fetch("/api/tasks?status=PENDING");
      if (response.ok) {
        const data = await response.json();
        setTasks(data.filter((t: Task) => t.type === "CUSTOM"));
      }
    } catch (error) {
      console.error("Failed to fetch tasks:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

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

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

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

  useEffect(() => {
    const checkReminders = () => {
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
            toast.info(`תזכורת: ${task.title}`);
          }
        }
      });
    };
    const interval = setInterval(checkReminders, 60000);
    checkReminders();
    return () => clearInterval(interval);
  }, [tasks]);

  const handleComplete = async (taskId: string) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "COMPLETED" }) });
      if (res.ok) { setTasks(prev => prev.filter(t => t.id !== taskId)); toast.success("הושלם"); }
    } catch { toast.error("שגיאה"); }
  };

  const handleDelete = async (taskId: string) => {
    try {
      const res = await fetch(`/api/tasks/${taskId}`, { method: "DELETE" });
      if (res.ok) { setTasks(prev => prev.filter(t => t.id !== taskId)); toast.success("נמחק"); }
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
  };

  if (isLoading) {
    return <Card><CardContent className="py-6 flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></CardContent></Card>;
  }

  if (tasks.length === 0 && !showHistory) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div className="flex items-center gap-2">
            <ListTodo className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-medium">מטלות אישיות</CardTitle>
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
            <p className="text-sm text-muted-foreground text-center py-2">אין מטלות</p>
          )}
        </CardContent>
      </Card>
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
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div className="flex items-center gap-2">
            <ListTodo className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-medium">מטלות אישיות</CardTitle>
            <span className="text-xs text-muted-foreground">({tasks.length})</span>
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
              <div className="space-y-1.5">
                {visibleTasks.map(task => (
                  <div
                    key={task.id}
                    className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-muted/50 group cursor-pointer"
                    onClick={() => openTask(task)}
                  >
                    <div onClick={(e) => e.stopPropagation()}>
                      <Checkbox className="h-4 w-4" onCheckedChange={() => handleComplete(task.id)} />
                    </div>
                    <span className="text-sm flex-1 truncate">{task.title}</span>
                    {task.description && <span className="text-[10px] text-muted-foreground shrink-0">...</span>}
                    {task.reminderAt && <Bell className="h-3 w-3 text-amber-500 shrink-0" />}
                    {task.dueDate && (
                      <span className="text-[11px] text-muted-foreground shrink-0">
                        {format(new Date(task.dueDate), "d/M")}
                      </span>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDelete(task.id); }}
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-muted-foreground hover:text-destructive" />
                    </button>
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
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  onClick={() => setIsEditing(true)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                  ערוך
                </Button>
                <Button
                  size="sm"
                  className="gap-1 bg-emerald-600 hover:bg-emerald-700"
                  onClick={() => {
                    handleComplete(selectedTask.id);
                    setSelectedTask(null);
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
    </>
  );
}
