"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Loader2, Calendar, Repeat, Settings, Waves, Trash2, User, FileText, Clock, AlertCircle, AlertTriangle, CheckCircle2, Ban, UserX, ChevronUp, ChevronDown, Wallet } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { format, addWeeks } from "date-fns";
import { toast } from "sonner";
import type { EventClickArg } from "@fullcalendar/core";
import type { DateClickArg } from "@fullcalendar/interaction";
import { QuickMarkPaid } from "@/components/payments/quick-mark-paid";
import Link from "next/link";

// Dynamic import for FullCalendar to avoid SSR issues
const FullCalendar = dynamic(
  () => import("@fullcalendar/react").then((mod) => mod.default),
  { ssr: false, loading: () => <div className="h-[600px] flex items-center justify-center"><Loader2 className="h-8 w-8 animate-spin text-muted-foreground" /></div> }
);

import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";

interface Client {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  defaultSessionPrice?: number | null;
  creditBalance?: number | null;
}

interface Session {
  id: string;
  startTime: string;
  endTime: string;
  status: string;
  type: string;
  price: number;
  client: Client | null;
  payment?: { id: string; status: string; amount?: number; expectedAmount?: number } | null;
  sessionNote?: string | null;
}

interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  backgroundColor: string;
  borderColor: string;
  classNames?: string[];
  extendedProps: {
    clientId: string;
    status: string;
    type: string;
  };
}

interface RecurringPattern {
  id: string;
  dayOfWeek: number;
  time: string;
  duration: number;
  isActive: boolean;
  clientId: string | null;
  client?: { name: string } | null;
}

const TIME_SLOTS = [
  "07:00", "07:15", "07:30", "07:45",
  "08:00", "08:15", "08:30", "08:45",
  "09:00", "09:15", "09:30", "09:45",
  "10:00", "10:15", "10:30", "10:45",
  "11:00", "11:15", "11:30", "11:45",
  "12:00", "12:15", "12:30", "12:45",
  "13:00", "13:15", "13:30", "13:45",
  "14:00", "14:15", "14:30", "14:45",
  "15:00", "15:15", "15:30", "15:45",
  "16:00", "16:15", "16:30", "16:45",
  "17:00", "17:15", "17:30", "17:45",
  "18:00", "18:15", "18:30", "18:45",
  "19:00", "19:15", "19:30", "19:45",
  "20:00", "20:15", "20:30", "20:45",
  "21:00", "21:15", "21:30", "21:45",
];

const DAYS_OF_WEEK = [
  { value: 0, label: "ראשון" },
  { value: 1, label: "שני" },
  { value: 2, label: "שלישי" },
  { value: 3, label: "רביעי" },
  { value: 4, label: "חמישי" },
  { value: 5, label: "שישי" },
  { value: 6, label: "שבת" },
];

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
  
  const [sessions, setSessions] = useState<Session[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [recurringPatterns, setRecurringPatterns] = useState<RecurringPattern[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [defaultSessionDuration, setDefaultSessionDuration] = useState(50);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isRecurringDialogOpen, setIsRecurringDialogOpen] = useState(false);
  const [isSessionDialogOpen, setIsSessionDialogOpen] = useState(false);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [isChargeDialogOpen, setIsChargeDialogOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<"CANCELLED" | "NO_SHOW" | null>(null);

  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [updateStatus, setUpdateStatus] = useState("");
  const [updateReason, setUpdateReason] = useState("");
  const [updating, setUpdating] = useState(false);
  const [updatePaymentMethod, setUpdatePaymentMethod] = useState("CASH");
  const [updatePaymentAmount, setUpdatePaymentAmount] = useState("");
  const [showUpdatePayment, setShowUpdatePayment] = useState(true);
  const [showUpdateAdvanced, setShowUpdateAdvanced] = useState(false);
  const [updatePaymentType, setUpdatePaymentType] = useState<"FULL" | "PARTIAL">("FULL");
  const [updatePartialAmount, setUpdatePartialAmount] = useState("");
  const [updateNoChargeReason, setUpdateNoChargeReason] = useState("");
  const [updateClientDebt, setUpdateClientDebt] = useState<{ total: number; count: number } | null>(null);
  const [updateIssueReceipt, setUpdateIssueReceipt] = useState(false);
  const [updateReceiptMode, setUpdateReceiptMode] = useState<string>("ASK");
  const [updateBusinessType, setUpdateBusinessType] = useState<string>("NONE");
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  const [paymentData, setPaymentData] = useState<{
    sessionId: string;
    clientId: string;
    amount: number;
    paymentId?: string;
    pendingSessionStatus?: string;
  } | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [formData, setFormData] = useState({
    clientId: "",
    startTime: "",
    endTime: "",
    type: "IN_PERSON",
    price: "",
    isRecurring: false,
    weeksToRepeat: 4,
  });
  const [recurringFormData, setRecurringFormData] = useState({
    dayOfWeek: 0,
    time: "09:00",
    duration: defaultSessionDuration,
    clientId: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDurationCustomizer, setShowDurationCustomizer] = useState(false);
  const [customDuration, setCustomDuration] = useState(defaultSessionDuration);
  const paramsHandled = useRef(false);
  const [overlaps, setOverlaps] = useState<any[]>([]);
  const [showOverlapsDialog, setShowOverlapsDialog] = useState(false);
  const [deletingOverlap, setDeletingOverlap] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const [sessionsRes, clientsRes, patternsRes, profileRes] = await Promise.all([
        fetch("/api/sessions"),
        fetch("/api/clients"),
        fetch("/api/recurring-patterns"),
        fetch("/api/user/profile"),
      ]);
      
      if (sessionsRes.ok && clientsRes.ok) {
        const sessionsData = await sessionsRes.json();
        const clientsData = await clientsRes.json();
        
        // Map sessionNote.content to sessionNote for easier access
        const mappedSessions = sessionsData.map((session: any) => ({
          ...session,
          sessionNote: session.sessionNote?.content || null,
        }));
        
        setSessions(mappedSessions);
        setClients(clientsData);
      }

      if (patternsRes.ok) {
        const patternsData = await patternsRes.json();
        setRecurringPatterns(patternsData);
      }

      if (profileRes.ok) {
        const profileData = await profileRes.json();
        setDefaultSessionDuration(profileData.defaultSessionDuration || 50);
      }
    } catch (error) {
      console.error("Failed to fetch data:", error);
      toast.error("שגיאה בטעינת הנתונים");
    } finally {
      setIsLoading(false);
    }
  }, []);

  const checkOverlaps = useCallback(async () => {
    try {
      const res = await fetch("/api/sessions/overlaps");
      if (res.ok) {
        const data = await res.json();
        setOverlaps(data.overlaps || []);
      }
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => {
    fetchData();
    checkOverlaps();

    const interval = setInterval(() => {
      fetch("/api/sessions").then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          const mapped = data.map((s: any) => ({ ...s, sessionNote: s.sessionNote?.content || null }));
          setSessions(mapped);
        }
      }).catch(() => {});
    }, 30_000);

    const onFocus = () => {
      fetch("/api/sessions").then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          const mapped = data.map((s: any) => ({ ...s, sessionNote: s.sessionNote?.content || null }));
          setSessions(mapped);
        }
      }).catch(() => {});
    };
    window.addEventListener("focus", onFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [fetchData, checkOverlaps]);

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

  useEffect(() => {
    setRecurringFormData(prev => ({ ...prev, duration: defaultSessionDuration }));
  }, [defaultSessionDuration]);

  // הצג פגישות מבוטלות שכבר עברו, הסתר מבוטלות עתידיות
  const events: CalendarEvent[] = sessions
    .filter((session) => {
      if (session.status !== "CANCELLED") return true;
      return new Date(session.endTime) < new Date();
    })
    .map((session) => ({
      id: session.id,
      title: session.type === "BREAK" ? "🌊 הפסקה" : (session.client?.name || "ללא שם"),
      start: new Date(session.startTime),
      end: new Date(session.endTime),
      backgroundColor:
        session.type === "BREAK"
          ? "var(--chart-2)"
          : session.status === "CANCELLED"
          ? "#E5E7EB"
          : session.status === "COMPLETED"
          ? "var(--primary)"
          : session.status === "NO_SHOW"
          ? "#FCA5A5"
          : session.status === "PENDING_APPROVAL"
          ? "#FDE68A"
          : session.status === "SCHEDULED" && new Date(session.endTime) < new Date()
          ? "#BAE6FD"
          : "#A7F3D0",
      textColor:
        session.type === "BREAK"
          ? "#ffffff"
          : session.status === "CANCELLED"
          ? "#6B7280"
          : session.status === "COMPLETED"
          ? "#ffffff"
          : session.status === "NO_SHOW"
          ? "#7F1D1D"
          : session.status === "PENDING_APPROVAL"
          ? "#92400E"
          : session.status === "SCHEDULED" && new Date(session.endTime) < new Date()
          ? "#0C4A6E"
          : "#064E3B",
    borderColor:
      session.type === "BREAK"
        ? "var(--chart-2)"
        : session.status === "CANCELLED"
        ? "#9CA3AF"
        : session.status === "COMPLETED"
        ? "var(--primary)"
        : session.status === "NO_SHOW"
        ? "#DC2626"
        : session.status === "PENDING_APPROVAL"
        ? "#F59E0B"
        : session.status === "SCHEDULED" && new Date(session.endTime) < new Date()
        ? "#0EA5E9"
        : "#059669",
    classNames: [
      ...(session.status === "PENDING_APPROVAL" ? ["fc-event-pending-pulse"] : []),
      ...(highlightParam === session.id ? ["fc-event-highlighted"] : []),
    ],
    extendedProps: {
      clientId: session.client?.id || "",
      status: session.status,
      type: session.type,
    },
  }));

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
    
    setFormData({
      clientId: "",
      startTime: `${dateStr}T${timeStr}`,
      endTime: `${dateStr}T${format(endTime, "HH:mm")}`,
      type: "IN_PERSON",
      price: "",
      isRecurring: false,
      weeksToRepeat: 4,
    });
    setCustomDuration(defaultSessionDuration);
    setShowDurationCustomizer(false);
    setIsDialogOpen(true);
  };

  // Play wave sound using Web Audio API
  const playWaveSound = () => {
    try {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const duration = 3;
      
      // Create multiple oscillators for a richer wave sound
      const frequencies = [200, 300, 400];
      frequencies.forEach((freq, index) => {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(freq, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(freq * 0.7, audioContext.currentTime + duration);
        
        // Fade in and out
        gainNode.gain.setValueAtTime(0, audioContext.currentTime);
        gainNode.gain.linearRampToValueAtTime(0.03 / (index + 1), audioContext.currentTime + 0.1);
        gainNode.gain.linearRampToValueAtTime(0, audioContext.currentTime + duration);
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + duration);
      });
    } catch (error) {
      console.log('Audio not available:', error);
    }
  };

  const handleEventClick = (info: EventClickArg) => {
    const session = sessions.find(s => s.id === info.event.id);
    if (session) {
      const isPast = new Date(session.startTime) < new Date();
      if (isPast && session.status === "SCHEDULED" && session.type !== "BREAK") {
        setSelectedSession(session);
        setUpdatePaymentAmount(session.price ? session.price.toString() : "");
        setUpdateDialogOpen(true);
      } else {
        setSelectedSession(session);
        setIsSessionDialogOpen(true);
      }
    }
  };

  const resetUpdateDialog = () => {
    setUpdateDialogOpen(false);
    setUpdateStatus("");
    setUpdateReason("");
    setUpdatePaymentAmount("");
    setShowUpdatePayment(true);
    setShowUpdateAdvanced(false);
    setUpdatePaymentType("FULL");
    setUpdatePartialAmount("");
    setUpdateNoChargeReason("");
    setUpdateIssueReceipt(false);
  };

  useEffect(() => {
    if (updateDialogOpen && selectedSession?.client?.id) {
      fetch(`/api/payments/client-debt/${selectedSession.client.id}`)
        .then(res => res.json())
        .then(data => {
          setUpdateClientDebt({
            total: Number(data.totalDebt || 0),
            count: data.unpaidSessions?.length || 0,
          });
        })
        .catch(() => setUpdateClientDebt(null));
    } else {
      setUpdateClientDebt(null);
    }
  }, [updateDialogOpen, selectedSession?.client?.id]);

  useEffect(() => {
    if (updateDialogOpen) {
      fetch("/api/user/business-settings")
        .then(res => res.json())
        .then(data => {
          if (data.businessType) setUpdateBusinessType(data.businessType);
          if (data.receiptDefaultMode) setUpdateReceiptMode(data.receiptDefaultMode);
          if (data.receiptDefaultMode === "ALWAYS") setUpdateIssueReceipt(true);
          else if (data.receiptDefaultMode === "NEVER") setUpdateIssueReceipt(false);
        })
        .catch(() => {});
    }
  }, [updateDialogOpen]);

  const handleUpdateSession = async () => {
    if (!updateStatus || !selectedSession) { toast.error("בחר סטטוס"); return; }
    setUpdating(true);
    try {
      if (updateStatus === "COMPLETED" && showUpdatePayment && selectedSession.price > 0 && selectedSession.client) {
        const paymentAmount = updatePaymentType === "PARTIAL"
          ? (parseFloat(updatePartialAmount) || 0)
          : Number(selectedSession.price);

        if (updatePaymentType === "PARTIAL" && (paymentAmount <= 0 || paymentAmount > selectedSession.price)) {
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
            amount: paymentAmount,
            expectedAmount: Number(selectedSession.price),
            paymentType: updatePaymentType === "PARTIAL" ? "PARTIAL" : "FULL",
            method: updatePaymentMethod,
            status: updatePaymentType === "PARTIAL" ? "PENDING" : "PAID",
            issueReceipt: updateBusinessType !== "NONE" && updateIssueReceipt,
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
        resetUpdateDialog();
        setSelectedSession(null);
        fetchData();
        return;
      }

      const updates: Promise<Response>[] = [];

      const statusBody: Record<string, unknown> = { status: updateStatus };
      if (updateStatus === "CANCELLED") {
        statusBody.cancellationReason = updateReason.trim() || undefined;
      }
      updates.push(
        fetch(`/api/sessions/${selectedSession.id}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(statusBody),
        })
      );

      if (showUpdatePayment && selectedSession.price > 0) {
        const amt = updatePaymentType === "PARTIAL"
          ? parseFloat(updatePartialAmount) || 0
          : parseFloat(updatePaymentAmount) || 0;
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
                paymentType: updatePaymentType === "PARTIAL" ? "PARTIAL" : "FULL",
                method: updatePaymentMethod,
                status: updatePaymentType === "PARTIAL" ? "PENDING" : "PAID",
                issueReceipt: updateBusinessType !== "NONE" && updateIssueReceipt,
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
      resetUpdateDialog();
      setSelectedSession(null);
      fetchData();
    } catch {
      toast.error("שגיאה בעדכון הפגישה");
    } finally {
      setUpdating(false);
    }
  };

  // פתיחת דיאלוג פגישה חדשה מיד אחרי פגישה קיימת
  const handleAddSessionAfter = (session: Session) => {
    const endTime = new Date(session.endTime);
    const dateStr = format(endTime, "yyyy-MM-dd");
    const timeStr = format(endTime, "HH:mm");
    const newEndTime = new Date(endTime);
    newEndTime.setMinutes(newEndTime.getMinutes() + defaultSessionDuration);
    
    setFormData({
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

  // עדכון משך פגישה והחישוב מחדש של שעת סיום
  const handleDurationChange = (minutes: number) => {
    setCustomDuration(minutes);
    if (formData.startTime) {
      const start = new Date(formData.startTime);
      const end = new Date(start);
      end.setMinutes(end.getMinutes() + minutes);
      setFormData((prev) => ({
        ...prev,
        endTime: format(end, "yyyy-MM-dd'T'HH:mm")
      }));
    }
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Skip client validation for BREAK type
    if (formData.type !== "BREAK" && (!formData.clientId || !formData.startTime || !formData.endTime)) {
      toast.error("נא למלא את כל השדות");
      return;
    }
    
    if (formData.type === "BREAK" && (!formData.startTime || !formData.endTime)) {
      toast.error("נא למלא את שעות ההפסקה");
      return;
    }

    setIsSubmitting(true);

    try {
      // Create the first session
      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: formData.clientId,
          startTime: formData.startTime,
          endTime: formData.endTime,
          type: formData.type,
          price: parseFloat(formData.price) || 0,
          isRecurring: formData.isRecurring,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        throw new Error(errData?.message || "שגיאה ביצירת הפגישה");
      }

      // If recurring, create additional sessions for future weeks
      if (formData.isRecurring && formData.weeksToRepeat > 1) {
        const startDate = new Date(formData.startTime);
        const endDate = new Date(formData.endTime);

        for (let i = 1; i < formData.weeksToRepeat; i++) {
          const newStart = addWeeks(startDate, i);
          const newEnd = addWeeks(endDate, i);

          // Use local datetime format (same as first session) to preserve timezone
          const newStartLocal = format(newStart, "yyyy-MM-dd'T'HH:mm");
          const newEndLocal = format(newEnd, "yyyy-MM-dd'T'HH:mm");

          await fetch("/api/sessions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              clientId: formData.clientId,
              startTime: newStartLocal,
              endTime: newEndLocal,
              type: formData.type,
              price: parseFloat(formData.price) || 0,
              isRecurring: true,
            }),
          });
        }
      }

      toast.success(formData.isRecurring 
        ? `${formData.weeksToRepeat} פגישות נוצרו בהצלחה` 
        : "הפגישה נוצרה בהצלחה"
      );
      setIsDialogOpen(false);
      fetchData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "שגיאה ביצירת הפגישה");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRecurringSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/recurring-patterns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(recurringFormData),
      });

      if (!response.ok) {
        throw new Error("שגיאה ביצירת התבנית");
      }

      toast.success("תבנית חוזרת נוצרה בהצלחה");
      setIsRecurringDialogOpen(false);
      fetchData();
    } catch {
      toast.error("שגיאה ביצירת התבנית");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApplyRecurring = async (weeksAhead: number = 4) => {
    setIsSubmitting(true);
    
    try {
      const response = await fetch("/api/recurring-patterns/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weeksAhead }),
      });

      if (!response.ok) {
        throw new Error("שגיאה בהחלת התבניות");
      }

      const result = await response.json();
      toast.success(`${result.created} פגישות נוצרו מהתבניות`);
      fetchData();
    } catch {
      toast.error("שגיאה בהחלת התבניות");
    } finally {
      setIsSubmitting(false);
    }
  };

  // פונקציה למחיקת פגישה
  const handleDeleteSession = async () => {
    if (!selectedSession) return;
    
    if (!confirm("האם אתה בטוח שברצונך למחוק את הפגישה?")) {
      return;
    }
    
    try {
      const response = await fetch(`/api/sessions/${selectedSession.id}`, {
        method: "DELETE",
      });
      
      if (!response.ok) {
        throw new Error("שגיאה במחיקת הפגישה");
      }
      
      toast.success("הפגישה נמחקה בהצלחה");
      setIsSessionDialogOpen(false);
      setSelectedSession(null);
      fetchData();
    } catch {
      toast.error("שגיאה במחיקת הפגישה");
    }
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
            setFormData({
              clientId: "",
              startTime: "",
              endTime: "",
              type: "IN_PERSON",
              price: "",
              isRecurring: false,
              weeksToRepeat: 4,
            });
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
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>פגישה חדשה</DialogTitle>
            <DialogDescription>
              {selectedDate && format(selectedDate, "EEEE, d בMMMM yyyy")}
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            {formData.type !== "BREAK" && (
              <div className="space-y-2">
                <Label htmlFor="clientId">מטופל</Label>
                <Select
                  value={formData.clientId}
                  onValueChange={(value) => {
                    const selectedClient = clients.find((c) => c.id === value);
                    setFormData((prev) => ({
                      ...prev,
                      clientId: value,
                      // Auto-populate price from client's default if available
                      price: selectedClient?.defaultSessionPrice 
                        ? String(selectedClient.defaultSessionPrice) 
                        : prev.price,
                    }));
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="בחר מטופל" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map((client) => (
                      <SelectItem key={client.id} value={client.id}>
                        {client.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="startTime">שעת התחלה</Label>
                <Input
                  id="startTime"
                  type="datetime-local"
                  value={formData.startTime}
                  onChange={(e) => {
                    const startValue = e.target.value;
                    if (startValue) {
                      const start = new Date(startValue);
                      const end = new Date(start);
                      end.setMinutes(end.getMinutes() + defaultSessionDuration);
                      setFormData((prev) => ({
                        ...prev,
                        startTime: startValue,
                        endTime: format(end, "yyyy-MM-dd'T'HH:mm")
                      }));
                    } else {
                      setFormData((prev) => ({ ...prev, startTime: startValue }));
                    }
                  }}
                  dir="ltr"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="endTime">שעת סיום</Label>
                <Input
                  id="endTime"
                  type="datetime-local"
                  value={formData.endTime}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, endTime: e.target.value }))
                  }
                  dir="ltr"
                />
              </div>
            </div>

            {/* Duration Customizer */}
            <div className="space-y-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => setShowDurationCustomizer(!showDurationCustomizer)}
                className="w-full text-sm text-muted-foreground hover:text-primary"
              >
                <Settings className="h-4 w-4 ml-2" />
                התאם משך פגישה
              </Button>
              
              {showDurationCustomizer && (
                <div className="border rounded-lg p-3 bg-slate-50 space-y-3 animate-in slide-in-from-top-2">
                  <div className="flex items-center gap-2">
                    <Label htmlFor="customDuration" className="text-sm whitespace-nowrap">
                      משך (דקות):
                    </Label>
                    <Input
                      id="customDuration"
                      type="number"
                      min="5"
                      max="180"
                      value={customDuration}
                      onChange={(e) => handleDurationChange(parseInt(e.target.value) || defaultSessionDuration)}
                      className="w-20 bg-white"
                    />
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {[15, 30, 45, 60].map((minutes) => (
                      <Button
                        key={minutes}
                        type="button"
                        variant={customDuration === minutes ? "default" : "outline"}
                        size="sm"
                        onClick={() => handleDurationChange(minutes)}
                        className="text-xs"
                      >
                        {minutes} דק׳
                      </Button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="type">סוג פגישה</Label>
                <Select
                  value={formData.type}
                  onValueChange={(value) =>
                    setFormData((prev) => ({ ...prev, type: value }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BREAK">
                      <div className="flex items-center gap-2">
                        <Waves className="h-4 w-4" />
                        הפסקה
                      </div>
                    </SelectItem>
                    <SelectItem value="IN_PERSON">פרונטלי</SelectItem>
                    <SelectItem value="ONLINE">אונליין</SelectItem>
                    <SelectItem value="PHONE">טלפון</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="price">מחיר (₪)</Label>
                <Input
                  id="price"
                  type="number"
                  placeholder="0"
                  value={formData.price}
                  onChange={(e) =>
                    setFormData((prev) => ({ ...prev, price: e.target.value }))
                  }
                  dir="ltr"
                />
              </div>
            </div>

            {/* Recurring Options */}
            <div className="flex items-center justify-between p-4 rounded-lg bg-muted/50">
              <div className="flex items-center gap-3">
                <Repeat className="h-5 w-5 text-muted-foreground" />
                <div>
                  <p className="font-medium">פגישה חוזרת</p>
                  <p className="text-sm text-muted-foreground">
                    שכפל את הפגישה לשבועות הבאים
                  </p>
                </div>
              </div>
              <Switch
                checked={formData.isRecurring}
                onCheckedChange={(checked) =>
                  setFormData((prev) => ({ ...prev, isRecurring: checked }))
                }
              />
            </div>

            {formData.isRecurring && (
              <div className="space-y-2">
                <Label>כמה שבועות?</Label>
                <Select
                  value={formData.weeksToRepeat.toString()}
                  onValueChange={(value) =>
                    setFormData((prev) => ({ ...prev, weeksToRepeat: parseInt(value) }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[2, 4, 8, 12, 16].map((weeks) => (
                      <SelectItem key={weeks} value={weeks.toString()}>
                        {weeks} שבועות
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
                disabled={isSubmitting}
              >
                ביטול
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                    יוצר...
                  </>
                ) : (
                  "צור פגישה"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Recurring Pattern Dialog */}
      <Dialog open={isRecurringDialogOpen} onOpenChange={setIsRecurringDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>ניהול תבניות שבועיות</DialogTitle>
            <DialogDescription>
              הגדר תבנית קבועה שתחזור בכל שבוע
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="patterns">
            <TabsList className="w-full">
              <TabsTrigger value="patterns" className="flex-1">תבניות קיימות</TabsTrigger>
              <TabsTrigger value="new" className="flex-1">תבנית חדשה</TabsTrigger>
            </TabsList>

            <TabsContent value="patterns" className="space-y-4 mt-4">
              {recurringPatterns.length > 0 ? (
                <>
                  <div className="space-y-2">
                    {recurringPatterns.map((pattern) => (
                      <div
                        key={pattern.id}
                        className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                      >
                        <div>
                          <p className="font-medium">
                            יום {DAYS_OF_WEEK.find((d) => d.value === pattern.dayOfWeek)?.label} בשעה {pattern.time}
                          </p>
                          <p className="text-sm text-muted-foreground">
                            {pattern.duration} דקות
                            {pattern.client && ` • ${pattern.client.name}`}
                          </p>
                        </div>
                        <Switch
                          checked={pattern.isActive}
                          onCheckedChange={async (checked) => {
                            await fetch(`/api/recurring-patterns/${pattern.id}`, {
                              method: "PUT",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ isActive: checked }),
                            });
                            fetchData();
                          }}
                        />
                      </div>
                    ))}
                  </div>
                  <Button
                    onClick={() => handleApplyRecurring(4)}
                    disabled={isSubmitting}
                    className="w-full"
                  >
                    {isSubmitting ? (
                      <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Calendar className="ml-2 h-4 w-4" />
                    )}
                    החל על 4 שבועות הבאים
                  </Button>
                </>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  <Repeat className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>אין תבניות עדיין</p>
                  <p className="text-sm">עבור ללשונית "תבנית חדשה" ליצירה</p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="new" className="mt-4">
              <form onSubmit={handleRecurringSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>יום בשבוע</Label>
                    <Select
                      value={recurringFormData.dayOfWeek.toString()}
                      onValueChange={(value) =>
                        setRecurringFormData((prev) => ({ ...prev, dayOfWeek: parseInt(value) }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DAYS_OF_WEEK.map((day) => (
                          <SelectItem key={day.value} value={day.value.toString()}>
                            {day.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>שעה</Label>
                    <Select
                      value={recurringFormData.time}
                      onValueChange={(value) =>
                        setRecurringFormData((prev) => ({ ...prev, time: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="max-h-60">
                        {TIME_SLOTS.map((time) => (
                          <SelectItem key={time} value={time}>
                            {time}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>משך (דקות)</Label>
                    <Select
                      value={recurringFormData.duration.toString()}
                      onValueChange={(value) =>
                        setRecurringFormData((prev) => ({ ...prev, duration: parseInt(value) }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="30">30 דקות</SelectItem>
                        <SelectItem value="45">45 דקות</SelectItem>
                        <SelectItem value="50">50 דקות</SelectItem>
                        <SelectItem value="60">שעה</SelectItem>
                        <SelectItem value="90">שעה וחצי</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>מטופל (אופציונלי)</Label>
                    <Select
                      value={recurringFormData.clientId}
                      onValueChange={(value) =>
                        setRecurringFormData((prev) => ({ ...prev, clientId: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="ללא" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">ללא</SelectItem>
                        {clients.map((client) => (
                          <SelectItem key={client.id} value={client.id}>
                            {client.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <DialogFooter>
                  <Button type="submit" disabled={isSubmitting}>
                    {isSubmitting ? (
                      <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Plus className="ml-2 h-4 w-4" />
                    )}
                    צור תבנית
                  </Button>
                </DialogFooter>
              </form>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Session Detail Dialog */}
      <Dialog open={isSessionDialogOpen} onOpenChange={setIsSessionDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>פרטי פגישה</DialogTitle>
            {selectedSession && (
              <DialogDescription>
                {selectedSession.client?.name || "הפסקה"} • {format(new Date(selectedSession.startTime), "d/M/yyyy HH:mm")}
              </DialogDescription>
            )}
          </DialogHeader>
          
          {selectedSession && (
            <div className="space-y-4">
              {/* Status Badge */}
              <div className="flex items-center gap-2 pb-2 border-b">
                <p className="text-sm text-muted-foreground">סטטוס:</p>
                <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                  selectedSession.status === "COMPLETED" 
                    ? "bg-green-100 text-green-800" 
                    : selectedSession.status === "NO_SHOW"
                    ? "bg-red-100 text-red-800"
                    : selectedSession.status === "CANCELLED"
                    ? "bg-gray-100 text-gray-800"
                    : selectedSession.status === "PENDING_APPROVAL"
                    ? "bg-amber-100 text-amber-800"
                    : "bg-sky-100 text-sky-800"
                }`}>
                  {selectedSession.status === "COMPLETED" 
                    ? "✅ הושלם" 
                    : selectedSession.status === "NO_SHOW"
                    ? "⚠️ אי הופעה"
                    : selectedSession.status === "CANCELLED"
                    ? "❌ בוטל"
                    : selectedSession.status === "PENDING_APPROVAL"
                    ? "📋 ממתין לאישור"
                    : "🕐 מתוכנן"}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-muted-foreground">סוג</p>
                  <p className="font-medium">
                    {selectedSession.type === "ONLINE" ? "אונליין" : 
                     selectedSession.type === "PHONE" ? "טלפון" : 
                     selectedSession.type === "BREAK" ? "הפסקה" : "פרונטלי"}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">מחיר</p>
                  <p className="font-medium">₪{selectedSession.price}</p>
                </div>
              </div>

              {/* Time Editor - Show for future sessions */}
              {selectedSession.status === "SCHEDULED" && new Date(selectedSession.startTime) > new Date() && (
                <div className="border rounded-lg p-4 bg-slate-50 space-y-3">
                  <p className="text-sm font-medium mb-3">עריכת זמן פגישה</p>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="edit-startTime" className="text-xs">שעת התחלה</Label>
                      <Input
                        id="edit-startTime"
                        type="datetime-local"
                        value={format(new Date(selectedSession.startTime), "yyyy-MM-dd'T'HH:mm")}
                        onChange={(e) => {
                          const newStartTime = new Date(e.target.value);
                          const duration = new Date(selectedSession.endTime).getTime() - new Date(selectedSession.startTime).getTime();
                          const newEndTime = new Date(newStartTime.getTime() + duration);
                          
                          fetch(`/api/sessions/${selectedSession.id}`, {
                            method: "PUT",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              startTime: newStartTime.toISOString(),
                              endTime: newEndTime.toISOString(),
                            }),
                          }).then(res => {
                            if (res.ok) {
                              toast.success("הזמן עודכן בהצלחה");
                              fetchData();
                              res.json().then(updated => setSelectedSession(updated));
                            } else {
                              toast.error("שגיאה בעדכון הזמן");
                            }
                          });
                        }}
                        dir="ltr"
                        className="text-sm"
                      />
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="edit-endTime" className="text-xs">שעת סיום</Label>
                      <Input
                        id="edit-endTime"
                        type="datetime-local"
                        value={format(new Date(selectedSession.endTime), "yyyy-MM-dd'T'HH:mm")}
                        onChange={(e) => {
                          const newEndTime = new Date(e.target.value);
                          
                          fetch(`/api/sessions/${selectedSession.id}`, {
                            method: "PUT",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              endTime: newEndTime.toISOString(),
                            }),
                          }).then(res => {
                            if (res.ok) {
                              toast.success("הזמן עודכן בהצלחה");
                              fetchData();
                              res.json().then(updated => setSelectedSession(updated));
                            } else {
                              toast.error("שגיאה בעדכון הזמן");
                            }
                          });
                        }}
                        dir="ltr"
                        className="text-sm"
                      />
                    </div>
                  </div>
                </div>
              )}
              
              {/* Delete Button - Show for future sessions (but not for breaks) */}
              {selectedSession.status === "SCHEDULED" && new Date(selectedSession.startTime) > new Date() && selectedSession.type !== "BREAK" && (
                <Button
                  onClick={handleDeleteSession}
                  variant="destructive"
                  className="w-full gap-2"
                >
                  <Trash2 className="h-4 w-4" />
                  מחק פגישה
                </Button>
              )}

              <div className="flex flex-col gap-2">
                {/* Different buttons for BREAK vs regular sessions */}
                {selectedSession.type === "BREAK" ? (
                  <>
                    <Button
                      onClick={() => {
                        setIsSessionDialogOpen(false);
                        setIsDialogOpen(true);
                        setFormData({
                          ...formData,
                          startTime: format(new Date(selectedSession.startTime), "yyyy-MM-dd'T'HH:mm"),
                          endTime: format(new Date(selectedSession.endTime), "yyyy-MM-dd'T'HH:mm"),
                          type: "IN_PERSON"
                        });
                      }}
                      className="w-full"
                    >
                      📅 הקבע פגישה במקום ההפסקה
                    </Button>
                    
                    <Button
                      onClick={async () => {
                        if (confirm("האם אתה בטוח שברצונך למחוק את ההפסקה?")) {
                          try {
                            await fetch(`/api/sessions/${selectedSession.id}`, {
                              method: "DELETE",
                            });
                            setIsSessionDialogOpen(false);
                            toast.success("ההפסקה נמחקה בהצלחה");
                            fetchData();
                          } catch {
                            toast.error("שגיאה במחיקת ההפסקה");
                          }
                        }
                      }}
                      variant="destructive"
                      className="w-full"
                    >
                      🗑️ מחק הפסקה
                    </Button>
                  </>
                ) : selectedSession.status === "PENDING_APPROVAL" ? (
                  <>
                    <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-3">
                      <p className="text-sm font-medium text-amber-800 text-center">פגישה זו נקבעה דרך זימון עצמי וממתינה לאישורך</p>
                      {(selectedSession.client?.email || selectedSession.client?.phone) && (
                        <div className="text-sm text-amber-700 space-y-1 border-t border-amber-200 pt-2">
                          {selectedSession.client.phone && (
                            <p><strong>טלפון:</strong> <a href={`tel:${selectedSession.client.phone}`} className="underline">{selectedSession.client.phone}</a></p>
                          )}
                          {selectedSession.client.email && (
                            <p><strong>מייל:</strong> <a href={`mailto:${selectedSession.client.email}`} className="underline">{selectedSession.client.email}</a></p>
                          )}
                        </div>
                      )}
                      <div className="flex gap-2">
                        <Button
                          onClick={async () => {
                            const res = await fetch(`/api/sessions/${selectedSession.id}/status`, {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ status: "SCHEDULED" }),
                            });
                            if (res.ok) {
                              toast.success("הפגישה אושרה!");
                              fetchData();
                              setIsSessionDialogOpen(false);
                            } else {
                              const errorData = await res.json().catch(() => null);
                              toast.error(errorData?.message || "שגיאה באישור הפגישה");
                            }
                          }}
                          className="flex-1 bg-green-600 hover:bg-green-700"
                        >
                          ✅ אשר פגישה
                        </Button>
                        <Button
                          onClick={async () => {
                            const res = await fetch(`/api/sessions/${selectedSession.id}/status`, {
                              method: "PATCH",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ status: "CANCELLED" }),
                            });
                            if (res.ok) {
                              toast.success("הפגישה נדחתה");
                              fetchData();
                              setIsSessionDialogOpen(false);
                            } else {
                              const errorData = await res.json().catch(() => null);
                              toast.error(errorData?.message || "שגיאה בדחיית הפגישה");
                            }
                          }}
                          variant="destructive"
                          className="flex-1"
                        >
                          ❌ דחה
                        </Button>
                      </div>
                    </div>
                  </>
                ) : selectedSession.status === "SCHEDULED" ? (
                  <>
                    <div className="border rounded-lg divide-y">
                      <p className="text-sm font-medium text-center py-2 bg-muted/50">בחר פעולה:</p>
                      
                      {/* 1. סיים ושלם */}
                      <button
                        onClick={() => {
                          if (!selectedSession.client) return;
                          setIsSessionDialogOpen(false);
                          setPaymentData({
                            sessionId: selectedSession.id,
                            clientId: selectedSession.client.id,
                            amount: selectedSession.price - Number(selectedSession.payment?.amount || 0),
                            pendingSessionStatus: "COMPLETED",
                          });
                          setIsPaymentDialogOpen(true);
                        }}
                        className="w-full py-3 px-4 text-right hover:bg-green-50 transition-colors flex items-center gap-3"
                      >
                        <span className="flex items-center justify-center w-7 h-7 rounded-full bg-green-600 text-white text-sm font-bold">1</span>
                        <span className="flex-1 font-medium">✅ סיים ושלם</span>
                      </button>
                      
                      {/* 2. סיים ללא תשלום */}
                      <button
                        onClick={async () => {
                          try {
                            await fetch(`/api/sessions/${selectedSession.id}`, {
                              method: "PUT",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ status: "COMPLETED" }),
                            });
                            toast.success("הפגישה הושלמה ללא תשלום");
                            setIsSessionDialogOpen(false);
                            fetchData();
                          } catch {
                            toast.error("שגיאה בעדכון הפגישה");
                          }
                        }}
                        className="w-full py-3 px-4 text-right hover:bg-sky-50 transition-colors flex items-center gap-3"
                      >
                        <span className="flex items-center justify-center w-7 h-7 rounded-full bg-sky-600 text-white text-sm font-bold">2</span>
                        <span className="flex-1 font-medium">סיים ללא תשלום</span>
                      </button>
                      
                      {/* 3. אי הופעה */}
                      <button
                        onClick={() => {
                          setPendingAction("NO_SHOW");
                          setIsChargeDialogOpen(true);
                        }}
                        className="w-full py-3 px-4 text-right hover:bg-red-50 transition-colors flex items-center gap-3"
                      >
                        <span className="flex items-center justify-center w-7 h-7 rounded-full bg-red-600 text-white text-sm font-bold">3</span>
                        <span className="flex-1 font-medium">🚫 אי הופעה</span>
                      </button>
                      
                      {/* 4. ביטול */}
                      <button
                        onClick={async () => {
                          if (!selectedSession) return;
                          const sessionStart = new Date(selectedSession.startTime);
                          const hoursUntil = (sessionStart.getTime() - Date.now()) / (1000 * 60 * 60);

                          if (hoursUntil > 24) {
                            // Future session (>24h) — cancel and remove, no charge dialog
                            if (!confirm("האם אתה בטוח שברצונך לבטל את הפגישה?")) return;
                            try {
                              await fetch(`/api/sessions/${selectedSession.id}`, {
                                method: "PUT",
                                headers: { "Content-Type": "application/json" },
                                body: JSON.stringify({ status: "CANCELLED" }),
                              });
                              toast.success("הפגישה בוטלה");
                              setIsSessionDialogOpen(false);
                              setSelectedSession(null);
                              fetchData();
                            } catch {
                              toast.error("שגיאה בביטול הפגישה");
                            }
                          } else {
                            // Past or near session — show charge dialog
                            setPendingAction("CANCELLED");
                            setIsChargeDialogOpen(true);
                          }
                        }}
                        className="w-full py-3 px-4 text-right hover:bg-orange-50 transition-colors flex items-center gap-3"
                      >
                        <span className="flex items-center justify-center w-7 h-7 rounded-full bg-orange-600 text-white text-sm font-bold">4</span>
                        <span className="flex-1 font-medium">❌ ביטול פגישה</span>
                      </button>
                    </div>
                  </>
                ) : selectedSession.status === "COMPLETED" ? (
                  <>
                    {/* כפתורים לפגישה שהושלמה */}
                    <div className="space-y-2">
                      <Button
                        onClick={() => {
                          setIsSessionDialogOpen(false);
                          router.push(`/dashboard/clients/${selectedSession.client?.id}`);
                        }}
                        className="w-full gap-2"
                      >
                        <User className="h-4 w-4" />
                        תיקית מטופל
                      </Button>
                      <Button
                        onClick={() => {
                          setIsSessionDialogOpen(false);
                          router.push(`/dashboard/sessions/${selectedSession.id}`);
                        }}
                        className="w-full gap-2"
                        variant="outline"
                      >
                        <FileText className="h-4 w-4" />
                        סיכום פגישה
                      </Button>
                      {/* כפתור תשלום דינמי - רק אם יש payment record */}
                      {selectedSession.payment && selectedSession.client ? (
                        <QuickMarkPaid
                          sessionId={selectedSession.id}
                          clientId={selectedSession.client.id}
                          clientName={selectedSession.client.name}
                          amount={selectedSession.price - Number(selectedSession.payment?.amount || 0)}
                          creditBalance={Number(selectedSession.client.creditBalance || 0)}
                          existingPayment={selectedSession.payment}
                          buttonText="רשום תשלום / הצג קבלה"
                        />
                      ) : (
                        <div className="space-y-2">
                          <div className="w-full py-3 px-4 text-center rounded-lg bg-emerald-50 dark:bg-emerald-950 border-2 border-emerald-200 dark:border-emerald-800">
                            <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">💚 פטור מתשלום</p>
                            <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">לא מחייב</p>
                          </div>
                          {/* הערה קטנה להסבר */}
                          <div className="space-y-1">
                            <label className="text-xs text-muted-foreground">הערה (אופציונלי):</label>
                            <textarea
                              placeholder="למה לא מחייב? (למשל: מטופל ביטל מראש, חופש, וכו')"
                              defaultValue={selectedSession.sessionNote || ""}
                              className="w-full text-xs p-2 rounded border resize-none"
                              rows={2}
                              onBlur={async (e) => {
                                try {
                                  await fetch(`/api/sessions/${selectedSession.id}/note`, {
                                    method: "PUT",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ note: e.target.value }),
                                  });
                                  toast.success("הערה נשמרה");
                                } catch {
                                  toast.error("שגיאה בשמירת הערה");
                                }
                              }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                ) : selectedSession.status === "NO_SHOW" ? (
                  <>
                    {/* כפתורים לאי הופעה */}
                    <div className="space-y-2">
                      <Button
                        onClick={() => {
                          setIsSessionDialogOpen(false);
                          router.push(`/dashboard/clients/${selectedSession.client?.id}`);
                        }}
                        className="w-full gap-2"
                      >
                        <User className="h-4 w-4" />
                        תיקית מטופל
                      </Button>
                      <Button
                        onClick={() => {
                          setIsSessionDialogOpen(false);
                          router.push(`/dashboard/sessions/${selectedSession.id}`);
                        }}
                        className="w-full gap-2"
                        variant="outline"
                      >
                        <FileText className="h-4 w-4" />
                        הוסף הערה
                      </Button>
                      {selectedSession.client && (
                        selectedSession.payment ? (
                          <QuickMarkPaid
                            sessionId={selectedSession.id}
                            clientId={selectedSession.client.id}
                            clientName={selectedSession.client.name}
                            amount={selectedSession.price - Number(selectedSession.payment?.amount || 0)}
                            creditBalance={Number(selectedSession.client.creditBalance || 0)}
                            existingPayment={selectedSession.payment}
                            buttonText="רשום תשלום"
                          />
                        ) : (
                          <div className="space-y-2">
                            <div className="w-full py-3 px-4 text-center rounded-lg bg-emerald-50 dark:bg-emerald-950 border-2 border-emerald-200 dark:border-emerald-800">
                              <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">💚 פטור מתשלום</p>
                              <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">לא מחייב</p>
                            </div>
                            {/* הערה קטנה להסבר */}
                            <div className="space-y-1">
                              <label className="text-xs text-muted-foreground">הערה (אופציונלי):</label>
                              <textarea
                                placeholder="למה לא מחייב? (למשל: מטופל ביטל מראש, חופש, וכו')"
                                defaultValue={selectedSession.sessionNote || ""}
                                className="w-full text-xs p-2 rounded border resize-none"
                                rows={2}
                                onBlur={async (e) => {
                                  try {
                                    await fetch(`/api/sessions/${selectedSession.id}/note`, {
                                      method: "PUT",
                                      headers: { "Content-Type": "application/json" },
                                      body: JSON.stringify({ note: e.target.value }),
                                    });
                                    toast.success("הערה נשמרה");
                                  } catch {
                                    toast.error("שגיאה בשמירת הערה");
                                  }
                                }}
                              />
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  </>
                ) : null}
              </div>
            </div>
          )}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsSessionDialogOpen(false)}>
              סגור
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

      {/* עדכון פגישה שעברה ולא עודכנה */}
      <Dialog open={updateDialogOpen} onOpenChange={(o) => { if (!o) resetUpdateDialog(); }}>
        <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-orange-500" />
              עדכון פגישה - {selectedSession?.client?.name}
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
                onClick={() => { setUpdateStatus("COMPLETED"); setShowUpdatePayment(true); }}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                הושלמה
              </Button>
              <Button
                type="button"
                variant={updateStatus === "CANCELLED" ? "default" : "outline"}
                size="sm"
                className={`h-10 text-xs gap-1 ${updateStatus === "CANCELLED" ? "bg-red-500 hover:bg-red-600" : ""}`}
                onClick={() => { setUpdateStatus("CANCELLED"); setShowUpdatePayment(true); }}
              >
                <Ban className="h-3.5 w-3.5" />
                בוטלה
              </Button>
              <Button
                type="button"
                variant={updateStatus === "NO_SHOW" ? "default" : "outline"}
                size="sm"
                className={`h-10 text-xs gap-1 ${updateStatus === "NO_SHOW" ? "bg-amber-500 hover:bg-amber-600" : ""}`}
                onClick={() => { setUpdateStatus("NO_SHOW"); setShowUpdatePayment(true); }}
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

            {updateStatus && selectedSession && selectedSession.price > 0 && (
              <>
                {updateStatus !== "COMPLETED" && (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full font-bold text-base"
                    onClick={() => setShowUpdatePayment(false)}
                  >
                    {updateStatus === "CANCELLED" ? "ביטול ללא חיוב" : "אי הגעה ללא חיוב"}
                  </Button>
                )}

                {!showUpdatePayment && (
                  <div className="space-y-2 p-3 rounded-lg border bg-orange-50/50 border-orange-200">
                    <Label className="text-sm text-orange-700">סיבה לאי חיוב (אופציונלי)</Label>
                    <Textarea
                      value={updateNoChargeReason}
                      onChange={e => setUpdateNoChargeReason(e.target.value)}
                      placeholder="לדוגמה: סיכום מראש, פגישת היכרות, הסדר מיוחד..."
                      className="resize-none h-16 bg-white/80 border-orange-200 text-sm"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-xs text-sky-600"
                      onClick={() => setShowUpdatePayment(true)}
                    >
                      ← חזרה לתשלום
                    </Button>
                  </div>
                )}

                {showUpdatePayment && (
                  <div className="space-y-3 p-4 rounded-lg border bg-muted/30">
                    <div className="flex items-center justify-between">
                      <Label className="text-lg font-bold">
                        {updateStatus === "COMPLETED" ? "עדכון ותשלום 💰" : updateStatus === "CANCELLED" ? "דמי ביטול 💰" : "חיוב אי הגעה 💰"}
                      </Label>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label>סכום</Label>
                        <div className="relative">
                          <Input
                            type="number"
                            value={updatePaymentAmount}
                            onChange={e => setUpdatePaymentAmount(e.target.value)}
                            className="pl-8"
                            disabled={updatePaymentType !== "FULL"}
                          />
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">₪</span>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>אמצעי תשלום</Label>
                        <Select value={updatePaymentMethod} onValueChange={setUpdatePaymentMethod}>
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

                    {updateBusinessType !== "NONE" && updateReceiptMode !== "NEVER" && (
                      <div className="flex items-center gap-3 py-2 px-3 bg-sky-50 rounded-lg border border-sky-200">
                        <Checkbox
                          id="cal-update-issue-receipt"
                          checked={updateIssueReceipt}
                          onCheckedChange={(checked) => setUpdateIssueReceipt(checked === true)}
                          disabled={updateReceiptMode === "ALWAYS"}
                        />
                        <Label htmlFor="cal-update-issue-receipt" className="cursor-pointer flex items-center gap-2 text-sky-800">
                          <FileText className="h-4 w-4" />
                          הוצא קבלה
                          {updateReceiptMode === "ALWAYS" && (
                            <span className="text-xs text-sky-600">(ברירת מחדל)</span>
                          )}
                        </Label>
                      </div>
                    )}

                    <div className="space-y-3">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="w-full justify-between font-semibold"
                        onClick={() => setShowUpdateAdvanced(!showUpdateAdvanced)}
                      >
                        <span className="font-bold">אופציות מתקדמות</span>
                        {showUpdateAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </Button>
                      {showUpdateAdvanced && (
                        <div className="space-y-2 pt-2">
                          <div className="grid gap-2">
                            <Button
                              type="button"
                              variant={updatePaymentType === "FULL" ? "default" : "outline"}
                              size="sm"
                              onClick={() => setUpdatePaymentType("FULL")}
                            >
                              תשלום מלא (₪{selectedSession.price})
                            </Button>
                            <Button
                              type="button"
                              variant={updatePaymentType === "PARTIAL" ? "default" : "outline"}
                              size="sm"
                              onClick={() => setUpdatePaymentType("PARTIAL")}
                            >
                              תשלום חלקי
                            </Button>
                            {updatePaymentType === "PARTIAL" && (
                              <div className="pr-4 space-y-1">
                                <Input
                                  type="number"
                                  placeholder="הכנס סכום"
                                  value={updatePartialAmount}
                                  onChange={e => setUpdatePartialAmount(e.target.value)}
                                  max={selectedSession.price}
                                  min={0}
                                  step="0.01"
                                />
                                {updatePartialAmount && parseFloat(updatePartialAmount) < selectedSession.price && (
                                  <p className="text-xs text-muted-foreground">
                                    נותר לתשלום: ₪{selectedSession.price - parseFloat(updatePartialAmount)}
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

            {updateStatus && updateClientDebt && updateClientDebt.count > 0 && updateClientDebt.total > 0 && (
              <div className="pt-3 border-t mt-2">
                <p className="text-sm text-muted-foreground mb-2 text-center">
                  למטופל יש {updateClientDebt.count} פגישות ממתינות לתשלום
                  (סה״כ חוב: ₪{updateClientDebt.total.toFixed(0)})
                </p>
                <Button
                  variant="outline"
                  className="w-full gap-2"
                  asChild
                >
                  <Link href={`/dashboard/payments/pay/${selectedSession?.client?.id}`}>
                    <Wallet className="h-4 w-4" />
                    שלם את כל החוב
                  </Link>
                </Button>
              </div>
            )}
          </div>
          <DialogFooter className="flex flex-wrap gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={resetUpdateDialog}
              disabled={updating}
              className="font-medium"
            >
              ביטול
            </Button>
            {updateStatus && showUpdatePayment && selectedSession && selectedSession.price > 0 && (
              <Button
                variant="outline"
                className="gap-2 font-bold border-amber-300 text-amber-700 hover:bg-amber-50"
                onClick={async () => {
                  if (!selectedSession.client) return;
                  setUpdating(true);
                  try {
                    const statusBody: Record<string, unknown> = { status: updateStatus, createPayment: true, markAsPaid: false };
                    if (updateStatus === "CANCELLED") {
                      statusBody.cancellationReason = updateReason.trim() || undefined;
                    }
                    const response = await fetch(`/api/sessions/${selectedSession.id}`, {
                      method: "PUT",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(statusBody),
                    });
                    if (response.ok) {
                      toast.success("הפגישה עודכנה והחוב נרשם");
                      resetUpdateDialog();
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
                }}
                disabled={updating}
              >
                {updating ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : <Wallet className="h-4 w-4 ml-1" />}
                עדכן ורשום חוב
              </Button>
            )}
            {showUpdatePayment && selectedSession && selectedSession.price > 0 ? (
              <Button
                onClick={handleUpdateSession}
                disabled={updating || !updateStatus}
                className="gap-2 font-bold bg-emerald-600 hover:bg-emerald-700"
              >
                {updating ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {updateStatus === "COMPLETED" ? "עדכן ושלם" : updateStatus === "CANCELLED" ? "בטל וחייב" : updateStatus === "NO_SHOW" ? "עדכן וחייב" : "עדכן"}
              </Button>
            ) : (
              <Button
                onClick={handleUpdateSession}
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


      {/* Overlaps Detection Dialog */}
      <Dialog open={showOverlapsDialog} onOpenChange={setShowOverlapsDialog}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              פגישות חופפות ({overlaps.length})
            </DialogTitle>
            <DialogDescription>
              הפגישות הבאות חופפות זו לזו. ניתן למחוק את הפגישה הלא רצויה.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {overlaps.map((overlap, idx) => (
              <div key={idx} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="text-sm">
                    <p className="font-medium">{overlap.session1.clientName}</p>
                    <p className="text-muted-foreground">
                      {new Date(overlap.session1.startTime).toLocaleDateString("he-IL")}
                      {" "}
                      {new Date(overlap.session1.startTime).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}
                      {" - "}
                      {new Date(overlap.session1.endTime).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={deletingOverlap === overlap.session1.id}
                    onClick={async () => {
                      if (!confirm("למחוק פגישה זו?")) return;
                      setDeletingOverlap(overlap.session1.id);
                      try {
                        await fetch(`/api/sessions/${overlap.session1.id}`, { method: "DELETE" });
                        toast.success("הפגישה נמחקה");
                        fetchData();
                        checkOverlaps();
                      } catch { toast.error("שגיאה במחיקה"); }
                      setDeletingOverlap(null);
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
                <div className="text-xs text-center text-amber-500 font-medium">חופפת עם</div>
                <div className="flex items-center justify-between">
                  <div className="text-sm">
                    <p className="font-medium">{overlap.session2.clientName}</p>
                    <p className="text-muted-foreground">
                      {new Date(overlap.session2.startTime).toLocaleDateString("he-IL")}
                      {" "}
                      {new Date(overlap.session2.startTime).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}
                      {" - "}
                      {new Date(overlap.session2.endTime).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={deletingOverlap === overlap.session2.id}
                    onClick={async () => {
                      if (!confirm("למחוק פגישה זו?")) return;
                      setDeletingOverlap(overlap.session2.id);
                      try {
                        await fetch(`/api/sessions/${overlap.session2.id}`, { method: "DELETE" });
                        toast.success("הפגישה נמחקה");
                        fetchData();
                        checkOverlaps();
                      } catch { toast.error("שגיאה במחיקה"); }
                      setDeletingOverlap(null);
                    }}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}

