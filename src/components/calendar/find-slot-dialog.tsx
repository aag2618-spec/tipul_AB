"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, CalendarSearch, Clock } from "lucide-react";
import { getTherapistAccent } from "@/lib/calendar/event-colors";

// משבצת פנויה שמוחזרת מ-/api/sessions/available-slots.
export interface AvailableSlot {
  therapistId: string;
  therapistName: string | null;
  date: string; // YYYY-MM-DD (ישראל)
  time: string; // HH:mm (ישראל)
  startISO: string;
  endISO: string;
}

interface TherapistOption {
  id: string;
  name: string | null;
}
interface RoomOption {
  id: string;
  name: string;
  isActive: boolean;
}

interface FindSlotDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  multiTherapist: boolean;
  defaultSessionDuration: number;
  defaultSessionType?: string;
  // נקרא כשבוחרים משבצת — האב פותח את טופס הפגישה החדשה ממולא.
  onPick: (
    slot: AvailableSlot,
    ctx: { duration: number; type: string; roomId: string },
  ) => void;
}

/** YYYY-MM-DD של היום בישראל. */
function todayIsrael(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
  }).format(new Date());
}
function addDays(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
/** כותרת יום בעברית (יום + תאריך). */
function formatDayHeader(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  return d.toLocaleDateString("he-IL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Asia/Jerusalem",
  });
}

export function FindSlotDialog({
  open,
  onOpenChange,
  multiTherapist,
  defaultSessionDuration,
  defaultSessionType = "IN_PERSON",
  onPick,
}: FindSlotDialogProps) {
  const [duration, setDuration] = useState(defaultSessionDuration);
  const [type, setType] = useState(defaultSessionType);
  const [fromDate, setFromDate] = useState(todayIsrael);
  const [toDate, setToDate] = useState(() => addDays(todayIsrael(), 7));
  const [dayStart, setDayStart] = useState("08:00");
  const [dayEnd, setDayEnd] = useState("21:00");
  const [therapistId, setTherapistId] = useState(""); // "" = כל המטפלים
  const [roomId, setRoomId] = useState(""); // "" = ללא חדר
  const [therapists, setTherapists] = useState<TherapistOption[]>([]);
  const [rooms, setRooms] = useState<RoomOption[]>([]);

  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [slots, setSlots] = useState<AvailableSlot[]>([]);
  const [truncated, setTruncated] = useState(false);

  // איפוס בעת פתיחה + טעינת מטפלים/חדרים.
  useEffect(() => {
    if (!open) return;
    setDuration(defaultSessionDuration);
    setType(defaultSessionType);
    setFromDate(todayIsrael());
    setToDate(addDays(todayIsrael(), 7));
    setDayStart("08:00");
    setDayEnd("21:00");
    setTherapistId("");
    setRoomId("");
    setSlots([]);
    setSearched(false);
    setTruncated(false);

    // מטפלים — רק בקליניקה רב-מטפלית (ה-API מחזיר 403 למטפל/ת עצמאי/ת).
    if (multiTherapist) {
      fetch("/api/clinic/therapists", { cache: "no-store" })
        .then((res) => (res.ok ? res.json() : []))
        .then((data) => setTherapists(Array.isArray(data) ? data : []))
        .catch(() => setTherapists([]));
    } else {
      setTherapists([]);
    }
    // חדרים — ריק למטפל/ת עצמאי/ת (אז הבורר לא יוצג).
    fetch("/api/clinic/rooms", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setRooms(Array.isArray(data) ? data : []))
      .catch(() => setRooms([]));
  }, [open, multiTherapist, defaultSessionDuration, defaultSessionType]);

  const handleSearch = useCallback(async () => {
    setLoading(true);
    setSearched(true);
    try {
      const params = new URLSearchParams({
        duration: String(duration),
        from: fromDate,
        to: toDate,
        dayStart,
        dayEnd,
      });
      if (therapistId) params.set("therapistId", therapistId);
      if (roomId) params.set("roomId", roomId);
      const res = await fetch(`/api/sessions/available-slots?${params.toString()}`);
      if (!res.ok) {
        setSlots([]);
        setTruncated(false);
        return;
      }
      const data = await res.json();
      setSlots(Array.isArray(data.slots) ? data.slots : []);
      setTruncated(!!data.truncated);
    } catch {
      setSlots([]);
      setTruncated(false);
    } finally {
      setLoading(false);
    }
  }, [duration, fromDate, toDate, dayStart, dayEnd, therapistId, roomId]);

  const grouped = useMemo(() => {
    const map = new Map<string, AvailableSlot[]>();
    for (const s of slots) {
      const list = map.get(s.date) ?? [];
      list.push(s);
      map.set(s.date, list);
    }
    return Array.from(map.entries());
  }, [slots]);

  const activeRooms = rooms.filter((r) => r.isActive);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarSearch className="h-5 w-5" />
            מצא משבצת פנויה
          </DialogTitle>
          <DialogDescription>
            בחרו משך, טווח תאריכים וחלון שעות — המערכת תציג את המשבצות הפנויות
            הקרובות. לחיצה על משבצת פותחת טופס פגישה חדשה מוכן.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* משך + סוג */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="find-duration">משך (דקות)</Label>
              <Input
                id="find-duration"
                type="number"
                min={5}
                max={480}
                step={5}
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value) || 0)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="find-type">סוג פגישה</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger id="find-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="IN_PERSON">פרונטלי</SelectItem>
                  <SelectItem value="ONLINE">מקוון</SelectItem>
                  <SelectItem value="PHONE">טלפוני</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* טווח תאריכים */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="find-from">מתאריך</Label>
              <Input
                id="find-from"
                type="date"
                dir="ltr"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="find-to">עד תאריך</Label>
              <Input
                id="find-to"
                type="date"
                dir="ltr"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
              />
            </div>
          </div>

          {/* חלון שעות */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="find-day-start">משעה</Label>
              <Input
                id="find-day-start"
                type="time"
                dir="ltr"
                value={dayStart}
                onChange={(e) => setDayStart(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="find-day-end">עד שעה</Label>
              <Input
                id="find-day-end"
                type="time"
                dir="ltr"
                value={dayEnd}
                onChange={(e) => setDayEnd(e.target.value)}
              />
            </div>
          </div>

          {/* מטפל (רק בקליניקה רב-מטפלית) + חדר (אם יש) */}
          {(multiTherapist && therapists.length > 0) || activeRooms.length > 0 ? (
            <div className="grid grid-cols-2 gap-3">
              {multiTherapist && therapists.length > 0 && (
                <div className="space-y-1">
                  <Label htmlFor="find-therapist">מטפל</Label>
                  <Select
                    value={therapistId || "all"}
                    onValueChange={(v) => setTherapistId(v === "all" ? "" : v)}
                  >
                    <SelectTrigger id="find-therapist">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">כל המטפלים</SelectItem>
                      {therapists.map((t) => (
                        <SelectItem key={t.id} value={t.id}>
                          {t.name || "מטפל/ת"}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
              {activeRooms.length > 0 && (
                <div className="space-y-1">
                  <Label htmlFor="find-room">חדר</Label>
                  <Select
                    value={roomId || "none"}
                    onValueChange={(v) => setRoomId(v === "none" ? "" : v)}
                  >
                    <SelectTrigger id="find-room">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">ללא חדר ספציפי</SelectItem>
                      {activeRooms.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          ) : null}

          <Button onClick={handleSearch} disabled={loading} className="w-full">
            {loading ? (
              <Loader2 className="ml-2 h-4 w-4 animate-spin" />
            ) : (
              <CalendarSearch className="ml-2 h-4 w-4" />
            )}
            חפש משבצות
          </Button>

          {/* תוצאות */}
          {searched && !loading && slots.length === 0 && (
            <div className="text-center text-sm text-muted-foreground py-6">
              לא נמצאו משבצות פנויות בטווח שנבחר. נסו להרחיב את טווח התאריכים או את
              חלון השעות.
            </div>
          )}

          {slots.length > 0 && (
            <div className="space-y-3">
              {truncated && (
                <p className="text-xs text-muted-foreground">
                  מוצגות המשבצות הקרובות בלבד. צמצמו את הטווח לתוצאות ממוקדות יותר.
                </p>
              )}
              {grouped.map(([date, daySlots]) => (
                <div key={date} className="space-y-1.5">
                  <div className="text-sm font-semibold text-muted-foreground">
                    {formatDayHeader(date)}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {daySlots.map((slot) => (
                      <button
                        key={`${slot.therapistId}-${slot.startISO}`}
                        type="button"
                        onClick={() => onPick(slot, { duration, type, roomId })}
                        className="flex items-center gap-1.5 rounded-md border bg-card px-2.5 py-1.5 text-sm hover:bg-accent hover:border-primary transition-colors"
                        title={
                          multiTherapist && slot.therapistName
                            ? `${slot.time} · ${slot.therapistName}`
                            : slot.time
                        }
                      >
                        <Clock className="h-3.5 w-3.5 opacity-60" aria-hidden />
                        <span className="font-medium">{slot.time}</span>
                        {multiTherapist && slot.therapistName && (
                          <span className="flex items-center gap-1 text-xs opacity-75">
                            <span
                              className="inline-block w-2 h-2 rounded-full shrink-0"
                              style={{
                                backgroundColor: getTherapistAccent(slot.therapistId),
                              }}
                              aria-hidden
                            />
                            {slot.therapistName}
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
