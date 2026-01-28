"use client";

import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Loader2, Calendar, Repeat, Settings, Waves } from "lucide-react";
import { format, addWeeks } from "date-fns";
import { toast } from "sonner";
import { PayClientDebts } from "@/components/payments/pay-client-debts";
import type { EventClickArg } from "@fullcalendar/core";
import type { DateClickArg } from "@fullcalendar/interaction";

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
  defaultSessionPrice?: number | null;
}

interface Session {
  id: string;
  startTime: string;
  endTime: string;
  status: string;
  type: string;
  price: number;
  client: Client | null;
}

interface CalendarEvent {
  id: string;
  title: string;
  start: Date;
  end: Date;
  backgroundColor: string;
  borderColor: string;
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
  const searchParams = useSearchParams();
  const viewParam = searchParams.get('view');
  const initialCalendarView = viewParam === 'month' ? 'dayGridMonth' : 'timeGridWeek';
  
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
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);
  const [paymentData, setPaymentData] = useState<{clientId: string; clientName: string; amount: number; creditBalance: number; paymentId?: string} | null>(null);
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
        setSessions(sessionsData);
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

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // עדכן duration כשמשך הפגישה הסטנדרטי משתנה
  useEffect(() => {
    setRecurringFormData(prev => ({ ...prev, duration: defaultSessionDuration }));
  }, [defaultSessionDuration]);

  // סינון פגישות מבוטלות מהיומן
  const events: CalendarEvent[] = sessions
    .filter((session) => session.status !== "CANCELLED")
    .map((session) => ({
      id: session.id,
      title: session.type === "BREAK" ? "🌊 הפסקה" : (session.client?.name || "ללא שם"),
      start: new Date(session.startTime),
      end: new Date(session.endTime),
      backgroundColor:
        session.type === "BREAK"
          ? "var(--chart-2)"
          : session.status === "COMPLETED"
          ? "var(--primary)"
          : "var(--accent)",
    borderColor:
      session.type === "BREAK"
        ? "var(--chart-2)"
        : session.status === "COMPLETED"
        ? "var(--primary)"
        : session.status === "CANCELLED"
        ? "var(--destructive)"
        : "var(--primary)",
    extendedProps: {
      clientId: session.client?.id || "",
      status: session.status,
      type: session.type,
    },
  }));

  const handleDateClick = (info: DateClickArg) => {
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
      // Play wave sound if it's a break session
      if (session.type === "BREAK") {
        playWaveSound();
      }
      setSelectedSession(session);
      setIsSessionDialogOpen(true);
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
          <div className="absolute inset-0 bg-gradient-to-b from-amber-800/70 via-emerald-600/60 to-cyan-400/80 opacity-90 animate-gradient-flow"></div>
          
          {/* Mountains and Trees - Top */}
          <div className="absolute top-1 left-0 right-0 z-10 flex justify-around px-2 text-xs opacity-70">
            <span>🏔️</span>
            <span>🌲</span>
            <span>🌲</span>
            <span>🏔️</span>
          </div>

          {/* Ducks - Appear on hover */}
          <div className="absolute top-1/3 left-0 right-0 z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-500">
            <div className="ducks-swimming text-sm flex justify-center gap-2">
              <span className="duck-1">🦆</span>
              <span className="duck-2">🦆</span>
            </div>
          </div>
          
          {/* Content */}
          <div className="relative z-10 flex flex-col items-center justify-center h-full text-center px-2 py-1">
            <div className="font-bold text-sm text-white drop-shadow-md">🌊 הפסקה</div>
            <div className="text-xs text-white/90 drop-shadow">{eventInfo.timeText}</div>
            <div className="text-xs text-white/80 mt-1 italic font-light">זמן לנשום...</div>
          </div>

          {/* Enhanced waves - more prominent on hover */}
          <div className="absolute bottom-0 left-0 right-0 h-6 z-10">
            <div className="wave-animation text-sm opacity-60 group-hover:opacity-100 transition-opacity duration-300">
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
        throw new Error("שגיאה ביצירת הפגישה");
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
    } catch {
      toast.error("שגיאה ביצירת הפגישה");
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
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            initialView={initialCalendarView}
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
            slotMinTime="07:00:00"
            slotMaxTime="22:00:00"
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
              
              <div className="flex flex-col gap-2">
                {/* Different buttons for BREAK vs regular sessions */}
                {selectedSession.type === "BREAK" ? (
                  <>
                    <Button
                      onClick={() => {
                        setIsSessionDialogOpen(false);
                        setIsFormOpen(true);
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
                ) : selectedSession.status === "SCHEDULED" && (
                  <>
                    <Button
                      onClick={async () => {
                        if (!selectedSession.client) return;
                        try {
                          // Update session status to COMPLETED
                          const response = await fetch(`/api/sessions/${selectedSession.id}`, {
                            method: "PUT",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ status: "COMPLETED", markAsPaid: false }),
                          });
                          
                          if (response.ok) {
                            // Get session with payment info
                            const sessionRes = await fetch(`/api/sessions/${selectedSession.id}`);
                            const sessionData = await sessionRes.json();
                            
                            // Get client credit balance
                            const clientRes = await fetch(`/api/clients/${selectedSession.client.id}`);
                            const clientData = await clientRes.json();
                            
                            setIsSessionDialogOpen(false);
                            toast.success("הפגישה הושלמה, עבור לתשלום");
                            
                            // Open payment dialog instead of navigating
                            setPaymentData({
                              clientId: selectedSession.client.id,
                              clientName: selectedSession.client.name,
                              amount: Number(selectedSession.price) || 0,
                              creditBalance: Number(clientData.creditBalance) || 0,
                              paymentId: sessionData.payment?.id || undefined
                            });
                            setShowPaymentDialog(true);
                          }
                        } catch {
                          toast.error("שגיאה בעדכון הפגישה");
                        }
                      }}
                      className="w-full"
                    >
                      ✅ סיום ושלם
                    </Button>
                    
                    <Button
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
                      variant="outline"
                      className="w-full"
                    >
                      סיום ללא תשלום
                    </Button>
                    
                    <Button
                      onClick={() => {
                        setPendingAction("CANCELLED");
                        setIsChargeDialogOpen(true);
                      }}
                      variant="outline"
                      className="w-full"
                    >
                      ❌ ביטול
                    </Button>
                    
                    <Button
                      onClick={() => {
                        setPendingAction("NO_SHOW");
                        setIsChargeDialogOpen(true);
                      }}
                      variant="outline"
                      className="w-full"
                    >
                      ⚠️ לא הגיע
                    </Button>
                  </>
                )}
                
                <Button
                  onClick={() => {
                    window.location.href = `/dashboard/sessions/${selectedSession.id}`;
                  }}
                  variant="secondary"
                  className="w-full mt-2"
                >
                  📝 פתח דף פגישה מלא
                </Button>
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
                : "המטופל לא הגיע לפגישה. האם ברצונך לחייב אותו בתשלום?"}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row-reverse gap-2">
            <Button
              onClick={async () => {
                if (!selectedSession || !pendingAction || !selectedSession.client) return;
                try {
                  // Update session status and create payment
                  await fetch(`/api/sessions/${selectedSession.id}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ 
                      status: pendingAction,
                      markAsPaid: false, // Don't auto-mark as paid, let user choose payment method
                    }),
                  });
                  
                  // Get session with payment info
                  const sessionRes = await fetch(`/api/sessions/${selectedSession.id}`);
                  const sessionData = await sessionRes.json();
                  
                  // Get client credit balance
                  const clientRes = await fetch(`/api/clients/${selectedSession.client.id}`);
                  const clientData = await clientRes.json();
                  
                  setIsChargeDialogOpen(false);
                  setIsSessionDialogOpen(false);
                  
                  toast.success(pendingAction === "CANCELLED" ? "הפגישה בוטלה, עבור לתשלום" : "נרשם כלא הגיע, עבור לתשלום");
                  
                  // Open payment dialog instead of navigating
                  setPaymentData({
                    clientId: selectedSession.client.id,
                    clientName: selectedSession.client.name,
                    amount: Number(selectedSession.price) || 0,
                    creditBalance: Number(clientData.creditBalance) || 0,
                    paymentId: sessionData.payment?.id || undefined
                  });
                  setShowPaymentDialog(true);
                  setPendingAction(null);
                } catch {
                  toast.error("שגיאה בעדכון הפגישה");
                }
              }}
            >
              כן, לחייב
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
                  
                  setIsChargeDialogOpen(false);
                  setIsSessionDialogOpen(false);
                  setPendingAction(null);
                  
                  toast.success(pendingAction === "CANCELLED" ? "הפגישה בוטלה ללא חיוב" : "נרשם כלא הגיע ללא חיוב");
                  fetchData();
                } catch {
                  toast.error("שגיאה בעדכון הפגישה");
                }
              }}
            >
              לא, לא לחייב
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Payment Dialog */}
      {paymentData && showPaymentDialog && (
        <Dialog open={showPaymentDialog} onOpenChange={setShowPaymentDialog}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle>תשלום עבור הפגישה</DialogTitle>
              <DialogDescription>
                בחר אמצעי תשלום ואופן התשלום עבור {paymentData.clientName}
              </DialogDescription>
            </DialogHeader>
            <div className="flex justify-center p-4">
              <PayClientDebts
                clientId={paymentData.clientId}
                clientName={paymentData.clientName}
                totalDebt={paymentData.amount}
                creditBalance={paymentData.creditBalance}
                unpaidPayments={paymentData.paymentId ? [{
                  paymentId: paymentData.paymentId,
                  amount: paymentData.amount
                }] : []}
                onPaymentComplete={() => {
                  setShowPaymentDialog(false);
                  setPaymentData(null);
                  fetchData();
                  toast.success("התשלום בוצע בהצלחה!");
                }}
              />
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

