"use client";

// שרשור הערות (דו-שיח) על מטלת צוות — משותף לצד העובד (דיאלוג "פרטי מטלה")
// ולצד המנהלת (לוח /clinic-admin/tasks). דפוס הבועות בהשראת message-thread של
// הצ'אט, אך גרסה מצומצמת ו-scope אחר (לא קשור ל-conversations של הצ'אט).
// isMine מגיע מה-API (מחושב בשרת) — אין צורך ב-session בצד הלקוח.

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Send, MessageCircle } from "lucide-react";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { toast } from "sonner";

const MAX_COMMENT_LENGTH = 2000;

interface TaskComment {
  id: string;
  body: string;
  createdAt: string;
  authorId: string | null;
  authorName: string | null;
  isMine: boolean;
}

interface TaskCommentsThreadProps {
  taskId: string;
  /** האם להציג תיבת כתיבה. שני הצדדים (עובד + מקצה) רשאים — ראה canAccessTaskThread בשרת. */
  canPost?: boolean;
  /** נקרא אחרי הוספת הערה מוצלחת — לרענון מונה ההערות בלוח המנהל. */
  onPosted?: () => void;
  className?: string;
}

export function TaskCommentsThread({
  taskId,
  canPost = false,
  onPosted,
  className,
}: TaskCommentsThreadProps) {
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const fetchComments = useCallback(async () => {
    try {
      const res = await fetch(`/api/tasks/${taskId}/comments`, {
        cache: "no-store",
      });
      if (res.ok) {
        const data = await res.json();
        setComments(Array.isArray(data) ? data : []);
        setLoadError(false);
      } else {
        // חשוב: לא להשאיר מסך ריק שנראה כמו "אין הערות" כשבעצם הטעינה נכשלה.
        setLoadError(true);
      }
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    setLoading(true);
    fetchComments();
  }, [fetchComments]);

  // גלילה לתחתית כשמתווספות הערות.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [comments.length]);

  const handleSend = async () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/tasks/${taskId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: trimmed }),
      });
      if (res.ok) {
        const created = (await res.json()) as TaskComment;
        setComments((prev) => [...prev, created]);
        setText("");
        onPosted?.();
      } else {
        const err = await res.json().catch(() => null);
        toast.error(err?.message || "שגיאה בשליחת ההערה");
      }
    } catch {
      toast.error("שגיאה בשליחת ההערה");
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className={className}>
      <div className="flex items-center gap-1.5 mb-2 text-xs font-medium text-muted-foreground">
        <MessageCircle className="h-3.5 w-3.5" />
        הערות והתכתבות
      </div>

      <div className="max-h-56 overflow-y-auto space-y-2 rounded-lg bg-muted/20 p-2">
        {loading && comments.length === 0 ? (
          <div className="flex justify-center py-3">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : loadError && comments.length === 0 ? (
          <p className="text-xs text-destructive text-center py-3">
            שגיאה בטעינת ההערות. אפשר לסגור ולפתוח שוב.
          </p>
        ) : comments.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-3">
            אין הערות עדיין. אפשר לכתוב הערה או שאלה.
          </p>
        ) : (
          comments.map((c) => (
            <div
              key={c.id}
              className={`flex ${c.isMine ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-3 py-1.5 ${
                  c.isMine
                    ? "bg-primary text-primary-foreground rounded-tr-sm"
                    : "bg-background border rounded-tl-sm"
                }`}
              >
                {!c.isMine && (
                  <p className="text-[11px] font-semibold text-primary mb-0.5">
                    {c.authorName || "משתמש"}
                  </p>
                )}
                <p className="text-sm whitespace-pre-wrap break-words">{c.body}</p>
                <p
                  className={`text-[10px] mt-0.5 ${
                    c.isMine
                      ? "text-primary-foreground/70"
                      : "text-muted-foreground"
                  }`}
                >
                  {format(new Date(c.createdAt), "d/M HH:mm", { locale: he })}
                </p>
              </div>
            </div>
          ))
        )}
        <div ref={endRef} />
      </div>

      {canPost && (
        <div className="flex items-end gap-2 mt-2">
          <Textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            maxLength={MAX_COMMENT_LENGTH}
            placeholder="כתוב/כתבי הערה…"
            className="min-h-[40px] max-h-24 resize-none text-sm"
            rows={1}
          />
          <Button
            size="icon"
            onClick={handleSend}
            disabled={!text.trim() || sending}
            aria-label="שלח הערה"
            className="shrink-0"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      )}
    </div>
  );
}
