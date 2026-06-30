"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, Check } from "lucide-react";
import { toast } from "sonner";

type StaffMember = {
  id: string;
  name: string | null;
  clinicRole: "OWNER" | "THERAPIST" | "SECRETARY";
};
type AssignMode = "SPECIFIC" | "ALL_THERAPISTS" | "ALL_SECRETARIES" | "ALL_STAFF";
type Recurrence = "NONE" | "DAILY" | "WEEKLY" | "MONTHLY";

export interface TaskTemplateData {
  id: string;
  title: string;
  description: string | null;
  priority: string;
  recurrence: string;
  recurrenceWeekday: number | null;
  recurrenceMonthday: number | null;
  active: boolean;
  assignMode: string;
  assigneeIds: string[];
}

interface TemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
  template?: TaskTemplateData | null; // null/undefined = יצירה חדשה
}

const ROLE_LABELS: Record<string, string> = {
  OWNER: "מנהל/ת",
  THERAPIST: "מטפל/ת",
  SECRETARY: "מזכיר/ה",
};
const WEEKDAYS = [
  { v: "0", l: "ראשון" },
  { v: "1", l: "שני" },
  { v: "2", l: "שלישי" },
  { v: "3", l: "רביעי" },
  { v: "4", l: "חמישי" },
  { v: "5", l: "שישי" },
  { v: "6", l: "שבת" },
];

export function TemplateDialog({
  open,
  onOpenChange,
  onSaved,
  template,
}: TemplateDialogProps) {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
  const [recurrence, setRecurrence] = useState<Recurrence>("NONE");
  const [weekday, setWeekday] = useState("0");
  const [monthday, setMonthday] = useState("1");
  const [assignMode, setAssignMode] = useState<AssignMode>("SPECIFIC");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch("/api/clinic-admin/staff", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (!cancelled) setStaff(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setStaff([]);
      });
    // אכלוס מתבנית קיימת (עריכה) או איפוס (יצירה).
    if (template) {
      setTitle(template.title);
      setDescription(template.description || "");
      setPriority(template.priority || "MEDIUM");
      setRecurrence((template.recurrence as Recurrence) || "NONE");
      setWeekday(String(template.recurrenceWeekday ?? 0));
      setMonthday(String(template.recurrenceMonthday ?? 1));
      setAssignMode((template.assignMode as AssignMode) || "SPECIFIC");
      setSelectedIds(template.assigneeIds || []);
    } else {
      setTitle("");
      setDescription("");
      setPriority("MEDIUM");
      setRecurrence("NONE");
      setWeekday("0");
      setMonthday("1");
      setAssignMode("SPECIFIC");
      setSelectedIds([]);
    }
    return () => {
      cancelled = true;
    };
  }, [open, template]);

  const toggle = (id: string) =>
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("נא להזין כותרת לתבנית");
      return;
    }
    if (assignMode === "SPECIFIC" && selectedIds.length === 0) {
      toast.error("נא לבחור לפחות עובד אחד");
      return;
    }
    setSubmitting(true);
    try {
      const body = {
        title: title.trim(),
        description: description.trim() || null,
        priority,
        recurrence,
        recurrenceWeekday: recurrence === "WEEKLY" ? parseInt(weekday, 10) : null,
        recurrenceMonthday:
          recurrence === "MONTHLY" ? parseInt(monthday, 10) : null,
        assignMode,
        assigneeIds: assignMode === "SPECIFIC" ? selectedIds : undefined,
      };
      const url = template
        ? `/api/task-templates/${template.id}`
        : "/api/task-templates";
      const res = await fetch(url, {
        method: template ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || "שגיאה בשמירת התבנית");
      }
      toast.success(template ? "התבנית עודכנה" : "התבנית נוצרה");
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "שגיאה בשמירת התבנית");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="sm:max-w-lg max-h-[90vh] overflow-y-auto"
        dir="rtl"
      >
        <DialogHeader>
          <DialogTitle>{template ? "עריכת תבנית" : "תבנית מטלה חדשה"}</DialogTitle>
          <DialogDescription>
            תבנית לשליחה חוזרת בלחיצה, או מטלה שתישלח אוטומטית כל יום/שבוע/חודש.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="tpl-title">כותרת</Label>
            <Input
              id="tpl-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="לדוגמה: סגירת הקליניקה בסוף היום"
              disabled={submitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="tpl-desc">פירוט (אופציונלי)</Label>
            <Textarea
              id="tpl-desc"
              value={description}
              rows={3}
              onChange={(e) => setDescription(e.target.value)}
              disabled={submitting}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>עדיפות</Label>
              <Select value={priority} onValueChange={setPriority} disabled={submitting}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="LOW">נמוכה</SelectItem>
                  <SelectItem value="MEDIUM">בינונית</SelectItem>
                  <SelectItem value="HIGH">גבוהה</SelectItem>
                  <SelectItem value="URGENT">דחופה</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>חזרתיות</Label>
              <Select
                value={recurrence}
                onValueChange={(v) => setRecurrence(v as Recurrence)}
                disabled={submitting}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">ללא (שליחה ידנית)</SelectItem>
                  <SelectItem value="DAILY">כל יום</SelectItem>
                  <SelectItem value="WEEKLY">כל שבוע</SelectItem>
                  <SelectItem value="MONTHLY">כל חודש</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* הבהרת תזמון — המטלה נוצרת אוטומטית בכל בוקר (חלון 06:00–08:00
              שעון ישראל), פעם אחת. אין שליטה על שעה מדויקת. בשבת/חג היצירה
              נדחית למוצאי שבת/חג. */}
          {recurrence !== "NONE" && (
            <p className="rounded-md bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              ⏰ המטלה נשלחת אוטומטית <strong>בכל בוקר</strong> (בסביבות
              06:00–08:00).
              {recurrence === "DAILY" && " היא תופיע לעובדים מדי יום."}
              {recurrence === "WEEKLY" &&
                " בחר/י למטה באיזה יום בשבוע — היא תישלח בבוקר אותו יום."}
              {recurrence === "MONTHLY" &&
                " בחר/י למטה באיזה יום בחודש — היא תישלח בבוקר אותו תאריך."}
              {" בשבת/חג השליחה נדחית למוצאי שבת/חג."}
            </p>
          )}

          {recurrence === "WEEKLY" && (
            <div className="space-y-2">
              <Label>באיזה יום בשבוע?</Label>
              <Select value={weekday} onValueChange={setWeekday} disabled={submitting}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WEEKDAYS.map((d) => (
                    <SelectItem key={d.v} value={d.v}>
                      {d.l}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                ברירת המחדל היא יום ראשון (תחילת השבוע).
              </p>
            </div>
          )}

          {recurrence === "MONTHLY" && (
            <div className="space-y-2">
              <Label htmlFor="tpl-monthday">באיזה יום בחודש? (1–31)</Label>
              <Input
                id="tpl-monthday"
                type="number"
                min={1}
                max={31}
                value={monthday}
                onChange={(e) => setMonthday(e.target.value)}
                disabled={submitting}
                dir="ltr"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label>למי לשלוח?</Label>
            <Select
              value={assignMode}
              onValueChange={(v) => setAssignMode(v as AssignMode)}
              disabled={submitting}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="SPECIFIC">עובדים מסוימים</SelectItem>
                <SelectItem value="ALL_THERAPISTS">כל המטפלים</SelectItem>
                <SelectItem value="ALL_SECRETARIES">כל המזכירות</SelectItem>
                <SelectItem value="ALL_STAFF">כל הצוות</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {assignMode === "SPECIFIC" && (
            <div className="space-y-2">
              <Label>בחר/י עובדים</Label>
              {staff.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2 text-center">
                  טוען צוות…
                </p>
              ) : (
                <div className="divide-y max-h-48 overflow-y-auto rounded-md border">
                  {staff.map((m) => {
                    const sel = selectedIds.includes(m.id);
                    return (
                      <button
                        key={m.id}
                        type="button"
                        onClick={() => toggle(m.id)}
                        className={`w-full text-right p-2.5 flex items-center gap-3 ${
                          sel ? "bg-primary/10" : "hover:bg-muted/50"
                        }`}
                      >
                        <span
                          className={`h-5 w-5 rounded-full border flex items-center justify-center shrink-0 ${
                            sel
                              ? "bg-primary border-primary text-primary-foreground"
                              : "border-muted-foreground/30"
                          }`}
                        >
                          {sel && <Check className="h-3.5 w-3.5" />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">
                            {m.name || "ללא שם"}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {ROLE_LABELS[m.clinicRole] || m.clinicRole}
                          </p>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              ביטול
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : null}
              {template ? "שמור שינויים" : "צור תבנית"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
