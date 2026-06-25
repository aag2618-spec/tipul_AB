"use client";

// AttentionInbox — מלבן "מה דורש את תשומת ליבך" בדשבורד המקצה (מנהלת/מזכירה).
// מרכז ממבט אחד את התגובות החדשות שדורשות פעולה: חיוויי מטלות-צוות (הערת עובד /
// מטלה שבוצעה) + הודעות צ׳אט שלא נקראו. לחיצה על פריט מטלה נכנסת ישר למטלה
// הספציפית (?task=) ומסמנת אותו כנקרא. מוסתר כשאין מה לטפל בו (alert, לא עוגן).
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Bell,
  CheckCircle2,
  Eye,
  ListChecks,
  MessagesSquare,
} from "lucide-react";
import { formatRelativeDate } from "@/lib/notification-utils";

type InboxItem = {
  id: string;
  type: string;
  title: string;
  content: string;
  taskRef: string | null;
  createdAt: string;
};

export function AttentionInbox() {
  const router = useRouter();
  const [items, setItems] = useState<InboxItem[]>([]);
  const [chatUnread, setChatUnread] = useState(0);
  const [isShabbat, setIsShabbat] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    const fetchAll = async () => {
      // חיוויי מטלות-צוות (אותו endpoint של ה-badge בטאב — מקור אמת יחיד).
      try {
        const res = await fetch("/api/clinic-admin/tasks/inbox", {
          cache: "no-store",
        });
        if (active) {
          if (res.ok) {
            const data = await res.json();
            setItems(Array.isArray(data.items) ? data.items : []);
            setIsShabbat(!!data.isShabbat);
          } else if (res.status === 403) {
            // אין הרשאת מטלות (מזכירה רגילה) — קטע מטלות ריק, צ׳אט עדיין מוצג.
            setItems([]);
          }
        }
      } catch {
        // שקט — polling
      }
      // הודעות צ׳אט שלא נקראו (ספירה מסכמת).
      try {
        const res = await fetch("/api/chat/unread-count", {
          cache: "no-store",
        });
        if (res.ok && active) {
          const data = await res.json();
          setChatUnread(data.unreadCount || 0);
        }
      } catch {
        // שקט — polling
      }
      if (active) setLoaded(true);
    };
    fetchAll();
    const interval = setInterval(fetchAll, 25000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  const openTaskItem = (item: InboxItem) => {
    // סימון נקרא (best-effort) + הסרה אופטימית + ניווט ממוקד למטלה.
    fetch("/api/clinic-admin/tasks/inbox", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notificationId: item.id }),
    }).catch(() => {});
    setItems((prev) => prev.filter((x) => x.id !== item.id));
    router.push(
      item.taskRef
        ? `/clinic-admin/tasks?task=${item.taskRef}`
        : "/clinic-admin/tasks"
    );
  };

  // בשבת/חג — מוסתר (עקבי עם PersonalTasksWidget). יופיע במוצ"ש.
  if (isShabbat) return null;
  // לפני טעינה ראשונה — לא מציגים (מונע הבהוב).
  if (!loaded) return null;
  // אין מה לטפל בו — המלבן הוא התראה, לא עוגן קבוע; נשאר נקי.
  if (items.length === 0 && chatUnread === 0) return null;

  return (
    <Card className="border-primary/30">
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Bell className="h-5 w-5 text-primary" />
          מה דורש את תשומת ליבך
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* קטע מטלות צוות */}
        {items.length > 0 && (
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <ListChecks className="h-3.5 w-3.5" />
              מטלות צוות
            </div>
            {items.map((item) => {
              const isDone = item.type === "STAFF_TASK_DONE";
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => openTaskItem(item)}
                  className="w-full text-right flex items-start gap-2 rounded-md border px-3 py-2 hover:bg-muted/50 transition-colors"
                >
                  {isDone ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                  ) : (
                    <Eye className="h-4 w-4 text-sky-500 shrink-0 mt-0.5" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium truncate">
                        {item.title}
                      </span>
                      <span
                        className={`shrink-0 text-[10px] rounded-full px-1.5 py-0.5 ${
                          isDone
                            ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                            : "bg-sky-100 text-sky-700 dark:bg-sky-900/40 dark:text-sky-300"
                        }`}
                      >
                        {isDone ? "בוצע" : "הערה"}
                      </span>
                    </div>
                    {item.content && (
                      <p className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                        {item.content}
                      </p>
                    )}
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {formatRelativeDate(item.createdAt)}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* קטע צ׳אט — ספירה מסכמת (מי שלח לא זמין מה-endpoint הקיים) */}
        {chatUnread > 0 && (
          <button
            type="button"
            onClick={() => router.push("/clinic-admin/team-chat")}
            className="w-full text-right flex items-center gap-2 rounded-md border px-3 py-2 hover:bg-muted/50 transition-colors"
          >
            <MessagesSquare className="h-4 w-4 text-primary shrink-0" />
            <span className="text-sm flex-1">הודעות חדשות בצ׳אט הצוות</span>
            <span className="shrink-0 inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs font-medium text-primary-foreground">
              {chatUnread}
            </span>
          </button>
        )}
      </CardContent>
    </Card>
  );
}
