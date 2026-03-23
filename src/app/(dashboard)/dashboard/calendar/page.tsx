"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";






import { Plus, Loader2, Repeat, Waves, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import type { EventClickArg, DatesSetArg } from "@fullcalendar/core";
import type { DateClickArg } from "@fullcalendar/interaction";
import { QuickMarkPaid } from "@/components/payments/quick-mark-paid";

import type { SessionOverlap } from "@/types";
import { CalendarOverlapsDialog } from "@/components/calendar/calendar-overlaps-dialog";
import { UpdateSessionDialog, type UpdateSessionDialogParams } from "@/components/update-session-dialog";
import { useCalendarData, type CalendarClient, type CalendarSession, type RecurringPattern } from "@/hooks/use-calendar-data";
import { getEventColors } from "@/lib/calendar/event-colors";
import { NewSessionDialog, DEFAULT_FORM_DATA, type SessionFormData, type RecurringPreviewItem, type PendingFormRecurring } from "@/components/calendar/new-session-dialog";
import { RecurringPatternDialog } from "@/components/calendar/recurring-pattern-dialog";
import { SessionDetailDialog, type PaymentRequest } from "@/components/calendar/session-detail-dialog";

// Dynamic import for FullCalendar to avoid SSR issues
const FullCalendar = dynamic(
  () => import("@fullcalendar/react").then((mod) => mod.default),
  { ssr: false, loading: () => <div className="h-[600px] flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div> }
);

import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";

interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  backgroundColor: string;
  textColor: string;
  borderColor: string;
  classNames?: string[];
  extendedProps: {
    clientId: string;
    status: string;
    type: string;
  };
}

// TIME_SLOTS and DAYS_OF_WEEK moved to recurring-pattern-dialog.tsx

export default function CalendarPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const viewParam = searchParams.get('view');
  const dateParam = searchParams.get('date');
  const timeParam = searchParams.get('time');
  const highlightParam = searchParams.get('highlight');
  const initialCalendarView = viewParam === 'month' ? 'dayGridMonth' : 'timeGridWeek';
  const initialDate = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam) ? dateParam : undefined;

  const scrollTime = (() => {
    if (timeParam && /^\d{1,2}:\d{2}$/.test(timeParam)) {
      const [h] = timeParam.split(":").map(Number);
      const scrollH = Math.max(0, h - 1);
      return `${String(scrollH).padStart(2, "0")}:00:00`;
    }
    return "07:00:00";
  })();

  const {
    sessions,
    setSessions,
    clients,
    recurringPatterns,
    isLoading,
    defaultSessionDuration,
    fetchData,
    checkOverlaps,
    overlaps,
    setOverlaps,
    setDateRange,
  } = useCalendarData();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isRecurringDialogOpen, setIsRecurringDialogOpen] = useState(false);
  const [isSessionDialogOpen, setIsSessionDialogOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<CalendarSession | null>(null);
  const [isChargeDialogOpen, setIsChargeDialogOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<"CANCELLED" | "NO_SHOW" | null>(null);

  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  const [paymentData, setPaymentData] = useState<{
    sessionId: string;
    clientId: string;
    amount: number;
    paymentId?: string;
    pendingSessionStatus?: string;
  } | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [initialFormData, setInitialFormData] = useState<SessionFormData>(DEFAULT_FORM_DATA);
  // isSubmitting is no longer needed here - moved to dialog components
  const [showOverlapsDialog, setShowOverlapsDialog] = useState(false);
  const [deletingOverlap, setDeletingOverlap] = useState<string | null>(null);
  const [applyPreview, setApplyPreview] = useState<{
    key: string;
    date: string;
    time: string;
    clientName: string;
    clientId: string;
    patternId: string;
    status: "ok" | "conflict";
    conflictWith?: { id: string; clientName: string; startTime: string; endTime: string };
  }[] | null>(null);
  const [conflictDecisions, setConflictDecisions] = useState<Record<string, "skip" | "replace" | "create">>({});
  // previewWeeksAhead moved to RecurringPatternDialog
  const [pendingFormRecurring, setPendingFormRecurring] = useState<{
    clientId: string;
    type: string;
    price: string;
    sessions: Array<{ startTime: string; endTime: string }>;
  } | null>(null);

  useEffect(() => {
    if (!timeParam && !highlightParam) return;

    const timer = setTimeout(() => {
      if (highlightParam) {
        const el = document.querySelector('.fc-event-highlighted');
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return;
        }
      }
      if (timeParam) {
        const [h, m] = timeParam.split(':').map(Number);
        const timeStr = `${String(h).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}:00`;
        const slot = document.querySelector(`[data-time="${timeStr}"]`);
        if (slot) {
          slot.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    }, 600);

    return () => clearTimeout(timer);
  }, [timeParam, highlightParam]);

  // recurringFormData duration sync moved to RecurringPatternDialog

  // הצג פגישות מבוטלות שכבר עברו, הסתר מבוטלות עתידיות
  const events: CalendarEvent[] = sessions
    .filter((session) => {
      if (session.status !== "CANCELLED") return true;
      return new Date(session.endTime) < new Date();
    })
    .map((session) => {
      const colors = getEventColors(session);
      return {
        id: session.id,
        title: session.type === "BREAK" ? "🌊 הפסקה" : (session.client?.name || "ללא שם"),
        start: new Date(session.startTime),
        end: new Date(session.endTime),
        backgroundColor: colors.bg,
        textColor: colors.text,
        borderColor: colors.border,
        classNames: [
          ...(session.status === "PENDING_APPROVAL" ? ["fc-event-pending-pulse"] : []),
          ...(highlightParam === session.id ? ["fc-event-highlighted"] : []),
        ],
        extendedProps: {
          clientId: session.client?.id || "",
          status: session.status,
          type: session.type,
        },
      };
    });

  // Update date range when calendar view changes (month/week navigation)
  const handleDatesSet = useCallback((info: DatesSetArg) => {
    const start = info.start.toISOString().split("T")[0] + "T00:00";
    const end = info.end.toISOString().split("T")[0] + "T23:59";
    setDateRange(prev => {
      if (prev && prev.start === start && prev.end === end) return prev;
      return { start, end };
    });
  }, [setDateRange]);

  const handleDateClick = (info: DateClickArg) => {
    // אם בתצוגת חודש, עבור לתצוגת שבוע של אותו תאריך
    if (info.view.type === 'dayGridMonth') {
      info.view.calendar.changeView('timeGridWeek', info.date);
      return;
    }
    
    // אחרת, פתח את דיאלוג יצירת פגישה חדשה
    setSelectedDate(info.date);
    // השתמש בזמן המדויק שנלחץ (כולל דקות)
    const clickedTime = info.date;
    const dateStr = format(clickedTime, "yyyy-MM-dd");
    const timeStr = format(clickedTime, "HH:mm");
    const endTime = new Date(clickedTime);
    endTime.setMinutes(endTime.getMinutes() + defaultSessionDuration);
    
    setInitialFormData({
      clientId: "",
      startTime: `${dateStr}T${timeStr}`,
      endTime: `${dateStr}T${format(endTime, "HH:mm")}`,
      type: "IN_PERSON",
      price: "",
      isRecurring: false,
      weeksToRepeat: 4,
    });
    setIsDialogOpen(true);
  };

  const handleEventClick = (info: EventClickArg) => {
    const session = sessions.find(s => s.id === info.event.id);
    if (session) {
      const isPast = new Date(session.startTime) < new Date();
      if (isPast && session.status === "SCHEDULED" && session.type !== "BREAK") {
        setSelectedSession(session);
        setUpdateDialogOpen(true);
      } else {
        setSelectedSession(session);
        setIsSessionDialogOpen(true);
      }
    }
  };

  const handleCalendarUpdate = async (params: UpdateSessionDialogParams) => {
    if (!selectedSession) return;
    const { updateStatus, showPayment, paymentMethod, paymentType, paymentAmount, partialAmount, issueReceipt, businessType, updateReason } = params;
    setUpdating(true);
    try {
      if (updateStatus === "COMPLETED" && showPayment && selectedSession.price > 0 && selectedSession.client) {
        const pmtAmount = paymentType === "PARTIAL"
          ? (parseFloat(partialAmount) || 0)
          : Number(selectedSession.price);
        if (paymentType === "PARTIAL" && (pmtAmount <= 0 || pmtAmount > selectedSession.price)) {
          toast.error("סכום חלקי לא תקין");
          setUpdating(false);
          return;
        }
        const paymentResponse = await fetch("/api/payments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientId: selectedSession.client.id,
            sessionId: selectedSession.id,
            amount: pmtAmount,
            expectedAmount: Number(selectedSession.price),
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
        const sessionUpdateRes = await fetch(`/api/sessions/${selectedSession.id}`, {
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
        setUpdateDialogOpen(false);
        setSelectedSession(null);
        fetchData();
        return;
      }
      const updates: Promise<Response>[] = [];
      const statusBody: Record<string, unknown> = { status: updateStatus };
      if (updateStatus === "CANCELLED") statusBody.cancellationReason = updateReason.trim() || undefined;
      updates.push(
        fetch(`/api/sessions/${selectedSession.id}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(statusBody),
        })
      );
      if (showPayment && selectedSession.price > 0) {
        const amt = paymentType === "PARTIAL"
          ? parseFloat(partialAmount) || 0
          : parseFloat(paymentAmount) || 0;
        if (amt > 0) {
          updates.push(
            fetch("/api/payments", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                clientId: selectedSession.client?.id,
                sessionId: selectedSession.id,
                amount: amt,
                expectedAmount: selectedSession.price || amt,
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
        const labels: Record<string, string> = {
          COMPLETED: "הפגישה עודכנה כהושלמה",
          CANCELLED: "הפגישה עודכנה כבוטלה",
          NO_SHOW: "הפגישה עודכנה כלא הגיע",
        };
        toast.success(labels[updateStatus] || "הפגישה עודכנה");
      }
      setUpdateDialogOpen(false);
      setSelectedSession(null);
      fetchData();
    } catch {
      toast.error("שגיאה בעדכון הפגישה");
    } finally {
      setUpdating(false);
    }
  };

  const handleCalendarRecordDebt = async (params: { updateStatus: string; updateReason: string }) => {
    if (!selectedSession?.client) return;
    const clientId = selectedSession.client.id;
    setUpdating(true);
    try {
      const statusBody: Record<string, unknown> = { status: params.updateStatus, createPayment: true, markAsPaid: false };
      if (params.updateStatus === "CANCELLED") statusBody.cancellationReason = params.updateReason.trim() || undefined;
      const response = await fetch(`/api/sessions/${selectedSession.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(statusBody),
      });
      if (response.ok) {
        toast.success("הפגישה עודכנה והחוב נרשם");
        setUpdateDialogOpen(false);
        setSelectedSession(null);
        fetchData();
      } else {
        const errorData = await response.json().catch(() => null);
        toast.error(errorData?.message || "שגיאה בעדכון הפגישה");
      }
    } catch {
      toast.error("שגיאה בעדכון הפגישה");
    } finally {
      setUpdating(false);
    }
  };

  // פתיחת דיאלוג פגישה חדשה מיד אחרי פגישה קיימת
  const handleAddSessionAfter = (session: CalendarSession) => {
    const endTime = new Date(session.endTime);
    const dateStr = format(endTime, "yyyy-MM-dd");
    const timeStr = format(endTime, "HH:mm");
    const newEndTime = new Date(endTime);
    newEndTime.setMinutes(newEndTime.getMinutes() + defaultSessionDuration);
    
    setInitialFormData({
      clientId: session.client?.id || "",
      startTime: `${dateStr}T${timeStr}`,
      endTime: `${dateStr}T${format(newEndTime, "HH:mm")}`,
      type: session.type,
      price: session.client?.defaultSessionPrice?.toString() || "",
      isRecurring: false,
      weeksToRepeat: 4,
    });
    setIsDialogOpen(true);
  };

  // Custom event content with "+" button
  const renderEventContent = (eventInfo: any) => {
    const session = sessions.find(s => s.id === eventInfo.event.id);
    if (!session) return null;

    const isBreak = session.type === "BREAK";

    if (isBreak) {
      return (
        <div className="relative w-full h-full overflow-hidden group break-event-card">
          {/* Mountain-to-River Gradient Background */}
          <div className="absolute inset-0 bg-gradient-to-b from-amber-800/70 via-emerald-600/60 to-cyan-400/80 opacity-90"></div>
          
          {/* Mountains and Trees - Top */}
          <div className="absolute top-1 left-0 right-0 z-10 flex justify-around px-2 text-xs opacity-70">
            <span>🏔️</span>
            <span>🌲</span>
            <span>🌲</span>
            <span>🏔️</span>
          </div>
          
          {/* Content */}
          <div className="relative z-20 flex items-center justify-between w-full h-full px-2 py-1">
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <div className="font-bold text-sm text-white drop-shadow-md">🌊 הפסקה</div>
              <div className="text-xs text-white/90 drop-shadow">{eventInfo.timeText}</div>
              <div className="text-xs text-white/80 mt-1 italic font-light">זמן לנשום...</div>
            </div>
            
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleAddSessionAfter(session);
              }}
              className="relative z-30 opacity-0 group-hover:opacity-100 bg-white hover:bg-green-50 text-green-600 rounded-full w-6 h-6 flex items-center justify-center text-lg font-bold shadow-sm"
              title="הוסף פגישה מיד אחרי"
            >
              +
            </button>
          </div>

          {/* Waves - static, no animation */}
          <div className="absolute bottom-0 left-0 right-0 h-6 z-10">
            <div className="text-sm opacity-60">
              🌊 🌊 🌊 🌊 🌊 🌊
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="flex items-center justify-between w-full px-1 group">
        <div className="flex-1 overflow-hidden">
          <div className="font-semibold text-xs truncate">{eventInfo.event.title}</div>
          <div className="text-xs opacity-90">{eventInfo.timeText}</div>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            handleAddSessionAfter(session);
          }}
          className="opacity-0 group-hover:opacity-100 transition-opacity bg-white hover:bg-green-50 text-green-600 rounded-full w-6 h-6 flex items-center justify-center text-lg font-bold shadow-sm ml-1"
          title="הוסף פגישה מיד אחרי"
        >
          +
        </button>
      </div>
    );
  };

  // handleDeleteSession moved to SessionDetailDialog

  if (isLoading) {
    return (
      <div className="h-[calc(100vh-200px)] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">יומן פגישות</h1>
          <p className="text-muted-foreground">
            ניהול הפגישות והזמנים שלך
          </p>
        </div>
        <div className="flex gap-2">
          {overlaps.length > 0 && (
            <Button variant="outline" className="text-amber-600 border-amber-300 hover:bg-amber-50" onClick={() => setShowOverlapsDialog(true)}>
              <AlertTriangle className="ml-2 h-4 w-4" />
              {overlaps.length} חפיפות
            </Button>
          )}
          <Button variant="outline" onClick={() => setIsRecurringDialogOpen(true)}>
            <Repeat className="ml-2 h-4 w-4" />
            תבנית שבועית
          </Button>
          <Button onClick={() => {
            setSelectedDate(new Date());
            setInitialFormData(DEFAULT_FORM_DATA);
            setIsDialogOpen(true);
          }}>
            <Plus className="ml-2 h-4 w-4" />
            פגישה חדשה
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-4">
          <FullCalendar
            key={`${initialDate || "today"}-${scrollTime}-${highlightParam || ""}`}
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView={initialCalendarView}
            initialDate={initialDate}
            locale="he"
            direction="rtl"
            headerToolbar={{
              right: "prev,next today",
              center: "title",
              left: "dayGridMonth,timeGridWeek,timeGridDay",
            }}
            buttonText={{
              today: "היום",
              month: "חודש",
              week: "שבוע",
              day: "יום",
            }}
            buttonHints={{
              prev: "תקופה קודמת",
              next: "תקופה הבאה",
              today: "עבור להיום",
            }}
            scrollTime={scrollTime}
            slotMinTime="00:00:00"
            slotMaxTime="24:00:00"
            allDaySlot={false}
            slotDuration="00:30:00"
            events={events}
            datesSet={handleDatesSet}
            dateClick={handleDateClick}
            eventClick={handleEventClick}
            eventContent={renderEventContent}
            height="auto"
            eventTimeFormat={{
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            }}
            slotLabelFormat={{
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            }}
          />
        </CardContent>
      </Card>

      {/* New Session Dialog */}
      <NewSessionDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        clients={clients}
        defaultSessionDuration={defaultSessionDuration}
        selectedDate={selectedDate}
        initialFormData={initialFormData}
        sessions={sessions}
        onSessionCreated={() => fetchData()}
        onShowRecurringPreview={(preview, decisions, pendingRecurring) => {
          setApplyPreview(preview);
          setConflictDecisions(decisions);
          setPendingFormRecurring(pendingRecurring);
        }}
      />

      {/* Recurring Pattern Dialog */}
      <RecurringPatternDialog
        open={isRecurringDialogOpen || applyPreview !== null}
        onOpenChange={(open) => setIsRecurringDialogOpen(open)}
        clients={clients}
        recurringPatterns={recurringPatterns}
        defaultSessionDuration={defaultSessionDuration}
        applyPreview={applyPreview}
        conflictDecisions={conflictDecisions}
        pendingFormRecurring={pendingFormRecurring}
        onApplyPreviewChange={setApplyPreview}
        onConflictDecisionsChange={setConflictDecisions}
        onPendingFormRecurringChange={setPendingFormRecurring}
        onDataChanged={() => { fetchData(); checkOverlaps(); }}
      />

      {/* Session Detail Dialog */}
      <SessionDetailDialog
        open={isSessionDialogOpen}
        onOpenChange={setIsSessionDialogOpen}
        session={selectedSession}
        onSessionChange={setSelectedSession}
        onRequestPayment={(data: PaymentRequest) => {
          setPaymentData(data);
          setIsPaymentDialogOpen(true);
        }}
        onRequestCharge={(action) => {
          setPendingAction(action);
          setIsChargeDialogOpen(true);
        }}
        onOpenNewSession={(formData) => {
          setInitialFormData({
            ...DEFAULT_FORM_DATA,
            ...formData,
          });
          setIsDialogOpen(true);
        }}
        onDataChanged={() => fetchData()}
      />

      {/* Charge Confirmation Dialog */}
      <Dialog open={isChargeDialogOpen} onOpenChange={setIsChargeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>האם לחייב את המטופל?</DialogTitle>
            <DialogDescription>
              {pendingAction === "CANCELLED" 
                ? "הפגישה בוטלה. האם ברצונך לחייב את המטופל בתשלום?"
                : "המטופל נעדר מהפגישה. האם ברצונך לחייב אותו בתשלום?"}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row-reverse gap-2">
            <Button
              onClick={() => {
                if (!selectedSession || !pendingAction || !selectedSession.client) return;
                const status = pendingAction;
                setIsChargeDialogOpen(false);
                setIsSessionDialogOpen(false);
                setPendingAction(null);
                setPaymentData({
                  sessionId: selectedSession.id,
                  clientId: selectedSession.client.id,
                  amount: selectedSession.price - Number(selectedSession.payment?.amount || 0),
                  pendingSessionStatus: status,
                });
                setIsPaymentDialogOpen(true);
              }}
            >
              כן, לחייב
            </Button>
            <Button
              variant="secondary"
              onClick={async () => {
                if (!selectedSession || !pendingAction || !selectedSession.client) return;
                try {
                  const response = await fetch(`/api/sessions/${selectedSession.id}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ status: pendingAction, createPayment: true, markAsPaid: false }),
                  });
                  if (response.ok) {
                    toast.success("הפגישה עודכנה והחוב נרשם");
                    setIsChargeDialogOpen(false);
                    setIsSessionDialogOpen(false);
                    setPendingAction(null);
                    await fetchData();
                  }
                } catch {
                  toast.error("שגיאה בעדכון הפגישה");
                }
              }}
            >
              עדכן ורשום חוב
            </Button>
            <Button
              variant="outline"
              onClick={async () => {
                if (!selectedSession || !pendingAction) return;
                try {
                  await fetch(`/api/sessions/${selectedSession.id}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ status: pendingAction }),
                  });
                  
                  toast.success(pendingAction === "CANCELLED" ? "הפגישה בוטלה ללא חיוב - פטור מתשלום" : "נרשמה אי הופעה ללא חיוב - פטור מתשלום");
                  
                  setIsChargeDialogOpen(false);
                  setIsSessionDialogOpen(false);
                  setPendingAction(null);
                  
                  await fetchData();
                } catch {
                  toast.error("שגיאה בעדכון הפגישה");
                }
              }}
            >
              פטור מתשלום
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* דיאלוג תשלום מהיר - נפתח אחרי סיום פגישה */}
      {paymentData && (
        <QuickMarkPaid
          sessionId={paymentData.sessionId}
          clientId={paymentData.clientId}
          clientName={selectedSession?.client?.name}
          amount={paymentData.amount}
          creditBalance={Number(selectedSession?.client?.creditBalance || 0)}
          existingPayment={paymentData.paymentId ? { id: paymentData.paymentId, status: "PENDING" } : null}
          buttonText="תשלום"
          open={isPaymentDialogOpen}
          onOpenChange={(open) => {
            setIsPaymentDialogOpen(open);
            if (!open) {
              setPaymentData(null);
            }
          }}
          hideButton={true}
          onPaymentSuccess={paymentData.pendingSessionStatus ? async () => {
            await fetch(`/api/sessions/${paymentData.sessionId}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status: paymentData.pendingSessionStatus }),
            });
            fetchData();
          } : undefined}
        />
      )}

      {updateDialogOpen && selectedSession && (
        <UpdateSessionDialog
          open={updateDialogOpen}
          onClose={() => { setUpdateDialogOpen(false); setSelectedSession(null); }}
          sessionId={selectedSession.id}
          clientId={selectedSession.client?.id ?? ""}
          clientName={selectedSession.client?.name ?? "מטופל"}
          price={selectedSession.price}
          updating={updating}
          onUpdate={handleCalendarUpdate}
          onRecordDebt={handleCalendarRecordDebt}
        />
      )}

      <CalendarOverlapsDialog
        showOverlapsDialog={showOverlapsDialog}
        setShowOverlapsDialog={setShowOverlapsDialog}
        overlaps={overlaps}
        deletingOverlap={deletingOverlap}
        setDeletingOverlap={setDeletingOverlap}
        fetchData={fetchData}
        checkOverlaps={checkOverlaps}
      />

    </div>
  );
}

