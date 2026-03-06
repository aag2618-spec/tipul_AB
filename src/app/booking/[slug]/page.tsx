"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Calendar, Clock, User, Phone, Mail, CheckCircle,
  ChevronRight, ChevronLeft, Loader2, AlertCircle,
} from "lucide-react";

interface TherapistInfo {
  therapistName: string;
  therapistImage: string | null;
  sessionDuration: number;
  welcomeMessage: string | null;
  maxAdvanceDays: number;
  enabledDays: number[];
}

const HEBREW_DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "מוצ״ש"];

function formatLocalDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
const HEBREW_MONTHS = [
  "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
  "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר",
];

export default function BookingPage() {
  const { slug } = useParams<{ slug: string }>();
  const [step, setStep] = useState<"date" | "time" | "details" | "success">("date");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [therapistInfo, setTherapistInfo] = useState<TherapistInfo | null>(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [clientName, setClientName] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientNotes, setClientNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmationMessage, setConfirmationMessage] = useState("");
  const [bookedDate, setBookedDate] = useState("");
  const [bookedTime, setBookedTime] = useState("");

  useEffect(() => {
    async function fetchInfo() {
      try {
        const res = await fetch(`/api/booking/${slug}`);
        if (!res.ok) {
          const data = await res.json();
          setError(data.error || "דף הזימון לא נמצא");
          return;
        }
        setTherapistInfo(await res.json());
      } catch {
        setError("שגיאה בטעינת הנתונים");
      } finally {
        setLoading(false);
      }
    }
    fetchInfo();
  }, [slug]);

  const fetchSlots = useCallback(async (date: Date) => {
    setSlotsLoading(true);
    try {
      const dateStr = formatLocalDate(date);
      const res = await fetch(`/api/booking/${slug}?date=${dateStr}`);
      const data = await res.json();
      setAvailableSlots(data.slots || []);
    } catch {
      setAvailableSlots([]);
    } finally {
      setSlotsLoading(false);
    }
  }, [slug]);

  function handleDateSelect(date: Date) {
    setSelectedDate(date);
    setSelectedTime(null);
    setError(null);
    fetchSlots(date);
    setStep("time");
  }

  async function handleSubmit() {
    if (!selectedDate || !selectedTime || !clientName) return;
    setSubmitting(true);
    setError(null);
    try {
      const dateStr = formatLocalDate(selectedDate);
      const res = await fetch(`/api/booking/${slug}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: dateStr, time: selectedTime, clientName, clientPhone, clientEmail, notes: clientNotes }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error || "שגיאה בקביעת התור"); return; }
      setConfirmationMessage(data.message);
      setBookedDate(data.date);
      setBookedTime(selectedTime);
      setStep("success");
    } catch {
      setError("שגיאה בקביעת התור");
    } finally {
      setSubmitting(false);
    }
  }

  function renderCalendar() {
    if (!therapistInfo) return null;
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const maxDate = new Date(); maxDate.setDate(maxDate.getDate() + therapistInfo.maxAdvanceDays);
    const cells: (Date | null)[] = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(new Date(year, month - 1, 1))}><ChevronRight className="h-4 w-4" /></Button>
          <h3 className="text-lg font-semibold">{HEBREW_MONTHS[month]} {year}</h3>
          <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(new Date(year, month + 1, 1))}><ChevronLeft className="h-4 w-4" /></Button>
        </div>
        <div className="grid grid-cols-7 gap-1 mb-2">
          {["א׳","ב׳","ג׳","ד׳","ה׳","ו׳","ש׳"].map((d) => (
            <div key={d} className="text-center text-xs font-medium text-muted-foreground py-1">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((date, idx) => {
            if (!date) return <div key={`e-${idx}`} />;
            const isEnabled = therapistInfo.enabledDays.includes(date.getDay());
            const isPast = date < today;
            const isTooFar = date > maxDate;
            const isDisabled = !isEnabled || isPast || isTooFar;
            const isSelected = selectedDate?.toDateString() === date.toDateString();
            const isToday = date.toDateString() === today.toDateString();
            return (
              <button key={date.toISOString()} onClick={() => !isDisabled && handleDateSelect(date)} disabled={isDisabled}
                className={`aspect-square rounded-lg text-sm font-medium transition-all
                  ${isDisabled ? "text-muted-foreground/30 cursor-not-allowed" : "hover:bg-primary/10 cursor-pointer"}
                  ${isSelected ? "bg-primary text-primary-foreground hover:bg-primary" : ""}
                  ${isToday && !isSelected ? "ring-1 ring-primary" : ""}`}>
                {date.getDate()}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (loading) {
    return (<div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-secondary/20 to-accent/10"><Loader2 className="h-8 w-8 animate-spin text-primary" /></div>);
  }
  if (error && !therapistInfo) {
    return (<div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-secondary/20 to-accent/10 p-4" dir="rtl"><Card className="max-w-md w-full"><CardContent className="pt-6 text-center"><AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" /><p className="text-lg font-medium">{error}</p></CardContent></Card></div>);
  }
  if (!therapistInfo) return null;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary/20 to-accent/10 py-8 px-4" dir="rtl">
      <div className="max-w-lg mx-auto space-y-6">
        <div className="text-center space-y-2">
          {therapistInfo.therapistImage && (<img src={therapistInfo.therapistImage} alt={therapistInfo.therapistName} className="w-20 h-20 rounded-full mx-auto object-cover" />)}
          <h1 className="text-2xl font-bold">{therapistInfo.therapistName}</h1>
          {therapistInfo.welcomeMessage && (<p className="text-muted-foreground">{therapistInfo.welcomeMessage}</p>)}
          <div className="flex items-center justify-center gap-1 text-sm text-muted-foreground"><Clock className="h-4 w-4" /><span>{therapistInfo.sessionDuration} דקות</span></div>
        </div>

        <div className="flex items-center justify-center gap-2">
          {(["date","time","details"] as const).map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors
                ${step === s ? "bg-primary text-primary-foreground" : (["date","time","details"].indexOf(step) > i || step === "success") ? "bg-primary/20 text-primary" : "bg-muted text-muted-foreground"}`}>
                {i + 1}
              </div>
              {i < 2 && <div className="w-8 h-0.5 bg-muted" />}
            </div>
          ))}
        </div>

        {step === "date" && (
          <Card><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Calendar className="h-5 w-5 text-primary" />בחירת תאריך</CardTitle></CardHeader><CardContent>{renderCalendar()}</CardContent></Card>
        )}

        {step === "time" && selectedDate && (
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Clock className="h-5 w-5 text-primary" />בחירת שעה - {HEBREW_DAYS[selectedDate.getDay()]} {selectedDate.toLocaleDateString("he-IL")}</CardTitle></CardHeader>
            <CardContent>
              {slotsLoading ? (<div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
              ) : availableSlots.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground"><AlertCircle className="h-8 w-8 mx-auto mb-2 opacity-50" /><p>אין שעות פנויות ביום זה</p><Button variant="link" onClick={() => setStep("date")} className="mt-2">בחר/י יום אחר</Button></div>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {availableSlots.map((slot) => (
                    <button key={slot} onClick={() => { setSelectedTime(slot); setStep("details"); }}
                      className={`py-3 px-4 rounded-lg text-sm font-medium border transition-all ${selectedTime === slot ? "bg-primary text-primary-foreground border-primary" : "hover:border-primary hover:bg-primary/5 border-border"}`}>
                      {slot}
                    </button>
                  ))}
                </div>
              )}
              <div className="mt-4"><Button variant="outline" onClick={() => setStep("date")} className="w-full">חזרה לבחירת תאריך</Button></div>
            </CardContent>
          </Card>
        )}

        {step === "details" && selectedDate && selectedTime && (
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><User className="h-5 w-5 text-primary" />פרטים אישיים</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-3 text-sm flex items-center gap-3">
                <Calendar className="h-4 w-4 text-primary shrink-0" /><span>{HEBREW_DAYS[selectedDate.getDay()]} {selectedDate.toLocaleDateString("he-IL")}</span>
                <Clock className="h-4 w-4 text-primary shrink-0 mr-2" /><span>{selectedTime}</span>
              </div>
              {error && (<div className="bg-destructive/10 text-destructive rounded-lg p-3 text-sm flex items-center gap-2"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>)}
              <div className="space-y-2"><Label htmlFor="name" className="flex items-center gap-1"><User className="h-3.5 w-3.5" /> שם מלא *</Label><Input id="name" value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="השם שלך" required /></div>
              <div className="space-y-2"><Label htmlFor="phone" className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" /> טלפון</Label><Input id="phone" type="tel" value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} placeholder="050-1234567" dir="ltr" /></div>
              <div className="space-y-2"><Label htmlFor="email" className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" /> אימייל</Label><Input id="email" type="email" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} placeholder="your@email.com" dir="ltr" /></div>
              <div className="space-y-2"><Label htmlFor="notes">הערות (אופציונלי)</Label><textarea id="notes" value={clientNotes} onChange={(e) => setClientNotes(e.target.value)} placeholder="האם יש משהו שתרצה/י לשתף מראש?" className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring" /></div>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" onClick={() => setStep("time")} className="flex-1">חזרה</Button>
                <Button onClick={handleSubmit} disabled={!clientName || submitting} className="flex-1">{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "קביעת תור"}</Button>
              </div>
            </CardContent>
          </Card>
        )}

        {step === "success" && (
          <Card>
            <CardContent className="pt-8 text-center space-y-4">
              <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto"><CheckCircle className="h-8 w-8 text-green-600" /></div>
              <h2 className="text-xl font-bold text-green-700">הבקשה התקבלה!</h2>
              <p className="text-muted-foreground">{confirmationMessage}</p>
              <div className="bg-muted/50 rounded-lg p-4 space-y-2 text-sm">
                <div className="flex items-center justify-center gap-2"><Calendar className="h-4 w-4 text-primary" /><span>{bookedDate}</span></div>
                <div className="flex items-center justify-center gap-2"><Clock className="h-4 w-4 text-primary" /><span>{bookedTime}</span></div>
                <div className="flex items-center justify-center gap-2"><User className="h-4 w-4 text-primary" /><span>{therapistInfo.therapistName}</span></div>
              </div>
            </CardContent>
          </Card>
        )}

        <p className="text-center text-xs text-muted-foreground">מופעל על ידי MyTipul</p>
      </div>
    </div>
  );
}
