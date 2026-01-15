import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ListTodo, Clock, AlertTriangle, CheckCircle } from "lucide-react";
import { format } from "date-fns";
import { he } from "date-fns/locale";

async function getTasks(userId: string) {
  const now = new Date();
  return prisma.task.findMany({
    where: {
      userId,
      status: { in: ["PENDING", "IN_PROGRESS"] },
      // Only show WRITE_SUMMARY tasks for sessions that already happened
      OR: [
        { type: { not: "WRITE_SUMMARY" } },
        { type: "WRITE_SUMMARY", dueDate: { lte: now } },
      ],
    },
    orderBy: [
      { priority: "desc" },
      { dueDate: "asc" },
      { createdAt: "desc" },
    ],
  });
}

async function getCompletedTasks(userId: string) {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
  
  return prisma.task.findMany({
    where: {
      userId,
      status: "COMPLETED",
      updatedAt: { gte: thirtyDaysAgo },
    },
    orderBy: { updatedAt: "desc" },
    take: 20,
  });
}

export default async function TasksPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;

  const [pendingTasks, completedTasks] = await Promise.all([
    getTasks(session.user.id),
    getCompletedTasks(session.user.id),
  ]);

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

  return (
    <div className="space-y-6 animate-fade-in">
      {/* סטטיסטיקות משימות */}
      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-lg border bg-card text-card-foreground shadow-sm">
          <div className="p-6 pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <ListTodo className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{pendingTasks.length}</p>
                <p className="text-sm text-muted-foreground">ממתינות</p>
              </div>
            </div>
          </div>
        </div>
        <div className="rounded-lg border bg-card text-card-foreground shadow-sm">
          <div className="p-6 pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-100">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {pendingTasks.filter((t) => t.priority === "URGENT" || t.priority === "HIGH").length}
                </p>
                <p className="text-sm text-muted-foreground">דחוף</p>
              </div>
            </div>
          </div>
        </div>
        <div className="rounded-lg border bg-card text-card-foreground shadow-sm">
          <div className="p-6 pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-100">
                <Clock className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {pendingTasks.filter((t) => t.dueDate && new Date(t.dueDate) < new Date()).length}
                </p>
                <p className="text-sm text-muted-foreground">באיחור</p>
              </div>
            </div>
          </div>
        </div>
        <div className="rounded-lg border bg-card text-card-foreground shadow-sm">
          <div className="p-6 pt-6">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-green-100">
                <CheckCircle className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-2xl font-bold">{completedTasks.length}</p>
                <p className="text-sm text-muted-foreground">הושלמו</p>
              </div>
            </div>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">משימות</h1>
          <p className="text-muted-foreground">
            {pendingTasks.length} משימות ממתינות לטיפול
          </p>
        </div>
      </div>
      {/* משימות פתוחות */}
      <div className="rounded-lg border bg-card text-card-foreground shadow-sm">
        <div className="p-6">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">משימות פתוחות</h2>
            <p className="text-sm text-muted-foreground">משימות שממתינות לטיפול</p>
          </div>
          {pendingTasks.length > 0 ? (
            <div className="space-y-3 mt-4">
              {pendingTasks.map((task) => (
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
                  <Checkbox className="mt-1" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{task.title}</p>
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
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-muted-foreground mt-4">
              <CheckCircle className="mx-auto h-12 w-12 mb-3 text-green-500 opacity-50" />
              <p>כל המשימות הושלמו! 🎉</p>
            </div>
          )}
        </div>
      </div>

      {/* History Section - Always visible */}
      <div className="rounded-lg border border-green-200/50 bg-card text-card-foreground shadow-sm" id="history">
        <div className="p-6 pb-2">
          <div className="text-base font-semibold flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-green-500" />
            משימות והיסטוריה
          </div>
          <p className="text-sm text-muted-foreground">
            {completedTasks.length > 0 
              ? `${completedTasks.length} משימות הושלמו ב-30 יום אחרונים`
              : "אין משימות שהושלמו ב-30 יום אחרונים"}
          </p>
        </div>
        <div className="p-6 pt-0">
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
        </div>
      </div>
    </div>
  );
}
























