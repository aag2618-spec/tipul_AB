"use client";

import { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Search, FileText, X, ChevronDown, ChevronUp, ListTodo, Trash2 } from "lucide-react";
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
  createdAt: Date;
}

interface TasksViewProps {
  initialTasks: Task[];
}

function extractClientName(title: string): string {
  const match = title.match(/עם\s+(.+?)$/);
  return match ? match[1] : title;
}

function getTaskLink(task: Task): string {
  if (task.type === "WRITE_SUMMARY" && task.relatedEntityId) {
    return `/dashboard/sessions/${task.relatedEntityId}`;
  }
  if (task.type === "COLLECT_PAYMENT" && task.relatedEntityId) {
    return `/dashboard/payments?highlight=${task.relatedEntityId}`;
  }
  return `/dashboard/sessions`;
}

function getTimeGroup(date: Date | null): string {
  if (!date) return "ללא תאריך";
  const now = new Date();
  const diffMs = now.getTime() - new Date(date).getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays <= 7) return "שבוע אחרון";
  if (diffDays <= 30) return "חודש אחרון";
  if (diffDays <= 60) return "חודש נוסף";
  return "ישנים";
}

const GROUP_ORDER = ["שבוע אחרון", "חודש אחרון", "חודש נוסף", "ישנים", "ללא תאריך"];

export function TasksView({ initialTasks }: TasksViewProps) {
  const [tasks, setTasks] = useState<Task[]>(initialTasks);
  const [dismissingIds, setDismissingIds] = useState<Set<string>>(new Set());
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    "שבוע אחרון": true,
    "חודש אחרון": true,
    "חודש נוסף": false,
    "ישנים": false,
    "ללא תאריך": false,
  });

  const filteredTasks = useMemo(() => {
    let result = tasks.filter(t => !dismissingIds.has(t.id));
    if (searchTerm.trim()) {
      const term = searchTerm.trim().toLowerCase();
      result = result.filter(t => t.title.toLowerCase().includes(term));
    }
    return result;
  }, [tasks, searchTerm, dismissingIds]);

  const groupedTasks = useMemo(() => {
    const groups: Record<string, Task[]> = {};
    for (const task of filteredTasks) {
      const group = getTimeGroup(task.dueDate);
      if (!groups[group]) groups[group] = [];
      groups[group].push(task);
    }
    return groups;
  }, [filteredTasks]);

  const toggleGroup = (group: string) => {
    setExpandedGroups(prev => ({ ...prev, [group]: !prev[group] }));
  };

  const handleDismiss = async (taskId: string) => {
    setDismissingIds(prev => new Set(prev).add(taskId));
    try {
      // taskId is actually a session ID (virtual tasks created from sessions)
      const res = await fetch(`/api/sessions/${taskId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skipSummary: true }),
      });
      if (res.ok) {
        setTasks(prev => prev.filter(t => t.id !== taskId));
        toast.success("הוסר בהצלחה");
      } else {
        setDismissingIds(prev => { const n = new Set(prev); n.delete(taskId); return n; });
        toast.error("שגיאה במחיקה");
      }
    } catch {
      setDismissingIds(prev => { const n = new Set(prev); n.delete(taskId); return n; });
      toast.error("שגיאה");
    }
  };

  const pendingCount = filteredTasks.length;

  return (
    <div className="space-y-4 animate-fade-in">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold tracking-tight">משימות</h1>
          <Badge variant="secondary" className="text-base px-3 py-1">
            {pendingCount} ממתינים
          </Badge>
        </div>
        <div className="relative w-full sm:w-72">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="חפש לפי שם מטופל..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pr-10"
          />
          {searchTerm && (
            <button onClick={() => setSearchTerm("")} className="absolute left-3 top-1/2 -translate-y-1/2">
              <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
            </button>
          )}
        </div>
      </div>

      {/* Grouped Tasks */}
      {filteredTasks.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <ListTodo className="mx-auto h-10 w-10 mb-3 opacity-30" />
          <p>{searchTerm ? "לא נמצאו תוצאות" : "אין משימות ממתינות"}</p>
        </div>
      ) : (
        GROUP_ORDER.map(groupName => {
          const groupTasks = groupedTasks[groupName];
          if (!groupTasks || groupTasks.length === 0) return null;
          const isExpanded = expandedGroups[groupName] ?? false;

          return (
            <div key={groupName}>
              <button
                onClick={() => toggleGroup(groupName)}
                className="flex items-center gap-2 w-full text-right py-2 px-1 hover:bg-accent/30 rounded-lg transition-colors"
              >
                {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                <span className="font-semibold text-sm">{groupName}</span>
                <Badge variant="outline" className="text-xs">{groupTasks.length}</Badge>
              </button>

              {isExpanded && (
                <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 mt-2">
                  {groupTasks.map(task => {
                    const clientName = extractClientName(task.title);
                    const link = getTaskLink(task);
                    const dateStr = task.dueDate
                      ? format(new Date(task.dueDate), "EEEE d/M", { locale: he })
                      : "";

                    return (
                      <div
                        key={task.id}
                        className="border rounded-xl p-4 bg-card hover:shadow-md transition-all flex flex-col justify-between min-h-[120px] group"
                      >
                        <div>
                          <p className="font-bold text-base truncate">{clientName}</p>
                          {dateStr && (
                            <p className="text-sm text-muted-foreground mt-0.5">{dateStr}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-3">
                          <Button
                            size="sm"
                            className="flex-1 gap-1.5 bg-primary/10 text-primary border border-primary/20 hover:bg-primary/15 shadow-none"
                            asChild
                          >
                            <Link href={link}>
                              <FileText className="h-3.5 w-3.5" />
                              כתוב סיכום
                            </Link>
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="px-2 text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 opacity-0 group-hover:opacity-100 transition-opacity"
                            onClick={(e) => { e.stopPropagation(); e.preventDefault(); handleDismiss(task.id); }}
                            title="הסר מהרשימה"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })
      )}
    </div>
  );
}
