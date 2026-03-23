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
            body: JSON.stringify({ status, createPayment: true, markAsPaid: false }),
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
        body: JSON.stringify({ status: pendingAction, createPayment: true, markAsPaid: false }),
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
      await fetch(`/api/sessions/${session.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: pendingAction }),
      });
      toast.success(
        pendingAction === "CANCELLED"
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>האם לחייב את המטופל?</DialogTitle>
          <DialogDescription>
            {pendingAction === "CANCELLED"
              ? "הפגישה בוטלה. האם ברצונך לחייב את המטופל בתשלום?"
              : "המטופל נעדר מהפגישה. האם ברצונך לחייב אותו בתשלום?"}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="flex-row-reverse gap-2">
          <Button onClick={handleCharge} disabled={isProcessing}>
            כן, לחייב
          </Button>
          <Button variant="secondary" onClick={handleRecordDebt} disabled={isProcessing}>
            עדכן ורשום חוב
          </Button>
          <Button variant="outline" onClick={handleExempt} disabled={isProcessing}>
            פטור מתשלום
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
