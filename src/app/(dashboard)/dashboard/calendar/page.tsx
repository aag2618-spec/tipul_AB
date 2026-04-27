"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

import { Plus, Loader2, Repeat, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import type { EventClickArg, DatesSetArg } from "@fullcalendar/core";
import type { DateClickArg } from "@fullcalendar/interaction";
import { QuickMarkPaid } from "@/components/payments/quick-mark-paid";

import type { SessionOverlap } from "@/types";
import { CalendarOverlapsDialog } from "@/components/calendar/calendar-overlaps-dialog";
import { UpdateSessionDialog, type UpdateSessionDialogParams } from "@/components/update-session-dialog";
import { useCalendarData, type CalendarSession } from "@/hooks/use-calendar-data";
import { useCalendarActions } from "@/hooks/use-calendar-actions";
import { getEventColors } from "@/lib/calendar/event-colors";
import { NewSessionDialog, DEFAULT_FORM_DATA, type SessionFormData, type RecurringPreviewItem, type PendingFormRecurring } from "@/components/calendar/new-session-dialog";
import { RecurringPatternDialog } from "@/components/calendar/recurring-pattern-dialog";
import { SessionDetailDialog, type PaymentRequest } from "@/components/calendar/session-detail-dialog";
import { ChargeConfirmationDialog } from "@/components/calendar/charge-confirmation-dialog";
import { CalendarEventContent } from "@/components/calendar/calendar-event-content";
import { ChargeCardcomDialog } from "@/components/payments/charge-cardcom-dialog";

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


export default function CalendarPage() {
  return (
    <Suspense fallback={<div className="h-[calc(100vh-200px)] flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div>}>
      <CalendarPageContent />
    </Suspense>
  );
}

function CalendarPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const viewParam = searchParams.get('view');
  const dateParam = searchParams.get('date');
  const timeParam = searchParams.get('time');
  const highlightParam = searchParams.get('highlight');
  const clientParam = searchParams.get('client');
  const newParam = searchParams.get('new');
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
    clients,
    recurringPatterns,
    isLoading,
    defaultSessionDuration,
    fetchData,
    checkOverlaps,
    overlaps,
    setDateRange,
  } = useCalendarData();

  const { updating, updateSessionWithPayment, recordSessionDebt } = useCalendarActions({ fetchData });

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isRecurringDialogOpen, setIsRecurringDialogOpen] = useState(false);
  const [isSessionDialogOpen, setIsSessionDialogOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<CalendarSession | null>(null);
  const [isChargeDialogOpen, setIsChargeDialogOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<"CANCELLED" | "NO_SHOW" | null>(null);

  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  // ── Cardcom intercept (lifted from UpdateSessionDialog) ──────────
  // ה-UpdateSessionDialog נטען בתנאי updateDialogOpen && selectedSession,
  // ולכן ברגע שקוראים ל-onClose() הוא יורד מה-DOM וכל ה-state המקומי שלו
  // נעלם. כדי שהמעבר ל-Cardcom לא ייקטע, מחזיקים את הדיאלוג כאן ברמת
  // העמוד עצמו (שורד את unmount של הדיאלוג הפנימי).
  const [calendarCardcomOpen, setCalendarCardcomOpen] = useState(false);
  const [calendarCardcomData, setCalendarCardcomData] = useState<{
    paymentId: string;
    amount: number;
    clientName: string;
    clientId: string;
  } | null>(null);
  const [paymentData, setPaymentData] = useState<{
    sessionId: string;
    clientId: string;
    amount: number;
    paymentId?: string;
    pendingSessionStatus?: string;
  } | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [initialFormData, setInitialFormData] = useState<SessionFormData>(DEFAULT_FORM_DATA);
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
  const [pendingFormRecurring, setPendingFormRecurring] = useState<{
    clientId: string;
    type: string;
    price: string;
    topic: string;
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

  // שמירת מטופל מהכתובת - ישמש כשלוחצים על שעה ביומן
  const [preselectedClientId, setPreselectedClientId] = useState<string | null>(clientParam);

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
    
    // אם הגיעו מדף מטופל, למלא את המטופל והמחיר אוטומטית
    let clientId = "";
    let price = "";
    if (preselectedClientId) {
      clientId = preselectedClientId;
      const client = clients.find(c => c.id === preselectedClientId);
      if (client?.defaultSessionPrice) {
        price = String(client.defaultSessionPrice);
      }
      setPreselectedClientId(null);
    }
    setInitialFormData({
      clientId,
      startTime: `${dateStr}T${timeStr}`,
      endTime: format(endTime, "yyyy-MM-dd'T'HH:mm"),
      type: "IN_PERSON",
      price,
      topic: "",
      isRecurring: false,
      weeksToRepeat: 4,
    });
    setIsDialogOpen(true);
  };

  const handleEventClick = (info: EventClickArg) => {
    const session = sessions.find(s => s.id === info.event.id);
    if (session) {
      const isEnded = new Date(session.endTime) < new Date();
      if (isEnded && session.status === "SCHEDULED" && session.type !== "BREAK") {
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
    const result = await updateSessionWithPayment(selectedSession, params);
    if (result.success) {
      setUpdateDialogOpen(false);
      setSelectedSession(null);
    }
  };

  const handleCalendarRecordDebt = async (params: { updateStatus: string; updateReason: string }) => {
    if (!selectedSession) return;
    const result = await recordSessionDebt(selectedSession, params);
    if (result.success) {
      setUpdateDialogOpen(false);
      setSelectedSession(null);
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
      endTime: format(newEndTime, "yyyy-MM-dd'T'HH:mm"),
      type: session.type,
      price: session.client?.defaultSessionPrice?.toString() || "",
      topic: "",
      isRecurring: false,
      weeksToRepeat: 4,
    });
    setIsDialogOpen(true);
  };

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
            eventContent={(eventInfo) => (
              <CalendarEventContent
                eventInfo={eventInfo}
                sessions={sessions}
                onAddSessionAfter={handleAddSessionAfter}
              />
            )}
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
        onRequestPayment={async (data: PaymentRequest) => {
          // בדיקה אם למטופל יש חובות ישנים - אם כן, מעבר לדף תשלום כל החובות
          try {
            const debtRes = await fetch(`/api/payments/client-debt/${data.clientId}`);
            if (debtRes.ok) {
              const debtData = await debtRes.json();
              const unpaidCount = debtData.unpaidSessions?.length || 0;
              if (unpaidCount > 0 && debtData.totalDebt > 0) {
                // יש חובות ישנים - רושם חוב על הפגישה הנוכחית ומעביר לדף תשלום כולל
                await fetch(`/api/sessions/${data.sessionId}`, {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ status: data.pendingSessionStatus, createPayment: true, markAsPaid: false }),
                });
                toast.success("הפגישה עודכנה, מעבר לדף תשלום החובות...");
                fetchData();
                router.push(`/dashboard/payments/pay/${data.clientId}`);
                return;
              }
            }
          } catch {
            // fallback לדיאלוג רגיל
          }
          // אין חובות ישנים - פתיחת דיאלוג תשלום רגיל
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
      <ChargeConfirmationDialog
        open={isChargeDialogOpen}
        onOpenChange={setIsChargeDialogOpen}
        session={selectedSession}
        pendingAction={pendingAction}
        onDismissAll={() => {
          setIsChargeDialogOpen(false);
          setIsSessionDialogOpen(false);
          setPendingAction(null);
        }}
        onRequestPayment={(data) => {
          setPaymentData(data);
          setIsPaymentDialogOpen(true);
        }}
        onDataChanged={() => fetchData()}
      />

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
          onCardcomRequested={(p) => {
            // ה-Payment כבר נוצר ב-PENDING בתוך הדיאלוג. כאן רק נפתח את
            // ה-ChargeCardcomDialog שחי ברמת העמוד (לא יושפע מ-unmount של
            // ה-UpdateSessionDialog).
            setCalendarCardcomData(p);
            setCalendarCardcomOpen(true);
          }}
        />
      )}

      {calendarCardcomData && (
        <ChargeCardcomDialog
          open={calendarCardcomOpen}
          onOpenChange={(open) => {
            setCalendarCardcomOpen(open);
            if (!open) setCalendarCardcomData(null);
          }}
          paymentId={calendarCardcomData.paymentId}
          clientId={calendarCardcomData.clientId}
          clientName={calendarCardcomData.clientName}
          amount={calendarCardcomData.amount}
          defaultDescription="פגישה"
          onPaymentSuccess={async () => {
            // CRITICAL: לא להסתפק ב-router.refresh — useCalendarData מחזיק
            // session-state ב-React state שמתעדכן רק דרך fetchData המפורש.
            await fetchData();
          }}
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

