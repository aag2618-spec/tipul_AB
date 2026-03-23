"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Loader2, Repeat, Settings, Waves } from "lucide-react";
import { format, addWeeks } from "date-fns";
import { toast } from "sonner";
import type { CalendarClient, CalendarSession } from "@/hooks/use-calendar-data";

// ── Types ──

export interface SessionFormData {
  clientId: string;
  startTime: string;
  endTime: string;
  type: string;
  price: string;
  isRecurring: boolean;
  weeksToRepeat: number;
}

export interface RecurringPreviewItem {
  key: string;
  date: string;
  time: string;
  clientName: string;
  clientId: string;
  patternId: string;
  status: "ok" | "conflict";
  conflictWith?: { id: string; clientName: string; startTime: string; endTime: string };
}

export interface PendingFormRecurring {
  clientId: string;
  type: string;
  price: string;
  sessions: Array<{ startTime: string; endTime: string }>;
}

export const DEFAULT_FORM_DATA: SessionFormData = {
  clientId: "",
  startTime: "",
  endTime: "",
  type: "IN_PERSON",
  price: "",
  isRecurring: false,
  weeksToRepeat: 4,
};

// ── Props ──

interface NewSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clients: CalendarClient[];
  defaultSessionDuration: number;
  selectedDate: Date | null;
  initialFormData: SessionFormData;
  sessions: CalendarSession[];
  onSessionCreated: () => void;
  onShowRecurringPreview: (
    preview: RecurringPreviewItem[],
    decisions: Record<string, "skip" | "replace" | "create">,
    pendingRecurring: PendingFormRecurring
  ) => void;
}

// ── Component ──

export function NewSessionDialog({
  open,
  onOpenChange,
  clients,
  defaultSessionDuration,
  selectedDate,
  initialFormData,
  sessions,
  onSessionCreated,
  onShowRecurringPreview,
}: NewSessionDialogProps) {
  const [formData, setFormData] = useState<SessionFormData>(initialFormData);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showDurationCustomizer, setShowDurationCustomizer] = useState(false);
  const [customDuration, setCustomDuration] = useState(defaultSessionDuration);

  // Reset internal state when dialog opens with new initial data
  useEffect(() => {
    if (open) {
      setFormData(initialFormData);
      setCustomDuration(defaultSessionDuration);
      setShowDurationCustomizer(false);
      setIsSubmitting(false);
    }
  }, [open, initialFormData, defaultSessionDuration]);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

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
      // ── Recurring: show preview before creating ──
      if (formData.isRecurring && formData.weeksToRepeat > 1) {
        const startDate = new Date(formData.startTime);
        const endDate = new Date(formData.endTime);
        const client = clients.find((c) => c.id === formData.clientId);
        const planned: Array<{ startLocal: string; endLocal: string; start: Date; end: Date }> = [];

        for (let i = 0; i < formData.weeksToRepeat; i++) {
          const s = addWeeks(startDate, i);
          const e = addWeeks(endDate, i);
          planned.push({
            start: s,
            end: e,
            startLocal: format(s, "yyyy-MM-dd'T'HH:mm"),
            endLocal: format(e, "yyyy-MM-dd'T'HH:mm"),
          });
        }

        const rangeStart = format(planned[0].start, "yyyy-MM-dd'T'HH:mm");
        const rangeEnd = format(planned[planned.length - 1].end, "yyyy-MM-dd'T'HH:mm");
        let rangeSessions = sessions;
        try {
          const qs = new URLSearchParams({
            startDate: rangeStart,
            endDate: rangeEnd,
          });
          const rangeRes = await fetch(`/api/sessions?${qs.toString()}`);
          if (rangeRes.ok) {
            rangeSessions = await rangeRes.json();
          }
        } catch {
          // fallback to local sessions on network error
        }

        const previewItems: RecurringPreviewItem[] = planned.map((p, idx) => {
          const dateStr = format(p.start, "yyyy-MM-dd");
          const timeStr = format(p.start, "HH:mm");
          const key = `form_${dateStr}_${timeStr}_${idx}`;
          const overlap = rangeSessions.find((s: CalendarSession) => {
            if (s.status === "CANCELLED") return false;
            const sStart = new Date(s.startTime);
            const sEnd = new Date(s.endTime);
            return p.start < sEnd && p.end > sStart;
          });
          return {
            key,
            date: dateStr,
            time: timeStr,
            clientName: client?.name || (formData.type === "BREAK" ? "הפסקה" : "ללא שם"),
            clientId: formData.clientId,
            patternId: "",
            status: (overlap ? "conflict" : "ok") as "ok" | "conflict",
            conflictWith: overlap
              ? {
                  id: overlap.id,
                  clientName: overlap.client?.name || (overlap.type === "BREAK" ? "הפסקה" : "ללא שם"),
                  startTime: overlap.startTime,
                  endTime: overlap.endTime,
                }
              : undefined,
          };
        });

        const defaults: Record<string, "skip" | "replace" | "create"> = {};
        previewItems.forEach((item) => {
          if (item.status === "conflict") defaults[item.key] = "skip";
        });

        onShowRecurringPreview(
          previewItems,
          defaults,
          {
            clientId: formData.clientId,
            type: formData.type,
            price: formData.price,
            sessions: planned.map((p) => ({ startTime: p.startLocal, endTime: p.endLocal })),
          }
        );
        onOpenChange(false);
        setIsSubmitting(false);
        return;
      }

      // ── Single session: create directly ──
      const response = await fetch("/api/sessions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: formData.clientId,
          startTime: formData.startTime,
          endTime: formData.endTime,
          type: formData.type,
          price: parseFloat(formData.price) || 0,
          isRecurring: false,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => null);
        throw new Error(errData?.message || "שגיאה ביצירת הפגישה");
      }

      toast.success("הפגישה נוצרה בהצלחה");
      onOpenChange(false);
      onSessionCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "שגיאה ביצירת הפגישה");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
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
              onClick={() => onOpenChange(false)}
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
  );
}
