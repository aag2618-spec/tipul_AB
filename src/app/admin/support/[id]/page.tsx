"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  ArrowRight,
  Send,
  User,
  Shield,
  Clock,
  MessageCircle,
  StickyNote,
} from "lucide-react";
import { toast } from "sonner";

interface TicketResponse {
  id: string;
  message: string;
  isAdmin: boolean;
  createdAt: string;
  author: { name: string | null; role: string };
}

interface TicketUser {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  userNumber: number | null;
  aiTier: string;
  subscriptionStatus: string;
}

interface Ticket {
  id: string;
  ticketNumber: number;
  subject: string;
  message: string;
  category: string;
  priority: string;
  status: string;
  adminNotes: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  user: TicketUser;
  responses: TicketResponse[];
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  OPEN: { label: "פתוח", color: "bg-blue-500" },
  IN_PROGRESS: { label: "בטיפול", color: "bg-yellow-500" },
  WAITING: { label: "ממתין למשתמש", color: "bg-orange-500" },
  RESOLVED: { label: "נפתר", color: "bg-green-500" },
  CLOSED: { label: "סגור", color: "bg-gray-500" },
};

const TIER_LABELS: Record<string, string> = {
  ESSENTIAL: "בסיסי",
  PRO: "מקצועי",
  ENTERPRISE: "ארגוני",
};

const CATEGORY_MAP: Record<string, string> = {
  general: "כללי",
  technical: "תמיכה טכנית",
  billing: "חשבון ותשלומים",
  other: "אחר",
};

export default function AdminTicketDetailPage() {
  const params = useParams();
  const router = useRouter();
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [loading, setLoading] = useState(true);
  const [replyText, setReplyText] = useState("");
  const [adminNotes, setAdminNotes] = useState("");
  const [sending, setSending] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);

  useEffect(() => {
    fetchTicket();
  }, [params.id]);

  const fetchTicket = async () => {
    try {
      const res = await fetch(`/api/admin/support/${params.id}`);
      if (res.ok) {
        const data = await res.json();
        setTicket(data.ticket);
        setAdminNotes(data.ticket.adminNotes || "");
      } else {
        toast.error("פנייה לא נמצאה");
        router.push("/admin/support");
      }
    } catch {
      toast.error("שגיאה");
    } finally {
      setLoading(false);
    }
  };

  const handleReply = async () => {
    if (!replyText.trim()) return;
    setSending(true);
    try {
      const res = await fetch(`/api/admin/support/${params.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: replyText }),
      });
      if (!res.ok) throw new Error("שגיאה");
      toast.success("התגובה נשלחה");
      setReplyText("");
      fetchTicket();
    } catch {
      toast.error("שגיאה בשליחה");
    } finally {
      setSending(false);
    }
  };

  const handleStatusChange = async (newStatus: string) => {
    setUpdatingStatus(true);
    try {
      const res = await fetch(`/api/admin/support/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error("שגיאה");
      toast.success("הסטטוס עודכן");
      fetchTicket();
    } catch {
      toast.error("שגיאה בעדכון");
    } finally {
      setUpdatingStatus(false);
    }
  };

  const handleSaveNotes = async () => {
    try {
      const res = await fetch(`/api/admin/support/${params.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminNotes }),
      });
      if (!res.ok) throw new Error("שגיאה");
      toast.success("ההערות נשמרו");
    } catch {
      toast.error("שגיאה בשמירה");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!ticket) return null;

  const statusInfo = STATUS_MAP[ticket.status] || STATUS_MAP.OPEN;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* כותרת */}
      <div className="flex items-center justify-between">
        <div>
          <Button variant="ghost" size="sm" onClick={() => router.push("/admin/support")} className="mb-2 text-muted-foreground">
            <ArrowRight className="ml-1 h-4 w-4" />
            חזרה לרשימה
          </Button>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            פנייה #{ticket.ticketNumber}
            <Badge className={statusInfo.color}>{statusInfo.label}</Badge>
          </h1>
          <p className="text-muted-foreground mt-1">
            {CATEGORY_MAP[ticket.category]} | נוצרה {new Date(ticket.createdAt).toLocaleString("he-IL")}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Select
            value={ticket.status}
            onValueChange={handleStatusChange}
            disabled={updatingStatus}
          >
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="OPEN">פתוח</SelectItem>
              <SelectItem value="IN_PROGRESS">בטיפול</SelectItem>
              <SelectItem value="WAITING">ממתין למשתמש</SelectItem>
              <SelectItem value="RESOLVED">נפתר</SelectItem>
              <SelectItem value="CLOSED">סגור</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* עמודה ראשית — שיחה */}
        <div className="lg:col-span-2 space-y-4">
          {/* ההודעה המקורית */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg">{ticket.subject}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm whitespace-pre-wrap">{ticket.message}</p>
            </CardContent>
          </Card>

          {/* שרשור תגובות */}
          {ticket.responses.length > 0 && (
            <div className="space-y-3">
              {ticket.responses.map((r) => (
                <div
                  key={r.id}
                  className={`p-4 rounded-lg border ${
                    r.isAdmin
                      ? "bg-primary/5 border-primary/20"
                      : "bg-muted border-border"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2 text-sm">
                      {r.isAdmin ? (
                        <Shield className="h-4 w-4 text-primary" />
                      ) : (
                        <User className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span className="font-medium">
                        {r.isAdmin ? `${r.author?.name || "אדמין"} (צוות)` : r.author?.name || "משתמש"}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(r.createdAt).toLocaleString("he-IL")}
                    </span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{r.message}</p>
                </div>
              ))}
            </div>
          )}

          {/* תיבת תגובה */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-1">
                <MessageCircle className="h-4 w-4" />
                תגובת אדמין
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                placeholder="כתוב תגובה למשתמש..."
                className="min-h-[100px] mb-3"
              />
              <div className="flex justify-end">
                <Button onClick={handleReply} disabled={sending || !replyText.trim()}>
                  {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="ml-1 h-4 w-4" />}
                  שלח תגובה
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* עמודה צדדית — פרטי משתמש + הערות */}
        <div className="space-y-4">
          {/* פרטי משתמש */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">פרטי הפונה</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-medium">{ticket.user.name || "ללא שם"}</span>
                {ticket.user.userNumber && (
                  <Badge variant="outline" className="font-mono text-xs bg-sky-500/10 text-sky-400 border-sky-500/30">
                    #{ticket.user.userNumber}
                  </Badge>
                )}
              </div>
              {ticket.user.email && (
                <p className="text-muted-foreground">{ticket.user.email}</p>
              )}
              {ticket.user.phone && (
                <p className="text-muted-foreground">{ticket.user.phone}</p>
              )}
              <div className="flex gap-2 pt-1">
                <Badge variant="outline">{TIER_LABELS[ticket.user.aiTier] || ticket.user.aiTier}</Badge>
              </div>
            </CardContent>
          </Card>

          {/* הערות פנימיות */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm flex items-center gap-1">
                <StickyNote className="h-4 w-4" />
                הערות פנימיות
              </CardTitle>
              <CardDescription className="text-xs">רק אדמין רואה</CardDescription>
            </CardHeader>
            <CardContent>
              <Textarea
                value={adminNotes}
                onChange={(e) => setAdminNotes(e.target.value)}
                placeholder="הערות פנימיות..."
                className="min-h-[80px] mb-2"
              />
              <Button variant="outline" size="sm" onClick={handleSaveNotes}>
                שמור הערות
              </Button>
            </CardContent>
          </Card>

          {/* מידע על הפנייה */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">פרטי הפנייה</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">תגובות</span>
                <span>{ticket.responses.length}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">נוצרה</span>
                <span>{new Date(ticket.createdAt).toLocaleDateString("he-IL")}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">עודכנה</span>
                <span>{new Date(ticket.updatedAt).toLocaleDateString("he-IL")}</span>
              </div>
              {ticket.resolvedAt && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">נפתרה</span>
                  <span>{new Date(ticket.resolvedAt).toLocaleDateString("he-IL")}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
