"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Loader2,
  AlertCircle,
  ArrowRight,
  Eye,
  Users,
  FileText,
  Download,
} from "lucide-react";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { toast } from "sonner";

type OversightParticipant = { id: string; name: string | null; role: string };
type OversightConversation = {
  id: string;
  type: "DIRECT" | "GROUP";
  title: string;
  participants: OversightParticipant[];
  lastMessage: { body: string; senderId: string; createdAt: string } | null;
  lastMessageAt: string | null;
};
type OversightMessage = {
  id: string;
  body: string;
  senderId: string;
  senderName: string | null;
  createdAt: string;
  attachment: { name: string; type: string; size: number } | null;
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getInitials(name: string | null): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2);
}

export default function ChatOversightPage() {
  const [conversations, setConversations] = useState<OversightConversation[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<OversightConversation | null>(null);
  const [messages, setMessages] = useState<OversightMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingList(true);
      setError(null);
      try {
        const res = await fetch("/api/clinic-admin/chat-oversight");
        if (cancelled) return;
        if (!res.ok) {
          setError(
            res.status === 403
              ? "הגישה לדף זה זמינה רק לבעלי/ות קליניקה."
              : "שגיאה בטעינת שיחות המטפלים."
          );
          return;
        }
        const data = await res.json();
        if (!cancelled) setConversations(data.conversations || []);
      } catch {
        if (!cancelled) setError("שגיאת רשת בטעינת השיחות.");
      } finally {
        if (!cancelled) setLoadingList(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const openConversation = useCallback(async (c: OversightConversation) => {
    setSelected(c);
    setMessages([]);
    setLoadingMessages(true);
    try {
      const res = await fetch(`/api/clinic-admin/chat-oversight/${c.id}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
      } else {
        toast.error("שגיאה בטעינת ההתכתבות");
      }
    } catch {
      toast.error("שגיאת רשת בטעינת ההתכתבות");
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  if (loadingList) {
    return (
      <div className="flex justify-center py-16" role="status" dir="rtl">
        <Loader2 className="h-8 w-8 animate-spin text-primary" aria-hidden="true" />
        <span className="sr-only">טוען שיחות מטפלים…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4 max-w-2xl mx-auto" dir="rtl">
        <Card>
          <CardContent className="py-12 text-center space-y-3">
            <AlertCircle className="h-10 w-10 text-amber-500 mx-auto" aria-hidden="true" />
            <p className="font-medium">{error}</p>
            <Button asChild variant="outline">
              <Link href="/clinic-admin">
                <ArrowRight className="ml-2 h-4 w-4" aria-hidden="true" />
                חזרה לסקירה
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-primary/15 rounded-lg">
          <Eye className="h-6 w-6 text-primary" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">מעקב שיחות מטפלים</h1>
          <p className="text-sm text-muted-foreground">
            צפייה בלבד בהתכתבויות בין המטפלים. המטפלים יודעים שההתכתבות גלויה לך.
          </p>
        </div>
      </div>

      {conversations.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            אין עדיין שיחות בין מטפלים.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-4">
          {/* רשימת שיחות */}
          <Card className="overflow-hidden">
            <div className="divide-y max-h-[70vh] overflow-y-auto">
              {conversations.map((c) => (
                <button
                  key={c.id}
                  onClick={() => openConversation(c)}
                  className={`w-full text-right p-3 flex items-start gap-3 transition-colors hover:bg-accent/50 ${
                    selected?.id === c.id ? "bg-primary/10" : ""
                  }`}
                >
                  <Avatar className="h-9 w-9 shrink-0">
                    <AvatarFallback className="bg-primary/10 text-primary">
                      {c.type === "GROUP" ? (
                        <Users className="h-4 w-4" />
                      ) : (
                        getInitials(c.title)
                      )}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{c.title}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {c.lastMessage?.body || "אין הודעות עדיין"}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </Card>

          {/* הודעות — קריאה בלבד */}
          <Card className="overflow-hidden">
            {!selected ? (
              <CardContent className="h-full flex items-center justify-center py-16 text-center text-muted-foreground">
                בחר/י שיחה כדי לצפות בהתכתבות
              </CardContent>
            ) : (
              <div className="flex flex-col h-full">
                <div className="p-4 border-b">
                  <p className="font-semibold truncate">{selected.title}</p>
                  <p className="text-xs text-muted-foreground truncate">
                    {selected.participants.map((p) => p.name || "מטפל/ת").join(" · ")}
                  </p>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-muted/20 max-h-[60vh]">
                  {loadingMessages ? (
                    <div className="text-center text-sm text-muted-foreground">
                      טוען הודעות…
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="text-center text-sm text-muted-foreground py-8">
                      אין הודעות בשיחה זו.
                    </div>
                  ) : (
                    messages.map((m) => (
                      <div key={m.id} className="flex justify-start">
                        <div className="max-w-[80%] rounded-2xl px-3 py-2 bg-background border rounded-tr-sm">
                          <p className="text-xs font-semibold text-primary mb-0.5">
                            {m.senderName || "מטפל/ת"}
                          </p>
                          {m.attachment &&
                            (m.attachment.type.startsWith("image/") ? (
                              <a
                                href={`/api/clinic-admin/chat-oversight/${selected.id}/attachment/${m.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="block mb-1"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src={`/api/clinic-admin/chat-oversight/${selected.id}/attachment/${m.id}`}
                                  alt={m.attachment.name}
                                  className="max-h-48 max-w-full rounded-lg object-cover"
                                />
                              </a>
                            ) : (
                              <a
                                href={`/api/clinic-admin/chat-oversight/${selected.id}/attachment/${m.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 mb-1 rounded-lg p-2 bg-muted"
                              >
                                <FileText
                                  className="h-5 w-5 shrink-0"
                                  aria-hidden="true"
                                />
                                <span className="min-w-0 flex-1">
                                  <span className="block text-xs font-medium truncate">
                                    {m.attachment.name}
                                  </span>
                                  <span className="block text-[10px] opacity-70">
                                    {formatFileSize(m.attachment.size)}
                                  </span>
                                </span>
                                <Download
                                  className="h-4 w-4 shrink-0 opacity-70"
                                  aria-hidden="true"
                                />
                              </a>
                            ))}
                          {m.body && (
                            <p className="text-sm whitespace-pre-wrap break-words">
                              {m.body}
                            </p>
                          )}
                          <p className="text-[10px] mt-1 text-muted-foreground">
                            {format(new Date(m.createdAt), "dd/MM HH:mm", {
                              locale: he,
                            })}
                          </p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <div className="p-3 border-t text-center text-xs text-muted-foreground">
                  מסך מעקב — צפייה בלבד. לא ניתן לכתוב כאן.
                </div>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
