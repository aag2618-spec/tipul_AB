"use client";

import { useEffect, useState, useCallback } from "react";
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
  const [sessions, setSessions] = useState<Session[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [recurringPatterns, setRecurringPatterns] = useState<RecurringPattern[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isRecurringDialogOpen, setIsRecurringDialogOpen] = useState(false);
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
    duration: 50,
    clientId: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [sessionsRes, clientsRes, patternsRes] = await Promise.all([
        fetch("/api/sessions"),
        fetch("/api/clients"),
        fetch("/api/recurring-patterns"),
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

  const events: CalendarEvent[] = sessions.map((session) => ({
    id: session.id,
    title: session.type === "BREAK" ? "🌊 הפסקה" : (session.client?.name || "ללא שם"),
    start: new Date(session.startTime),
    end: new Date(session.endTime),
    backgroundColor:
      session.type === "BREAK"
        ? "var(--chart-2)"
        : session.status === "COMPLETED"
        ? "var(--primary)"
        : session.status === "CANCELLED"
        ? "var(--destructive)"
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
    const dateStr = format(info.date, "yyyy-MM-dd");
    const timeStr = format(info.date, "HH:mm");
    const endTime = new Date(info.date);
    endTime.setMinutes(endTime.getMinutes() + 50);
    
    setFormData({
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
    // Navigate to session details
    window.location.href = `/dashboard/sessions/${info.event.id}`;
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
            initialView="timeGridWeek"
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
                      end.setMinutes(end.getMinutes() + 50);
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
    </div>
  );
}

