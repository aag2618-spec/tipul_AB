"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Calendar, Clock, User, Mail, CheckCircle, ShieldCheck,
  ChevronRight, ChevronLeft, Loader2, AlertCircle, Lock,
} from "lucide-react";

interface TokenInfo {
  therapistName: string;
  therapistImage: string | null;
  sessionDuration: number;
  welcomeMessage: string | null;
  maxAdvanceDays: number;
  enabledDays: number[];
  requiresVerification?: boolean;
  verified?: boolean;
  otpChannel?: "email" | "sms" | null;
  clientName?: string;
  clientEmail?: string | null;
  shabbatBlocked?: boolean;
  shabbatMessage?: string;
}

const HEBREW_DAYS = ["ראשון", "שני", "שלישי", "רביעי", "חמישי", "שישי", "מוצ״ש"];
const HEBREW_MONTHS = [
  "ינואר", "פברואר", "מרץ", "אפריל", "מאי", "יוני",
  "יולי", "אוגוסט", "ספטמבר", "אוקטובר", "נובמבר", "דצמבר",
];

function formatLocalDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

type Step = "verify" | "date" | "time" | "details" | "success";

export default function TokenBookingPage() {
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<TokenInfo | null>(null);
  const [step, setStep] = useState<Step>("verify");

  // אימות
  const [otpSent, setOtpSent] = useState(false);
  const [destinationMasked, setDestinationMasked] = useState<string | null>(null);
  const [otp, setOtp] = useState("");
  const [otpError, setOtpError] = useState<string | null>(null);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [verifying, setVerifying] = useState(false);

  // פרטי מטופל (נעולים, מגיעים מהשרת אחרי אימות)
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState<string | null>(null);

  // בחירת תאריך/שעה
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [clientNotes, setClientNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [confirmationMessage, setConfirmationMessage] = useState("");
  const [bookedDate, setBookedDate] = useState("");
  const [bookedTime, setBookedTime] = useState("");

  useEffect(() => {
    async function fetchInfo() {
      try {
        const res = await fetch(`/api/booking/t/${token}`);
        const data = await res.json();
        if (!res.ok) {
          setError(data.message || "הקישור לא נמצא");
          return;
        }
        setInfo(data);
        if (data.verified && data.clientName) {
          // כבר אומת בחלון הנוכחי — מדלגים ישר לבחירת תאריך.
          setClientName(data.clientName);
          setClientEmail(data.clientEmail ?? null);
          setStep("date");
        }
      } catch {
        setError("שגיאה בטעינת הנתונים");
      } finally {
        setLoading(false);
      }
    }
    fetchInfo();
  }, [token]);

  async function handleSendOtp() {
    setSendingOtp(true);
    setOtpError(null);
    try {
      const res = await fetch(`/api/booking/t/${token}?action=send-otp`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        setOtpError(data.message || "שליחת הקוד נכשלה");
        return;
      }
      setOtpSent(true);
      setDestinationMasked(data.destinationMasked ?? null);
    } catch {
      setOtpError("שגיאה בשליחת הקוד");
    } finally {
      setSendingOtp(false);
    }
  }

  async function handleVerifyOtp() {
    if (otp.length !== 6) return;
    setVerifying(true);
    setOtpError(null);
    try {
      const res = await fetch(`/api/booking/t/${token}?action=verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ otp }),
      });
      const data = await res.json();
      if (!res.ok) {
        setOtpError(data.message || "קוד שגוי");
        return;
      }
      setClientName(data.clientName || "");
      setClientEmail(data.clientEmail ?? null);
      setStep("date");
    } catch {
      setOtpError("שגיאה באימות הקוד");
    } finally {
      setVerifying(false);
    }
  }

  const fetchSlots = useCallback(async (date: Date) => {
    setSlotsLoading(true);
    try {
      const dateStr = formatLocalDate(date);
      const res = await fetch(`/api/booking/t/${token}?date=${dateStr}`);
      const data = await res.json();
      setAvailableSlots(data.slots || []);
    } catch {
      setAvailableSlots([]);
    } finally {
      setSlotsLoading(false);
    }
  }, [token]);

  function handleDateSelect(date: Date) {
    setSelectedDate(date);
    setSelectedTime(null);
    setError(null);
    fetchSlots(date);
    setStep("time");
  }

  async function handleSubmit() {
    if (!selectedDate || !selectedTime) return;
    setSubmitting(true);
    setError(null);
    try {
      const dateStr = formatLocalDate(selectedDate);
      const res = await fetch(`/api/booking/t/${token}?action=create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: dateStr, time: selectedTime, notes: clientNotes }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.message || "שגיאה בקביעת התור"); return; }
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
    if (!info) return null;
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const maxDate = new Date(); maxDate.setDate(maxDate.getDate() + info.maxAdvanceDays);
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
            const isEnabled = info.enabledDays.includes(date.getDay());
            const isPast = date < today;
            const isTooFar = date > maxDate;
            const isDisabled = !isEnabled || isPast || isTooFar;
            const isSelected = selectedDate?.toDateString() === date.toDateString();
            const isToday = date.toDateString() === today.toDateString();
            return (
              <button key={date.toISOString()} onClick={() => !isDisabled && handleDateSelect(date)} disabled={isDisabled}
                className={`aspect-square min-h-[44px] rounded-lg text-sm font-medium transition-all
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
  if (error && !info) {
    return (<div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-secondary/20 to-accent/10 p-4" dir="rtl"><Card className="max-w-md w-full"><CardContent className="pt-6 text-center"><AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" /><p className="text-lg font-medium">{error}</p></CardContent></Card></div>);
  }
  if (!info) return null;

  if (info.shabbatBlocked) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-secondary/20 to-accent/10 p-4" dir="rtl">
        <Card className="max-w-md w-full">
          <CardContent className="pt-8 pb-6 text-center space-y-4">
            {info.therapistImage && (
              <img src={info.therapistImage} alt={info.therapistName} className="w-20 h-20 rounded-full mx-auto object-cover opacity-60" />
            )}
            <h1 className="text-2xl font-bold">{info.therapistName}</h1>
            <div className="text-3xl font-bold text-primary mt-6">שבת שלום</div>
            <p className="text-base text-muted-foreground leading-relaxed">
              {info.shabbatMessage ?? "מערכת הזימון סגורה בשבת ובחגים. ניתן להזמין במוצאי שבת/חג."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-secondary/20 to-accent/10 py-8 px-4" dir="rtl">
      <div className="max-w-lg mx-auto space-y-6">
        <div className="text-center space-y-2">
          {info.therapistImage && (<img src={info.therapistImage} alt={info.therapistName} className="w-20 h-20 rounded-full mx-auto object-cover" />)}
          <h1 className="text-2xl font-bold">{info.therapistName}</h1>
          {info.welcomeMessage && (<p className="text-muted-foreground">{info.welcomeMessage}</p>)}
          <div className="flex items-center justify-center gap-1 text-sm text-muted-foreground"><Clock className="h-4 w-4" /><span>{info.sessionDuration} דקות</span></div>
        </div>

        {/* שלב אימות */}
        {step === "verify" && (
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><ShieldCheck className="h-5 w-5 text-primary" />אימות זהות</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {!otpSent ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    כדי לקבוע תור נשלח לך קוד אימות חד-פעמי לפרטי הקשר הרשומים אצל המטפל/ת.
                  </p>
                  {otpError && (<div className="bg-destructive/10 text-destructive rounded-lg p-3 text-sm flex items-center gap-2"><AlertCircle className="h-4 w-4 shrink-0" />{otpError}</div>)}
                  <Button onClick={handleSendOtp} disabled={sendingOtp} className="w-full">
                    {sendingOtp ? <Loader2 className="h-4 w-4 animate-spin" /> : "שלח לי קוד אימות"}
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted-foreground">
                    שלחנו קוד בן 6 ספרות{destinationMasked ? <> אל <span dir="ltr" className="font-medium">{destinationMasked}</span></> : ""}. נא להקליד אותו כאן:
                  </p>
                  <Input
                    inputMode="numeric"
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="______"
                    className="text-center text-2xl tracking-[0.5em] font-bold"
                    // מפצה על דחיפת-השמאל של WebKit בטקסט ממורכז עם letter-spacing (חצי ה-tracking)
                    style={{ textIndent: "0.25em" }}
                    dir="ltr"
                  />
                  {otpError && (<div className="bg-destructive/10 text-destructive rounded-lg p-3 text-sm flex items-center gap-2"><AlertCircle className="h-4 w-4 shrink-0" />{otpError}</div>)}
                  <Button onClick={handleVerifyOtp} disabled={otp.length !== 6 || verifying} className="w-full">
                    {verifying ? <Loader2 className="h-4 w-4 animate-spin" /> : "אמת/י והמשך"}
                  </Button>
                  <Button variant="link" onClick={handleSendOtp} disabled={sendingOtp} className="w-full text-sm">
                    לא קיבלת? שלח/י קוד חדש
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* מחוון שלבים (אחרי אימות) */}
        {step !== "verify" && (
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
        )}

        {step === "date" && (
          <Card><CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Calendar className="h-5 w-5 text-primary" />בחירת תאריך</CardTitle></CardHeader><CardContent>{renderCalendar()}</CardContent></Card>
        )}

        {step === "time" && selectedDate && (
          <Card>
            <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><Clock className="h-5 w-5 text-primary" />בחירת שעה - {HEBREW_DAYS[selectedDate.getDay()]} {selectedDate.toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" })}</CardTitle></CardHeader>
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
            <CardHeader><CardTitle className="flex items-center gap-2 text-lg"><User className="h-5 w-5 text-primary" />אישור הפרטים</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-3 text-sm flex items-center gap-3">
                <Calendar className="h-4 w-4 text-primary shrink-0" /><span>{HEBREW_DAYS[selectedDate.getDay()]} {selectedDate.toLocaleDateString("he-IL", { timeZone: "Asia/Jerusalem" })}</span>
                <Clock className="h-4 w-4 text-primary shrink-0 mr-2" /><span>{selectedTime}</span>
              </div>
              {error && (<div className="bg-destructive/10 text-destructive rounded-lg p-3 text-sm flex items-center gap-2"><AlertCircle className="h-4 w-4 shrink-0" />{error}</div>)}

              {/* שם ומייל — נעולים, מגיעים מהמערכת. אי אפשר לערוך. */}
              <div className="space-y-2">
                <Label className="flex items-center gap-1"><User className="h-3.5 w-3.5" /> שם מלא</Label>
                <div className="relative">
                  <Input value={clientName} readOnly disabled className="bg-muted/60 cursor-not-allowed pl-9" />
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                </div>
              </div>
              {clientEmail && (
                <div className="space-y-2">
                  <Label className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" /> אימייל</Label>
                  <div className="relative">
                    <Input value={clientEmail} readOnly disabled dir="ltr" className="bg-muted/60 cursor-not-allowed pl-9" />
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                </div>
              )}
              <p className="text-xs text-muted-foreground">הפרטים מאומתים ולא ניתנים לשינוי. אם משהו שגוי, נא לפנות למטפל/ת.</p>

              <div className="space-y-2"><Label htmlFor="notes">הערות (אופציונלי)</Label><textarea id="notes" value={clientNotes} onChange={(e) => setClientNotes(e.target.value)} placeholder="האם יש משהו שתרצה/י לשתף מראש?" className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring" /></div>
              <div className="flex gap-2 pt-2">
                <Button variant="outline" onClick={() => setStep("time")} className="flex-1">חזרה</Button>
                <Button onClick={handleSubmit} disabled={submitting} className="flex-1">{submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "קביעת תור"}</Button>
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
                <div className="flex items-center justify-center gap-2"><User className="h-4 w-4 text-primary" /><span>{info.therapistName}</span></div>
              </div>
            </CardContent>
          </Card>
        )}

        <p className="text-center text-xs text-muted-foreground">מופעל על ידי MyTipul</p>
      </div>
    </div>
  );
}
