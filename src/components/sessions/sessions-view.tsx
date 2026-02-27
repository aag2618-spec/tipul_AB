"use client";

import { useState, useMemo, useEffect } from "react";
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
  Wallet,
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
  const [cancelDialog, setCancelDialog] = useState<{
    open: boolean; sessionId: string; clientName: string;
    clientId: string; startTime: string; price: number;
  }>({
    open: false, sessionId: "", clientName: "", clientId: "", startTime: "", price: 0,
  });
  const [cancelReason, setCancelReason] = useState("");
  const [cancelling, setCancelling] = useState(false);
  const [cancelCharge, setCancelCharge] = useState<"ask" | "charge" | "free">("ask");

  const [updateDialog, setUpdateDialog] = useState<{
    open: boolean; sessionId: string; clientName: string; clientId: string; price: number;
  }>({ open: false, sessionId: "", clientName: "", clientId: "", price: 0 });
  const [updateStatus, setUpdateStatus] = useState<string>("");
  const [updateReason, setUpdateReason] = useState("");
  const [updating, setUpdating] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [showPayment, setShowPayment] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [paymentType, setPaymentType] = useState<"FULL" | "PARTIAL">("FULL");
  const [partialAmount, setPartialAmount] = useState("");
  const [noChargeReason, setNoChargeReason] = useState("");
  const [clientDebt, setClientDebt] = useState<{ total: number; count: number } | null>(null);

  const now = useMemo(() => new Date(), []);

  useEffect(() => {
    if (updateDialog.open && updateDialog.clientId) {
      fetch(`/api/payments/client-debt/${updateDialog.clientId}`)
        .then(res => res.json())
        .then(data => {
          setClientDebt({
            total: Number(data.totalDebt || 0),
            count: data.unpaidSessions?.length || 0,
          });
        })
        .catch(() => setClientDebt(null));
    } else {
      setClientDebt(null);
    }
  }, [updateDialog.open, updateDialog.clientId]);

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

  const isWithin24h = (startTime: string) => {
    const sessionTime = new Date(startTime).getTime();
    const nowTime = Date.now();
    return sessionTime - nowTime <= 24 * 60 * 60 * 1000;
  };

  const handleCancel = async (charge: boolean = false) => {
    setCancelling(true);
    try {
      const updates: Promise<Response>[] = [];

      updates.push(
        fetch(`/api/sessions/${cancelDialog.sessionId}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: "CANCELLED",
            cancellationReason: cancelReason.trim() || undefined,
          }),
        })
      );

      if (charge && cancelDialog.price > 0) {
        updates.push(
          fetch("/api/payments", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              clientId: cancelDialog.clientId,
              sessionId: cancelDialog.sessionId,
              amount: cancelDialog.price,
              expectedAmount: cancelDialog.price,
              paymentType: "FULL",
              method: "CASH",
              status: "PENDING",
            }),
          })
        );
      }

      const results = await Promise.all(updates);
      if (results[0].ok) {
        setSessions(prev =>
          prev.map(s =>
            s.id === cancelDialog.sessionId
              ? { ...s, status: "CANCELLED", cancellationReason: cancelReason.trim(), cancelledAt: new Date().toISOString() }
              : s
          )
        );
        toast.success(charge ? "הפגישה בוטלה - נוצר חיוב" : "הפגישה בוטלה ללא חיוב");
        setCancelDialog({ open: false, sessionId: "", clientName: "", clientId: "", startTime: "", price: 0 });
        setCancelReason("");
        setCancelCharge("ask");
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
      const updates: Promise<Response>[] = [];

      const statusBody: Record<string, unknown> = { status: updateStatus };
      if (updateStatus === "CANCELLED") {
        statusBody.cancellationReason = updateReason.trim() || undefined;
      }
      updates.push(
        fetch(`/api/sessions/${updateDialog.sessionId}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(statusBody),
        })
      );

      if (showPayment) {
        const amt = paymentType === "PARTIAL"
          ? parseFloat(partialAmount) || 0
          : parseFloat(paymentAmount) || 0;
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
                paymentType: paymentType === "PARTIAL" ? "PARTIAL" : "FULL",
                method: paymentMethod,
                status: "PAID",
              }),
            })
          );
        }
      }

      await Promise.all(updates);

      const newStatus = updateStatus;
      setSessions(prev => prev.map(s =>
        s.id === updateDialog.sessionId
          ? {
              ...s,
              status: newStatus,
              ...(newStatus === "CANCELLED" ? { cancellationReason: updateReason.trim(), cancelledAt: new Date().toISOString() } : {}),
            }
          : s
      ));

      const labels: Record<string, string> = {
        COMPLETED: "הפגישה עודכנה כהושלמה",
        CANCELLED: "הפגישה עודכנה כבוטלה",
        NO_SHOW: "הפגישה עודכנה כלא הגיע",
      };
      toast.success(labels[newStatus] || "הפגישה עודכנה");

      setUpdateDialog({ open: false, sessionId: "", clientName: "", clientId: "", price: 0 });
      setUpdateStatus("");
      setUpdateReason("");
      setPaymentAmount("");
      setShowPayment(true);
      setShowAdvanced(false);
      setPaymentType("FULL");
      setPartialAmount("");
      setNoChargeReason("");
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
              setCancelDialog({
                open: true, sessionId: s.id, clientName: s.client?.name || "",
                clientId: s.client?.id || "", startTime: s.startTime, price: s.price || 0,
              });
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
      <Dialog open={cancelDialog.open} onOpenChange={(o) => {
        if (!o) {
          setCancelDialog({ open: false, sessionId: "", clientName: "", clientId: "", startTime: "", price: 0 });
          setCancelReason("");
          setCancelCharge("ask");
        }
      }}>
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

            {isWithin24h(cancelDialog.startTime) && cancelDialog.price > 0 && cancelCharge === "ask" && (
              <div className="p-3 rounded-lg border bg-amber-50 border-amber-200">
                <p className="text-sm font-semibold text-amber-800 mb-2">
                  הפגישה תוך 24 שעות - האם לחייב דמי ביטול?
                </p>
                <p className="text-xs text-amber-700 mb-3">
                  סכום: ₪{cancelDialog.price}
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    className="flex-1 bg-amber-600 hover:bg-amber-700"
                    onClick={() => setCancelCharge("charge")}
                  >
                    כן, לחייב
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="flex-1"
                    onClick={() => setCancelCharge("free")}
                  >
                    לא, פטור
                  </Button>
                </div>
              </div>
            )}

            {cancelCharge === "charge" && (
              <div className="p-3 rounded-lg border bg-emerald-50 border-emerald-200">
                <p className="text-sm text-emerald-700">
                  ✓ ייווצר חיוב של ₪{cancelDialog.price} למטופל
                </p>
              </div>
            )}

            {cancelCharge === "free" && (
              <div className="p-3 rounded-lg border bg-sky-50 border-sky-200">
                <p className="text-sm text-sky-700">
                  ✓ הביטול יהיה ללא חיוב
                </p>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={() => {
                setCancelDialog({ open: false, sessionId: "", clientName: "", clientId: "", startTime: "", price: 0 });
                setCancelReason("");
                setCancelCharge("ask");
              }}
              disabled={cancelling}
            >
              חזרה
            </Button>
            <Button
              variant="destructive"
              onClick={() => handleCancel(cancelCharge === "charge")}
              disabled={cancelling || (isWithin24h(cancelDialog.startTime) && cancelDialog.price > 0 && cancelCharge === "ask")}
              className="bg-red-500 hover:bg-red-600"
            >
              {cancelling ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : <Ban className="h-4 w-4 ml-1" />}
              {cancelCharge === "charge" ? "בטל וחייב" : "בטל פגישה"}
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
          setShowPayment(true);
          setShowAdvanced(false);
          setPaymentType("FULL");
          setPartialAmount("");
          setNoChargeReason("");
        }
      }}>
        <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto" dir="rtl">
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
              <>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full font-bold text-base"
                  onClick={() => {
                    setShowPayment(false);
                  }}
                >
                  {updateStatus === "COMPLETED" ? "עדכון ללא תשלום" : updateStatus === "CANCELLED" ? "ביטול ללא חיוב" : "אי הגעה ללא חיוב"}
                </Button>

                {!showPayment && (
                  <div className="space-y-2 p-3 rounded-lg border bg-orange-50/50 border-orange-200">
                    <Label className="text-sm text-orange-700">סיבה לאי חיוב (אופציונלי)</Label>
                    <Textarea
                      value={noChargeReason}
                      onChange={e => setNoChargeReason(e.target.value)}
                      placeholder="לדוגמה: סיכום מראש, פגישת היכרות, הסדר מיוחד..."
                      className="resize-none h-16 bg-white/80 border-orange-200 text-sm"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-xs text-sky-600"
                      onClick={() => setShowPayment(true)}
                    >
                      ← חזרה לתשלום
                    </Button>
                  </div>
                )}

                {showPayment && (
                  <div className="space-y-3 p-4 rounded-lg border bg-muted/30">
                    <div className="flex items-center justify-between">
                      <Label className="text-lg font-bold">
                        {updateStatus === "COMPLETED" ? "עדכון ותשלום 💰" : updateStatus === "CANCELLED" ? "דמי ביטול 💰" : "חיוב אי הגעה 💰"}
                      </Label>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label htmlFor="update-amount">סכום</Label>
                        <div className="relative">
                          <Input
                            type="number"
                            value={paymentAmount}
                            onChange={e => setPaymentAmount(e.target.value)}
                            className="pl-8"
                            disabled={paymentType !== "FULL"}
                          />
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">₪</span>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="update-method">אמצעי תשלום</Label>
                        <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="CASH">מזומן</SelectItem>
                            <SelectItem value="CREDIT_CARD">אשראי</SelectItem>
                            <SelectItem value="BANK_TRANSFER">העברה</SelectItem>
                            <SelectItem value="CHECK">צ׳ק</SelectItem>
                            <SelectItem value="OTHER">אחר</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="w-full justify-between font-semibold"
                        onClick={() => setShowAdvanced(!showAdvanced)}
                      >
                        <span className="font-bold">אופציות מתקדמות</span>
                        {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </Button>
                      {showAdvanced && (
                        <div className="space-y-2 pt-2">
                          <div className="grid gap-2">
                            <Button
                              type="button"
                              variant={paymentType === "FULL" ? "default" : "outline"}
                              size="sm"
                              onClick={() => setPaymentType("FULL")}
                            >
                              תשלום מלא (₪{updateDialog.price})
                            </Button>
                            <Button
                              type="button"
                              variant={paymentType === "PARTIAL" ? "default" : "outline"}
                              size="sm"
                              onClick={() => setPaymentType("PARTIAL")}
                            >
                              תשלום חלקי
                            </Button>
                            {paymentType === "PARTIAL" && (
                              <div className="pr-4 space-y-1">
                                <Input
                                  type="number"
                                  placeholder="הכנס סכום"
                                  value={partialAmount}
                                  onChange={e => setPartialAmount(e.target.value)}
                                  max={updateDialog.price}
                                  min={0}
                                  step="0.01"
                                />
                                {partialAmount && parseFloat(partialAmount) < updateDialog.price && (
                                  <p className="text-xs text-muted-foreground">
                                    נותר לתשלום: ₪{updateDialog.price - parseFloat(partialAmount)}
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}

            {clientDebt && clientDebt.count > 1 && clientDebt.total > 0 && (
              <div className="pt-3 border-t mt-2">
                <p className="text-sm text-muted-foreground mb-2 text-center">
                  למטופל יש עוד {clientDebt.count - 1} פגישות ממתינות לתשלום
                  (סה״כ חוב: ₪{clientDebt.total.toFixed(0)})
                </p>
                <Button
                  variant="outline"
                  className="w-full gap-2"
                  asChild
                >
                  <Link href={`/dashboard/payments/pay/${updateDialog.clientId}`}>
                    <Wallet className="h-4 w-4" />
                    שלם את כל החוב
                  </Link>
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
                setShowPayment(true);
                setShowAdvanced(false);
                setPaymentType("FULL");
                setPartialAmount("");
                setNoChargeReason("");
              }}
              disabled={updating}
              className="font-medium"
            >
              ביטול
            </Button>
            {showPayment && updateDialog.price > 0 ? (
              <Button
                onClick={handleUpdate}
                disabled={updating || !updateStatus}
                className="gap-2 font-bold bg-green-600 hover:bg-green-700"
              >
                {updating ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {updateStatus === "COMPLETED" ? "עדכן ושלם" : updateStatus === "CANCELLED" ? "בטל וחייב" : updateStatus === "NO_SHOW" ? "עדכן וחייב" : "עדכן"}
              </Button>
            ) : (
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
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
