"use client";

import { useState, useEffect } from "react";
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
import { 
  Mail, 
  CheckCircle, 
  XCircle, 
  Clock, 
  Search, 
  Loader2,
  Eye,
  Calendar,
  User,
  Users,
  Plus,
  ArrowDownLeft,
  Send
} from "lucide-react";
import Link from "next/link";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
  client: {
    id: string;
    name: string;
  } | null;
}

type FilterType = "all" | "SENT" | "FAILED" | "PENDING" | "RECEIVED";
type ChannelType = "all" | "EMAIL" | "SMS" | "WHATSAPP";

export default function CommunicationsPage() {
  const [logs, setLogs] = useState<CommunicationLog[]>([]);
  const [filteredLogs, setFilteredLogs] = useState<CommunicationLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<FilterType>("all");
  const [channelFilter, setChannelFilter] = useState<ChannelType>("all");
  const [selectedLog, setSelectedLog] = useState<CommunicationLog | null>(null);

  useEffect(() => {
    fetchLogs();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [logs, searchTerm, statusFilter, channelFilter]);

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

  const applyFilters = () => {
    let filtered = logs;

    // Status filter
    if (statusFilter !== "all") {
      filtered = filtered.filter((log) => log.status === statusFilter);
    }

    // Channel filter
    if (channelFilter !== "all") {
      filtered = filtered.filter((log) => log.channel === channelFilter);
    }

    // Search filter
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(
        (log) =>
          log.recipient.toLowerCase().includes(search) ||
          log.subject.toLowerCase().includes(search) ||
          log.client?.name.toLowerCase().includes(search)
      );
    }

    setFilteredLogs(filtered);
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case "SENT":
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case "FAILED":
        return <XCircle className="h-4 w-4 text-red-500" />;
      case "PENDING":
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case "RECEIVED":
        return <Mail className="h-4 w-4 text-blue-500" />;
      default:
        return <Mail className="h-4 w-4" />;
    }
  };

  const getStatusBadge = (status: string) => {
    const variants: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
      SENT: "default",
      FAILED: "destructive",
      PENDING: "secondary",
      RECEIVED: "outline",
    };
    const labels: Record<string, string> = {
      SENT: "נשלח",
      FAILED: "נכשל",
      PENDING: "ממתין",
      RECEIVED: "התקבל מהמטופל",
    };
    return (
      <Badge variant={variants[status] || "outline"} className={status === "RECEIVED" ? "bg-blue-50 text-blue-700 border-blue-200" : ""}>
        {labels[status] || status}
      </Badge>
    );
  };

  const getTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      REMINDER_24H: "תזכורת 24 שעות",
      REMINDER_2H: "תזכורת 2 שעות",
      CANCELLATION_REQUEST: "בקשת ביטול",
      CANCELLATION_APPROVED: "ביטול אושר",
      CANCELLATION_REJECTED: "ביטול נדחה",
      CUSTOM: "מייל מותאם",
      INCOMING_EMAIL: "תשובה מהמטופל",
      SESSION_CONFIRMATION: "אישור תור",
      PAYMENT_RECEIPT: "קבלה",
      WELCOME: "ברוכים הבאים",
    };
    return labels[type] || type;
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
    sent: logs.filter((l) => l.status === "SENT").length,
    failed: logs.filter((l) => l.status === "FAILED").length,
    pending: logs.filter((l) => l.status === "PENDING").length,
    received: logs.filter((l) => l.status === "RECEIVED").length,
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
            <CardTitle className="text-sm font-medium">סה"כ הודעות</CardTitle>
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

      {/* Logs List */}
      <div className="space-y-3">
        {filteredLogs.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <Mail className="h-16 w-16 text-muted-foreground mb-4 opacity-50" />
              <p className="text-lg font-medium">
                {searchTerm ? "לא נמצאו תוצאות" : "אין עדיין היסטוריית תקשורת"}
              </p>
            </CardContent>
          </Card>
        ) : (
          filteredLogs.map((log) => {
            const isIncoming = log.type === "INCOMING_EMAIL";
            return (
              <Card 
                key={log.id} 
                className={`hover:shadow-md transition-shadow ${
                  isIncoming 
                    ? "border-blue-200 bg-blue-50/30 dark:bg-blue-950/10" 
                    : ""
                } ${isIncoming && !log.isRead ? "ring-2 ring-blue-400/50" : ""}`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3 flex-1">
                      <div className="mt-1">
                        {isIncoming ? (
                          <ArrowDownLeft className="h-4 w-4 text-blue-600" />
                        ) : (
                          getStatusIcon(log.status)
                        )}
                      </div>
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          {isIncoming && !log.isRead && (
                            <Badge className="bg-blue-600">חדש</Badge>
                          )}
                          <h3 className="font-semibold">{log.subject}</h3>
                          {isIncoming ? (
                            <Badge variant="outline" className="border-blue-500 text-blue-700 bg-blue-50">
                              <ArrowDownLeft className="h-3 w-3 ml-1" />
                              תשובה מהמטופל
                            </Badge>
                          ) : (
                            <>
                              {getStatusBadge(log.status)}
                              <Badge variant="outline">{getTypeLabel(log.type)}</Badge>
                            </>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground flex-wrap">
                          <div className="flex items-center gap-1">
                            {isIncoming ? <ArrowDownLeft className="h-3 w-3" /> : <Send className="h-3 w-3" />}
                            {isIncoming ? `מ-${log.client?.name || log.recipient}` : log.recipient}
                          </div>
                          {!isIncoming && log.client && (
                            <div className="flex items-center gap-1">
                              <User className="h-3 w-3" />
                              {log.client.name}
                            </div>
                          )}
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {log.sentAt
                              ? format(new Date(log.sentAt), "dd/MM/yyyy HH:mm", { locale: he })
                              : format(new Date(log.createdAt), "dd/MM/yyyy HH:mm", { locale: he })}
                          </div>
                        </div>
                        {isIncoming && (
                          <div className="text-sm text-foreground bg-white dark:bg-slate-900 p-3 rounded border mt-1">
                            <div dangerouslySetInnerHTML={{ __html: log.content.substring(0, 300) + (log.content.length > 300 ? "..." : "") }} />
                          </div>
                        )}
                        {log.errorMessage && (
                          <div className="text-sm text-red-600 bg-red-50 p-2 rounded">
                            שגיאה: {log.errorMessage}
                          </div>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedLog(log)}
                      className="gap-2"
                    >
                      <Eye className="h-4 w-4" />
                      צפה
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })
        )}
      </div>

      {/* View Details Dialog */}
      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>פרטי הודעה</DialogTitle>
            <DialogDescription>
              {selectedLog && format(new Date(selectedLog.createdAt), "dd MMMM yyyy, HH:mm", { locale: he })}
            </DialogDescription>
          </DialogHeader>
          {selectedLog && (
            <div className="space-y-4">
              {/* Direction banner */}
              {selectedLog.type === "INCOMING_EMAIL" ? (
                <div className="flex items-center gap-2 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200">
                  <ArrowDownLeft className="h-5 w-5 text-blue-600" />
                  <span className="font-medium text-blue-800 dark:text-blue-300">תשובה שהתקבלה מ-{selectedLog.client?.name || "מטופל"}</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 p-3 bg-green-50 dark:bg-green-950/30 rounded-lg border border-green-200">
                  <Send className="h-5 w-5 text-green-600" />
                  <span className="font-medium text-green-800 dark:text-green-300">הודעה שנשלחה ל-{selectedLog.client?.name || selectedLog.recipient}</span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-muted-foreground">סטטוס</div>
                  <div className="mt-1">{getStatusBadge(selectedLog.status)}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">סוג</div>
                  <div className="mt-1 font-medium">{getTypeLabel(selectedLog.type)}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">ערוץ</div>
                  <div className="mt-1 font-medium">{selectedLog.channel}</div>
                </div>
                <div>
                  <div className="text-sm text-muted-foreground">{selectedLog.type === "INCOMING_EMAIL" ? "מאת" : "נמען"}</div>
                  <div className="mt-1 font-medium">{selectedLog.recipient}</div>
                </div>
              </div>
              {selectedLog.client && (
                <div>
                  <div className="text-sm text-muted-foreground">מטופל</div>
                  <div className="mt-1 font-medium">{selectedLog.client.name}</div>
                </div>
              )}
              <div>
                <div className="text-sm text-muted-foreground">נושא</div>
                <div className="mt-1 font-semibold text-lg">{selectedLog.subject}</div>
              </div>
              <div>
                <div className="text-sm text-muted-foreground mb-2">תוכן</div>
                <div 
                  className="bg-slate-50 dark:bg-slate-900 p-4 rounded border whitespace-pre-wrap prose prose-sm max-w-none"
                  dangerouslySetInnerHTML={{ __html: selectedLog.content }}
                />
              </div>
              {selectedLog.errorMessage && (
                <div>
                  <div className="text-sm text-muted-foreground">הודעת שגיאה</div>
                  <div className="mt-1 text-red-600 bg-red-50 p-3 rounded">
                    {selectedLog.errorMessage}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
