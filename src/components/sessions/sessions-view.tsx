"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Search,
  X,
  Clock,
  CalendarDays,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { QuickMarkPaid } from "@/components/payments/quick-mark-paid";
import { toast } from "sonner";
import Link from "next/link";
import { SessionCard, type Session } from "./session-card";
import { CancelSessionDialog } from "./cancel-session-dialog";
import { SessionsUpdateDialog } from "./update-session-dialog";

interface SessionsViewProps {
  initialSessions: Session[];
}

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
  const router = useRouter();
  const [sessions, setSessions] = useState<Session[]>(initialSessions);
  const [searchTerm, setSearchTerm] = useState("");
  const [historySearch, setHistorySearch] = useState("");
  const [showOnlyConsultation, setShowOnlyConsultation] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
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
  const [cancelling, setCancelling] = useState(false);

  const [updateDialog, setUpdateDialog] = useState<{
    open: boolean; sessionId: string; clientName: string; clientId: string; price: number; existingPaymentId?: string;
  }>({ open: false, sessionId: "", clientName: "", clientId: "", price: 0 });
  const [updating, setUpdating] = useState(false);
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  const [paymentDialogData, setPaymentDialogData] = useState<{
    sessionId: string;
    clientId: string;
    clientName: string;
    amount: number;
    paymentId?: string;
    creditBalance: number;
  } | null>(null);

  const now = useMemo(() => new Date(), []);

  const searchFilter = (s: Session, term: string) => {
    if (!term.trim()) return true;
    return (s.client?.name ?? "").toLowerCase().includes(term.trim().toLowerCase());
  };

  const consultationFilter = (s: Session) => {
    if (!showOnlyConsultation) return true;
    return s.client?.isQuickClient === true;
  };

  const upcoming = useMemo(() => {
    return sessions
      .filter(s => (s.status === "SCHEDULED" || s.status === "PENDING_APPROVAL") && new Date(s.startTime) >= now)
      .filter(s => searchFilter(s, searchTerm))
      .filter(consultationFilter)
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  }, [sessions, searchTerm, showOnlyConsultation, now]);

  const history = useMemo(() => {
    return sessions
      .filter(s => (s.status !== "SCHEDULED" && s.status !== "PENDING_APPROVAL") || new Date(s.startTime) < now)
      .filter(s => searchFilter(s, historySearch))
      .filter(consultationFilter)
      .filter(s => {
        if (dateFrom && new Date(s.startTime) < new Date(dateFrom)) return false;
        if (dateTo) {
          const to = new Date(dateTo);
          to.setHours(23, 59, 59, 999);
          if (new Date(s.startTime) > to) return false;
        }
        return true;
      })
      .sort((a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime());
  }, [sessions, historySearch, showOnlyConsultation, dateFrom, dateTo, now]);

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

  const isWithinWeek = (dateStr: string) => {
    const d = new Date(dateStr);
    const weekEnd = new Date();
    weekEnd.setDate(weekEnd.getDate() + 7);
    return d < weekEnd;
  };

  const handleCancel = async (charge: boolean, reason: string) => {
    setCancelling(true);
    try {
      const updates: Promise<Response>[] = [];

      updates.push(
        fetch(`/api/sessions/${cancelDialog.sessionId}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: "CANCELLED",
            cancellationReason: reason.trim() || undefined,
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
              amount: 0,
              expectedAmount: cancelDialog.price,
              paymentType: "FULL",
              method: "CASH",
              status: "PENDING",
              issueReceipt: false,
            }),
          })
        );
      }

      const results = await Promise.all(updates);
      const failedResult = results.find(r => !r.ok);
      if (failedResult) {
        const errorData = await failedResult.json().catch(() => null);
        toast.error(errorData?.message || "שגיאה בביטול הפגישה");
      } else {
        setSessions(prev =>
          prev.map(s =>
            s.id === cancelDialog.sessionId
              ? { ...s, status: "CANCELLED", cancellationReason: reason.trim(), cancelledAt: new Date().toISOString() }
              : s
          )
        );
        toast.success(charge ? "הפגישה בוטלה - נוצר חיוב" : "הפגישה בוטלה ללא חיוב");
        setCancelDialog({ open: false, sessionId: "", clientName: "", clientId: "", startTime: "", price: 0 });
      }
    } catch {
      toast.error("שגיאה בביטול הפגישה");
    } finally {
      setCancelling(false);
    }
  };

  const handleUpdate = async (params: {
    updateStatus: string;
    showPayment: boolean;
    paymentMethod: string;
    paymentType: "FULL" | "PARTIAL";
    paymentAmount: string;
    partialAmount: string;
    issueReceipt: boolean;
    businessType: string;
    updateReason: string;
    noChargeReason: string;
  }) => {
    const { updateStatus, showPayment, paymentMethod, paymentType, paymentAmount, partialAmount, issueReceipt, businessType, updateReason, noChargeReason } = params;
    if (!updateStatus) { toast.error("בחר סטטוס"); return; }
    setUpdating(true);
    try {
      if (updateStatus === "COMPLETED" && showPayment && updateDialog.price > 0 && updateDialog.clientId) {
        const pmtAmount = paymentType === "PARTIAL"
          ? (parseFloat(partialAmount) || 0)
          : Number(updateDialog.price);

        if (paymentType === "PARTIAL" && (pmtAmount <= 0 || pmtAmount > updateDialog.price)) {
          toast.error("סכום חלקי לא תקין");
          setUpdating(false);
          return;
        }

        const paymentResponse = await fetch("/api/payments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientId: updateDialog.clientId,
            sessionId: updateDialog.sessionId,
            amount: pmtAmount,
            expectedAmount: Number(updateDialog.price),
            paymentType: paymentType === "PARTIAL" ? "PARTIAL" : "FULL",
            method: paymentMethod,
            status: paymentType === "PARTIAL" ? "PENDING" : "PAID",
            issueReceipt: businessType !== "NONE" && issueReceipt,
          }),
        });

        if (!paymentResponse.ok) {
          const errorData = await paymentResponse.json().catch(() => null);
          toast.error(errorData?.message || "שגיאה ביצירת התשלום");
          setUpdating(false);
          return;
        }

        const paymentResult = await paymentResponse.json();

        const sessionUpdateRes = await fetch(`/api/sessions/${updateDialog.sessionId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "COMPLETED" }),
        });

        if (!sessionUpdateRes.ok) {
          toast.success("התשלום בוצע");
          toast.error("שגיאה בעדכון סטטוס הפגישה - נסה לעדכן ידנית");
        } else {
          toast.success("הפגישה הושלמה והתשלום בוצע");
        }
        if (paymentResult?.receiptError) {
          toast.error(`שגיאה בהפקת קבלה: ${paymentResult.receiptError}`, { duration: 8000 });
        }
        setSessions(prev => prev.map(s =>
          s.id === updateDialog.sessionId ? { ...s, status: "COMPLETED" } : s
        ));
        setUpdateDialog({ open: false, sessionId: "", clientName: "", clientId: "", price: 0 });
        return;
      }

      const updates: Promise<Response>[] = [];

      const statusBody: Record<string, unknown> = { status: updateStatus };
      if (updateStatus === "CANCELLED" || updateStatus === "NO_SHOW") {
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
                status: paymentType === "PARTIAL" ? "PENDING" : "PAID",
                issueReceipt: businessType !== "NONE" && issueReceipt,
              }),
            })
          );
        }
      }

      const results = await Promise.all(updates);
      const failedResult = results.find(r => !r.ok);

      if (failedResult) {
        const errorData = await failedResult.json().catch(() => null);
        toast.error(errorData?.message || "שגיאה בעדכון הפגישה");
      } else {
        const newStatus = updateStatus;
        setSessions(prev => prev.map(s =>
          s.id === updateDialog.sessionId
            ? {
                ...s,
                status: newStatus,
                ...((newStatus === "CANCELLED" || newStatus === "NO_SHOW") ? { cancellationReason: updateReason.trim(), cancelledAt: new Date().toISOString() } : {}),
              }
            : s
        ));

        const labels: Record<string, string> = {
          COMPLETED: "הפגישה עודכנה כהושלמה",
          CANCELLED: "הפגישה עודכנה כבוטלה",
          NO_SHOW: "הפגישה עודכנה כאי הופעה",
        };
        toast.success(labels[newStatus] || "הפגישה עודכנה");

        // שמירת סיבת אי חיוב כהערה (כשבחרו ללא חיוב)
        if (!showPayment && noChargeReason?.trim()) {
          await fetch(`/api/sessions/${updateDialog.sessionId}/note`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ content: noChargeReason.trim() }),
          }).catch(() => {});
        }
      }

      setUpdateDialog({ open: false, sessionId: "", clientName: "", clientId: "", price: 0 });
    } catch {
      toast.error("שגיאה בעדכון הפגישה");
    } finally {
      setUpdating(false);
    }
  };

  const handleRecordDebt = async (params: {
    updateStatus: string;
    updateReason: string;
  }) => {
    setUpdating(true);
    try {
      const statusBody: Record<string, unknown> = { status: params.updateStatus, createPayment: true, markAsPaid: false };
      if (params.updateStatus === "CANCELLED") {
        statusBody.cancellationReason = params.updateReason.trim() || undefined;
      }
      const response = await fetch(`/api/sessions/${updateDialog.sessionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(statusBody),
      });
      if (response.ok) {
        toast.success("הפגישה עודכנה והחוב נרשם");
        setUpdateDialog({ open: false, sessionId: "", clientName: "", clientId: "", price: 0 });
        router.refresh();
      } else {
        toast.error("שגיאה בעדכון הפגישה");
      }
    } catch {
      toast.error("שגיאה בעדכון הפגישה");
    } finally {
      setUpdating(false);
    }
  };

  const handleApproveSession = async (s: Session) => {
    const res = await fetch(`/api/sessions/${s.id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "SCHEDULED" }),
    });
    if (res.ok) {
      toast.success("הפגישה אושרה!");
      setSessions(prev => prev.map(sess => sess.id === s.id ? { ...sess, status: "SCHEDULED" } : sess));
    } else {
      const errorData = await res.json().catch(() => null);
      toast.error(errorData?.message || "שגיאה באישור הפגישה");
    }
  };

  const handleRejectSession = async (s: Session) => {
    const res = await fetch(`/api/sessions/${s.id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "CANCELLED" }),
    });
    if (res.ok) {
      toast.success("הפגישה נדחתה");
      setSessions(prev => prev.map(sess => sess.id === s.id ? { ...sess, status: "CANCELLED" } : sess));
    } else {
      const errorData = await res.json().catch(() => null);
      toast.error(errorData?.message || "שגיאה בדחיית הפגישה");
    }
  };

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
                {items.map(s => (
                  <SessionCard
                    key={s.id}
                    session={s}
                    showCancel={showCancel}
                    now={now}
                    isWithinWeek={isWithinWeek}
                    onCancelClick={(sess) => {
                      setCancelDialog({
                        open: true, sessionId: sess.id, clientName: sess.client?.name || "",
                        clientId: sess.client?.id || "", startTime: sess.startTime, price: sess.price || 0,
                      });
                    }}
                    onUpdateClick={(sess) => {
                      setUpdateDialog({
                        open: true,
                        sessionId: sess.id,
                        clientName: sess.client?.name || "",
                        clientId: sess.client?.id || "",
                        price: sess.price || 0,
                        existingPaymentId: sess.payment?.id,
                      });
                    }}
                    onApprove={handleApproveSession}
                    onReject={handleRejectSession}
                  />
                ))}
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

        {/* סינון פגישות ייעוץ */}
        <div className="mt-3">
          <button
            onClick={() => setShowOnlyConsultation(!showOnlyConsultation)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
              showOnlyConsultation
                ? "bg-blue-100 text-blue-700 border-blue-300"
                : "bg-white text-muted-foreground border-muted hover:bg-muted/50"
            }`}
          >
            {showOnlyConsultation ? "✓ " : ""}פגישות ייעוץ בלבד
          </button>
        </div>

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
          <div className="flex items-center gap-3 mb-4 flex-wrap">
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
            <div className="flex items-center gap-2">
              <Input
                type="date"
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                className="h-9 w-full sm:w-[140px] bg-white border-muted-foreground/15 text-sm"
                placeholder="מתאריך"
              />
              <span className="text-muted-foreground/50 text-xs">—</span>
              <Input
                type="date"
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                className="h-9 w-full sm:w-[140px] bg-white border-muted-foreground/15 text-sm"
                placeholder="עד תאריך"
              />
              {(dateFrom || dateTo) && (
                <button onClick={() => { setDateFrom(""); setDateTo(""); }} className="text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
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
      <CancelSessionDialog
        open={cancelDialog.open}
        onOpenChange={(o) => {
          if (o) setCancelDialog(prev => ({ ...prev, open: true }));
        }}
        clientName={cancelDialog.clientName}
        startTime={cancelDialog.startTime}
        price={cancelDialog.price}
        cancelling={cancelling}
        onCancel={handleCancel}
        onClose={() => {
          setCancelDialog({ open: false, sessionId: "", clientName: "", clientId: "", startTime: "", price: 0 });
        }}
      />

      {/* Update Session Dialog */}
      <SessionsUpdateDialog
        open={updateDialog.open}
        sessionId={updateDialog.sessionId}
        clientName={updateDialog.clientName}
        clientId={updateDialog.clientId}
        price={updateDialog.price}
        existingPaymentId={updateDialog.existingPaymentId}
        updating={updating}
        onClose={() => {
          setUpdateDialog({ open: false, sessionId: "", clientName: "", clientId: "", price: 0 });
        }}
        onUpdate={handleUpdate}
        onRecordDebt={handleRecordDebt}
      />

      {paymentDialogData && (
        <QuickMarkPaid
          sessionId={paymentDialogData.sessionId}
          clientId={paymentDialogData.clientId}
          clientName={paymentDialogData.clientName}
          amount={paymentDialogData.amount}
          creditBalance={paymentDialogData.creditBalance}
          existingPayment={paymentDialogData.paymentId ? { id: paymentDialogData.paymentId, status: "PENDING" } : null}
          buttonText="תשלום"
          open={isPaymentDialogOpen}
          onOpenChange={(open) => {
            setIsPaymentDialogOpen(open);
            if (!open) {
              setPaymentDialogData(null);
            }
          }}
          hideButton={true}
        />
      )}
    </div>
  );
}
