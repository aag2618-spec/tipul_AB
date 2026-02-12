"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { 
  Mail, 
  CheckCircle, 
  XCircle, 
  Clock, 
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
  FileText
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
type ChannelType = "all" | "EMAIL" | "SMS" | "WHATSAPP";

// Normalize subject by removing Re: / Fwd: prefixes
function normalizeSubject(subject: string): string {
  return subject
    .replace(/^(Re:|RE:|Fwd:|FWD:|השב:|הע:)\s*/gi, "")
    .trim();
}

// Clean incoming email content - remove quoted replies and date/sender headers
function cleanIncomingContent(html: string): string {
  let cleaned = html;
  
  // Remove "בתאריך יום X, DD בMONTH YYYY ב-HH:MM מאת NAME <email>:" blocks and everything after
  cleaned = cleaned.replace(/בתאריך\s+יום\s+[^:]+מאת\s+[^:]+:[\s\S]*/gi, "");
  
  // Remove "On DATE, NAME <email> wrote:" blocks and everything after
  cleaned = cleaned.replace(/On\s+\w+,\s+\w+\s+\d+[\s\S]*?wrote:[\s\S]*/gi, "");
  
  // Remove blockquote elements (quoted replies)
  cleaned = cleaned.replace(/<blockquote[\s\S]*?<\/blockquote>/gi, "");
  
  // Remove <br> and divs that are just whitespace after cleaning
  cleaned = cleaned.replace(/(<br\s*\/?>|\s)*$/gi, "").trim();
  
  // If nothing left, return original
  if (!cleaned || cleaned.replace(/<[^>]*>/g, "").trim().length === 0) {
    return html;
  }
  
  return cleaned;
}

export default function CommunicationsPage() {
  const [logs, setLogs] = useState<CommunicationLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<FilterType>("all");
  const [channelFilter, setChannelFilter] = useState<ChannelType>("all");
  const [selectedThread, setSelectedThread] = useState<Thread | null>(null);
  const [replyText, setReplyText] = useState("");
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [attachments, setAttachments] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchLogs();
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

    if (channelFilter !== "all") {
      filtered = filtered.filter(t => t.messages.some(m => m.channel === channelFilter));
    }

    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(t =>
        t.subject.toLowerCase().includes(search) ||
        t.clientName.toLowerCase().includes(search) ||
        t.messages.some(m => m.recipient.toLowerCase().includes(search))
      );
    }

    return filtered;
  }, [threads, statusFilter, channelFilter, searchTerm]);

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

  const stats = {
    total: logs.length,
    sent: logs.filter(l => l.status === "SENT").length,
    failed: logs.filter(l => l.status === "FAILED").length,
    pending: logs.filter(l => l.status === "PENDING").length,
    received: logs.filter(l => l.status === "RECEIVED").length,
  };

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">היסטוריית תקשורת</h1>
          <p className="text-muted-foreground">כל המיילים וההודעות - שלוחים ונכנסים</p>
        </div>
        <Button asChild className="gap-2">
          <Link href="/dashboard/communications/bulk-email">
            <Users className="h-4 w-4" />
            שליחה קבוצתית
          </Link>
        </Button>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">סה&quot;כ הודעות</CardTitle>
            <Mail className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">נשלחו בהצלחה</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{stats.sent}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">נכשלו</CardTitle>
            <XCircle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{stats.failed}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">ממתינים</CardTitle>
            <Clock className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">{stats.pending}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">תגובות מהמטופלים</CardTitle>
            <Mail className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{stats.received}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="חפש לפי נמען, נושא או מטופל..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pr-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as FilterType)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="סטטוס" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">הכל</SelectItem>
            <SelectItem value="SENT">נשלחו</SelectItem>
            <SelectItem value="RECEIVED">תגובות מהמטופלים</SelectItem>
            <SelectItem value="FAILED">נכשלו</SelectItem>
            <SelectItem value="PENDING">ממתינים</SelectItem>
          </SelectContent>
        </Select>
        <Select value={channelFilter} onValueChange={(value) => setChannelFilter(value as ChannelType)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="ערוץ" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">כל הערוצים</SelectItem>
            <SelectItem value="EMAIL">מייל</SelectItem>
            <SelectItem value="SMS">SMS</SelectItem>
            <SelectItem value="WHATSAPP">WhatsApp</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Threads List */}
      <div className="space-y-3">
        {filteredThreads.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Mail className="h-16 w-16 text-muted-foreground mb-4 opacity-50" />
              <p className="text-lg font-medium">
                {searchTerm ? "לא נמצאו תוצאות" : "אין עדיין היסטוריית תקשורת"}
              </p>
            </CardContent>
          </Card>
        ) : (
          filteredThreads.map((thread) => {
            const { isIncoming, preview } = getLatestMessagePreview(thread);
            return (
              <Card 
                key={thread.id} 
                className={`hover:shadow-md transition-shadow cursor-pointer ${
                  thread.hasUnread 
                    ? "border-blue-300 bg-blue-50/40 dark:bg-blue-950/10 ring-2 ring-blue-400/40" 
                    : ""
                }`}
                onClick={() => { setSelectedThread(thread); setReplyText(""); setAttachments([]); }}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1">
                      <div className="mt-1">
                        {isIncoming ? (
                          <ArrowDownLeft className="h-5 w-5 text-blue-600" />
                        ) : (
                          <Send className="h-5 w-5 text-green-600" />
                        )}
                      </div>
                      <div className="flex-1 space-y-1.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          {thread.hasUnread && (
                            <Badge className="bg-blue-600 text-white">חדש</Badge>
                          )}
                          <h3 className="font-semibold">{thread.subject || "ללא נושא"}</h3>
                          {thread.messageCount > 1 && (
                            <Badge variant="secondary" className="gap-1">
                              <MessageSquare className="h-3 w-3" />
                              {thread.messageCount} הודעות
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {thread.clientName}
                          </div>
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {format(new Date(thread.latestMessage.createdAt), "dd/MM/yyyy HH:mm", { locale: he })}
                          </div>
                        </div>
                        {/* Latest message preview */}
                        <div className="text-sm text-muted-foreground mt-1 line-clamp-2">
                          <span className="font-medium">
                            {isIncoming ? `${thread.clientName}: ` : "אתה: "}
                          </span>
                          {preview || "(ללא תוכן)"}
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })
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
                                <Badge variant="destructive" className="text-xs py-0">נכשל</Badge>
                              )}
                            </>
                          )}
                        </div>
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(msgDate), "dd/MM/yyyy HH:mm", { locale: he })}
                        </span>
                      </div>
                      {/* Message content */}
                      <div 
                        className="prose prose-sm max-w-none text-sm whitespace-pre-wrap"
                        dangerouslySetInnerHTML={{ __html: isIncoming ? cleanIncomingContent(msg.content || "") || "(ללא תוכן)" : msg.content || "(ללא תוכן)" }}
                      />
                      {msg.errorMessage && (
                        <div className="mt-2 text-xs text-red-600 bg-red-50 p-2 rounded">
                          שגיאה: {msg.errorMessage}
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
