"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  Search,
  Headphones,
  MessageCircle,
  Clock,
  CheckCircle,
  AlertCircle,
  Inbox,
} from "lucide-react";
import { toast } from "sonner";
import Link from "next/link";

interface TicketUser {
  id: string;
  name: string | null;
  email: string | null;
  userNumber: number | null;
  aiTier: string;
}

interface Ticket {
  id: string;
  ticketNumber: number;
  subject: string;
  message: string;
  category: string;
  priority: string;
  status: string;
  createdAt: string;
  user: TicketUser;
  _count: { responses: number };
}

interface Stats {
  open: number;
  inProgress: number;
  resolved: number;
  closed: number;
  waiting: number;
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  OPEN: { label: "פתוח", color: "bg-blue-500" },
  IN_PROGRESS: { label: "בטיפול", color: "bg-yellow-500" },
  WAITING: { label: "ממתין למשתמש", color: "bg-orange-500" },
  RESOLVED: { label: "נפתר", color: "bg-green-500" },
  CLOSED: { label: "סגור", color: "bg-gray-500" },
};

const PRIORITY_MAP: Record<string, { label: string; color: string }> = {
  LOW: { label: "נמוך", color: "text-gray-500" },
  MEDIUM: { label: "בינוני", color: "text-yellow-600" },
  HIGH: { label: "גבוה", color: "text-orange-500" },
  URGENT: { label: "דחוף", color: "text-red-500" },
};

const CATEGORY_MAP: Record<string, string> = {
  general: "כללי",
  technical: "תמיכה טכנית",
  billing: "חשבון ותשלומים",
  other: "אחר",
};

export default function AdminSupportPage() {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [stats, setStats] = useState<Stats>({ open: 0, inProgress: 0, resolved: 0, closed: 0, waiting: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterCategory, setFilterCategory] = useState("all");

  useEffect(() => {
    fetchTickets();
  }, [filterStatus, filterCategory]);

  const fetchTickets = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus !== "all") params.set("status", filterStatus);
      if (filterCategory !== "all") params.set("category", filterCategory);
      if (search) params.set("search", search);

      const res = await fetch(`/api/admin/support?${params}`);
      if (res.ok) {
        const data = await res.json();
        setTickets(data.tickets);
        setStats(data.stats);
      }
    } catch {
      toast.error("שגיאה בטעינת פניות");
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    fetchTickets();
  };

  return (
    <div className="space-y-6 animate-fade-in">
      {/* כותרת */}
      <div>
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Headphones className="h-8 w-8 text-primary" />
          ניהול פניות ותמיכה
        </h1>
        <p className="text-muted-foreground mt-1">צפה ונהל את כל הפניות ממשתמשי המערכת</p>
      </div>

      {/* כרטיסי סטטיסטיקה */}
      <div className="grid gap-4 md:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">פתוחות</CardTitle>
            <Inbox className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.open}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">בטיפול</CardTitle>
            <Clock className="h-4 w-4 text-yellow-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.inProgress}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">ממתינות למשתמש</CardTitle>
            <AlertCircle className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.waiting}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">נפתרו</CardTitle>
            <CheckCircle className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.resolved}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">סגורות</CardTitle>
            <MessageCircle className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.closed}</div>
          </CardContent>
        </Card>
      </div>

      {/* חיפוש וסינון */}
      <Card>
        <CardContent className="pt-6">
          <div className="grid gap-3 md:grid-cols-4">
            <div className="relative md:col-span-2">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="חיפוש לפי נושא, #מספר פנייה, שם או #מספר משתמש..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSearch()}
                className="pr-10"
              />
            </div>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger><SelectValue placeholder="סטטוס" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">כל הסטטוסים</SelectItem>
                <SelectItem value="OPEN">פתוח</SelectItem>
                <SelectItem value="IN_PROGRESS">בטיפול</SelectItem>
                <SelectItem value="WAITING">ממתין למשתמש</SelectItem>
                <SelectItem value="RESOLVED">נפתר</SelectItem>
                <SelectItem value="CLOSED">סגור</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filterCategory} onValueChange={setFilterCategory}>
              <SelectTrigger><SelectValue placeholder="קטגוריה" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">כל הקטגוריות</SelectItem>
                <SelectItem value="general">כללי</SelectItem>
                <SelectItem value="technical">תמיכה טכנית</SelectItem>
                <SelectItem value="billing">חשבון ותשלומים</SelectItem>
                <SelectItem value="other">אחר</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* טבלת פניות */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{tickets.length} פניות</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : tickets.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Headphones className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>אין פניות</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-border">
                  <TableHead className="text-muted-foreground">מס׳ פנייה</TableHead>
                  <TableHead className="text-muted-foreground">משתמש</TableHead>
                  <TableHead className="text-muted-foreground">נושא</TableHead>
                  <TableHead className="text-muted-foreground">קטגוריה</TableHead>
                  <TableHead className="text-muted-foreground">עדיפות</TableHead>
                  <TableHead className="text-muted-foreground">סטטוס</TableHead>
                  <TableHead className="text-muted-foreground">תגובות</TableHead>
                  <TableHead className="text-muted-foreground">תאריך</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tickets.map((ticket) => {
                  const statusInfo = STATUS_MAP[ticket.status] || STATUS_MAP.OPEN;
                  const priorityInfo = PRIORITY_MAP[ticket.priority] || PRIORITY_MAP.MEDIUM;
                  return (
                    <TableRow key={ticket.id} className="border-border">
                      <TableCell>
                        <Link href={`/admin/support/${ticket.id}`} className="font-mono text-sm text-primary hover:underline">
                          #{ticket.ticketNumber}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium text-sm flex items-center gap-1">
                            {ticket.user.name || "ללא שם"}
                            {ticket.user.userNumber && (
                              <Badge variant="outline" className="font-mono text-xs bg-sky-500/10 text-sky-400 border-sky-500/30">
                                #{ticket.user.userNumber}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground">{ticket.user.email}</p>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Link href={`/admin/support/${ticket.id}`} className="text-sm hover:underline">
                          {ticket.subject}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {CATEGORY_MAP[ticket.category] || ticket.category}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span className={`text-sm font-medium ${priorityInfo.color}`}>
                          {priorityInfo.label}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Badge className={statusInfo.color}>
                          {statusInfo.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {ticket._count.responses}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(ticket.createdAt).toLocaleDateString("he-IL")}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
