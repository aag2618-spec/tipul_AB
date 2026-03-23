"use client";

import { useState } from "react";
import { toast } from "sonner";
import type { CalendarSession } from "@/hooks/use-calendar-data";
import type { UpdateSessionDialogParams } from "@/components/update-session-dialog";

interface UseCalendarActionsProps {
  fetchData: () => void;
}

interface UpdateResult {
  success: boolean;
}

export function useCalendarActions({ fetchData }: UseCalendarActionsProps) {
  const [updating, setUpdating] = useState(false);

  /**
   * עדכון פגישה עם תשלום אופציונלי (מ-UpdateSessionDialog)
   */
  const updateSessionWithPayment = async (
    session: CalendarSession,
    params: UpdateSessionDialogParams
  ): Promise<UpdateResult> => {
    const { updateStatus, showPayment, paymentMethod, paymentType, paymentAmount, partialAmount, issueReceipt, businessType, updateReason } = params;
    setUpdating(true);
    try {
      // תשלום + סטטוס הושלם
      if (updateStatus === "COMPLETED" && showPayment && session.price > 0 && session.client) {
        const pmtAmount = paymentType === "PARTIAL"
          ? (parseFloat(partialAmount) || 0)
          : Number(session.price);
        if (paymentType === "PARTIAL" && (pmtAmount <= 0 || pmtAmount > session.price)) {
          toast.error("סכום חלקי לא תקין");
          return { success: false };
        }
        const paymentResponse = await fetch("/api/payments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientId: session.client.id,
            sessionId: session.id,
            amount: pmtAmount,
            expectedAmount: Number(session.price),
            paymentType: paymentType === "PARTIAL" ? "PARTIAL" : "FULL",
            method: paymentMethod,
            status: paymentType === "PARTIAL" ? "PENDING" : "PAID",
            issueReceipt: businessType !== "NONE" && issueReceipt,
          }),
        });
        if (!paymentResponse.ok) {
          const errorData = await paymentResponse.json().catch(() => null);
          toast.error(errorData?.message || "שגיאה ביצירת התשלום");
          return { success: false };
        }
        const paymentResult = await paymentResponse.json();
        const sessionUpdateRes = await fetch(`/api/sessions/${session.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "COMPLETED" }),
        });
        if (!sessionUpdateRes.ok) {
          toast.success("התשלום בוצע");
          toast.error("שגיאה בעדכון סטטוס הפגישה - נסה לעדכן ידנית");
        } else {
          toast.success("הפגישה הושלמה והתשלום בוצע");
        }
        if (paymentResult?.receiptError) {
          toast.error(`שגיאה בהפקת קבלה: ${paymentResult.receiptError}`, { duration: 8000 });
        }
        fetchData();
        return { success: true };
      }

      // עדכון סטטוס (ביטול/אי-הופעה) עם תשלום אופציונלי
      const updates: Promise<Response>[] = [];
      const statusBody: Record<string, unknown> = { status: updateStatus };
      if (updateStatus === "CANCELLED") statusBody.cancellationReason = updateReason.trim() || undefined;
      updates.push(
        fetch(`/api/sessions/${session.id}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(statusBody),
        })
      );
      if (showPayment && session.price > 0) {
        const amt = paymentType === "PARTIAL"
          ? parseFloat(partialAmount) || 0
          : parseFloat(paymentAmount) || 0;
        if (amt > 0) {
          updates.push(
            fetch("/api/payments", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                clientId: session.client?.id,
                sessionId: session.id,
                amount: amt,
                expectedAmount: session.price || amt,
                paymentType: paymentType === "PARTIAL" ? "PARTIAL" : "FULL",
                method: paymentMethod,
                status: paymentType === "PARTIAL" ? "PENDING" : "PAID",
                issueReceipt: businessType !== "NONE" && issueReceipt,
              }),
            })
          );
        }
      }
      const results = await Promise.all(updates);
      const failedResult = results.find(r => !r.ok);
      if (failedResult) {
        const errorData = await failedResult.json().catch(() => null);
        toast.error(errorData?.message || "שגיאה בעדכון הפגישה");
        return { success: false };
      }
      const labels: Record<string, string> = {
        COMPLETED: "הפגישה עודכנה כהושלמה",
        CANCELLED: "הפגישה עודכנה כבוטלה",
        NO_SHOW: "הפגישה עודכנה כלא הגיע",
      };
      toast.success(labels[updateStatus] || "הפגישה עודכנה");
      fetchData();
      return { success: true };
    } catch {
      toast.error("שגיאה בעדכון הפגישה");
      return { success: false };
    } finally {
      setUpdating(false);
    }
  };

  /**
   * רישום חוב על פגישה (מ-UpdateSessionDialog)
   */
  const recordSessionDebt = async (
    session: CalendarSession,
    params: { updateStatus: string; updateReason: string }
  ): Promise<UpdateResult> => {
    if (!session.client) return { success: false };
    setUpdating(true);
    try {
      const statusBody: Record<string, unknown> = { status: params.updateStatus, createPayment: true, markAsPaid: false };
      if (params.updateStatus === "CANCELLED") statusBody.cancellationReason = params.updateReason.trim() || undefined;
      const response = await fetch(`/api/sessions/${session.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(statusBody),
      });
      if (response.ok) {
        toast.success("הפגישה עודכנה והחוב נרשם");
        fetchData();
        return { success: true };
      }
      const errorData = await response.json().catch(() => null);
      toast.error(errorData?.message || "שגיאה בעדכון הפגישה");
      return { success: false };
    } catch {
      toast.error("שגיאה בעדכון הפגישה");
      return { success: false };
    } finally {
      setUpdating(false);
    }
  };

  return {
    updating,
    updateSessionWithPayment,
    recordSessionDebt,
  };
}
