"use client";

// עמוד שיחה ציבורי למתעניין מדף הנחיתה (ללא התחברות) — נפתח דרך הקישור האישי
// שבמייל. מציג את השרשור ומאפשר להשיב; התגובה נכנסת לפנייה במערכת.
import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Send, MessageCircle, AlertCircle, CheckCircle, Shield } from "lucide-react";

interface Reply {
  id: string;
  message: string;
  isAdmin: boolean;
  createdAt: string;
}

interface Conversation {
  ticketNumber: number;
  name: string | null;
  status: string;
  closed: boolean;
  responses: Reply[];
}

const STATUS_LABEL: Record<string, string> = {
  OPEN: "פתוחה",
  IN_PROGRESS: "בטיפול",
  WAITING: "ממתינה לתשובתך",
  RESOLVED: "טופלה",
  CLOSED: "סגורה",
};

export default function PublicSupportConversationPage() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [conv, setConv] = useState<Conversation | null>(null);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/support/t/${token}`);
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        setError(body.message || "השיחה לא נמצאה");
        return;
      }
      const data = await res.json();
      setConv(data.conversation);
      setError(null);
    } catch {
      setError("שגיאה בטעינת השיחה");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSend = async () => {
    if (!reply.trim() || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/support/t/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: reply.trim() }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message || "שגיאה בשליחת התגובה");
      }
      setReply("");
      setSent(true);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה בשליחת התגובה");
    } finally {
      setSending(false);
    }
  };

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-b from-emerald-50/60 to-background px-4 py-10">
      <div className="mx-auto w-full max-w-2xl space-y-6">
        {/* כותרת מותג */}
        <div className="text-center">
          <h1 className="text-2xl font-bold text-emerald-600">MyTipul</h1>
          <p className="text-sm text-muted-foreground mt-1">השיחה שלך עם הצוות</p>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : error && !conv ? (
          <Card>
            <CardContent className="py-12 text-center space-y-2">
              <AlertCircle className="h-10 w-10 mx-auto text-muted-foreground opacity-60" />
              <p className="font-medium">{error}</p>
              <p className="text-sm text-muted-foreground">
                ייתכן שהקישור פג או שגוי. אפשר ליצור קשר מחדש דרך האתר.
              </p>
            </CardContent>
          </Card>
        ) : conv ? (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between gap-2">
                <CardTitle className="text-lg">הפנייה שלך</CardTitle>
                <Badge variant="outline" className="shrink-0">
                  {STATUS_LABEL[conv.status] || conv.status}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* שרשור התגובות */}
              {conv.responses.map((r) => (
                <div
                  key={r.id}
                  className={`rounded-lg p-3 ${
                    r.isAdmin
                      ? "border border-emerald-200 bg-emerald-50/70"
                      : "bg-muted"
                  }`}
                >
                  <div className="mb-1 flex items-center gap-1 text-xs font-medium text-muted-foreground">
                    {r.isAdmin ? (
                      <>
                        <Shield className="h-3 w-3 text-emerald-600" />
                        צוות MyTipul
                      </>
                    ) : (
                      conv.name ? `${conv.name} (את/ה)` : "את/ה"
                    )}
                    <span className="mr-auto font-normal">
                      {new Date(r.createdAt).toLocaleString("he-IL")}
                    </span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm">{r.message}</p>
                </div>
              ))}

              {/* תיבת תגובה / הודעת סגירה */}
              {conv.closed ? (
                <div className="rounded-lg border bg-muted/50 p-3 text-center text-sm text-muted-foreground">
                  השיחה נסגרה. אם תרצה/י להמשיך — אפשר ליצור קשר מחדש דרך האתר.
                </div>
              ) : (
                <div className="space-y-2 border-t pt-4">
                  {sent && (
                    <div className="flex items-center gap-1.5 text-sm text-emerald-600">
                      <CheckCircle className="h-4 w-4" />
                      התשובה נשלחה — נחזור אליך בהקדם.
                    </div>
                  )}
                  {error && conv && (
                    <p className="text-sm text-destructive">{error}</p>
                  )}
                  <Textarea
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder="כתוב/כתבי תשובה..."
                    className="min-h-[90px]"
                    disabled={sending}
                  />
                  <div className="flex justify-end">
                    <Button onClick={handleSend} disabled={sending || !reply.trim()}>
                      {sending ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Send className="ml-1 h-4 w-4" />
                          שליחה
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ) : null}

        <p className="flex items-center justify-center gap-1 text-center text-xs text-muted-foreground">
          <MessageCircle className="h-3 w-3" />
          פנייה #{conv?.ticketNumber ?? ""}
        </p>
      </div>
    </div>
  );
}
