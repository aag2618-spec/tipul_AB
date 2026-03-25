"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import type { CalendarSession } from "@/hooks/use-calendar-data";

interface ChargeConfirmationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: CalendarSession | null;
  pendingAction: "CANCELLED" | "NO_SHOW" | null;
  /** סוגר את כל הדיאלוגים (charge + session-detail) ומאפס state - נקרא מיד בלחיצה */
  onDismissAll: () => void;
  /** פותח דיאלוג תשלום רגיל (QuickMarkPaid) */
  onRequestPayment: (data: {
    sessionId: string;
    clientId: string;
    amount: number;
    pendingSessionStatus: string;
  }) => void;
  /** מרענן נתונים אחרי פעולה מוצלחת */
  onDataChanged: () => void;
}

export function ChargeConfirmationDialog({
  open,
  onOpenChange,
  session,
  pendingAction,
  onDismissAll,
  onRequestPayment,
  onDataChanged,
}: ChargeConfirmationDialogProps) {
  const router = useRouter();
  const [isProcessing, setIsProcessing] = useState(false);
  const [reason, setReason] = useState("");
  const [noChargeReason, setNoChargeReason] = useState("");
  const [showExemptReason, setShowExemptReason] = useState(false);

  const isCancelled = pendingAction === "CANCELLED";
  const reasonLabel = isCancelled ? "סיבת ביטול (אופציונלי)" : "סיבת אי הופעה (אופציונלי)";
  const reasonPlaceholder = isCancelled
    ? "לדוגמה: מחלה, בקשת מטופל..."
    : "לדוגמה: לא ענה לטלפון, שכח...";

  const handleCharge = async () => {
    if (!session || !pendingAction || !session.client) return;
    const status = pendingAction;
    const clientId = session.client.id;
    const sessionId = session.id;
    const amount = session.price - Number(session.payment?.amount || 0);

    // סוגר את כל הדיאלוגים מיד (כמו בקוד המקורי)
    onDismissAll();

    try {
      // בדיקת חובות ישנים
      const debtRes = await fetch(`/api/payments/client-debt/${clientId}`);
      if (debtRes.ok) {
        const debtData = await debtRes.json();
        const unpaidCount = debtData.unpaidSessions?.length || 0;
        if (unpaidCount > 0 && debtData.totalDebt > 0) {
          await fetch(`/api/sessions/${sessionId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              status,
              createPayment: true,
              markAsPaid: false,
              cancellationReason: reason || undefined,
            }),
          });
          toast.success("הפגישה עודכנה, מעבר לדף תשלום החובות...");
          onDataChanged();
          router.push(`/dashboard/payments/pay/${clientId}`);
          return;
        }
      }
    } catch {
      // fallback לדיאלוג תשלום רגיל
    }

    // שמירת סיבה לפני פתיחת דיאלוג תשלום
    if (reason) {
      await fetch(`/api/sessions/${sessionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cancellationReason: reason }),
      }).catch(() => {});
    }

    // אין חובות ישנים - פתיחת דיאלוג תשלום רגיל
    onRequestPayment({
      sessionId,
      clientId,
      amount,
      pendingSessionStatus: status,
    });
  };

  const handleRecordDebt = async () => {
    if (!session || !pendingAction || !session.client) return;
    setIsProcessing(true);
    try {
      const response = await fetch(`/api/sessions/${session.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: pendingAction,
          createPayment: true,
          markAsPaid: false,
          cancellationReason: reason || undefined,
        }),
      });
      if (response.ok) {
        toast.success("הפגישה עודכנה והחוב נרשם");
        onDismissAll();
        onDataChanged();
      }
    } catch {
      toast.error("שגיאה בעדכון הפגישה");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExempt = async () => {
    if (!session || !pendingAction) return;
    setIsProcessing(true);
    try {
      // עדכון סטטוס + סיבה
      await fetch(`/api/sessions/${session.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: pendingAction,
          cancellationReason: reason || undefined,
        }),
      });
      // שמירת סיבת אי חיוב כהערה
      if (noChargeReason) {
        await fetch(`/api/sessions/${session.id}/note`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: noChargeReason }),
        });
      }
      toast.success(
        isCancelled
          ? "הפגישה בוטלה ללא חיוב - פטור מתשלום"
          : "נרשמה אי הופעה ללא חיוב - פטור מתשלום"
      );
      onDismissAll();
      onDataChanged();
    } catch {
      toast.error("שגיאה בעדכון הפגישה");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => {
      if (!o) {
        setReason("");
        setNoChargeReason("");
        setShowExemptReason(false);
      }
      onOpenChange(o);
    }}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle>האם לחייב את המטופל?</DialogTitle>
          <DialogDescription>
            {isCancelled
              ? "הפגישה בוטלה. האם ברצונך לחייב את המטופל בתשלום?"
              : "המטופל נעדר מהפגישה. האם ברצונך לחייב אותו בתשלום?"}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* שדה סיבה */}
          <div className="space-y-1.5">
            <label className="text-xs text-muted-foreground">{reasonLabel}</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={reasonPlaceholder}
              className="w-full text-sm p-2.5 rounded-lg border resize-none bg-background"
              rows={2}
            />
          </div>

          {/* שדה סיבת אי חיוב - מוצג רק בלחיצה על פטור */}
          {showExemptReason && (
            <div className="space-y-1.5 border rounded-lg p-3 bg-amber-50/50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800">
              <label className="text-xs font-medium text-amber-700 dark:text-amber-300">סיבה לאי חיוב (אופציונלי)</label>
              <textarea
                value={noChargeReason}
                onChange={(e) => setNoChargeReason(e.target.value)}
                placeholder="לדוגמה: סיכום מראש, פגישת היכרות, הסדר מיוחד..."
                className="w-full text-sm p-2.5 rounded-lg border resize-none bg-background"
                rows={2}
              />
            </div>
          )}
        </div>

        <DialogFooter className="flex-row-reverse gap-2">
          <Button onClick={handleCharge} disabled={isProcessing}>
            כן, לחייב
          </Button>
          <Button variant="secondary" onClick={handleRecordDebt} disabled={isProcessing}>
            עדכן ורשום חוב
          </Button>
          {!showExemptReason ? (
            <Button
              variant="outline"
              onClick={() => setShowExemptReason(true)}
              disabled={isProcessing}
            >
              פטור מתשלום
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={handleExempt}
              disabled={isProcessing}
            >
              אשר פטור
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
