"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Trash2, CheckCircle } from "lucide-react";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { toast } from "sonner";
import Link from "next/link";

interface Task {
  id: string;
  type: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  dueDate: Date | null;
  relatedEntityId: string | null;
  relatedEntity: string | null;
}

interface TaskListProps {
  initialTasks: Task[];
}

export function TaskList({ initialTasks }: TaskListProps) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);

  const getTypeLabel = (type: string) => {
    switch (type) {
      case "WRITE_SUMMARY": return "כתיבת סיכום";
      case "COLLECT_PAYMENT": return "גביית תשלום";
      case "SIGN_DOCUMENT": return "חתימת מסמך";
      case "SCHEDULE_SESSION": return "קביעת פגישה";
      case "REVIEW_TRANSCRIPTION": return "סקירת תמלול";
      case "FOLLOW_UP": return "מעקב";
      case "CUSTOM": return "משימה אישית";
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

  const getTaskLink = (task: Task): string | null => {
    // Return the appropriate link based on task type and related entity
    if (task.type === "WRITE_SUMMARY" && task.relatedEntityId && task.relatedEntity === "session") {
      return `/dashboard/sessions/${task.relatedEntityId}`;
    }
    if (task.type === "COLLECT_PAYMENT" && task.relatedEntityId) {
      return `/dashboard/payments?highlight=${task.relatedEntityId}`;
    }
    if (task.type === "SIGN_DOCUMENT" && task.relatedEntityId) {
      return `/dashboard/documents/${task.relatedEntityId}`;
    }
    if (task.type === "SCHEDULE_SESSION" && task.relatedEntityId) {
      return `/dashboard/calendar?client=${task.relatedEntityId}`;
    }
    if (task.type === "REVIEW_TRANSCRIPTION" && task.relatedEntityId) {
      return `/dashboard/recordings/${task.relatedEntityId}`;
    }
    return null;
  };

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

  if (tasks.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground mt-4">
        <CheckCircle className="mx-auto h-12 w-12 mb-3 text-green-500 opacity-50" />
        <p>כל המשימות הושלמו! 🎉</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 mt-4">
      {tasks.map((task) => {
        const taskLink = getTaskLink(task);
        
        const TaskContent = (
          <>
            <div className="flex items-center gap-2">
              <span className="font-medium">{task.title}</span>
              {getPriorityBadge(task.priority)}
            </div>
            <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
              <Badge variant="outline">{getTypeLabel(task.type)}</Badge>
              {task.dueDate && (
                <span className={new Date(task.dueDate) < new Date() ? "text-destructive" : ""}>
                  עד {format(new Date(task.dueDate), "d בMMMM", { locale: he })}
                </span>
              )}
            </div>
            {task.description && (
              <p className="mt-2 text-sm text-muted-foreground">
                {task.description}
              </p>
            )}
          </>
        );
        
        return (
          <div
            key={task.id}
            className={`flex items-start gap-4 p-4 rounded-lg ${
              task.priority === "URGENT"
                ? "bg-destructive/10 border border-destructive/20"
                : task.priority === "HIGH"
                ? "bg-amber-50 border border-amber-200"
                : "bg-muted/50"
            }`}
          >
            <Checkbox 
              className="mt-1" 
              onCheckedChange={() => handleComplete(task.id)}
            />
            {taskLink ? (
              <Link 
                href={taskLink}
                className="flex-1 hover:opacity-80 transition-opacity cursor-pointer"
              >
                {TaskContent}
              </Link>
            ) : (
              <div className="flex-1">
                {TaskContent}
              </div>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"
              onClick={() => handleDelete(task.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        );
      })}
    </div>
  );
}
