"use client";

import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, MessageSquarePlus, Megaphone } from "lucide-react";
import { format, isToday, isYesterday } from "date-fns";
import { he } from "date-fns/locale";
import type { ConversationSummary } from "./types";

function getInitials(name: string | null): string {
  if (!name) return "?";
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .slice(0, 2);
}

function formatTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isToday(d)) return format(d, "HH:mm", { locale: he });
  if (isYesterday(d)) return "אתמול";
  return format(d, "dd/MM", { locale: he });
}

interface ConversationListProps {
  conversations: ConversationSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onNewChat: () => void;
  loading: boolean;
}

export function ConversationList({
  conversations,
  selectedId,
  onSelect,
  onNewChat,
  loading,
}: ConversationListProps) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between p-4 border-b">
        <h2 className="font-semibold text-lg">צ׳אט צוות</h2>
        <Button size="sm" variant="outline" onClick={onNewChat}>
          <MessageSquarePlus className="h-4 w-4 ms-2" />
          שיחה חדשה
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading && conversations.length === 0 ? (
          <div className="p-4 text-sm text-muted-foreground text-center">
            טוען שיחות…
          </div>
        ) : conversations.length === 0 ? (
          <div className="p-6 text-sm text-muted-foreground text-center">
            אין עדיין שיחות. התחל/י שיחה חדשה עם איש צוות.
          </div>
        ) : (
          <div className="divide-y">
            {conversations.map((c) => {
              const isSelected = c.id === selectedId;
              return (
                <button
                  key={c.id}
                  onClick={() => onSelect(c.id)}
                  className={`w-full text-right p-3 flex items-start gap-3 transition-colors hover:bg-accent/50 ${
                    isSelected ? "bg-primary/10" : ""
                  }`}
                >
                  <Avatar className="h-10 w-10 shrink-0">
                    <AvatarFallback
                      className={
                        c.isTeamChannel
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-primary/10 text-primary"
                      }
                    >
                      {c.isTeamChannel ? (
                        <Users className="h-5 w-5" />
                      ) : c.isBroadcast ? (
                        <Megaphone className="h-5 w-5" />
                      ) : (
                        getInitials(c.title)
                      )}
                    </AvatarFallback>
                  </Avatar>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-sm truncate">
                        {c.title}
                      </span>
                      <span className="text-xs text-muted-foreground shrink-0">
                        {formatTime(c.lastMessageAt)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <span className="text-xs text-muted-foreground truncate">
                        {c.lastMessage
                          ? c.lastMessage.body || "📎 קובץ מצורף"
                          : "אין הודעות עדיין"}
                      </span>
                      {c.unreadCount > 0 && (
                        <Badge
                          variant="default"
                          className="shrink-0 h-5 min-w-5 justify-center px-1.5 text-xs"
                        >
                          {c.unreadCount}
                        </Badge>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
