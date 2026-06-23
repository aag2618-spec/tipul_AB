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
import type { TaskTemplateData } from "./template-dialog";

type StaffMember = {
  id: string;
  name: string | null;
  email: string | null;
  clinicRole: "OWNER" | "THERAPIST" | "SECRETARY";
};

type AssignMode = "SPECIFIC" | "ALL_THERAPISTS" | "ALL_SECRETARIES" | "ALL_STAFF";

interface AssignTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => void;
}

const ROLE_LABELS: Record<string, string> = {
  OWNER: "מנהל/ת",
  THERAPIST: "מטפל/ת",
  SECRETARY: "מזכיר/ה",
};

export function AssignTaskDialog({
  open,
  onOpenChange,
  onCreated,
}: AssignTaskDialogProps) {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [loadingStaff, setLoadingStaff] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
  const [dueDate, setDueDate] = useState("");
  const [assignMode, setAssignMode] = useState<AssignMode>("SPECIFIC");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [templates, setTemplates] = useState<TaskTemplateData[]>([]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingStaff(true);
    fetch("/api/clinic-admin/staff", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (cancelled) return;
        setStaff(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) {
          setStaff([]);
          toast.error("שגיאה בטעינת רשימת הצוות");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingStaff(false);
      });
    // תבניות לשליחה חוזרת ("טען מתבנית").
    fetch("/api/task-templates", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => {
        if (!cancelled) setTemplates(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        if (!cancelled) setTemplates([]);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // מילוי מהיר של השדות מתבנית שנבחרה.
  const applyTemplate = (id: string) => {
    const tpl = templates.find((t) => t.id === id);
    if (!tpl) return;
    setTitle(tpl.title);
    setDescription(tpl.description || "");
    setPriority(tpl.priority || "MEDIUM");
    setAssignMode((tpl.assignMode as AssignMode) || "SPECIFIC");
    setSelectedIds(tpl.assigneeIds || []);
  };

  const reset = () => {
    setTitle("");
    setDescription("");
    setPriority("MEDIUM");
    setDueDate("");
    setAssignMode("SPECIFIC");
    setSelectedIds([]);
  };

  const toggle = (id: string) =>
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("נא להזין כותרת למטלה");
      return;
    }
    if (assignMode === "SPECIFIC" && selectedIds.length === 0) {
      toast.error("נא לבחור לפחות עובד אחד");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/clinic-admin/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          priority,
          dueDate: dueDate || null,
          assignMode,
          assigneeIds: assignMode === "SPECIFIC" ? selectedIds : undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || "שגיאה ביצירת המטלה");
      }
      const data = await res.json();
      toast.success(
        `המטלה נשלחה ל-${data.created} ${data.created === 1 ? "עובד" : "עובדים"}`
      );
      reset();
      onOpenChange(false);
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "שגיאה ביצירת המטלה");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent
        className="sm:max-w-lg max-h-[90vh] overflow-y-auto"
        dir="rtl"
      >
        <DialogHeader>
          <DialogTitle>מטלה חדשה לצוות</DialogTitle>
          <DialogDescription>
            שלח/י מטלה לעובד אחד או לכמה. הם יראו אותה בדשבורד ויסמנו &quot;בוצע&quot;.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          {templates.length > 0 && (
            <div className="space-y-2">
              <Label>טען מתבנית (אופציונלי)</Label>
              <Select onValueChange={applyTemplate} disabled={submitting}>
                <SelectTrigger>
                  <SelectValue placeholder="בחר/י תבנית למילוי מהיר…" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="task-title">כותרת</Label>
            <Input
              id="task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="לדוגמה: לבדוק שכל החדרים מסודרים"
              disabled={submitting}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="task-desc">פירוט (אופציונלי)</Label>
            <Textarea
              id="task-desc"
              value={description}
              rows={3}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="הסבר/י מה צריך לעשות..."
              disabled={submitting}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>עדיפות</Label>
              <Select
                value={priority}
                onValueChange={setPriority}
                disabled={submitting}
              >
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
              <Label htmlFor="task-due">תאריך יעד (אופציונלי)</Label>
              <Input
                id="task-due"
                type="date"
                value={dueDate}
                dir="ltr"
                onChange={(e) => setDueDate(e.target.value)}
                disabled={submitting}
              />
            </div>
          </div>

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
              {loadingStaff ? (
                <div className="flex items-center justify-center py-6 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin ms-2" /> טוען צוות…
                </div>
              ) : staff.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  אין עובדים בקליניקה.
                </p>
              ) : (
                <div className="divide-y max-h-56 overflow-y-auto rounded-md border">
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
              {selectedIds.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  {selectedIds.length} נבחרו
                </p>
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
              {submitting ? (
                <Loader2 className="ml-2 h-4 w-4 animate-spin" />
              ) : null}
              שליחה
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
