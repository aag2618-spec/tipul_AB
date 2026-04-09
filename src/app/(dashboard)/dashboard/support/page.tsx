"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Loader2,
  Plus,
  MessageCircle,
  Clock,
  CheckCircle,
  Send,
  ChevronLeft,
  Headphones,
} from "lucide-react";
import { toast } from "sonner";

interface TicketResponse {
  id: string;
  message: string;
  isAdmin: boolean;
  createdAt: string;
  author: { name: string | null };
}

interface Ticket {
  id: string;
  ticketNumber: number;
  subject: string;
  message: string;
  category: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  responses: TicketResponse[];
  _count: { responses: number };
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  OPEN: { label: "פתוח", color: "bg-blue-500" },
  IN_PROGRESS: { label: "בטיפול", color: "bg-yellow-500" },
  WAITING: { label: "ממתין לתגובתך", color: "bg-orange-500" },
  RESOLVED: { label: "נפתר", color: "bg-green-500" },
  CLOSED: { label: "סגור", color: "bg-gray-500" },
};

const CATEGORY_MAP: Record<string, string> = {
  general: "כללי",
  technical: "תמיכה טכנית",
  billing: "חשבון ותשלומים",
  other: "אחר",
};

export default function SupportPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [replyText, setReplyText] = useState("");
  const [sending, setSending] = useState(false);

  // טופס פנייה חדשה
  const [newSubject, setNewSubject] = useState("");
  const [newMessage, setNewMessage] = useState("");
  const [newCategory, setNewCategory] = useState("general");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    fetchTickets();
  }, []);

  const fetchTickets = async () => {
    try {
      const res = await fetch("/api/support");
      if (res.ok) {
        const data = await res.json();
        setTickets(data.tickets);
      }
    } catch {
      toast.error("שגיאה בטעינת פניות");
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!newSubject.trim() || !newMessage.trim()) {
      toast.error("יש למלא נושא והודעה");
      return;
    }
    setCreating(true);
    try {
      const res = await fetch("/api/support", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: newSubject,
          message: newMessage,
          category: newCategory,
        }),
      });
      if (!res.ok) throw new Error("שגיאה");

      const data = await res.json();
      toast.success(`פנייה #${data.ticket.ticketNumber} נוצרה בהצלחה`);
      setNewDialogOpen(false);
      setNewSubject("");
      setNewMessage("");
      setNewCategory("general");
      fetchTickets();
    } catch {
      toast.error("שגיאה ביצירת פנייה");
    } finally {
      setCreating(false);
    }
  };

  const handleReply = async () => {
    if (!selectedTicket || !replyText.trim()) return;
    setSending(true);
    try {
      const res = await fetch(`/api/support/${selectedTicket.id}/responses`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: replyText }),
      });
      if (!res.ok) throw new Error("שגיאה");

      toast.success("התגובה נשלחה");
      setReplyText("");
      // רענון הפנייה
      const ticketRes = await fetch(`/api/support/${selectedTicket.id}`);
      if (ticketRes.ok) {
        const data = await ticketRes.json();
        setSelectedTicket(data.ticket);
        fetchTickets();
      }
    } catch {
      toast.error("שגיאה בשליחת תגובה");
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // תצוגת פנייה בודדת
  if (selectedTicket) {
    const statusInfo = STATUS_MAP[selectedTicket.status] || STATUS_MAP.OPEN;
    return (
      <div className="space-y-6 max-w-3xl mx-auto">
        <Button variant="ghost" onClick={() => setSelectedTicket(null)} className="text-muted-foreground">
          <ChevronLeft className="ml-1 h-4 w-4" />
          חזרה לרשימה
        </Button>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  פנייה #{selectedTicket.ticketNumber}
                  <Badge className={statusInfo.color}>{statusInfo.label}</Badge>
                </CardTitle>
                <CardDescription className="mt-1">
                  {CATEGORY_MAP[selectedTicket.category] || selectedTicket.category} | {new Date(selectedTicket.createdAt).toLocaleDateString("he-IL")}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <h3 className="font-semibold mb-1">{selectedTicket.subject}</h3>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{selectedTicket.message}</p>
            </div>

            {/* שרשור תגובות */}
            {selectedTicket.responses.length > 0 && (
              <div className="space-y-3 border-t pt-4">
                <h4 className="text-sm font-medium text-muted-foreground">תגובות</h4>
                {selectedTicket.responses.map((r) => (
                  <div
                    key={r.id}
                    className={`p-3 rounded-lg ${
                      r.isAdmin
                        ? "bg-primary/10 border border-primary/20 mr-8"
                        : "bg-muted ml-8"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-medium">
                        {r.isAdmin ? "צוות התמיכה" : r.author?.name || "את/ה"}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {new Date(r.createdAt).toLocaleString("he-IL")}
                      </span>
                    </div>
                    <p className="text-sm whitespace-pre-wrap">{r.message}</p>
                  </div>
                ))}
              </div>
            )}

            {/* תיבת תגובה */}
            {selectedTicket.status !== "CLOSED" && (
              <div className="border-t pt-4">
                <div className="flex gap-2">
                  <Textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    placeholder="כתוב תגובה..."
                    className="min-h-[80px]"
                  />
                </div>
                <div className="flex justify-end mt-2">
                  <Button onClick={handleReply} disabled={sending || !replyText.trim()} size="sm">
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="ml-1 h-4 w-4" />}
                    שלח
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // רשימת פניות
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Headphones className="h-8 w-8 text-primary" />
            פניות ותמיכה
          </h1>
          <p className="text-muted-foreground mt-1">שלח פנייה וקבל מענה מצוות התמיכה</p>
        </div>

        <Dialog open={newDialogOpen} onOpenChange={setNewDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="ml-2 h-4 w-4" />
              פנייה חדשה
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>פנייה חדשה</DialogTitle>
              <DialogDescription>שלח פנייה לצוות התמיכה</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>נושא</Label>
                <Input
                  value={newSubject}
                  onChange={(e) => setNewSubject(e.target.value)}
                  placeholder="תאר בקצרה את הנושא..."
                />
              </div>
              <div className="space-y-2">
                <Label>קטגוריה</Label>
                <Select value={newCategory} onValueChange={setNewCategory}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">כללי</SelectItem>
                    <SelectItem value="technical">תמיכה טכנית</SelectItem>
                    <SelectItem value="billing">חשבון ותשלומים</SelectItem>
                    <SelectItem value="other">אחר</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>הודעה</Label>
                <Textarea
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="תאר את הבעיה או הבקשה שלך..."
                  className="min-h-[120px]"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setNewDialogOpen(false)}>ביטול</Button>
              <Button onClick={handleCreate} disabled={creating}>
                {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "שלח פנייה"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {tickets.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <MessageCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-50" />
            <p className="text-muted-foreground">אין פניות עדיין</p>
            <p className="text-sm text-muted-foreground mt-1">לחץ על "פנייה חדשה" כדי ליצור פנייה ראשונה</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {tickets.map((ticket) => {
            const statusInfo = STATUS_MAP[ticket.status] || STATUS_MAP.OPEN;
            return (
              <Card
                key={ticket.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => setSelectedTicket(ticket)}
              >
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-xs text-muted-foreground">#{ticket.ticketNumber}</span>
                        <Badge className={statusInfo.color} variant="secondary">
                          {statusInfo.label}
                        </Badge>
                        <Badge variant="outline" className="text-xs">
                          {CATEGORY_MAP[ticket.category] || ticket.category}
                        </Badge>
                      </div>
                      <h3 className="font-medium truncate">{ticket.subject}</h3>
                      <p className="text-sm text-muted-foreground truncate mt-0.5">{ticket.message}</p>
                    </div>
                    <div className="text-left mr-4 shrink-0">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {new Date(ticket.createdAt).toLocaleDateString("he-IL")}
                      </div>
                      {ticket._count.responses > 0 && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1">
                          <MessageCircle className="h-3 w-3" />
                          {ticket._count.responses} תגובות
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
