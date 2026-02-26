"use client";

import { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
  Search,
  X,
  Calendar as CalendarIcon,
  Clock,
  XCircle,
  Eye,
  CalendarDays,
  CheckCircle2,
  Ban,
  UserX,
  Loader2,
  ChevronDown,
  ChevronUp,
  AlertCircle,
} from "lucide-react";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { toast } from "sonner";
import Link from "next/link";

interface Session {
  id: string;
  startTime: string;
  endTime: string;
  status: string;
  type: string;
  price: number;
  cancellationReason?: string | null;
  cancelledAt?: string | null;
  client?: {
    id: string;
    name: string;
  } | null;
}

interface SessionsViewProps {
  initialSessions: Session[];
}

const STATUS_LABELS: Record<string, string> = {
  COMPLETED: "הושלמה",
  CANCELLED: "בוטלה",
  NO_SHOW: "לא הגיע",
  NOT_UPDATED: "לא עודכן",
};

const STATUS_COLORS: Record<string, string> = {
  COMPLETED: "bg-emerald-50 text-emerald-700 border-emerald-200",
  CANCELLED: "bg-red-50 text-red-600 border-red-200",
  NO_SHOW: "bg-amber-50 text-amber-700 border-amber-200",
  NOT_UPDATED: "bg-orange-50 text-orange-600 border-orange-300 cursor-pointer hover:bg-orange-100",
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  COMPLETED: <CheckCircle2 className="h-3 w-3" />,
  CANCELLED: <Ban className="h-3 w-3" />,
  NO_SHOW: <UserX className="h-3 w-3" />,
  NOT_UPDATED: <Clock className="h-3 w-3" />,
};

const UPCOMING_GROUPS = ["היום", "מחר", "השבוע", "החודש", "בהמשך"] as const;
const HISTORY_GROUPS = ["היום", "שבוע אחרון", "חודש אחרון", "ישנים"] as const;

function getUpcomingGroup(dateStr: string): string {
  const d = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const dayAfter = new Date(today);
  dayAfter.setDate(dayAfter.getDate() + 2);
  const weekEnd = new Date(today);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59);

  if (d >= today && d < tomorrow) return "היום";
  if (d >= tomorrow && d < dayAfter) return "מחר";
  if (d < weekEnd) return "השבוע";
  if (d <= monthEnd) return "החודש";
  return "בהמשך";
}

function getHistoryGroup(dateStr: string): string {
  const d = new Date(dateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const weekAgo = new Date(today);
  weekAgo.setDate(weekAgo.getDate() - 7);
  const monthAgo = new Date(today);
  monthAgo.setMonth(monthAgo.getMonth() - 1);

  if (d >= today && d < tomorrow) return "היום";
  if (d >= weekAgo) return "שבוע אחרון";
  if (d >= monthAgo) return "חודש אחרון";
  return "ישנים";
}

export function SessionsView({ initialSessions }: SessionsViewProps) {
  const [sessions, setSessions] = useState<Session[]>(initialSessions);
  const [searchTerm, setSearchTerm] = useState("");
  const [historySearch, setHistorySearch] = useState("");
  const [expandedUpcoming, setExpandedUpcoming] = useState<Record<string, boolean>>({
    "היום": true, "מחר": true, "השבוע": true, "החודש": true, "בהמשך": false,
  });
  const [expandedHistory, setExpandedHistory] = useState<Record<string, boolean>>({
    "היום": true, "שבוע אחרון": true, "חודש אחרון": false, "ישנים": false,
  });
  const [cancelDialog, setCancelDialog] = useState<{ open: boolean; sessionId: string; clientName: string }>({
    open: false, sessionId: "", clientName: "",
  });
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);

  const [updateDialog, setUpdateDialog] = useState<{
    open: boolean; sessionId: string; clientName: string; clientId: string; price: number;
  }>({ open: false, sessionId: "", clientName: "", clientId: "", price: 0 });
  const [updateStatus, setUpdateStatus] = useState<string>("");
  const [updateReason, setUpdateReason] = useState("");
  const [updating, setUpdating] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [paymentAmount, setPaymentAmount] = useState("");

  const now = useMemo(() => new Date(), []);

  const searchFilter = (s: Session, term: string) => {
    if (!term.trim()) return true;
    return s.client?.name.toLowerCase().includes(term.trim().toLowerCase()) ?? false;
  };

  const upcoming = useMemo(() => {
    return sessions
      .filter(s => s.status === "SCHEDULED" && new Date(s.startTime) >= now)
      .filter(s => searchFilter(s, searchTerm))
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  }, [sessions, searchTerm, now]);

  const history = useMemo(() => {
    return sessions
      .filter(s => s.status !== "SCHEDULED" || new Date(s.startTime) < now)
      .filter(s => searchFilter(s, historySearch))
      .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
  }, [sessions, historySearch, now]);

  const groupedUpcoming = useMemo(() => {
    const g: Record<string, Session[]> = {};
    for (const s of upcoming) {
      const group = getUpcomingGroup(s.startTime);
      if (!g[group]) g[group] = [];
      g[group].push(s);
    }
    return g;
  }, [upcoming]);

  const groupedHistory = useMemo(() => {
    const g: Record<string, Session[]> = {};
    for (const s of history) {
      const group = getHistoryGroup(s.startTime);
      if (!g[group]) g[group] = [];
      g[group].push(s);
    }
    return g;
  }, [history]);

  const handleCancel = async () => {
    setCancelling(true);
    try {
      const res = await fetch(`/api/sessions/${cancelDialog.sessionId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: "CANCELLED",
          cancellationReason: cancelReason.trim() || undefined,
        }),
      });
      if (res.ok) {
        setSessions(prev =>
          prev.map(s =>
            s.id === cancelDialog.sessionId
              ? { ...s, status: "CANCELLED", cancellationReason: cancelReason.trim(), cancelledAt: new Date().toISOString() }
              : s
          )
        );
        toast.success("הפגישה בוטלה בהצלחה");
        setCancelDialog({ open: false, sessionId: "", clientName: "" });
        setCancelReason("");
      } else {
        toast.error("שגיאה בביטול הפגישה");
      }
    } catch {
      toast.error("שגיאה בביטול הפגישה");
    } finally {
      setCancelling(false);
    }
  };

  const handleUpdate = async () => {
    if (!updateStatus) { toast.error("בחר סטטוס"); return; }
    setUpdating(true);
    try {
      if (updateStatus === "COMPLETED") {
        const updates: Promise<Response>[] = [];
        updates.push(
          fetch(`/api/sessions/${updateDialog.sessionId}/status`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "COMPLETED" }),
          })
        );
        const amt = parseFloat(paymentAmount);
        if (amt > 0) {
          updates.push(
            fetch("/api/payments", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                clientId: updateDialog.clientId,
                sessionId: updateDialog.sessionId,
                amount: amt,
                expectedAmount: updateDialog.price || amt,
                paymentType: "FULL",
                method: paymentMethod,
                status: "PAID",
              }),
            })
          );
        }
        await Promise.all(updates);
        setSessions(prev => prev.map(s =>
          s.id === updateDialog.sessionId ? { ...s, status: "COMPLETED" } : s
        ));
        toast.success("הפגישה עודכנה כהושלמה");
      } else if (updateStatus === "CANCELLED") {
        const res = await fetch(`/api/sessions/${updateDialog.sessionId}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "CANCELLED", cancellationReason: updateReason.trim() || undefined }),
        });
        if (res.ok) {
          setSessions(prev => prev.map(s =>
            s.id === updateDialog.sessionId
              ? { ...s, status: "CANCELLED", cancellationReason: updateReason.trim(), cancelledAt: new Date().toISOString() }
              : s
          ));
          toast.success("הפגישה עודכנה כבוטלה");
        }
      } else if (updateStatus === "NO_SHOW") {
        const res = await fetch(`/api/sessions/${updateDialog.sessionId}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "NO_SHOW" }),
        });
        if (res.ok) {
          setSessions(prev => prev.map(s =>
            s.id === updateDialog.sessionId ? { ...s, status: "NO_SHOW" } : s
          ));
          toast.success("הפגישה עודכנה כלא הגיע");
        }
      }
      setUpdateDialog({ open: false, sessionId: "", clientName: "", clientId: "", price: 0 });
      setUpdateStatus("");
      setUpdateReason("");
      setPaymentAmount("");
    } catch {
      toast.error("שגיאה בעדכון הפגישה");
    } finally {
      setUpdating(false);
    }
  };

  const isWithinWeek = (dateStr: string) => {
    const d = new Date(dateStr);
    const weekEnd = new Date();
    weekEnd.setDate(weekEnd.getDate() + 7);
    return d < weekEnd;
  };

  const renderSessionCard = (s: Session, showCancel: boolean) => (
    <div
      key={s.id}
      className="group relative bg-white rounded-xl border border-muted-foreground/8 p-4
        hover:shadow-md hover:-translate-y-0.5 transition-all duration-200
        flex flex-col justify-between min-h-[130px]"
    >
      <div>
        <div className="flex items-center justify-between mb-1">
          <p className="font-semibold text-[15px] truncate flex-1">{s.client?.name || "ללא מטופל"}</p>
          {!showCancel && s.status === "SCHEDULED" && new Date(s.startTime) < now ? (
            <Badge
              variant="outline"
              className={`text-[10px] px-1.5 py-0 h-5 font-normal gap-1 shrink-0 mr-2 ${STATUS_COLORS["NOT_UPDATED"]}`}
              onClick={(e) => {
                e.stopPropagation();
                setUpdateDialog({
                  open: true,
                  sessionId: s.id,
                  clientName: s.client?.name || "",
                  clientId: s.client?.id || "",
                  price: s.price || 0,
                });
                setPaymentAmount(s.price ? s.price.toString() : "");
              }}
            >
              {STATUS_ICONS["NOT_UPDATED"]}
              לא עודכן · עדכן
            </Badge>
          ) : !showCancel && s.status !== "SCHEDULED" ? (
            <Badge
              variant="outline"
              className={`text-[10px] px-1.5 py-0 h-5 font-normal gap-1 shrink-0 mr-2 ${STATUS_COLORS[s.status] || ""}`}
            >
              {STATUS_ICONS[s.status]}
              {STATUS_LABELS[s.status]}
            </Badge>
          ) : null}
        </div>
        <div className="flex items-center gap-1.5 text-muted-foreground/70">
          <CalendarIcon className="h-3.5 w-3.5 shrink-0" />
          <span className="text-sm">{format(new Date(s.startTime), "EEEE, d/M", { locale: he })}</span>
        </div>
        <div className="flex items-center gap-1.5 mt-0.5 text-muted-foreground/70">
          <Clock className="h-3.5 w-3.5 shrink-0" />
          <span className="text-sm">
            {format(new Date(s.startTime), "HH:mm")} - {format(new Date(s.endTime), "HH:mm")}
          </span>
        </div>
      </div>

      {s.cancellationReason && !showCancel && (
        <p className="text-xs text-muted-foreground/50 mt-2 pt-2 border-t border-muted-foreground/5 truncate">
          סיבה: {s.cancellationReason}
        </p>
      )}

      <div className="flex items-center gap-1.5 mt-3 pt-3 border-t border-muted-foreground/5">
        {(!showCancel || isWithinWeek(s.startTime)) && (
          <Button
            variant="outline"
            size="sm"
            className="flex-1 h-8 text-xs border-muted-foreground/10 hover:bg-muted/30"
            asChild
          >
            <Link href={`/dashboard/sessions/${s.id}`}>
              <Eye className="h-3 w-3 ml-1" />
              פרטים
            </Link>
          </Button>
        )}
        {showCancel && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-muted-foreground/60 hover:text-red-500 hover:bg-red-50/50"
            onClick={(e) => {
              e.stopPropagation();
              setCancelDialog({ open: true, sessionId: s.id, clientName: s.client?.name || "" });
            }}
          >
            <XCircle className="h-3.5 w-3.5 ml-1" />
            ביטול
          </Button>
        )}
      </div>
    </div>
  );

  const renderGroupedGrid = (
    groups: readonly string[],
    grouped: Record<string, Session[]>,
    expanded: Record<string, boolean>,
    setExpanded: React.Dispatch<React.SetStateAction<Record<string, boolean>>>,
    showCancel: boolean,
  ) => (
    <div className="space-y-4">
      {groups.map(groupName => {
        const items = grouped[groupName];
        if (!items || items.length === 0) return null;
        const isOpen = expanded[groupName] ?? false;

        return (
          <div key={groupName}>
            <button
              onClick={() => setExpanded(prev => ({ ...prev, [groupName]: !prev[groupName] }))}
              className="flex items-center gap-2 w-full text-right py-1.5 px-1 hover:bg-muted/20 rounded-lg transition-colors mb-2"
            >
              {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground/50" /> : <ChevronDown className="h-4 w-4 text-muted-foreground/50" />}
              <span className="font-medium text-sm">{groupName}</span>
              <Badge variant="outline" className="text-[11px] px-1.5 py-0 h-5 font-normal text-muted-foreground/60 border-muted-foreground/15">
                {items.length}
              </Badge>
            </button>
            {isOpen && (
              <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {items.map(s => renderSessionCard(s, showCancel))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-5 animate-fade-in">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">פגישות</h1>
        <p className="text-sm text-muted-foreground mt-0.5">ניהול פגישות מתוכננות והיסטוריה</p>
      </div>

      <Tabs defaultValue="upcoming" dir="rtl">
        <TabsList className="bg-muted/40 p-1 h-auto">
          <TabsTrigger value="upcoming" className="gap-2 px-4 py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <CalendarDays className="h-4 w-4" />
            קרובות
            {upcoming.length > 0 && (
              <Badge variant="secondary" className="mr-1 text-xs px-1.5 py-0 h-5 min-w-5 justify-center">
                {upcoming.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="history" className="gap-2 px-4 py-2 data-[state=active]:bg-white data-[state=active]:shadow-sm">
            <Clock className="h-4 w-4" />
            היסטוריה
          </TabsTrigger>
        </TabsList>

        {/* Upcoming */}
        <TabsContent value="upcoming" className="mt-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
              <Input
                placeholder="חפש מטופל..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pr-9 bg-white border-muted-foreground/15 focus-visible:ring-primary/20"
              />
              {searchTerm && (
                <button onClick={() => setSearchTerm("")} className="absolute left-3 top-1/2 -translate-y-1/2">
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              )}
            </div>
          </div>

          {upcoming.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-16 h-16 rounded-full bg-primary/5 flex items-center justify-center mx-auto mb-4">
                <CalendarDays className="h-7 w-7 text-primary/40" />
              </div>
              <p className="text-muted-foreground">{searchTerm ? "לא נמצאו תוצאות" : "אין פגישות קרובות"}</p>
              {!searchTerm && (
                <Button variant="link" asChild className="mt-1 text-primary/70">
                  <Link href="/dashboard/calendar">קבע פגישה חדשה</Link>
                </Button>
              )}
            </div>
          ) : (
            renderGroupedGrid(UPCOMING_GROUPS, groupedUpcoming, expandedUpcoming, setExpandedUpcoming, true)
          )}
        </TabsContent>

        {/* History */}
        <TabsContent value="history" className="mt-4">
          <div className="flex items-center gap-3 mb-4">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground/60" />
              <Input
                placeholder="חפש מטופל..."
                value={historySearch}
                onChange={e => setHistorySearch(e.target.value)}
                className="pr-9 bg-white border-muted-foreground/15 focus-visible:ring-primary/20"
              />
              {historySearch && (
                <button onClick={() => setHistorySearch("")} className="absolute left-3 top-1/2 -translate-y-1/2">
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
              )}
            </div>
          </div>

          {history.length === 0 ? (
            <div className="text-center py-16">
              <div className="w-16 h-16 rounded-full bg-muted/30 flex items-center justify-center mx-auto mb-4">
                <Clock className="h-7 w-7 text-muted-foreground/30" />
              </div>
              <p className="text-muted-foreground">{historySearch ? "לא נמצאו תוצאות" : "אין היסטוריה עדיין"}</p>
            </div>
          ) : (
            renderGroupedGrid(HISTORY_GROUPS, groupedHistory, expandedHistory, setExpandedHistory, false)
          )}
        </TabsContent>
      </Tabs>

      {/* Cancel Dialog */}
      <Dialog open={cancelDialog.open} onOpenChange={(o) => { if (!o) { setCancelDialog({ open: false, sessionId: "", clientName: "" }); setCancelReason(""); } }}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle>ביטול פגישה</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {cancelDialog.clientName && (
              <p className="text-sm text-muted-foreground">
                האם לבטל את הפגישה עם <span className="font-medium text-foreground">{cancelDialog.clientName}</span>?
              </p>
            )}
            <div>
              <label className="text-sm font-medium mb-1.5 block">סיבת ביטול (אופציונלי)</label>
              <Textarea
                value={cancelReason}
                onChange={e => setCancelReason(e.target.value)}
                placeholder="לדוגמה: מחלה, בקשת מטופל..."
                className="resize-none h-20 bg-muted/20 border-muted-foreground/10"
              />
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => { setCancelDialog({ open: false, sessionId: "", clientName: "" }); setCancelReason(""); }}
              disabled={cancelling}
            >
              חזרה
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancel}
              disabled={cancelling}
              className="bg-red-500 hover:bg-red-600"
            >
              {cancelling ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : <Ban className="h-4 w-4 ml-1" />}
              בטל פגישה
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Update Session Dialog */}
      <Dialog open={updateDialog.open} onOpenChange={(o) => {
        if (!o) {
          setUpdateDialog({ open: false, sessionId: "", clientName: "", clientId: "", price: 0 });
          setUpdateStatus("");
          setUpdateReason("");
          setPaymentAmount("");
        }
      }}>
        <DialogContent className="sm:max-w-md" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-orange-500" />
              עדכון פגישה - {updateDialog.clientName}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">הפגישה לא עודכנה. מה קרה?</p>

            <div className="grid grid-cols-3 gap-2">
              <Button
                type="button"
                variant={updateStatus === "COMPLETED" ? "default" : "outline"}
                size="sm"
                className={`h-10 text-xs gap-1 ${updateStatus === "COMPLETED" ? "bg-emerald-600 hover:bg-emerald-700" : ""}`}
                onClick={() => setUpdateStatus("COMPLETED")}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                הושלמה
              </Button>
              <Button
                type="button"
                variant={updateStatus === "CANCELLED" ? "default" : "outline"}
                size="sm"
                className={`h-10 text-xs gap-1 ${updateStatus === "CANCELLED" ? "bg-red-500 hover:bg-red-600" : ""}`}
                onClick={() => setUpdateStatus("CANCELLED")}
              >
                <Ban className="h-3.5 w-3.5" />
                בוטלה
              </Button>
              <Button
                type="button"
                variant={updateStatus === "NO_SHOW" ? "default" : "outline"}
                size="sm"
                className={`h-10 text-xs gap-1 ${updateStatus === "NO_SHOW" ? "bg-amber-500 hover:bg-amber-600" : ""}`}
                onClick={() => setUpdateStatus("NO_SHOW")}
              >
                <UserX className="h-3.5 w-3.5" />
                לא הגיע
              </Button>
            </div>

            {updateStatus === "CANCELLED" && (
              <div className="space-y-2">
                <Label className="text-sm">סיבת ביטול (אופציונלי)</Label>
                <Textarea
                  value={updateReason}
                  onChange={e => setUpdateReason(e.target.value)}
                  placeholder="לדוגמה: מחלה, בקשת מטופל..."
                  className="resize-none h-16 bg-muted/20 border-muted-foreground/10 text-sm"
                />
              </div>
            )}

            {updateStatus && updateDialog.price > 0 && (
              <div className="space-y-3 p-3 rounded-lg border bg-muted/20 border-muted-foreground/10">
                <Label className="text-sm font-semibold">
                  {updateStatus === "COMPLETED" ? "תשלום" : updateStatus === "CANCELLED" ? "דמי ביטול" : "חיוב אי הגעה"}
                </Label>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">סכום</Label>
                    <div className="relative">
                      <Input
                        type="number"
                        value={paymentAmount}
                        onChange={e => setPaymentAmount(e.target.value)}
                        className="pl-8 h-9 text-sm"
                      />
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">₪</span>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">אמצעי</Label>
                    <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                      <SelectTrigger className="h-9 text-sm">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="CASH">מזומן</SelectItem>
                        <SelectItem value="CREDIT_CARD">אשראי</SelectItem>
                        <SelectItem value="BANK_TRANSFER">העברה</SelectItem>
                        <SelectItem value="CHECK">צ׳ק</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground h-7 px-2"
                  onClick={() => setPaymentAmount("0")}
                >
                  ללא תשלום
                </Button>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setUpdateDialog({ open: false, sessionId: "", clientName: "", clientId: "", price: 0 });
                setUpdateStatus("");
                setUpdateReason("");
                setPaymentAmount("");
              }}
              disabled={updating}
            >
              ביטול
            </Button>
            <Button
              onClick={handleUpdate}
              disabled={updating || !updateStatus}
              className={
                updateStatus === "COMPLETED" ? "bg-emerald-600 hover:bg-emerald-700" :
                updateStatus === "CANCELLED" ? "bg-red-500 hover:bg-red-600" :
                updateStatus === "NO_SHOW" ? "bg-amber-500 hover:bg-amber-600" : ""
              }
            >
              {updating ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : null}
              עדכן
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
