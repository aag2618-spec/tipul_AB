"use client";

import { useEffect, useState, useCallback } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ListTodo, Bell, Loader2, History, CheckCircle, Clock, Trash2 } from "lucide-react";
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

export function PersonalTasksWidget() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [completedTasks, setCompletedTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showHistory, setShowHistory] = useState(false);

  const fetchTasks = useCallback(async () => {
    try {
      // Fetch pending custom tasks
      const response = await fetch("/api/tasks?status=PENDING");
      if (response.ok) {
        const data = await response.json();
        // Filter only CUSTOM tasks and limit to 5
        const customTasks = data
          .filter((t: Task) => t.type === "CUSTOM")
          .slice(0, 5);
        setTasks(customTasks);
      }
      
      // Fetch completed custom tasks (last 30 days)
      const completedResponse = await fetch("/api/tasks?status=COMPLETED&type=CUSTOM");
      if (completedResponse.ok) {
        const completedData = await completedResponse.json();
        // Filter to only CUSTOM tasks completed in last 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const recentCompleted = completedData
          .filter((t: Task) => t.type === "CUSTOM" && new Date(t.updatedAt || t.createdAt) >= thirtyDaysAgo)
          .slice(0, 20);
        setCompletedTasks(recentCompleted);
      }
    } catch (error) {
      console.error("Failed to fetch tasks:", error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  // Request notification permission on mount
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }
  }, []);

  // Check for reminders every minute
  useEffect(() => {
    const checkReminders = () => {
      const now = new Date();
      const notifiedKey = "notified_reminders";
      const notified = JSON.parse(localStorage.getItem(notifiedKey) || "[]");

      tasks.forEach((task) => {
        if (task.reminderAt && !notified.includes(task.id)) {
          const reminderTime = new Date(task.reminderAt);
          // Check if reminder time has passed (within last 5 minutes)
          const timeDiff = now.getTime() - reminderTime.getTime();
          if (timeDiff >= 0 && timeDiff < 5 * 60 * 1000) {
            // Show browser notification
            if ("Notification" in window && Notification.permission === "granted") {
              new Notification("תזכורת: " + task.title, {
                body: task.description || "יש לך משימה לביצוע",
                icon: "/favicon.ico",
              });
            }
            // Mark as notified
            localStorage.setItem(
              notifiedKey,
              JSON.stringify([...notified, task.id])
            );
            toast.info(`תזכורת: ${task.title}`);
          }
        }
      });
    };

    const interval = setInterval(checkReminders, 60000); // Check every minute
    checkReminders(); // Check immediately

    return () => clearInterval(interval);
  }, [tasks]);

  const handleComplete = async (taskId: string) => {
    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "COMPLETED" }),
      });

      if (response.ok) {
        setTasks((prev) => prev.filter((t) => t.id !== taskId));
        toast.success("המשימה הושלמה");
      }
    } catch {
      toast.error("שגיאה בעדכון המשימה");
    }
  };

  const handleDelete = async (taskId: string) => {
    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        setTasks((prev) => prev.filter((t) => t.id !== taskId));
        toast.success("המשימה נמחקה");
      }
    } catch {
      toast.error("שגיאה במחיקת המשימה");
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "URGENT":
        return "destructive";
      case "HIGH":
        return "default";
      case "MEDIUM":
        return "secondary";
      default:
        return "outline";
    }
  };

  const getPriorityLabel = (priority: string) => {
    switch (priority) {
      case "URGENT":
        return "דחוף";
      case "HIGH":
        return "גבוה";
      case "MEDIUM":
        return "בינוני";
      default:
        return "נמוך";
    }
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <ListTodo className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-lg">מטלות אישיות</CardTitle>
            <CardDescription>
              {tasks.length > 0
                ? `${tasks.length} מטלות ממתינות`
                : "אין מטלות ממתינות"}
            </CardDescription>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant={showHistory ? "secondary" : "outline"} 
            size="sm"
            onClick={() => setShowHistory(!showHistory)}
            className="gap-1"
          >
            <History className="h-4 w-4" />
            היסטוריה
          </Button>
          <AddCustomTask onTaskAdded={fetchTasks} />
        </div>
      </CardHeader>

      <CardContent>
        {/* History Section */}
        {showHistory && (
          <div className="mb-4 p-3 rounded-lg bg-green-50/50 border border-green-200/50">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="h-4 w-4 text-green-500" />
              <span className="text-sm font-medium">היסטוריה (30 יום אחרונים)</span>
            </div>
            {completedTasks.length > 0 ? (
              <div className="space-y-1 max-h-[200px] overflow-y-auto">
                {completedTasks.map((task) => (
                  <div
                    key={task.id}
                    className="flex items-center justify-between gap-2 py-1 text-sm"
                  >
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-3 w-3 text-green-500 shrink-0" />
                      <span className="text-muted-foreground line-through">{task.title}</span>
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {format(new Date(task.updatedAt || task.createdAt), "d/M/yy")}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-3 text-muted-foreground text-sm">
                <Clock className="mx-auto h-6 w-6 mb-1 opacity-30" />
                <p>מטלות אישיות שתשלים יופיעו כאן</p>
              </div>
            )}
          </div>
        )}

        {/* Pending Tasks */}
        {tasks.length > 0 ? (
          <div className="space-y-3">
            {tasks.map((task) => (
              <div
                key={task.id}
                className="flex items-start gap-3 p-3 rounded-lg bg-muted/50 hover:bg-muted/70 transition-colors"
              >
                <Checkbox
                  className="mt-1"
                  onCheckedChange={() => handleComplete(task.id)}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{task.title}</span>
                    <Badge variant={getPriorityColor(task.priority) as "destructive" | "default" | "secondary" | "outline"}>
                      {getPriorityLabel(task.priority)}
                    </Badge>
                    {task.reminderAt && (
                      <Badge variant="outline" className="text-amber-600 border-amber-200 bg-amber-50">
                        <Bell className="h-3 w-3 ml-1" />
                        {format(new Date(task.reminderAt), "d/M HH:mm")}
                      </Badge>
                    )}
                  </div>
                  {task.description && (
                    <p className="text-sm text-muted-foreground mt-1 truncate">
                      {task.description}
                    </p>
                  )}
                  {task.dueDate && (
                    <p className="text-xs text-muted-foreground mt-1">
                      יעד: {format(new Date(task.dueDate), "EEEE, d בMMMM", { locale: he })}
                    </p>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                  onClick={() => handleDelete(task.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-6 text-muted-foreground">
            <ListTodo className="mx-auto h-10 w-10 mb-2 opacity-50" />
            <p>אין מטלות אישיות</p>
            <p className="text-sm">הוסף מטלה חדשה כדי לעקוב אחריה</p>
          </div>
        )}

        {tasks.length > 0 && (
          <Button variant="link" className="w-full mt-2" asChild>
            <a href="/dashboard/tasks">צפה בכל המשימות</a>
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
