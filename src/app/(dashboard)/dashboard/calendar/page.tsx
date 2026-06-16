"use client";

import { Suspense, useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

import { Plus, Loader2, Repeat, AlertTriangle, Search, X, Users } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuCheckboxItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { format } from "date-fns";
import { toast } from "sonner";
import type { EventClickArg, DatesSetArg, EventDropArg } from "@fullcalendar/core";
import type { DateClickArg } from "@fullcalendar/interaction";
import { QuickMarkPaid } from "@/components/payments/quick-mark-paid";

import { CalendarOverlapsDialog } from "@/components/calendar/calendar-overlaps-dialog";
import { UpdateSessionDialog, type UpdateSessionDialogParams } from "@/components/update-session-dialog";
import { useCalendarData, type CalendarSession } from "@/hooks/use-calendar-data";
import { useCalendarActions } from "@/hooks/use-calendar-actions";
import { ReceiptPreviewDialog } from "@/components/payments/receipt-preview-dialog";
import { resolveReceiptToShow, tryOpenReceiptInNewTab } from "@/lib/receipt-utils";
import { getEventColors, getTherapistAccent } from "@/lib/calendar/event-colors";
import { isClinicCalendarView } from "@/lib/calendar/clinic-view";
import { NewSessionDialog, DEFAULT_FORM_DATA, type SessionFormData } from "@/components/calendar/new-session-dialog";
import { RecurringPatternDialog } from "@/components/calendar/recurring-pattern-dialog";
import { SessionDetailDialog, type PaymentRequest } from "@/components/calendar/session-detail-dialog";
import { useMyPermissions } from "@/hooks/use-my-permissions";
import { TimeUpdateConfirmDialog, type TimeUpdatePromptData } from "@/components/calendar/time-update-confirm-dialog";
import { ChargeConfirmationDialog } from "@/components/calendar/charge-confirmation-dialog";
import { CalendarEventContent } from "@/components/calendar/calendar-event-content";
import { ChargeCardcomDialog } from "@/components/payments/charge-cardcom-dialog";
import { useIsMobile } from "@/hooks/use-mobile";

// Dynamic import for FullCalendar to avoid SSR issues
const FullCalendar = dynamic(
  () => import("@fullcalendar/react").then((mod) => mod.default),
  { ssr: false, loading: () => <div className="h-[600px] flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div> }
);

import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import listPlugin from "@fullcalendar/list";

interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  backgroundColor: string;
  textColor: string;
  borderColor: string;
  classNames?: string[];
  editable?: boolean;
  extendedProps: {
    clientId: string;
    status: string;
    type: string;
    therapistId: string;
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
  // מזהה המשתמש המחובר — כדי לא להציג את שם/צבע המטפל על הפגישות של המשתמש עצמו.
  const { data: authSession } = useSession();
  const currentTherapistId = authSession?.user?.id ?? null;
  const viewParam = searchParams.get('view');
  const dateParam = searchParams.get('date');
  const timeParam = searchParams.get('time');
  const highlightParam = searchParams.get('highlight');
  const clientParam = searchParams.get('client');
  // Phase 3: deep-link `?new=true` מ-dashboard לפותח NewSessionDialog אוטומטית.
  // הקישורים מ-/dashboard ל-/dashboard/calendar?new=true היו inert עד עכשיו
  // (הפרמטר לא נקרא). useEffect למטה פותח את הדיאלוג ומנקה את ה-URL כך
  // שרענון העמוד לא יפתח אותו שוב.
  const newParam = searchParams.get('new');
  const isMobile = useIsMobile();
  // ביומן בטלפון: יום בודד עם רשת שעות (שומר drag-and-drop). במחשב/טאבלט: שבוע מלא (כמו היום)
  const initialCalendarView =
    viewParam === 'month' ? 'dayGridMonth' :
    isMobile ? 'timeGridDay' :
    'timeGridWeek';
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
    defaultSessionPrice,
    fetchData,
    checkOverlaps,
    overlaps,
    setDateRange,
  } = useCalendarData();

  // Phase 3: הרשאות מזכירה ל-UI gating ב-SessionDetailDialog. ל-non-secretary
  // (OWNER/THERAPIST/independent) כל ההרשאות true. ה-default האופטימי ב-hook
  // מבטיח שלא יופיע "flash of missing button" לבעלים בזמן הטעינה.
  const { permissions: myPermissions, isSecretary } = useMyPermissions();

  const { updating, updateSessionWithPayment, recordSessionDebt } = useCalendarActions({ fetchData });
  // תצוגת קבלה מיד אחרי עדכון "הושלמה" + תשלום מזומן/צ'ק/העברה ביומן.
  const [receiptDialogOpen, setReceiptDialogOpen] = useState(false);
  const [receiptDialogPaymentId, setReceiptDialogPaymentId] = useState<string | null>(null);
  const [receiptDialogIsCardcom, setReceiptDialogIsCardcom] = useState(false);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isRecurringDialogOpen, setIsRecurringDialogOpen] = useState(false);
  const [isSessionDialogOpen, setIsSessionDialogOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<CalendarSession | null>(null);
  const [isChargeDialogOpen, setIsChargeDialogOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<"CANCELLED" | "NO_SHOW" | null>(null);

  // ── אישור שינוי שעת פגישה (גם בעריכה ידנית וגם בגרירה) ──
  const [timeUpdatePrompt, setTimeUpdatePrompt] = useState<TimeUpdatePromptData | null>(null);
  const [timeUpdateSubmitting, setTimeUpdateSubmitting] = useState(false);

  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  // ── Cardcom intercept (lifted from UpdateSessionDialog) ──────────
  // ה-UpdateSessionDialog נטען בתנאי updateDialogOpen && selectedSession,
  // ולכן ברגע שקוראים ל-onClose() הוא יורד מה-DOM וכל ה-state המקומי שלו
  // נעלם. כדי שהמעבר ל-Cardcom לא ייקטע, מחזיקים את הדיאלוג כאן ברמת
  // העמוד עצמו (שורד את unmount של הדיאלוג הפנימי).
  const [calendarCardcomOpen, setCalendarCardcomOpen] = useState(false);
  const [calendarCardcomData, setCalendarCardcomData] = useState<{
    paymentId?: string;
    sessionId?: string;
    amount: number;
    clientName: string;
    clientId: string;
    clientPhone?: string | null;
    clientEmail?: string | null;
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
    location?: string;
    // יומן רב-מטפלים: המטפל/ת היעד לסדרה החוזרת (מבורר המטפל ב-NewSessionDialog).
    therapistId?: string;
    // שלב 2 (חדרים): החדר היעד לסדרה החוזרת (מבורר החדר ב-NewSessionDialog).
    roomId?: string;
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

  // Phase 3: deep-link מ-dashboard — `?new=true` פותח את NewSessionDialog
  // אוטומטית עם state ריק (כמו לחיצה על "פגישה חדשה" ביומן). מנקים את
  // הפרמטר מה-URL מיד אחרי כדי שרענון לא יפתח שוב, ובסגירת הדיאלוג
  // ה-URL כבר נקי. תאימות לאחור: בלי `?new=true` ההתנהגות זהה ל-pre-Phase-3.
  useEffect(() => {
    if (newParam !== 'true') return;
    setSelectedDate(new Date());
    setInitialFormData(DEFAULT_FORM_DATA);
    setIsDialogOpen(true);
    const params = new URLSearchParams(searchParams.toString());
    params.delete('new');
    const qs = params.toString();
    router.replace(qs ? `/dashboard/calendar?${qs}` : '/dashboard/calendar', { scroll: false });
  }, [newParam, searchParams, router]);

  // שמירת מטופל מהכתובת - ישמש כשלוחצים על שעה ביומן
  const [preselectedClientId, setPreselectedClientId] = useState<string | null>(clientParam);

  // חיפוש ביומן — שם מטופל וקפיצה לתאריך
  const [searchTerm, setSearchTerm] = useState("");

  // ── יומן רב-מטפלים: מסנן לפי מטפל ──────────────────────────────
  // הרשימה נטענת מ-/api/clinic/therapists (זמין לבעלים/מזכירה בקליניקה בלבד;
  // 403 למטפל עצמאי). המסנן מוצג רק כשיש יותר ממטפל אחד.
  // selectedTherapistIds = null משמעו "כל המטפלים" (אין סינון).
  const [therapists, setTherapists] = useState<{ id: string; name: string | null }[]>([]);
  const [selectedTherapistIds, setSelectedTherapistIds] = useState<Set<string> | null>(null);

  useEffect(() => {
    let active = true;
    fetch("/api/clinic/therapists")
      .then(async (res) => {
        if (res.ok && active) {
          const data = await res.json();
          setTherapists(Array.isArray(data) ? data : []);
        }
      })
      .catch(() => {
        // מטפל עצמאי / שגיאה — אין מסנן, וזה תקין
      });
    return () => {
      active = false;
    };
  }, []);

  // ── יומן רב-מטפלים: ברירת מחדל למסנן + סנכרון עם המתג "שלי / כל הקליניקה" ──
  // viewScope נקרא מה-cookie בכל render (אותו דפוס כמו ב-useCalendarData). המתג
  // כותב cookie + router.refresh, ולכן הערך מתעדכן בהחלפה. מאפסים את מסנן
  // המטפלים רק כשההיקף באמת משתנה (או בטעינה הראשונה), בלי לדרוס בחירה ידנית
  // של המשתמש בתוך אותו היקף (useRef עוקב אחרי ההיקף הקודם):
  //   • "כל הקליניקה" → כל המטפלים (null = ללא סינון, כולל מטפל חדש).
  //   • "שלי" → רק אני, אם אני מטפל בקליניקה (בעלים-שהוא-מטפל). מזכירה / מנהל
  //     לא-מטפל אינם ברשימת המטפלים — וממשיכים לראות את כולם.
  // זה מתקן גם כניסה ישירה ליומן כשהמתג כבר על "כל הקליניקה" (היה מציג בעלים בלבד).
  const viewScope =
    typeof document !== "undefined" &&
    /(?:^|;\s*)mytipul_view=clinic/.test(document.cookie)
      ? "clinic"
      : "personal";
  const prevViewScopeRef = useRef<string | null>(null);
  useEffect(() => {
    if (!currentTherapistId || therapists.length === 0) return;
    const prev = prevViewScopeRef.current;
    if (prev === viewScope) return; // אותו היקף — לא דורסים בחירה ידנית של המשתמש
    prevViewScopeRef.current = viewScope;
    const meIsTherapist = therapists.some((t) => t.id === currentTherapistId);
    if (viewScope === "personal" && meIsTherapist && therapists.length > 1) {
      setSelectedTherapistIds(new Set([currentTherapistId]));
    } else {
      setSelectedTherapistIds(null);
    }
  }, [viewScope, therapists, currentTherapistId]);

  const multiTherapist = therapists.length > 1;
  // יומן הקליניקה (תצוגה רב-מטפלית) מול היומן הרגיל. שיפורי התצוגה (הסרת שם
  // מטפל מהכרטיס, פריסת כפתורים אנכית, navLinks, הפרדת box-shadow) חלים *רק*
  // כאן — "שלי" של הבעלים ומטפל עצמאי נשארים בדיוק כמו קודם.
  //   • מזכירה: תמיד רואה את כל הקליניקה → true.
  //   • בעלים: רק כשבחר "כל הקליניקה" (viewScope==="clinic").
  //   • מטפל עצמאי: multiTherapist=false → false.
  const isClinicCalendar = isClinicCalendarView({ multiTherapist, viewMode: viewScope, isSecretary });
  const allTherapistIds = therapists.map((t) => t.id);
  const isTherapistSelected = (id: string) =>
    !selectedTherapistIds || selectedTherapistIds.has(id);
  const selectedTherapistCount = selectedTherapistIds
    ? selectedTherapistIds.size
    : therapists.length;

  const toggleTherapist = (id: string) => {
    setSelectedTherapistIds((prev) => {
      const base = prev ? new Set(prev) : new Set(allTherapistIds);
      if (base.has(id)) base.delete(id);
      else base.add(id);
      // כל המטפלים מסומנים → null (ללא סינון), כדי שגם מטפל חדש ייכלל אוטומטית
      return base.size === allTherapistIds.length ? null : base;
    });
  };
  const showAllTherapists = () => setSelectedTherapistIds(null);
  const showTherapistsWithSessions = () => {
    // רק מטפלים מהרשימה החוקית (allTherapistIds) שיש להם פגישה בטווח הטעון.
    // סינון מול הרשימה מונע ספירה שגויה (פגישות של מזכירה/מטפל שהוסר).
    const valid = new Set(allTherapistIds);
    const withSessions = new Set(
      sessions
        .map((s) => s.therapistId)
        .filter((x): x is string => typeof x === "string" && valid.has(x))
    );
    setSelectedTherapistIds(withSessions);
  };

  // קפיצה לתאריך מסוים: עדכון URL כדי לטעון מחדש את היומן עם initialDate חדש
  const handleDateJump = useCallback((dateStr: string) => {
    if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return;
    const params = new URLSearchParams(searchParams.toString());
    params.set("date", dateStr);
    router.push(`/dashboard/calendar?${params.toString()}`);
  }, [searchParams, router]);

  // הצג פגישות מבוטלות שכבר עברו, הסתר מבוטלות עתידיות
  const events: CalendarEvent[] = sessions
    .filter((session) => {
      if (session.status !== "CANCELLED") return true;
      return new Date(session.endTime) < new Date();
    })
    .map((session) => {
      const colors = getEventColors(session);
      // אפשר לגרור רק פגישות מתוכננות שעדיין לא הסתיימו.
      // פגישות שעבר זמנן / הושלמו / בוטלו / ממתינות לאישור — נעולות.
      const isFuture = new Date(session.endTime) > new Date();
      const isDraggable = isFuture && session.status === "SCHEDULED";
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
        editable: isDraggable,
        extendedProps: {
          clientId: session.client?.id || "",
          status: session.status,
          type: session.type,
          therapistId: session.therapistId || "",
        },
      };
    });

  // סינון לפי מטפל (יומן רב-מטפלים). null = כל המטפלים. אירוע ללא therapistId
  // (קצה לא צפוי) נשאר מוצג.
  const therapistFilteredEvents: CalendarEvent[] =
    multiTherapist && selectedTherapistIds
      ? events.filter(
          (e) =>
            !e.extendedProps.therapistId ||
            selectedTherapistIds.has(e.extendedProps.therapistId)
        )
      : events;

  // סינון אירועים לפי חיפוש לפי שם מטופל. אם השדה ריק — מחזיר את אותו reference (אין שינוי)
  const filteredEvents: CalendarEvent[] = searchTerm.trim()
    ? therapistFilteredEvents.filter((e) => {
        if (e.extendedProps?.type === "BREAK") return false; // הפסקות לא תואמות לחיפוש לפי שם
        return (e.title || "").toLowerCase().includes(searchTerm.trim().toLowerCase());
      })
    : therapistFilteredEvents;

  // Update date range when calendar view changes (month/week navigation)
  // חלון רחב: 3 שבועות אחורה + 4 שבועות קדימה — כך ניווט בין שבועות לא גורם לטעינה מחדש
  const handleDatesSet = useCallback((info: DatesSetArg) => {
    const visibleStart = info.start.getTime();
    const visibleEnd = info.end.getTime();
    const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
    const bufferStart = new Date(visibleStart - 3 * WEEK_MS);
    const bufferEnd = new Date(visibleEnd + 4 * WEEK_MS);

    setDateRange(prev => {
      if (prev) {
        const prevStart = new Date(prev.start).getTime();
        const prevEnd = new Date(prev.end).getTime();
        if (visibleStart >= prevStart && visibleEnd <= prevEnd) return prev;
      }
      return {
        start: bufferStart.toISOString().split("T")[0] + "T00:00",
        end: bufferEnd.toISOString().split("T")[0] + "T23:59",
      };
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
    
    // אם הגיעו מדף מטופל, למלא את המטופל והמחיר אוטומטית.
    // אחרת — שימוש במחיר ברירת המחדל של המטפל (מההגדרות) ככרית פתיחה.
    let clientId = "";
    let price = defaultSessionPrice != null ? String(defaultSessionPrice) : "";
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
      // Phase 1 (סבב 21): location חייב להיות מוגדר ב-initial state כדי
      // ש-formData.location.trim() ב-submit לא יזרוק TypeError. ריק = אין חדר.
      location: "",
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

  // ── שינוי שעת פגישה (משותף לעריכה ידנית ב-SessionDetailDialog ולגרירה ב-FullCalendar) ──
  const requestTimeUpdate = (params: {
    sessionId: string;
    oldStart: Date;
    oldEnd: Date;
    newStart: Date;
    newEnd: Date;
    source?: "manual" | "drag";
    onCancel?: () => void;
  }) => {
    // איתור פגישות חופפות לוקאלית — מחריגים את הפגישה עצמה
    const conflicts = sessions
      .filter((s) => {
        if (s.id === params.sessionId) return false;
        if (s.status === "CANCELLED" || s.status === "COMPLETED" || s.status === "NO_SHOW") return false;
        const sStart = new Date(s.startTime);
        const sEnd = new Date(s.endTime);
        return params.newStart < sEnd && params.newEnd > sStart;
      })
      .map((s) => ({
        id: s.id,
        clientName: s.client?.name || (s.type === "BREAK" ? "הפסקה" : "ללא שם"),
        startTime: typeof s.startTime === "string" ? s.startTime : new Date(s.startTime).toISOString(),
        endTime: typeof s.endTime === "string" ? s.endTime : new Date(s.endTime).toISOString(),
      }));

    setTimeUpdatePrompt({ ...params, conflicts });
  };

  const handleTimeUpdateClose = () => {
    if (timeUpdatePrompt?.onCancel) timeUpdatePrompt.onCancel();
    setTimeUpdatePrompt(null);
  };

  const handleTimeUpdateConfirm = async (opts: { allowOverlap?: boolean; replaceSessionIds?: string[] }) => {
    if (!timeUpdatePrompt) return;
    setTimeUpdateSubmitting(true);
    try {
      const willOverlap = opts.allowOverlap || (opts.replaceSessionIds?.length ?? 0) > 0;

      // עדכון הפגישה תחילה — אם יש replace, השרת יקבל allowOverlap כדי לא לחסום ב-409.
      // הביטולים של הקיימות יבוצעו רק אחרי שהעדכון הצליח (atomicity).
      const updateRes = await fetch(`/api/sessions/${timeUpdatePrompt.sessionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          startTime: timeUpdatePrompt.newStart.toISOString(),
          endTime: timeUpdatePrompt.newEnd.toISOString(),
          allowOverlap: willOverlap || undefined,
        }),
      });

      if (!updateRes.ok) {
        const err = await updateRes.json().catch(() => null);
        throw new Error(err?.message || "שגיאה בעדכון שעת הפגישה");
      }

      // העדכון עבר. אם המשתמש ביקש "החלף" — מבטלים את כל הפגישות החופפות.
      const idsToCancel = opts.replaceSessionIds ?? [];
      if (idsToCancel.length > 0) {
        const cancelResults = await Promise.all(
          idsToCancel.map((id) =>
            fetch(`/api/sessions/${id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ status: "CANCELLED" }),
            }).then((r) => r.ok).catch(() => false)
          )
        );
        const failedCount = cancelResults.filter((ok) => !ok).length;
        if (failedCount > 0) {
          toast.warning(
            failedCount === idsToCancel.length
              ? "השעה עודכנה, אך ביטול הפגישות הקיימות נכשל. בטל/י אותן ידנית."
              : `השעה עודכנה, אך ${failedCount} מתוך ${idsToCancel.length} פגישות לא בוטלו. בדוק/י ידנית.`
          );
        } else {
          toast.success(
            idsToCancel.length === 1
              ? "הפגישה הקיימת בוטלה והשעה עודכנה"
              : `${idsToCancel.length} פגישות בוטלו והשעה עודכנה`
          );
        }
      } else {
        toast.success("שעת הפגישה עודכנה");
      }

      // עדכון ה-session הנבחר אם הדיאלוג פתוח עליו
      if (selectedSession?.id === timeUpdatePrompt.sessionId) {
        const updated = await updateRes.json().catch(() => null);
        if (updated) setSelectedSession(updated);
      }
      setTimeUpdatePrompt(null);
      fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "שגיאה בעדכון שעת הפגישה");
      // כשל בעדכון — להחזיר את הגרירה אם הייתה
      if (timeUpdatePrompt.onCancel) timeUpdatePrompt.onCancel();
      setTimeUpdatePrompt(null);
    } finally {
      setTimeUpdateSubmitting(false);
    }
  };

  const handleEventDrop = (info: EventDropArg) => {
    const session = sessions.find((s) => s.id === info.event.id);
    if (!session || !info.event.start || !info.event.end) {
      info.revert();
      return;
    }
    // הגנת עומק — אסור לגרור פגישה שעבר זמנה או שאינה מתוכננת.
    // ה-editable ברמת event אמור למנוע זאת, אבל אם איכשהו עברנו את הסינון —
    // להחזיר ולא לפתוח דיאלוג.
    if (session.status !== "SCHEDULED" || new Date(session.endTime) <= new Date()) {
      info.revert();
      return;
    }
    requestTimeUpdate({
      sessionId: session.id,
      oldStart: new Date(session.startTime),
      oldEnd: new Date(session.endTime),
      newStart: info.event.start,
      newEnd: info.event.end,
      source: "drag",
      onCancel: () => info.revert(),
    });
  };

  const handleCalendarUpdate = async (params: UpdateSessionDialogParams) => {
    if (!selectedSession) return;
    const result = await updateSessionWithPayment(selectedSession, params);
    if (result.success) {
      setUpdateDialogOpen(false);
      setSelectedSession(null);
      // הצגת הקבלה מיד אחרי תשלום מזומן/צ'ק/העברה בעדכון "הושלמה" — לפי מה
      // שהשרת באמת הפיק (כמו ביתר מסכי התשלום). עבור אשראי הקבלה מטופלת
      // ב-ChargeCardcomDialog (onCardcomRequested), לא כאן.
      const shown = resolveReceiptToShow(result.payment);
      if (result.payment?.id && shown) {
        const { opened } = tryOpenReceiptInNewTab(shown.receiptUrl);
        if (opened) {
          toast.message("הקבלה נפתחה בלשונית חדשה — אפשר להדפיס משם", { duration: 5000 });
          return;
        }
        setReceiptDialogPaymentId(result.payment.id);
        setReceiptDialogIsCardcom(shown.isCardcom);
        toast.message(
          shown.receiptUrl
            ? "הדפדפן חסם פתיחת לשונית. הקבלה מוצגת כאן — או אשר/י popups בהגדרות הדפדפן."
            : "הקבלה תיפתח כאן ברגע שתהיה מוכנה",
          { duration: shown.receiptUrl ? 8000 : 4000 },
        );
        setTimeout(() => setReceiptDialogOpen(true), 220);
      }
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
      // Phase 1 (סבב 21): location ריק כברירת מחדל. אם נרצה בעתיד למלא
      // אותו אוטומטית מהפגישה הקודמת — צריך להוסיף `location` ל-CalendarSession
      // ב-use-calendar-data.ts.
      location: "",
    });
    setIsDialogOpen(true);
  };

  // יומן רב-מטפלים: פתיחת דיאלוג פגישה חדשה על *אותה* משבצת (במקביל) — למטפל/חדר
  // אחר. בשונה מ-handleAddSessionAfter (שמתחיל בסיום הפגישה), כאן שומרים את אותן
  // שעת התחלה/סיום ומשאירים את המטופל/מטפל לבחירה בטופס. מחובר רק במצב רב-מטפלים.
  const handleAddSessionParallel = (session: CalendarSession) => {
    const startTime = new Date(session.startTime);
    const endTime = new Date(session.endTime);
    setSelectedDate(startTime);
    setInitialFormData({
      clientId: "",
      startTime: format(startTime, "yyyy-MM-dd'T'HH:mm"),
      endTime: format(endTime, "yyyy-MM-dd'T'HH:mm"),
      type: "IN_PERSON",
      price: defaultSessionPrice != null ? String(defaultSessionPrice) : "",
      topic: "",
      isRecurring: false,
      weeksToRepeat: 4,
      location: "",
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

      {/* שורת חיפוש: שם מטופל + מסנן מטפל + קפיצה לתאריך — בכל גודל מסך */}
      <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 sm:items-center">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            type="text"
            placeholder="חפש פגישה לפי שם מטופל..."
            className="pr-10 pl-10"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            aria-label="חיפוש פגישה לפי שם מטופל"
          />
          {searchTerm && (
            <button
              type="button"
              onClick={() => setSearchTerm("")}
              className="absolute left-1 top-1/2 -translate-y-1/2 inline-flex items-center justify-center w-9 h-9 rounded hover:bg-muted text-muted-foreground"
              aria-label="נקה חיפוש"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {multiTherapist && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="gap-2 whitespace-nowrap">
                <Users className="h-4 w-4" />
                מטפלים ({selectedTherapistCount}/{therapists.length})
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel>סינון לפי מטפל</DropdownMenuLabel>
              <DropdownMenuItem onClick={showAllTherapists}>הצג את כולם</DropdownMenuItem>
              <DropdownMenuItem onClick={showTherapistsWithSessions}>
                רק מטפלים עם פגישות
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {therapists.map((t) => (
                <DropdownMenuCheckboxItem
                  key={t.id}
                  checked={isTherapistSelected(t.id)}
                  onCheckedChange={() => toggleTherapist(t.id)}
                  onSelect={(e) => e.preventDefault()}
                >
                  <span className="inline-flex items-center gap-2">
                    <span
                      className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: getTherapistAccent(t.id) }}
                      aria-hidden
                    />
                    {t.name || "מטפל"}
                  </span>
                </DropdownMenuCheckboxItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <div className="flex items-center gap-2">
          <label htmlFor="calendar-date-jump" className="text-sm text-muted-foreground whitespace-nowrap">
            קפיצה לתאריך:
          </label>
          <Input
            id="calendar-date-jump"
            type="date"
            dir="ltr"
            value={initialDate || ""}
            onChange={(e) => handleDateJump(e.target.value)}
            className="w-full sm:w-[160px]"
            aria-label="קפיצה לתאריך ביומן"
          />
        </div>
      </div>

      {searchTerm && filteredEvents.length === 0 && (
        <div className="text-sm text-muted-foreground py-2 px-3 rounded bg-muted/40 border border-muted">
          לא נמצאו פגישות עם השם &quot;{searchTerm}&quot; בטווח התאריכים המוצג. נסה לקפוץ לתאריך אחר באמצעות שדה &quot;קפיצה לתאריך&quot;, או לעבור לתצוגת חודש/שבוע.
        </div>
      )}

      <Card>
        {/* clinic-cal: עוגן ל-CSS של הפרדת הפגישות (box-shadow) — מתווסף רק
            ביומן הקליניקה, כך שהיומן הרגיל ("שלי"/עצמאי) לא מושפע. */}
        <CardContent className={`p-4 ${isClinicCalendar ? "clinic-cal" : ""}`}>
          {/* יומן רב-מטפלים: slotEventOverlap={false} גורם לפגישות שמתנגשות באותה
              שעה להופיע אחת ליד השנייה (חצי רוחב כל אחת) במקום אחת על השנייה, כך
              ששתיהן נראות במלואן ואף פגישה לא מסתירה את חברתה. משפיע רק על המשבצת
              החופפת — כל שאר הפגישות נשארות ברוחב מלא. */}
          <FullCalendar
            key={`${initialDate || "today"}-${scrollTime}-${highlightParam || ""}-${isMobile ? "m" : "d"}`}
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin]}
            initialView={initialCalendarView}
            initialDate={initialDate}
            locale="he"
            direction="rtl"
            headerToolbar={isMobile ? {
              right: "prev,next today",
              center: "title",
              left: "timeGridDay,timeGridWeek,dayGridMonth,listWeek",
            } : {
              right: "prev,next today",
              center: "title",
              left: "dayGridMonth,timeGridWeek,timeGridDay,listWeek",
            }}
            buttonText={{
              today: "היום",
              month: "חודש",
              week: "שבוע",
              day: "יום",
              list: "רשימה",
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
            slotEventOverlap={false}
            // יומן הקליניקה בלבד: לחיצה על כותרת היום (בשבוע/חודש) עוברת לתצוגה
            // היומית הברורה. ב"שלי"/עצמאי navLinks=false — כותרות לא לחיצות, כמו קודם.
            navLinks={isClinicCalendar}
            navLinkDayClick="timeGridDay"
            events={filteredEvents}
            datesSet={handleDatesSet}
            dateClick={handleDateClick}
            eventClick={handleEventClick}
            editable
            eventStartEditable
            eventDurationEditable={false}
            eventDrop={handleEventDrop}
            eventContent={(eventInfo) => (
              <CalendarEventContent
                eventInfo={eventInfo}
                sessions={sessions}
                onAddSessionAfter={handleAddSessionAfter}
                onAddSessionParallel={handleAddSessionParallel}
                showTherapist={multiTherapist}
                currentTherapistId={currentTherapistId}
                isClinicCalendar={isClinicCalendar}
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
        defaultSessionPrice={defaultSessionPrice}
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
        currentTherapistId={currentTherapistId}
        canViewPayments={myPermissions.canViewPayments}
        multiTherapist={multiTherapist}
        onRequestPayment={async (data: PaymentRequest) => {
          // Phase 3: client-side guard — מזכירה ללא canViewPayments לא צריכה
          // להגיע לכאן (הכפתורים מוסתרים), אבל אם משתמש כן מצליח לטריגר
          // (race condition / DevTools), חוסמים פה לפני יצירת payment. השרת
          // יחזיר 403 בכל מקרה, אבל זה מקצר את לולאת ה-UX.
          if (!myPermissions.canViewPayments) {
            toast.error("אין הרשאה לפעולות תשלום");
            return;
          }
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
        onRequestTimeUpdate={requestTimeUpdate}
      />

      {/* Time Update Confirm Dialog (משותף לעריכה ידנית ולגרירה) */}
      <TimeUpdateConfirmDialog
        prompt={timeUpdatePrompt}
        isSubmitting={timeUpdateSubmitting}
        onConfirm={handleTimeUpdateConfirm}
        onClose={handleTimeUpdateClose}
      />

      {/* Charge Confirmation Dialog */}
      <ChargeConfirmationDialog
        open={isChargeDialogOpen}
        onOpenChange={setIsChargeDialogOpen}
        session={selectedSession}
        pendingAction={pendingAction}
        canViewPayments={myPermissions.canViewPayments}
        onDismissAll={() => {
          setIsChargeDialogOpen(false);
          setIsSessionDialogOpen(false);
          setPendingAction(null);
        }}
        onRequestPayment={(data) => {
          // Phase 3: client-side guard — מזכירה ללא canViewPayments לא צריכה
          // לפתוח דיאלוג תשלום גם מ-ChargeConfirmationDialog (handleRecordDebt
          // עם createPayment=true). השרת חוסם דרך 403 על PUT /api/sessions/[id]
          // ו-ChargeConfirmationDialog מסתיר את הכפתורים — זה defense-in-depth.
          if (!myPermissions.canViewPayments) {
            toast.error("אין הרשאה לפעולות תשלום");
            return;
          }
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
          onCardcomRequested={(p) => {
            // Lift Cardcom dialog to page level. ה-QuickMarkPaid נטען בתנאי
            // (paymentData && ...) — ברגע ש-onOpenChange(false) רץ, האב מנקה
            // paymentData והקומפוננט יורד מה-DOM יחד עם ה-ChargeCardcomDialog
            // הפנימי. ה-ChargeCardcomDialog ברמת העמוד שורד את ה-unmount.
            //
            // CRITICAL: סיום הפגישה — אם המשתמש בא דרך "סיים ושלם" יש לנו
            // pendingSessionStatus (COMPLETED). הסליקה תיכשל אם הפגישה
            // עדיין SCHEDULED (auto-create של Payment ב-amount=0 לא יקרה,
            // ויהיה race עם ה-Cardcom flow). מסמנים COMPLETED לפני פתיחת
            // הסליקה כדי שהמצב יהיה עקבי גם אם המשתמש סוגר באמצע.
            (async () => {
              if (paymentData?.pendingSessionStatus) {
                try {
                  await fetch(`/api/sessions/${paymentData.sessionId}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ status: paymentData.pendingSessionStatus }),
                  });
                } catch {
                  // non-fatal — Cardcom flow will still create a Payment
                }
              }
              setCalendarCardcomData({
                paymentId: p.paymentId,
                sessionId: p.sessionId,
                clientId: p.clientId,
                clientName: p.clientName ?? "מטופל",
                clientPhone: p.clientPhone,
                clientEmail: p.clientEmail,
                amount: p.amount,
              });
              setCalendarCardcomOpen(true);
            })();
          }}
        />
      )}

      {updateDialogOpen && selectedSession && (
        <UpdateSessionDialog
          open={updateDialogOpen}
          onClose={() => { setUpdateDialogOpen(false); setSelectedSession(null); }}
          sessionId={selectedSession.id}
          clientId={selectedSession.client?.id ?? ""}
          clientName={selectedSession.client?.name ?? "מטופל"}
          clientEmail={selectedSession.client?.email ?? null}
          clientPhone={selectedSession.client?.phone ?? null}
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
            // ⚠️ אין לאפס calendarCardcomData ב-onClose! ChargeCardcomDialog
            // מחזיק בתוכו את ReceiptPreviewDialog שנפתח 220ms אחרי שהדיאלוג
            // הראשי נסגר (success-path). אם נאפס את הנתונים כאן, ה-component
            // ייעלם מה-DOM ו-receipt-dialog לעולם לא ייפתח. הנתונים מתאפסים
            // ב-onPaymentSuccess (אחרי שהקבלה נסגרה) או דרך timeout בכוונה.
          }}
          paymentId={calendarCardcomData.paymentId}
          sessionId={calendarCardcomData.sessionId}
          clientId={calendarCardcomData.clientId}
          clientName={calendarCardcomData.clientName}
          clientPhone={calendarCardcomData.clientPhone}
          clientEmail={calendarCardcomData.clientEmail}
          amount={calendarCardcomData.amount}
          defaultDescription="פגישה"
          onPaymentSuccess={async () => {
            // CRITICAL: לא להסתפק ב-router.refresh — useCalendarData מחזיק
            // session-state ב-React state שמתעדכן רק דרך fetchData המפורש.
            await fetchData();
            // עכשיו שאפשר — מאפסים את הנתונים. ה-ReceiptPreviewDialog
            // כבר נסגר (זה התרחיש שמפעיל את onPaymentSuccess הדחוי).
            setCalendarCardcomData(null);
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

      {/* קבלה אחרי עדכון "הושלמה" + תשלום מזומן/צ'ק/העברה ביומן (לא-Cardcom).
          עבור אשראי, ChargeCardcomDialog למעלה מטפל בקבלה בעצמו. */}
      <ReceiptPreviewDialog
        open={receiptDialogOpen}
        onOpenChange={(next) => {
          setReceiptDialogOpen(next);
          if (!next) fetchData();
        }}
        paymentId={receiptDialogPaymentId}
        isCardcom={receiptDialogIsCardcom}
      />

    </div>
  );
}

