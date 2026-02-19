"use client";

import { useState, useEffect, useRef, useMemo } from "react";
// Card removed - threads use lightweight divs now
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
// Select removed - filters replaced by inline badges
import { Textarea } from "@/components/ui/textarea";
import { 
  Mail, 
  XCircle, 
  AlertCircle,
  Search, 
  Loader2,
  Calendar,
  User,
  Users,
  ArrowDownLeft,
  Send,
  Reply,
  MessageSquare,
  X,
  Paperclip,
  FileText,
  Download,
  FolderPlus
} from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface CommunicationLog {
  id: string;
  type: string;
  channel: string;
  recipient: string;
  subject: string;
  content: string;
  status: string;
  errorMessage: string | null;
  sentAt: Date | null;
  createdAt: Date;
  isRead: boolean;
  readAt: Date | null;
  messageId: string | null;
  inReplyTo: string | null;
  attachments: Array<{
    id?: string;
    filename: string;
    contentType?: string;
    size?: number;
    resendEmailId?: string;
    fileUrl?: string;
  }> | null;
  client: {
    id: string;
    name: string;
  } | null;
}

interface Thread {
  id: string; // normalized subject + clientId
  subject: string;
  clientName: string;
  clientId: string | null;
  messages: CommunicationLog[];
  latestMessage: CommunicationLog;
  hasUnread: boolean;
  messageCount: number;
}

type FilterType = "all" | "SENT" | "FAILED" | "PENDING" | "RECEIVED";
// ChannelType removed - channel filter dropdown removed

// Normalize subject by removing Re: / Fwd: prefixes
function normalizeSubject(subject: string): string {
  return subject
    .replace(/^(Re:|RE:|Fwd:|FWD:|השב:|הע:)\s*/gi, "")
    .trim();
}

// Clean incoming email content - remove quoted replies and date/sender headers
function cleanIncomingContent(html: string): string {
  let cleaned = html;
  
  // Step 1: Remove ALL Unicode direction markers, zero-width chars, RTL/LTR marks
  cleaned = cleaned.replace(/[\u200F\u200E\u202B\u202C\u202A\u202D\u202E\u200D\u200C\u200B\u2069\u2068\u2067\u2066\uFEFF]/g, "");
  
  // Step 2: Remove gmail_quote divs and everything inside them
  cleaned = cleaned.replace(/<div\s+class=["']gmail_quote["'][\s\S]*$/gi, "");
  
  // Step 3: Remove blockquote elements (quoted replies)
  cleaned = cleaned.replace(/<blockquote[\s\S]*?<\/blockquote>/gi, "");
  cleaned = cleaned.replace(/<blockquote[\s\S]*$/gi, "");
  
  // Step 4: Remove Hebrew "בתאריך" date header and EVERYTHING after it
  // This is the most common Gmail Hebrew quoting format
  // Uses very broad matching to catch all variations with geresh (׳), special chars, etc.
  cleaned = cleaned.replace(/\s*בתאריך[\s\S]*$/gi, "");
  
  // Step 5: Remove English "On ... wrote:" header and everything after
  cleaned = cleaned.replace(/\s*On\s+\w{3,},?\s+\w[\s\S]*?wrote:\s*[\s\S]*$/gi, "");
  
  // Step 6: Remove "---------- Forwarded/Original message" blocks
  cleaned = cleaned.replace(/\s*-{3,}\s*(Forwarded|Original|הודעה)[\s\S]*/gi, "");
  
  // Step 7: Remove trailing <br>, empty divs, whitespace
  cleaned = cleaned.replace(/(<br\s*\/?>|<div>\s*<\/div>|\s)*$/gi, "").trim();
  
  // If nothing meaningful left, return original content
  const textOnly = cleaned.replace(/<[^>]*>/g, "").trim();
  if (!textOnly || textOnly.length === 0) {
    return html;
  }
  
  return cleaned;
}

export default function CommunicationsPage() {
  const [logs, setLogs] = useState<CommunicationLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<FilterType>("all");
  // channelFilter removed - dropdown removed for simplicity
  const [selectedThread, setSelectedThread] = useState<Thread | null>(null);
  const [replyText, setReplyText] = useState("");
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchLogs();
    // Auto-refresh every 30 seconds (silent, no spinner, no error toasts)
    const interval = setInterval(() => {
      silentRefresh();
    }, 30000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchLogs = async () => {
    try {
      setIsLoading(true);
      const response = await fetch("/api/communications/logs");
      if (response.ok) {
        const data = await response.json();
        setLogs(data);
      } else {
        toast.error("שגיאה בטעינת נתונים");
      }
    } catch (error) {
      console.error("Error fetching logs:", error);
      toast.error("שגיאה בטעינת נתונים");
    } finally {
      setIsLoading(false);
    }
  };

  const silentRefresh = async () => {
    try {
      const response = await fetch("/api/communications/logs");
      if (response.ok) {
        const data = await response.json();
        setLogs(data);
      }
    } catch {
      // Silent - don't show errors on background refresh
    }
  };

  // Group logs into threads
  const threads = useMemo(() => {
    const threadMap = new Map<string, CommunicationLog[]>();

    for (const log of logs) {
      const normalizedSub = normalizeSubject(log.subject || "");
      const clientKey = log.client?.id || log.recipient || "unknown";
      const threadKey = `${clientKey}::${normalizedSub}`;

      if (!threadMap.has(threadKey)) {
        threadMap.set(threadKey, []);
      }
      threadMap.get(threadKey)!.push(log);
    }

    const result: Thread[] = [];
    for (const [key, messages] of threadMap) {
      // Sort messages: newest first
      messages.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

      const latestMessage = messages[0];
      const hasUnread = messages.some(m => m.type === "INCOMING_EMAIL" && !m.isRead);

      result.push({
        id: key,
        subject: normalizeSubject(latestMessage.subject || "ללא נושא"),
        clientName: latestMessage.client?.name || latestMessage.recipient,
        clientId: latestMessage.client?.id || null,
        messages,
        latestMessage,
        hasUnread,
        messageCount: messages.length,
      });
    }

    // Sort threads by latest message date (newest first)
    result.sort((a, b) => 
      new Date(b.latestMessage.createdAt).getTime() - new Date(a.latestMessage.createdAt).getTime()
    );

    return result;
  }, [logs]);

  // Apply filters to threads
  const filteredThreads = useMemo(() => {
    let filtered = threads;

    if (statusFilter !== "all") {
      if (statusFilter === "RECEIVED") {
        filtered = filtered.filter(t => t.messages.some(m => m.status === "RECEIVED"));
      } else {
        filtered = filtered.filter(t => t.messages.some(m => m.status === statusFilter));
      }
    }

    // channelFilter removed

    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(t =>
        t.subject.toLowerCase().includes(search) ||
        t.clientName.toLowerCase().includes(search) ||
        t.messages.some(m => m.recipient.toLowerCase().includes(search))
      );
    }

    return filtered;
  }, [threads, statusFilter, searchTerm]);

  const handleSendReply = async () => {
    if (!selectedThread || !replyText.trim()) return;

    // Find the latest incoming email to reply to, or fallback to latest message
    const replyTo = selectedThread.messages.find(m => m.type === "INCOMING_EMAIL") 
      || selectedThread.latestMessage;

    setIsSendingReply(true);
    try {
      const formData = new FormData();
      formData.append("communicationLogId", replyTo.id);
      formData.append("replyContent", replyText.trim());
      
      for (const file of attachments) {
        formData.append("attachments", file);
      }

      const response = await fetch("/api/communications/reply", {
        method: "POST",
        // If there are attachments, use FormData; otherwise JSON
        ...(attachments.length > 0
          ? { body: formData }
          : {
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                communicationLogId: replyTo.id,
                replyContent: replyText.trim(),
              }),
            }),
      });

      if (response.ok) {
        toast.success("התשובה נשלחה בהצלחה!");
        setReplyText("");
        setAttachments([]);
        setSelectedThread(null);
        fetchLogs();
      } else {
        const data = await response.json();
        toast.error(data.message || "שגיאה בשליחת התשובה");
      }
    } catch (error) {
      console.error("Error sending reply:", error);
      toast.error("שגיאה בשליחת התשובה");
    } finally {
      setIsSendingReply(false);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      const newFiles = Array.from(files);
      // Max 5 files, max 10MB each
      const validFiles = newFiles.filter(f => f.size <= 10 * 1024 * 1024);
      if (validFiles.length < newFiles.length) {
        toast.error("קבצים מעל 10MB לא נתמכים");
      }
      setAttachments(prev => [...prev, ...validFiles].slice(0, 5));
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const handleDownloadAttachment = async (logId: string, attachmentId: string, filename: string) => {
    try {
      toast.info("מוריד קובץ...");
      const response = await fetch(
        `/api/communications/attachments?logId=${logId}&attachmentId=${encodeURIComponent(attachmentId)}&filename=${encodeURIComponent(filename)}`
      );
      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        toast.error(err.message || "שגיאה בהורדת הקובץ");
        return;
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast.success("הקובץ הורד בהצלחה");
    } catch {
      toast.error("שגיאה בהורדת הקובץ");
    }
  };

  const handleSaveToClientFolder = async (logId: string, attachmentId: string, filename: string, clientId: string) => {
    try {
      toast.info("שומר לתיקיית מטופל...");
      const response = await fetch("/api/communications/attachments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ logId, attachmentId, filename, clientId }),
      });
      const data = await response.json();
      if (response.ok) {
        toast.success(data.message || "הקובץ נשמר בהצלחה!");
      } else {
        toast.error(data.message || "שגיאה בשמירת הקובץ");
      }
    } catch {
      toast.error("שגיאה בשמירת הקובץ");
    }
  };

  const openThread = (thread: Thread) => {
    setSelectedThread(thread);
    setReplyText("");
    setAttachments([]);
    // Mark unread incoming messages in this thread as read
    const unreadIds = new Set<string>();
    thread.messages.forEach(msg => {
      if (msg.type === "INCOMING_EMAIL" && !msg.isRead) {
        unreadIds.add(msg.id);
        fetch(`/api/communications/logs/${msg.id}/read`, { method: "POST" }).catch(() => {});
      }
    });
    // Update local state immediately so blue highlight disappears
    if (unreadIds.size > 0) {
      setLogs(prev => prev.map(l => unreadIds.has(l.id) ? { ...l, isRead: true } : l));
    }
    // Mark related notifications as read (by subject match)
    fetch("/api/notifications/mark-read-by-subject", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject: thread.subject }),
    }).catch(() => {});
  };

  const dismissFailedMessage = async (msgId: string) => {
    try {
      const response = await fetch(`/api/communications/logs/${msgId}/dismiss`, { method: "POST" });
      if (response.ok) {
        setLogs(prev => prev.map(l => l.id === msgId ? { ...l, status: "DISMISSED" } : l));
        if (selectedThread) {
          setSelectedThread({
            ...selectedThread,
            messages: selectedThread.messages.map(m => m.id === msgId ? { ...m, status: "DISMISSED" } : m),
          });
        }
        toast.success("סומן כטופל");
      }
    } catch {
      toast.error("שגיאה");
    }
  };

  const dismissAllFailedInThread = async (thread: Thread) => {
    const failedMsgs = thread.messages.filter(m => m.status === "FAILED");
    if (failedMsgs.length === 0) return;
    try {
      await Promise.all(failedMsgs.map(m => fetch(`/api/communications/logs/${m.id}/dismiss`, { method: "POST" })));
      const failedIds = new Set(failedMsgs.map(m => m.id));
      setLogs(prev => prev.map(l => failedIds.has(l.id) ? { ...l, status: "DISMISSED" } : l));
      toast.success("סומן כטופל");
    } catch {
      toast.error("שגיאה");
    }
  };

  const getLatestMessagePreview = (thread: Thread) => {
    const msg = thread.latestMessage;
    const isIncoming = msg.type === "INCOMING_EMAIL";
    // Clean incoming content then strip HTML for preview
    const rawContent = isIncoming ? cleanIncomingContent(msg.content || "") : (msg.content || "");
    const textContent = rawContent.replace(/<[^>]*>/g, "").trim();
    const preview = textContent.substring(0, 100) + (textContent.length > 100 ? "..." : "");
    return { isIncoming, preview };
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const unreadReplies = logs.filter(l => l.type === "INCOMING_EMAIL" && !l.isRead).length;
  const failedThreadCount = threads.filter(t => t.messages.some(m => m.status === "FAILED")).length;

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">היסטוריית תקשורת</h1>
          <div className="flex items-center gap-2 mt-2">
            {/* Unread replies badge - always visible */}
            <button
              onClick={() => setStatusFilter(statusFilter === "RECEIVED" ? "all" : "RECEIVED")}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                statusFilter === "RECEIVED"
                  ? "bg-blue-100 text-blue-800 ring-2 ring-blue-400"
                  : unreadReplies > 0
                    ? "bg-blue-50 text-blue-700 hover:bg-blue-100"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              <Mail className="h-3.5 w-3.5" />
              {unreadReplies > 0 ? `${unreadReplies} תגובות שלא נקראו` : "אין תגובות חדשות"}
            </button>
            {/* Failed badge - only if > 0, counts threads */}
            {failedThreadCount > 0 && (
              <button
                onClick={() => setStatusFilter(statusFilter === "FAILED" ? "all" : "FAILED")}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  statusFilter === "FAILED"
                    ? "bg-red-100 text-red-800 ring-2 ring-red-400"
                    : "bg-red-50 text-red-700 hover:bg-red-100"
                }`}
              >
                <AlertCircle className="h-3.5 w-3.5" />
                {failedThreadCount} שליחות נכשלו
              </button>
            )}
          </div>
        </div>
        <Button asChild className="gap-2">
          <Link href="/dashboard/communications/bulk-email">
            <Users className="h-4 w-4" />
            שליחה קבוצתית
          </Link>
        </Button>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="חפש לפי שם מטופל או נושא..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pr-10"
        />
      </div>

      {/* Threads List - Gmail style */}
      <div className="bg-white dark:bg-background rounded-lg">
        {filteredThreads.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground">
            <Mail className="h-10 w-10 mb-3 opacity-30" />
            <p className="text-sm">{searchTerm ? "לא נמצאו תוצאות" : "אין עדיין היסטוריית תקשורת"}</p>
          </div>
        ) : (
          <table className="w-full" style={{ borderCollapse: "collapse", tableLayout: "fixed" }}>
            <colgroup>
              <col style={{ width: "28px" }} />
              <col style={{ width: "140px" }} />
              <col />
              <col style={{ width: "50px" }} />
              <col style={{ width: "80px" }} />
            </colgroup>
            <tbody>
              {filteredThreads.map((thread, idx) => {
                const { isIncoming, preview } = getLatestMessagePreview(thread);
                const threadHasFailed = thread.messages.some(m => m.status === "FAILED");
                const hasAttachments = thread.messages.some(m => m.attachments && m.attachments.length > 0);
                const isUnread = thread.hasUnread;
                return (
                  <tr
                    key={thread.id}
                    className={`cursor-pointer border-b border-[#f1f3f4] dark:border-gray-800 last:border-b-0 hover:z-10 hover:shadow-[inset_1px_0_0_#dadce0,inset_-1px_0_0_#dadce0,0_1px_2px_0_rgba(60,64,67,.3),0_1px_3px_1px_rgba(60,64,67,.15)] ${
                      isUnread
                        ? "bg-[#f2f6fc] dark:bg-blue-950/20"
                        : threadHasFailed
                        ? "bg-red-50/30 dark:bg-red-950/10"
                        : "bg-white dark:bg-background"
                    } ${idx === 0 ? "[&>td:first-child]:rounded-tr-lg [&>td:last-child]:rounded-tl-lg" : ""} ${idx === filteredThreads.length - 1 ? "[&>td:first-child]:rounded-br-lg [&>td:last-child]:rounded-bl-lg" : ""}`}
                    style={{ height: "40px" }}
                    onClick={() => openThread(thread)}
                  >
                    {/* Col 1: Unread dot / fail icon */}
                    <td className="pr-2 pl-3">
                      <div className="flex justify-center">
                        {isUnread ? (
                          <span className="w-[10px] h-[10px] rounded-full bg-[#1a73e8]" />
                        ) : threadHasFailed ? (
                          <AlertCircle className="h-4 w-4 text-red-500" />
                        ) : null}
                      </div>
                    </td>

                    {/* Col 2: Client name */}
                    <td className="py-0 pr-3 overflow-hidden">
                      <span className={`block text-[14px] truncate ${isUnread ? "font-bold text-[#202124] dark:text-white" : "text-[#5f6368] dark:text-gray-300"}`}>
                        {thread.clientName}
                      </span>
                    </td>

                    {/* Col 3: Subject + preview */}
                    <td className="py-0 pr-2 overflow-hidden">
                      <div className="flex items-baseline overflow-hidden whitespace-nowrap">
                        <span className={`text-[14px] shrink-0 ${isUnread ? "font-bold text-[#202124] dark:text-white" : "text-[#202124] dark:text-gray-200"}`}>
                          {thread.subject || "ללא נושא"}
                        </span>
                        {threadHasFailed && (
                          <span className="text-[12px] text-red-500 mr-1 shrink-0"> — נכשל</span>
                        )}
                        <span className="text-[14px] text-[#5f6368] dark:text-gray-400 truncate">
                          &nbsp;— {preview || ""}
                        </span>
                      </div>
                    </td>

                    {/* Col 4: Indicators */}
                    <td className="py-0 text-center">
                      <div className="flex items-center justify-end gap-1">
                        {hasAttachments && <Paperclip className="h-[15px] w-[15px] text-[#5f6368] dark:text-gray-400" />}
                        {thread.messageCount > 1 && (
                          <span className="text-[12px] text-[#5f6368] dark:text-gray-400">{thread.messageCount}</span>
                        )}
                        {threadHasFailed && (
                          <button
                            onClick={(e) => { e.stopPropagation(); dismissAllFailedInThread(thread); }}
                            className="p-0.5 rounded hover:bg-red-100 text-red-400 hover:text-red-600"
                            title="סמן כטופל"
                          >
                            <X className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>

                    {/* Col 5: Date */}
                    <td className="py-0 pl-4 pr-2">
                      <span dir="ltr" className={`text-[12px] tabular-nums block text-left ${isUnread ? "font-bold text-[#202124] dark:text-white" : "text-[#5f6368] dark:text-gray-400"}`}>
                        {format(new Date(thread.latestMessage.createdAt), "dd בMMM", { locale: he })}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Thread Dialog */}
      <Dialog open={!!selectedThread} onOpenChange={() => { setSelectedThread(null); setReplyText(""); setAttachments([]); }}>
        <DialogContent className="max-w-3xl max-h-[85vh] flex flex-col p-0">
          {/* Header */}
          <div className="p-4 pb-2 border-b">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-teal-600" />
                {selectedThread?.subject || "ללא נושא"}
                {selectedThread && selectedThread.messageCount > 1 && (
                  <Badge variant="secondary" className="mr-2">
                    {selectedThread.messageCount} הודעות
                  </Badge>
                )}
              </DialogTitle>
              {selectedThread?.clientName && (
                <p className="text-sm text-muted-foreground flex items-center gap-1 mt-1">
                  <User className="h-3 w-3" />
                  {selectedThread.clientName}
                </p>
              )}
            </DialogHeader>
          </div>

          {selectedThread && (
            <>
              {/* Reply Section - AT THE TOP */}
              <div className="p-4 border-b bg-slate-50/50 dark:bg-slate-900/50">
                <div className="flex items-center gap-2 mb-2">
                  <Reply className="h-4 w-4 text-teal-600" />
                  <span className="font-medium text-sm text-teal-700">השב ל-{selectedThread.clientName}</span>
                </div>
                <Textarea
                  placeholder="כתוב את תשובתך כאן..."
                  value={replyText}
                  onChange={(e) => setReplyText(e.target.value)}
                  className="min-h-[80px] mb-2 bg-white dark:bg-slate-800"
                  dir="rtl"
                />
                {/* Attachments */}
                {attachments.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-2">
                    {attachments.map((file, idx) => (
                      <div key={idx} className="flex items-center gap-1 bg-white dark:bg-slate-800 border rounded px-2 py-1 text-xs">
                        <FileText className="h-3 w-3 text-muted-foreground" />
                        <span className="max-w-[120px] truncate">{file.name}</span>
                        <button onClick={() => removeAttachment(idx)} className="text-red-400 hover:text-red-600 mr-1">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex justify-between items-center">
                  <div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      className="hidden"
                      onChange={handleFileSelect}
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.gif,.txt"
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => fileInputRef.current?.click()}
                      className="gap-1 text-xs"
                    >
                      <Paperclip className="h-3 w-3" />
                      צרף קובץ
                    </Button>
                  </div>
                  <Button
                    onClick={handleSendReply}
                    disabled={!replyText.trim() || isSendingReply}
                    size="sm"
                    className="gap-2 bg-teal-600 hover:bg-teal-700"
                  >
                    {isSendingReply ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    שלח תשובה
                  </Button>
                </div>
              </div>

              {/* Messages - newest first (scrollable) */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {selectedThread.messages.map((msg, idx) => {
                  const isIncoming = msg.type === "INCOMING_EMAIL";
                  const msgDate = msg.sentAt || msg.createdAt;
                  return (
                    <div
                      key={msg.id}
                      className={`rounded-lg border p-4 ${
                        isIncoming
                          ? "bg-blue-50/70 dark:bg-blue-950/20 border-blue-200"
                          : "bg-green-50/70 dark:bg-green-950/20 border-green-200"
                      }`}
                    >
                      {/* Message header */}
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          {isIncoming ? (
                            <>
                              <ArrowDownLeft className="h-4 w-4 text-blue-600" />
                              <span className="font-medium text-blue-800 dark:text-blue-300 text-sm">
                                {msg.client?.name || "מטופל"}
                              </span>
                              {!msg.isRead && (
                                <Badge className="bg-blue-600 text-white text-xs py-0">חדש</Badge>
                              )}
                            </>
                          ) : (
                            <>
                              <Send className="h-4 w-4 text-green-600" />
                              <span className="font-medium text-green-800 dark:text-green-300 text-sm">
                                אתה
                              </span>
                              {msg.status === "FAILED" && (
                                <Badge variant="destructive" className="text-xs py-0">שליחה נכשלה</Badge>
                              )}
                            </>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(msgDate), "EEEE dd/MM/yyyy HH:mm", { locale: he })}
                        </span>
                      </div>
                      {/* Message content */}
                      <div 
                        className="prose prose-sm max-w-none text-sm whitespace-pre-wrap"
                        dangerouslySetInnerHTML={{ __html: isIncoming ? cleanIncomingContent(msg.content || "") || "(ללא תוכן)" : msg.content || "(ללא תוכן)" }}
                      />
                      {msg.status === "FAILED" && (
                        <div className="mt-2 text-xs text-red-700 bg-red-50 border border-red-200 p-2.5 rounded-md">
                          <div className="flex items-start gap-2">
                            <XCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                            <div className="flex-1">
                              <span className="font-semibold">ההודעה לא הגיעה למטופל.</span>
                              {msg.errorMessage && (
                                <span className="block mt-0.5 text-red-500">סיבה: {msg.errorMessage}</span>
                              )}
                            </div>
                          </div>
                          <div className="mt-2 flex items-center gap-2 border-t border-red-200 pt-2">
                            <button
                              onClick={(e) => { e.stopPropagation(); dismissFailedMessage(msg.id); }}
                              className="text-xs px-2.5 py-1 rounded bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors"
                            >
                              סמן כטופל ✓
                            </button>
                            <span className="text-red-400 text-xs">ניתן לנסות לשלוח שוב מהמערכת</span>
                          </div>
                        </div>
                      )}
                      {msg.status === "DISMISSED" && (
                        <div className="mt-2 text-xs text-gray-500 bg-gray-50 border border-gray-200 p-2 rounded-md flex items-center gap-1.5">
                          <span>✓ סומן כטופל</span>
                        </div>
                      )}
                      {/* Attachments */}
                      {msg.attachments && msg.attachments.length > 0 && (
                        <div className="mt-3 border-t pt-2">
                          <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
                            <Paperclip className="h-3 w-3" />
                            קבצים מצורפים ({msg.attachments.length})
                          </div>
                          <div className="flex flex-col gap-1">
                            {msg.attachments.map((att: { id?: string; filename: string; size?: number; resendEmailId?: string; fileUrl?: string }, attIdx: number) => {
                              const msgIsIncoming = msg.type === "INCOMING_EMAIL";
                              const hasSavedFile = !!att.fileUrl;
                              return (
                                <div key={attIdx} className="flex items-center gap-2 bg-muted/50 rounded px-2 py-1.5 text-xs">
                                  <FileText className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                                  <span className="truncate flex-1">{att.filename}</span>
                                  {att.size && (
                                    <span className="text-muted-foreground flex-shrink-0">
                                      {att.size > 1024 * 1024 
                                        ? `${(att.size / (1024 * 1024)).toFixed(1)}MB` 
                                        : `${Math.round(att.size / 1024)}KB`}
                                    </span>
                                  )}
                                  {msgIsIncoming ? (
                                    <>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        className="h-6 px-2 text-xs"
                                        onClick={() => handleDownloadAttachment(msg.id, att.id || "", att.filename)}
                                        title="הורד למחשב"
                                      >
                                        <Download className="h-3 w-3 ml-1" />
                                        הורד
                                      </Button>
                                      {msg.client?.id && (
                                        <Button
                                          size="sm"
                                          variant="ghost"
                                          className="h-6 px-2 text-xs text-blue-600"
                                          onClick={() => handleSaveToClientFolder(msg.id, att.id || "", att.filename, msg.client!.id)}
                                          title="שמור לתיקיית מטופל"
                                        >
                                          <FolderPlus className="h-3 w-3 ml-1" />
                                          שמור
                                        </Button>
                                      )}
                                    </>
                                  ) : hasSavedFile ? (
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-6 px-2 text-xs"
                                      onClick={() => {
                                        const a = document.createElement("a");
                                        a.href = att.fileUrl!;
                                        a.download = att.filename;
                                        document.body.appendChild(a);
                                        a.click();
                                        document.body.removeChild(a);
                                      }}
                                      title="הורד למחשב"
                                    >
                                      <Download className="h-3 w-3 ml-1" />
                                      הורד
                                    </Button>
                                  ) : (
                                    <span className="text-muted-foreground italic">נשלח</span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
