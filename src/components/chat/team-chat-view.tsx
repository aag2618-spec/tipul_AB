"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { toast } from "sonner";
import { ConversationList } from "./conversation-list";
import { MessageThread } from "./message-thread";
import { NewChatDialog } from "./new-chat-dialog";
import type { ChatContact, ChatMessage, ConversationSummary } from "./types";

const CONVERSATIONS_POLL_MS = 12000;
const MESSAGES_POLL_MS = 5000;

export function TeamChatView({ currentUserId }: { currentUserId: string }) {
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [contacts, setContacts] = useState<ChatContact[]>([]);
  const [loadingConvos, setLoadingConvos] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [sending, setSending] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [mobileView, setMobileView] = useState<"list" | "thread">("list");

  const selectedIdRef = useRef<string | null>(null);
  const sinceRef = useRef<string | null>(null);

  const fetchConversations = useCallback(async () => {
    try {
      const res = await fetch("/api/chat/conversations");
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations || []);
      }
    } catch {
      // שקט — זה polling, לא להציק למשתמש
    } finally {
      setLoadingConvos(false);
    }
  }, []);

  const markRead = useCallback(async (id: string) => {
    try {
      await fetch(`/api/chat/conversations/${id}/read`, { method: "POST" });
    } catch {
      // ignore
    }
    setConversations((prev) =>
      prev.map((c) => (c.id === id ? { ...c, unreadCount: 0 } : c))
    );
  }, []);

  const openConversation = useCallback(
    async (id: string) => {
      setSelectedId(id);
      selectedIdRef.current = id;
      setMobileView("thread");
      setMessages([]);
      sinceRef.current = null;
      setLoadingMessages(true);
      try {
        const res = await fetch(`/api/chat/conversations/${id}/messages`);
        if (res.ok) {
          const data = await res.json();
          const msgs: ChatMessage[] = data.messages || [];
          setMessages(msgs);
          sinceRef.current = msgs.length
            ? msgs[msgs.length - 1].createdAt
            : null;
          markRead(id);
        }
      } catch {
        toast.error("שגיאה בטעינת ההודעות");
      } finally {
        setLoadingMessages(false);
      }
    },
    [markRead]
  );

  // polling להודעות חדשות בשיחה הפתוחה
  useEffect(() => {
    if (!selectedId) return;
    const interval = setInterval(async () => {
      const id = selectedIdRef.current;
      if (!id) return;
      try {
        const since = sinceRef.current;
        const url = since
          ? `/api/chat/conversations/${id}/messages?since=${encodeURIComponent(
              since
            )}`
          : `/api/chat/conversations/${id}/messages`;
        const res = await fetch(url);
        if (!res.ok) return;
        const data = await res.json();
        const incoming: ChatMessage[] = data.messages || [];
        if (incoming.length > 0) {
          setMessages((prev) => {
            const existing = new Set(prev.map((m) => m.id));
            const fresh = incoming.filter((m) => !existing.has(m.id));
            return fresh.length ? [...prev, ...fresh] : prev;
          });
          sinceRef.current = incoming[incoming.length - 1].createdAt;
          if (incoming.some((m) => m.senderId !== currentUserId)) {
            markRead(id);
          }
        }
      } catch {
        // ignore
      }
    }, MESSAGES_POLL_MS);
    return () => clearInterval(interval);
  }, [selectedId, currentUserId, markRead]);

  // polling לרשימת השיחות
  useEffect(() => {
    fetchConversations();
    const interval = setInterval(fetchConversations, CONVERSATIONS_POLL_MS);
    return () => clearInterval(interval);
  }, [fetchConversations]);

  const handleSend = useCallback(
    async (body: string) => {
      const id = selectedIdRef.current;
      if (!id) return;
      setSending(true);
      try {
        const res = await fetch(`/api/chat/conversations/${id}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ body }),
        });
        if (res.ok) {
          const data = await res.json();
          const msg: ChatMessage = data.message;
          setMessages((prev) =>
            prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]
          );
          sinceRef.current = msg.createdAt;
          fetchConversations();
        } else {
          const data = await res.json().catch(() => ({}));
          toast.error(data.message || "שגיאה בשליחת ההודעה");
        }
      } catch {
        toast.error("שגיאה בשליחת ההודעה");
      } finally {
        setSending(false);
      }
    },
    [fetchConversations]
  );

  const handleOpenNewChat = useCallback(async () => {
    setDialogOpen(true);
    setLoadingContacts(true);
    try {
      const res = await fetch("/api/chat/contacts");
      if (res.ok) {
        const data = await res.json();
        setContacts(data.contacts || []);
      }
    } catch {
      toast.error("שגיאה בטעינת אנשי הצוות");
    } finally {
      setLoadingContacts(false);
    }
  }, []);

  const handlePickContact = useCallback(
    async (contactId: string) => {
      try {
        const res = await fetch("/api/chat/conversations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ recipientId: contactId }),
        });
        if (res.ok) {
          const data = await res.json();
          setDialogOpen(false);
          await fetchConversations();
          openConversation(data.conversationId);
        } else {
          const data = await res.json().catch(() => ({}));
          toast.error(data.message || "שגיאה בפתיחת השיחה");
        }
      } catch {
        toast.error("שגיאה בפתיחת השיחה");
      }
    },
    [fetchConversations, openConversation]
  );

  const selectedConversation =
    conversations.find((c) => c.id === selectedId) || null;

  return (
    <div className="h-[calc(100dvh-11rem)] border rounded-xl overflow-hidden bg-card">
      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] h-full">
        {/* רשימת שיחות */}
        <div
          className={`border-e h-full min-h-0 ${
            mobileView === "thread" ? "hidden lg:block" : "block"
          }`}
        >
          <ConversationList
            conversations={conversations}
            selectedId={selectedId}
            onSelect={openConversation}
            onNewChat={handleOpenNewChat}
            loading={loadingConvos}
          />
        </div>

        {/* חוט הודעות */}
        <div
          className={`h-full min-h-0 ${
            mobileView === "list" ? "hidden lg:block" : "block"
          }`}
        >
          <MessageThread
            conversation={selectedConversation}
            messages={messages}
            currentUserId={currentUserId}
            onSend={handleSend}
            sending={sending}
            loading={loadingMessages}
            onBack={() => setMobileView("list")}
          />
        </div>
      </div>

      <NewChatDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        contacts={contacts}
        loading={loadingContacts}
        onPick={handlePickContact}
      />
    </div>
  );
}
