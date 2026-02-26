"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ListTodo, Bell, Loader2, Trash2, ChevronDown, ChevronUp } from "lucide-react";
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

export function PersonalTasksWidget() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

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

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

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

  if (isLoading) {
    return <Card><CardContent className="py-6 flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></CardContent></Card>;
  }

  if (tasks.length === 0) {
    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <div className="flex items-center gap-2">
            <ListTodo className="h-4 w-4 text-primary" />
            <CardTitle className="text-sm font-medium">מטלות אישיות</CardTitle>
          </div>
          <AddCustomTask onTaskAdded={fetchTasks} />
        </CardHeader>
        <CardContent className="pb-4">
          <p className="text-sm text-muted-foreground text-center py-2">אין מטלות</p>
        </CardContent>
      </Card>
    );
  }

  const visibleTasks = showAll ? tasks : tasks.slice(0, MAX_VISIBLE);
  const hasMore = tasks.length > MAX_VISIBLE;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="flex items-center gap-2">
          <ListTodo className="h-4 w-4 text-primary" />
          <CardTitle className="text-sm font-medium">מטלות אישיות</CardTitle>
          <span className="text-xs text-muted-foreground">({tasks.length})</span>
        </div>
        <AddCustomTask onTaskAdded={fetchTasks} />
      </CardHeader>
      <CardContent className="pb-3">
        <div className="space-y-1.5">
          {visibleTasks.map(task => (
            <div key={task.id} className="flex items-center gap-2 py-1.5 px-2 rounded hover:bg-muted/50 group">
              <Checkbox className="h-4 w-4" onCheckedChange={() => handleComplete(task.id)} />
              <span className="text-sm flex-1 truncate">{task.title}</span>
              {task.reminderAt && <Bell className="h-3 w-3 text-amber-500 shrink-0" />}
              {task.dueDate && (
                <span className="text-[11px] text-muted-foreground shrink-0">
                  {format(new Date(task.dueDate), "d/M")}
                </span>
              )}
              <button
                onClick={() => handleDelete(task.id)}
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
      </CardContent>
    </Card>
  );
}
