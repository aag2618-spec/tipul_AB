"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Loader2, Calendar, Repeat, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import type { CalendarClient, RecurringPattern } from "@/hooks/use-calendar-data";
import type { RecurringPreviewItem, PendingFormRecurring } from "@/components/calendar/new-session-dialog";

// ── Constants ──

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

// ── Props ──

interface RecurringPatternDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clients: CalendarClient[];
  recurringPatterns: RecurringPattern[];
  defaultSessionDuration: number;
  // Preview state (managed by page.tsx because NewSessionDialog also sets it)
  applyPreview: RecurringPreviewItem[] | null;
  conflictDecisions: Record<string, "skip" | "replace" | "create">;
  pendingFormRecurring: PendingFormRecurring | null;
  onApplyPreviewChange: (preview: RecurringPreviewItem[] | null) => void;
  onConflictDecisionsChange: (decisions: Record<string, "skip" | "replace" | "create">) => void;
  onPendingFormRecurringChange: (pending: PendingFormRecurring | null) => void;
  // Callbacks
  onDataChanged: () => void;
}

// ── Component ──

export function RecurringPatternDialog({
  open,
  onOpenChange,
  clients,
  recurringPatterns,
  defaultSessionDuration,
  applyPreview,
  conflictDecisions,
  pendingFormRecurring,
  onApplyPreviewChange,
  onConflictDecisionsChange,
  onPendingFormRecurringChange,
  onDataChanged,
}: RecurringPatternDialogProps) {
  const [recurringFormData, setRecurringFormData] = useState({
    dayOfWeek: 0,
    time: "09:00",
    duration: defaultSessionDuration,
    clientId: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [previewWeeksAhead, setPreviewWeeksAhead] = useState(4);

  useEffect(() => {
    setRecurringFormData(prev => ({ ...prev, duration: defaultSessionDuration }));
  }, [defaultSessionDuration]);

  const handleClose = (openState: boolean) => {
    onOpenChange(openState);
    if (!openState) {
      onApplyPreviewChange(null);
      onConflictDecisionsChange({});
      onPendingFormRecurringChange(null);
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
      onOpenChange(false);
      onDataChanged();
    } catch {
      toast.error("שגיאה ביצירת התבנית");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleApplyRecurring = async (weeksAhead: number = 4) => {
    setIsSubmitting(true);

    try {
      const previewRes = await fetch("/api/recurring-patterns/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weeksAhead, dryRun: true }),
        cache: "no-store",
      });

      if (!previewRes.ok) {
        const errBody = await previewRes.json().catch(() => null);
        throw new Error(errBody?.message || "שגיאה בהחלת התבניות");
      }

      const previewData = await previewRes.json();
      const rows = Array.isArray(previewData?.preview) ? previewData.preview : [];

      if (rows.length === 0) {
        toast.info("אין פגישות חדשות ליצירה");
        return;
      }

      setPreviewWeeksAhead(weeksAhead);
      const defaults: Record<string, "skip" | "replace" | "create"> = {};
      rows.forEach((item: { key: string; status: string }) => {
        if (item.status === "conflict") defaults[item.key] = "skip";
      });
      onConflictDecisionsChange(defaults);
      onApplyPreviewChange(rows);
    } catch (e) {
      console.error("apply recurring dryRun:", e);
      toast.error(e instanceof Error ? e.message : "שגיאה בהחלת התבניות");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmApply = async () => {
    setIsSubmitting(true);
    try {
      // ── Form-based recurring ──
      if (pendingFormRecurring && applyPreview) {
        let created = 0;
        let skipped = 0;

        for (let i = 0; i < pendingFormRecurring.sessions.length; i++) {
          const session = pendingFormRecurring.sessions[i];
          const item = applyPreview[i];

          if (item?.status === "conflict") {
            const decision = conflictDecisions[item.key];
            if (!decision || decision === "skip") {
              skipped++;
              continue;
            }
            if (decision === "replace" && item.conflictWith) {
              await fetch(`/api/sessions/${item.conflictWith.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "CANCELLED" }),
              });
            }
          }

          const isOverlapAllowed = item?.status === "conflict" && conflictDecisions[item.key] === "create";
          const res = await fetch("/api/sessions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              clientId: pendingFormRecurring.clientId,
              startTime: session.startTime,
              endTime: session.endTime,
              type: pendingFormRecurring.type,
              price: parseFloat(pendingFormRecurring.price) || 0,
              isRecurring: true,
              allowOverlap: isOverlapAllowed || undefined,
            }),
          });

          if (res.ok) created++;
          else skipped++;
        }

        const msg =
          skipped > 0
            ? `${created} פגישות נוצרו, ${skipped} דולגו`
            : `${created} פגישות נוצרו בהצלחה`;
        toast.success(msg);
        onPendingFormRecurringChange(null);
        onApplyPreviewChange(null);
        onConflictDecisionsChange({});
        onDataChanged();
        return;
      }

      // ── Pattern-based recurring ──
      const resolutions = Object.entries(conflictDecisions).map(([key, action]) => ({ key, action }));

      const response = await fetch("/api/recurring-patterns/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ weeksAhead: previewWeeksAhead, dryRun: false, resolutions }),
        cache: "no-store",
      });

      if (!response.ok) throw new Error("שגיאה בהחלת התבניות");

      const result = await response.json();
      const created = typeof result.created === "number" ? result.created : 0;
      const skipped = typeof result.skipped === "number" ? result.skipped : 0;
      const msg =
        skipped > 0
          ? `${created} פגישות נוצרו, ${skipped} דולגו`
          : `${created} פגישות נוצרו מהתבניות`;
      toast.success(msg);
      onApplyPreviewChange(null);
      onConflictDecisionsChange({});
      onOpenChange(false);
      onDataChanged();
    } catch {
      toast.error("שגיאה בהחלת התבניות");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent
        className={applyPreview ? "sm:max-w-lg max-h-[85vh] overflow-y-auto" : "sm:max-w-lg"}
      >
        {applyPreview ? (
          <>
            <DialogHeader>
              <DialogTitle>תצוגה מקדימה - החלת תבניות</DialogTitle>
              <DialogDescription>
                בדוק את הפגישות שייווצרו ובחר מה לעשות עם התנגשויות (פגישה קיימת באותו זמן = התנגשות)
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              {applyPreview.map((item) => (
                <div
                  key={item.key}
                  className={`p-3 rounded-lg border ${item.status === "conflict" ? "border-amber-300 bg-amber-50/50" : "border-green-200 bg-green-50/50"}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm min-w-0">
                      <p className="font-medium">{item.clientName}</p>
                      <p className="text-muted-foreground">
                        {new Date(item.date + "T12:00:00Z").toLocaleDateString("he-IL", { weekday: "long", day: "numeric", month: "long" })}
                        {" • "}
                        {item.time}
                      </p>
                    </div>
                    {item.status === "ok" && (
                      <span className="text-xs text-green-600 font-medium shrink-0">תיווצר</span>
                    )}
                  </div>

                  {item.status === "conflict" && item.conflictWith && (
                    <div className="mt-2 space-y-2">
                      <div className="text-xs text-amber-700 bg-amber-100 rounded px-2 py-1">
                        <AlertTriangle className="inline h-3 w-3 ml-1" />
                        חופפת עם: {item.conflictWith.clientName}{" "}
                        {new Date(item.conflictWith.startTime).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}
                        {" - "}
                        {new Date(item.conflictWith.endTime).toLocaleTimeString("he-IL", { hour: "2-digit", minute: "2-digit" })}
                      </div>
                      <div className="flex flex-col gap-1.5">
                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                          <input
                            type="radio"
                            name={`decision-${item.key}`}
                            checked={conflictDecisions[item.key] === "skip"}
                            onChange={() => onConflictDecisionsChange({ ...conflictDecisions, [item.key]: "skip" })}
                          />
                          דלג (לא ליצור)
                        </label>
                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                          <input
                            type="radio"
                            name={`decision-${item.key}`}
                            checked={conflictDecisions[item.key] === "replace"}
                            onChange={() => onConflictDecisionsChange({ ...conflictDecisions, [item.key]: "replace" })}
                          />
                          בטל את הפגישה הקיימת וצור חדשה
                        </label>
                        <label className="flex items-center gap-2 text-sm cursor-pointer">
                          <input
                            type="radio"
                            name={`decision-${item.key}`}
                            checked={conflictDecisions[item.key] === "create"}
                            onChange={() => onConflictDecisionsChange({ ...conflictDecisions, [item.key]: "create" })}
                          />
                          צור בכל זאת (חפיפה)
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <DialogFooter className="gap-2 flex-col sm:flex-row sm:justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  onApplyPreviewChange(null);
                  onConflictDecisionsChange({});
                }}
              >
                {pendingFormRecurring ? "ביטול" : "חזרה לתבניות"}
              </Button>
              <div className="flex gap-2 w-full sm:w-auto justify-end">
                <Button type="button" onClick={handleConfirmApply} disabled={isSubmitting} className="flex-1 sm:flex-initial">
                  {isSubmitting ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : null}
                  אשר וצור{" "}
                  {applyPreview.filter((p) => p.status === "ok" || conflictDecisions[p.key] !== "skip").length} פגישות
                </Button>
              </div>
            </DialogFooter>
          </>
        ) : (
          <>
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
                              onDataChanged();
                            }}
                          />
                        </div>
                      ))}
                    </div>
                    <Button
                      type="button"
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
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
