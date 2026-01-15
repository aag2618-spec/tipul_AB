"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { ListTodo, Clock, AlertTriangle, CheckCircle, History, Loader2, ExternalLink } from "lucide-react";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { toast } from "sonner";

interface Task {
  id: string;
  type: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: string | null;
  relatedEntityId: string | null;
  relatedEntity: string | null;
  createdAt: string;
  updatedAt: string;
}

type FilterType = "all" | "urgent" | "overdue" | "completed";

export default function TasksPage() {
  const router = useRouter();
  const [pendingTasks, setPendingTasks] = useState<Task[]>([]);
  const [completedTasks, setCompletedTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [filter, setFilter] = useState<FilterType>("all");

  useEffect(() => {
    fetchTasks();
  }, []);

  const fetchTasks = async () => {
    try {
      const [pendingRes, completedRes] = await Promise.all([
        fetch("/api/tasks?status=PENDING"),
        fetch("/api/tasks?status=COMPLETED"),
      ]);

      if (pendingRes.ok) {
        const data = await pendingRes.json();
        const now = new Date();
        const filtered = data.filter((t: Task) => 
          t.type !== "WRITE_SUMMARY" || (t.dueDate && new Date(t.dueDate) <= now)
        );
        setPendingTasks(filtered);
      }

      if (completedRes.ok) {
        const data = await completedRes.json();
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const recent = data.filter((t: Task) => new Date(t.updatedAt) >= thirtyDaysAgo).slice(0, 20);
        setCompletedTasks(recent);
      }
    } catch (error) {
      console.error("Failed to fetch tasks:", error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleComplete = async (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const response = await fetch(`/api/tasks/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "COMPLETED" }),
      });

      if (response.ok) {
        const task = pendingTasks.find(t => t.id === taskId);
        if (task) {
          setPendingTasks(prev => prev.filter(t => t.id !== taskId));
          setCompletedTasks(prev => [{ ...task, status: "COMPLETED", updatedAt: new Date().toISOString() }, ...prev]);
        }
        toast.success("המשימה הושלמה");
      }
    } catch {
      toast.error("שגיאה בעדכון המשימה");
    }
  };

  const getTaskUrl = (task: Task): string | null => {
    switch (task.type) {
      case "WRITE_SUMMARY":
        if (task.relatedEntityId && task.relatedEntity === "session") {
          return `/dashboard/sessions/${task.relatedEntityId}`;
        }
        break;
      case "COLLECT_PAYMENT":
        if (task.relatedEntityId && task.relatedEntity === "client") {
          return `/dashboard/clients/${task.relatedEntityId}?tab=payments`;
        }
        return "/dashboard/payments";
      case "SCHEDULE_SESSION":
        if (task.relatedEntityId && task.relatedEntity === "client") {
          return `/dashboard/clients/${task.relatedEntityId}`;
        }
        return "/dashboard/calendar";
      case "SIGN_DOCUMENT":
        return "/dashboard/documents";
      case "REVIEW_TRANSCRIPTION":
        return "/dashboard/recordings";
      case "FOLLOW_UP":
        if (task.relatedEntityId && task.relatedEntity === "client") {
          return `/dashboard/clients/${task.relatedEntityId}`;
        }
        break;
    }
    return null;
  };

  const handleTaskClick = (task: Task) => {
    const url = getTaskUrl(task);
    if (url) {
      router.push(url);
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case "WRITE_SUMMARY": return "כתיבת סיכום";
      case "COLLECT_PAYMENT": return "גביית תשלום";
      case "SIGN_DOCUMENT": return "חתימת מסמך";
      case "SCHEDULE_SESSION": return "קביעת פגישה";
      case "REVIEW_TRANSCRIPTION": return "סקירת תמלול";
      case "FOLLOW_UP": return "מעקב";
      default: return "משימה";
    }
  };

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case "URGENT":
        return <Badge variant="destructive">דחוף</Badge>;
      case "HIGH":
        return <Badge className="bg-amber-500">גבוה</Badge>;
      case "MEDIUM":
        return <Badge variant="secondary">רגיל</Badge>;
      default:
        return <Badge variant="outline">נמוך</Badge>;
    }
  };

  // Calculate stats
  const urgentCount = pendingTasks.filter(t => t.priority === "URGENT" || t.priority === "HIGH").length;
  const overdueCount = pendingTasks.filter(t => t.dueDate && new Date(t.dueDate) < new Date()).length;

  // Filter tasks based on selected filter
  const getFilteredTasks = () => {
    switch (filter) {
      case "urgent":
        return pendingTasks.filter(t => t.priority === "URGENT" || t.priority === "HIGH");
      case "overdue":
        return pendingTasks.filter(t => t.dueDate && new Date(t.dueDate) < new Date());
      case "completed":
        return completedTasks;
      default:
        return pendingTasks;
    }
  };

  const filteredTasks = getFilteredTasks();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">משימות</h1>
          <p className="text-muted-foreground">
            {pendingTasks.length} משימות ממתינות לטיפול
          </p>
        </div>
        {/* סטטיסטיקות לחיצות */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card 
            className={`cursor-pointer transition-all hover:shadow-md ${filter === "all" ? "ring-2 ring-primary" : ""}`}
            onClick={() => setFilter("all")}
          >
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                  <ListTodo className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{pendingTasks.length}</p>
                  <p className="text-sm text-muted-foreground">ממתינות</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card 
            className={`cursor-pointer transition-all hover:shadow-md ${filter === "urgent" ? "ring-2 ring-amber-500" : ""}`}
            onClick={() => setFilter("urgent")}
          >
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100">
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{pendingTasks.filter((t) => t.priority === "URGENT" || t.priority === "HIGH").length}</p>
                  <p className="text-sm text-muted-foreground">דחxxxx</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card 
            className={`cursor-pointer transition-all hover:shadow-md ${filter === "overdue" ? "ring-2 ring-blue-500" : ""}`}
            onClick={() => setFilter("overdue")}
          >
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
                  <Clock className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{pendingTasks.filter((t) => t.dueDate && new Date(t.dueDate) < new Date()).length}</p>
                  <p className="text-sm text-muted-foreground">באיחור</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card 
            className={`cursor-pointer transition-all hover:shadow-md ${filter === "completed" ? "ring-2 ring-green-500" : ""}`}
            onClick={() => setFilter("completed")}
          >
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{completedTasks.length}</p>
                  <p className="text-sm text-muted-foreground">הושלמו</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
              <div>
                <p className="text-2xl font-bold">{completedTasks.length}</p>
                <p className="text-sm text-muted-foreground">הושלמו</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* רשימת משימות מסוננת */}
      <Card>
        <CardHeader>
          <CardTitle>
            {filter === "all" && "משימות פתוחות"}
            {filter === "urgent" && "משימות דחxxxx"}
            {filter === "overdue" && "משימות באיחור"}
            {filter === "completed" && "משימות שהושלמו"}
          </CardTitle>
          <CardDescription>
            {filter === "completed" 
              ? "משימות שהושלמו ב-30 יום אחרונים"
              : "לחץ על משימה כדי לעבור לביצועה"
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          {filteredTasks.length > 0 ? (
            <div className="space-y-3">
              {filteredTasks.map((task) => {
                const taskUrl = getTaskUrl(task);
                const isClickable = !!taskUrl && filter !== "completed";
                
                return (
                  <div
                    key={task.id}
                    onClick={() => isClickable && handleTaskClick(task)}
                    className={`flex items-start gap-4 p-4 rounded-lg transition-all ${
                      filter === "completed"
                        ? "bg-green-50/50"
                        : task.priority === "URGENT"
                        ? "bg-destructive/10 border border-destructive/20"
                        : task.priority === "HIGH"
                        ? "bg-amber-50 border border-amber-200"
                        : "bg-muted/50"
                    } ${isClickable ? "cursor-pointer hover:shadow-md hover:scale-[1.01]" : ""}`}
                  >
                    {filter !== "completed" ? (
                      <Checkbox 
                        className="mt-1" 
                        onClick={(e) => handleComplete(task.id, e)}
                      />
                    ) : (
                      <CheckCircle className="h-5 w-5 text-green-500 mt-1 shrink-0" />
                    )}
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className={`font-medium ${filter === "completed" ? "line-through text-muted-foreground" : ""}`}>
                          {task.title}
                        </p>
                        {filter !== "completed" && getPriorityBadge(task.priority)}
                        {isClickable && (
                          <ExternalLink className="h-4 w-4 text-muted-foreground" />
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                        <Badge variant="outline">{getTypeLabel(task.type)}</Badge>
                        {task.dueDate && filter !== "completed" && (
                          <span className={new Date(task.dueDate) < new Date() ? "text-destructive" : ""}>
                            עד {format(new Date(task.dueDate), "d בMMMM", { locale: he })}
                          </span>
                        )}
                        {filter === "completed" && (
                          <span>הושלם {format(new Date(task.updatedAt), "d/M/yy")}</span>
                        )}
                      </div>
                      {task.description && filter !== "completed" && (
                        <p className="mt-2 text-sm text-muted-foreground">
                          {task.description}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground">
              {filter === "completed" ? (
                <>
                  <Clock className="mx-auto h-12 w-12 mb-3 opacity-30" />
                  <p>אין משימות שהושלמו ב-30 יום אחרונים</p>
                </>
              ) : filter === "urgent" ? (
                <>
                  <CheckCircle className="mx-auto h-12 w-12 mb-3 text-green-500 opacity-50" />
                  <p>אין משימות דחxxxx!</p>
                </>
              ) : filter === "overdue" ? (
                <>
                  <CheckCircle className="mx-auto h-12 w-12 mb-3 text-green-500 opacity-50" />
                  <p>אין משימות באיחור! 🎉</p>
                </>
              ) : (
                <>
                  <CheckCircle className="mx-auto h-12 w-12 mb-3 text-green-500 opacity-50" />
                  <p>כל המשימות הושלמו! 🎉</p>
                </>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* History Section - Always visible */}
      <Card className="border-green-200/50" id="history">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-green-500" />
            משימות והיסטוריה
          </CardTitle>
          <CardDescription>
            {completedTasks.length > 0 
              ? `${completedTasks.length} משימות הושלמו ב-30 יום אחרונים`
              : "אין משימות שהושלמו ב-30 יום אחרונים"
            }
          </CardDescription>
        </CardHeader>
        <CardContent>
          {completedTasks.length > 0 ? (
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {completedTasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center justify-between gap-4 p-2 rounded-lg bg-green-50/50 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                    <span className="text-muted-foreground line-through">{task.title}</span>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {format(new Date(task.updatedAt), "d/M/yy")}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 text-muted-foreground">
              <Clock className="mx-auto h-8 w-8 mb-2 opacity-30" />
              <p className="text-sm">משימות שתשלים יופיעו כאן</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}













