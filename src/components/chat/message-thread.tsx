"use client";

import { useEffect, useRef, useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Users, Send, ArrowRight, Loader2, Eye } from "lucide-react";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import type { ChatMessage, ConversationSummary } from "./types";

function getInitials(name: string | null): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2);
}

interface MessageThreadProps {
  conversation: ConversationSummary | null;
  messages: ChatMessage[];
  currentUserId: string;
  onSend: (body: string) => void;
  sending: boolean;
  loading: boolean;
  onBack: () => void;
}

export function MessageThread({
  conversation,
  messages,
  currentUserId,
  onSend,
  sending,
  loading,
  onBack,
}: MessageThreadProps) {
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  // גלילה אוטומטית לתחתית כשמגיעות הודעות חדשות.
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  if (!conversation) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground p-6 text-center">
        בחר/י שיחה כדי להתחיל לכתוב
      </div>
    );
  }

  const isGroup = conversation.type === "GROUP";

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    onSend(trimmed);
    setText("");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* כותרת */}
      <div className="flex items-center gap-3 p-4 border-b">
        <Button
          size="icon"
          variant="ghost"
          className="lg:hidden shrink-0"
          onClick={onBack}
          aria-label="חזרה לרשימה"
        >
          <ArrowRight className="h-5 w-5" />
        </Button>
        <Avatar className="h-9 w-9 shrink-0">
          <AvatarFallback
            className={
              conversation.isTeamChannel
                ? "bg-emerald-100 text-emerald-700"
                : "bg-primary/10 text-primary"
            }
          >
            {conversation.isTeamChannel ? (
              <Users className="h-5 w-5" />
            ) : (
              getInitials(conversation.title)
            )}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <h2 className="font-semibold truncate">{conversation.title}</h2>
          <p className="text-xs text-muted-foreground truncate">
            {isGroup
              ? `${conversation.participants.length} משתתפים`
              : conversation.participants.find((p) => p.id !== currentUserId)
                  ?.role || ""}
          </p>
        </div>
      </div>

      {/* הודעת שקיפות — שיחה בין מטפלים גלויה למנהלת */}
      {conversation.visibleToManager && (
        <div className="flex items-center gap-2 px-4 py-2 text-xs bg-amber-50 text-amber-800 border-b border-amber-100 dark:bg-amber-950/30 dark:text-amber-200">
          <Eye className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>ההתכתבות בין המטפלים גלויה למנהלת הקליניקה.</span>
        </div>
      )}

      {/* הודעות */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-muted/20">
        {loading && messages.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground">
            טוען הודעות…
          </div>
        ) : messages.length === 0 ? (
          <div className="text-center text-sm text-muted-foreground py-8">
            אין הודעות עדיין. כתוב/כתבי את ההודעה הראשונה.
          </div>
        ) : (
          messages.map((m) => {
            const mine = m.senderId === currentUserId;
            return (
              <div
                key={m.id}
                className={`flex ${mine ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[75%] rounded-2xl px-3 py-2 ${
                    mine
                      ? "bg-primary text-primary-foreground rounded-tl-sm"
                      : "bg-background border rounded-tr-sm"
                  }`}
                >
                  {isGroup && !mine && (
                    <p className="text-xs font-semibold text-primary mb-0.5">
                      {m.senderName || "משתמש"}
                    </p>
                  )}
                  <p className="text-sm whitespace-pre-wrap break-words">
                    {m.body}
                  </p>
                  <p
                    className={`text-[10px] mt-1 ${
                      mine
                        ? "text-primary-foreground/70"
                        : "text-muted-foreground"
                    }`}
                  >
                    {format(new Date(m.createdAt), "HH:mm", { locale: he })}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      {/* תיבת כתיבה */}
      <div className="p-3 border-t flex items-end gap-2">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="הקלד/י הודעה…"
          className="min-h-[44px] max-h-32 resize-none"
          rows={1}
        />
        <Button
          size="icon"
          onClick={handleSubmit}
          disabled={!text.trim() || sending}
          aria-label="שלח הודעה"
        >
          {sending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}
