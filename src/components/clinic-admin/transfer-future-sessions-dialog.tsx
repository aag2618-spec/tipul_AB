"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Loader2, AlertCircle, Calendar, AlertTriangle } from "lucide-react";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { toast } from "sonner";

interface PreviewItem {
  id: string;
  startTime: string;
  endTime: string;
  status: string;
  type: string;
  conflict: {
    sessionId: string;
    clientName: string | null;
    startTime: string;
    endTime: string;
    status: string;
  } | null;
}

type Choice = "TRANSFER" | "CANCEL"; // לפגישה ללא חפיפה
type ChoiceConflict = "TRANSFER_OVERRIDE" | "CANCEL"; // לפגישה עם חפיפה

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientId: string;
  clientName: string;
  toTherapistId: string;
  fromTherapistName: string;
  toTherapistName: string;
  reason?: string;
  onSuccess: () => void;
}

export function TransferFutureSessionsDialog({
  open,
  onOpenChange,
  clientId,
  clientName,
  toTherapistId,
  fromTherapistName,
  toTherapistName,
  reason,
  onSuccess,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<PreviewItem[]>([]);
  // sessionId → bחירת המשתמש
  const [choices, setChoices] = useState<Record<string, Choice | ChoiceConflict>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      setItems([]);
      setChoices({});
      try {
        const res = await fetch(
          `/api/clinic-admin/transfer-client/preview?clientId=${encodeURIComponent(
            clientId
          )}&toTherapistId=${encodeURIComponent(toTherapistId)}`
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.message || "שגיאה");
        if (cancelled) return;
        setItems(data.items || []);
        // ברירת מחדל: ללא התנגשות → TRANSFER, עם התנגשות → CANCEL
        const initial: Record<string, Choice | ChoiceConflict> = {};
        for (const it of data.items || []) {
          initial[it.id] = it.conflict ? "CANCEL" : "TRANSFER";
        }
        setChoices(initial);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "שגיאה");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, clientId, toTherapistId]);

  function setChoice(sessionId: string, choice: Choice | ChoiceConflict) {
    setChoices((prev) => ({ ...prev, [sessionId]: choice }));
  }

  const counts = (() => {
    let transfer = 0;
    let override = 0;
    let cancel = 0;
    for (const item of items) {
      const choice = choices[item.id];
      if (choice === "TRANSFER") transfer++;
      else if (choice === "TRANSFER_OVERRIDE") override++;
      else cancel++;
    }
    return { transfer, override, cancel };
  })();

  async function handleSubmit() {
    if (items.length === 0) {
      // אין פגישות עתידיות — ביצוע פשוט בלי הרשימות
      await doTransfer({
        sessionsToTransfer: [],
        sessionsToTransferWithOverride: [],
        sessionsToCancel: [],
      });
      return;
    }

    const sessionsToTransfer: string[] = [];
    const sessionsToTransferWithOverride: string[] = [];
    const sessionsToCancel: string[] = [];
    for (const item of items) {
      const choice = choices[item.id];
      if (choice === "TRANSFER") sessionsToTransfer.push(item.id);
      else if (choice === "TRANSFER_OVERRIDE") sessionsToTransferWithOverride.push(item.id);
      else sessionsToCancel.push(item.id);
    }
    await doTransfer({
      sessionsToTransfer,
      sessionsToTransferWithOverride,
      sessionsToCancel,
    });
  }

  async function doTransfer(payload: {
    sessionsToTransfer: string[];
    sessionsToTransferWithOverride: string[];
    sessionsToCancel: string[];
  }) {
    setSubmitting(true);
    try {
      const res = await fetch("/api/clinic-admin/transfer-client", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          toTherapistId,
          reason,
          transferFutureSessions: true,
          ...payload,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || "שגיאה");
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "שגיאה בהעברה");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="max-w-2xl max-h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>העברת פגישות עתידיות</DialogTitle>
          <DialogDescription>
            {clientName} — מ-{fromTherapistName} ל-{toTherapistName}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto -mx-1 px-1 space-y-3">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : error ? (
            <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-md text-sm">
              <AlertCircle className="inline h-4 w-4 ml-1" />
              {error}
            </div>
          ) : items.length === 0 ? (
            <div className="p-6 bg-muted/30 rounded-md text-sm text-center text-muted-foreground">
              אין פגישות עתידיות פעילות. ההעברה תעדכן את שיוך המטופל בלבד.
            </div>
          ) : (
            <>
              <div className="text-xs text-muted-foreground bg-muted/30 p-2 rounded">
                {items.length} פגישות עתידיות פעילות. בחר/י לכל אחת מה לעשות.
              </div>

              {items.map((item) => {
                const start = new Date(item.startTime);
                const end = new Date(item.endTime);
                const choice = choices[item.id];
                const hasConflict = !!item.conflict;
                const conflictStart = item.conflict ? new Date(item.conflict.startTime) : null;
                const conflictEnd = item.conflict ? new Date(item.conflict.endTime) : null;

                return (
                  <div
                    key={item.id}
                    className="p-3 border border-border rounded-md bg-muted/20 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 text-sm">
                        <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
                        <div>
                          <div className="font-medium">
                            {format(start, "EEEE, dd/MM/yyyy", { locale: he })}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {format(start, "HH:mm")} — {format(end, "HH:mm")}
                          </div>
                        </div>
                      </div>
                      {hasConflict && (
                        <div className="text-xs text-amber-600 dark:text-amber-400 inline-flex items-center gap-1 shrink-0">
                          <AlertTriangle className="h-3 w-3" />
                          התנגשות
                        </div>
                      )}
                    </div>

                    {hasConflict && conflictStart && conflictEnd && (
                      <div className="text-xs bg-amber-500/10 border border-amber-500/30 rounded px-2 py-1.5">
                        כבר יש ל-{toTherapistName} פגישה עם{" "}
                        <strong>{item.conflict?.clientName || "—"}</strong> בשעות{" "}
                        {format(conflictStart, "HH:mm")}-
                        {format(conflictEnd, "HH:mm")}.
                      </div>
                    )}

                    <RadioGroup
                      value={choice}
                      onValueChange={(v) =>
                        setChoice(item.id, v as Choice | ChoiceConflict)
                      }
                      className="gap-1.5"
                      dir="rtl"
                    >
                      {hasConflict ? (
                        <>
                          <div className="flex items-center gap-2">
                            <RadioGroupItem
                              value="TRANSFER_OVERRIDE"
                              id={`r-${item.id}-override`}
                            />
                            <Label
                              htmlFor={`r-${item.id}-override`}
                              className="text-sm cursor-pointer"
                            >
                              להעביר בכל זאת (יוצר שתי פגישות באותו זמן!)
                            </Label>
                          </div>
                          <div className="flex items-center gap-2">
                            <RadioGroupItem value="CANCEL" id={`r-${item.id}-cancel`} />
                            <Label
                              htmlFor={`r-${item.id}-cancel`}
                              className="text-sm cursor-pointer"
                            >
                              לבטל את הפגישה (ברירת מחדל)
                            </Label>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="flex items-center gap-2">
                            <RadioGroupItem value="TRANSFER" id={`r-${item.id}-transfer`} />
                            <Label
                              htmlFor={`r-${item.id}-transfer`}
                              className="text-sm cursor-pointer"
                            >
                              להעביר (ברירת מחדל)
                            </Label>
                          </div>
                          <div className="flex items-center gap-2">
                            <RadioGroupItem value="CANCEL" id={`r-${item.id}-cancel`} />
                            <Label
                              htmlFor={`r-${item.id}-cancel`}
                              className="text-sm cursor-pointer"
                            >
                              לבטל את הפגישה
                            </Label>
                          </div>
                        </>
                      )}
                    </RadioGroup>
                  </div>
                );
              })}

              {/* סיכום */}
              <div className="sticky bottom-0 bg-background border border-border rounded-md p-2 text-xs">
                <strong>סיכום:</strong>{" "}
                {counts.transfer} יועברו · {counts.override} יועברו עם התנגשות ·{" "}
                {counts.cancel} יבוטלו
              </div>

              <div className="text-xs text-muted-foreground">
                פגישות שיבוטלו ובהן תשלום/קבלה — יישארו במערכת בסטטוס &quot;בוטל&quot;
                כדי לשמור את שרשרת החיוב. שאר הפגישות יימחקו.
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            ביטול
          </Button>
          <Button onClick={handleSubmit} disabled={submitting || loading}>
            {submitting && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
            אישור והעברה
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
