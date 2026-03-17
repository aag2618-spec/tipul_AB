"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { CheckCircle, ClipboardList, Clock, FileText, MoreVertical, User, Loader2 } from "lucide-react";
import { QuickMarkPaid } from "@/components/payments/quick-mark-paid";
import { toast } from "sonner";
import { ChargeConfirmDialog } from "./charge-confirm-dialog";
import { UpdateSessionDialog } from "./update-session-dialog";
import { SessionStatusIndicators } from "./session-status-indicators";

interface TodaySessionCardProps {
  session: {
    id: string;
    startTime: Date | string;
    endTime: Date | string;
    type: string;
    price: number;
    status: string;
    sessionNote: string | null;
    cancellationReason?: string | null;
    payment: {
      id: string;
      status: string;
      amount: number;
      expectedAmount?: number;
    } | null;
    client: {
      id: string;
      name: string;
      creditBalance: number;
      totalDebt?: number;
      unpaidSessionsCount?: number;
    } | null;
  };
}

// Helper to get Israel time components from UTC using Intl API for accurate DST
function getIsraelTime(utcDate: Date) {
  const date = new Date(utcDate);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jerusalem",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  }).formatToParts(date);

  const get = (type: string) => parseInt(parts.find(p => p.type === type)?.value || "0");

  const dayOfWeekStr = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jerusalem",
    weekday: "short",
  }).format(date);
  const dayMap: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  return {
    hours: get("hour"),
    minutes: get("minute"),
    date: get("day"),
    month: get("month"),
    year: get("year"),
    dayOfWeek: dayMap[dayOfWeekStr] ?? 0,
  };
}

// Helper to format time as HH:mm
function formatTimeHHMM(utcDate: Date): string {
  const { hours, minutes } = getIsraelTime(utcDate);
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

// Helper to format date in Hebrew
function formatDateHebrew(utcDate: Date): string {
  const { date, month, dayOfWeek } = getIsraelTime(utcDate);
  const days = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  const months = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

  return `יום ${days[dayOfWeek]}, ${date} ב${months[month - 1]}`;
}

export function TodaySessionCard({ session }: TodaySessionCardProps) {
  const router = useRouter();
  const [isChargeDialogOpen, setIsChargeDialogOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<"CANCELLED" | "NO_SHOW" | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [isPaymentDialogOpen, setIsPaymentDialogOpen] = useState(false);
  const [paymentData, setPaymentData] = useState<{
    sessionId: string;
    clientId: string;
    amount: number;
    paymentId?: string;
  } | null>(null);

  const handleUpdate = async (params: {
    updateStatus: string;
    showPayment: boolean;
    paymentMethod: string;
    paymentType: "FULL" | "PARTIAL";
    paymentAmount: string;
    partialAmount: string;
    issueReceipt: boolean;
    businessType: string;
    updateReason: string;
    noChargeReason: string;
  }) => {
    const { updateStatus, showPayment, paymentMethod, paymentType, paymentAmount, partialAmount, issueReceipt, businessType, updateReason } = params;
    if (!updateStatus) { toast.error("בחר סטטוס"); return; }
    setUpdating(true);
    try {
      if (updateStatus === "COMPLETED" && showPayment && session.price > 0 && session.client) {
        const pmtAmount = paymentType === "PARTIAL"
          ? (parseFloat(partialAmount) || 0)
          : Number(session.price);

        if (paymentType === "PARTIAL" && (pmtAmount <= 0 || pmtAmount > session.price)) {
          toast.error("סכום חלקי לא תקין");
          setUpdating(false);
          return;
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
          setUpdating(false);
          return;
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
        router.refresh();
        return;
      }

      const updates: Promise<Response>[] = [];
      const statusBody: Record<string, unknown> = { status: updateStatus };
      if (updateStatus === "CANCELLED") {
        statusBody.cancellationReason = updateReason.trim() || undefined;
      }
      updates.push(
        fetch(`/api/sessions/${session.id}/status`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(statusBody),
        })
      );

      if (showPayment) {
        const amt = paymentType === "PARTIAL"
          ? parseFloat(partialAmount) || 0
          : parseFloat(paymentAmount) || 0;
        if (amt > 0 && session.client) {
          updates.push(
            fetch("/api/payments", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                clientId: session.client.id,
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
      } else {
        const labels: Record<string, string> = {
          COMPLETED: "הפגישה עודכנה כהושלמה",
          CANCELLED: "הפגישה עודכנה כבוטלה",
          NO_SHOW: "הפגישה עודכנה כלא הגיע",
        };
        toast.success(labels[updateStatus] || "הפגישה עודכנה");
      }
      router.refresh();
    } catch {
      toast.error("שגיאה בעדכון הפגישה");
    } finally {
      setUpdating(false);
    }
  };

  const handleRecordDebt = async (params: {
    updateStatus: string;
    updateReason: string;
  }) => {
    if (!session.client) return;
    setUpdating(true);
    try {
      const statusBody: Record<string, unknown> = { status: params.updateStatus, createPayment: true, markAsPaid: false };
      if (params.updateStatus === "CANCELLED") {
        statusBody.cancellationReason = params.updateReason.trim() || undefined;
      }
      const response = await fetch(`/api/sessions/${session.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(statusBody),
      });
      if (response.ok) {
        toast.success("הפגישה עודכנה והחוב נרשם");
        router.refresh();
      } else {
        toast.error("שגיאה בעדכון הפגישה");
      }
    } catch {
      toast.error("שגיאה בעדכון הפגישה");
    } finally {
      setUpdating(false);
    }
  };

  const handleFinishAndPay = async () => {
    if (!session.client) return;
    setIsProcessing(true);
    try {
      const response = await fetch(`/api/sessions/${session.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "COMPLETED", createPayment: true, markAsPaid: false }),
      });

      if (response.ok) {
        const updatedSession = await response.json();
        toast.success("הפגישה הושלמה, מעבר לדף תשלום...");
        // Navigate to simple payment page with payment ID
        if (updatedSession.payment?.id) {
          router.push(`/dashboard/payments/${updatedSession.payment.id}/mark-paid`);
        } else {
          // Fallback to full payment page if no payment created
          router.push(`/dashboard/payments/pay/${session.client.id}`);
        }
      }
    } catch {
      toast.error("שגיאה בעדכון הפגישה");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFinishWithoutPayment = async () => {
    setIsProcessing(true);
    try {
      await fetch(`/api/sessions/${session.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "COMPLETED" }),
      });
      toast.success("הפגישה הושלמה ללא תשלום");
      router.refresh();
    } catch {
      toast.error("שגיאה בעדכון הפגישה");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleActionWithCharge = async (shouldCharge: boolean) => {
    if (!session.client || !pendingAction) return;
    setIsProcessing(true);
    try {
      const response = await fetch(`/api/sessions/${session.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: pendingAction,
          createPayment: shouldCharge,
          markAsPaid: false,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to update session");
      }

      setIsChargeDialogOpen(false);
      setPendingAction(null);

      if (shouldCharge) {
        const updatedSession = await response.json();
        toast.success(pendingAction === "CANCELLED" ? "הפגישה בוטלה וחויבה. מעבר לדף תשלום..." : "דווחה אי הופעה וחויב. מעבר לדף תשלום...");
        // Navigate to simple payment page with payment ID
        const clientId = session.client?.id;
        if (clientId) {
          setTimeout(() => {
            if (updatedSession.payment?.id) {
              router.push(`/dashboard/payments/${updatedSession.payment.id}/mark-paid`);
            } else {
              router.push(`/dashboard/payments/pay/${clientId}`);
            }
          }, 500);
        } else {
          toast.error("שגיאה: לא נמצא מזהה מטופל");
          setIsProcessing(false);
        }
      } else {
        toast.success(pendingAction === "CANCELLED" ? "הפגישה בוטלה ללא חיוב" : "דווחה אי הופעה ללא חיוב");
        setIsProcessing(false);
        router.refresh();
      }
    } catch (error) {
      toast.error("שגיאה בעדכון הפגישה");
      setIsProcessing(false);
      setIsChargeDialogOpen(false);
      setPendingAction(null);
    }
  };

  return (
    <>
      <div className={`p-3 rounded-lg border space-y-2 ${
        session.status === "COMPLETED" ? "bg-white border-emerald-300" :
        session.status === "CANCELLED" ? "bg-red-50/40 border-red-200" :
        session.status === "NO_SHOW" ? "bg-red-50/50 border-red-200" :
        session.status === "SCHEDULED" && new Date(session.endTime) < new Date() ? "bg-sky-50/60 border-sky-200" :
        "bg-emerald-50/60 border-emerald-200"
      }`}>
        {/* Row 1: Time + session type */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="flex flex-col items-center justify-center w-12 h-12 rounded-lg bg-primary/10 text-primary">
              <span className="text-sm font-bold">
                {formatTimeHHMM(new Date(session.startTime))}
              </span>
              <span className="text-xs text-muted-foreground">
                {Math.round((new Date(session.endTime).getTime() - new Date(session.startTime).getTime()) / 60000)} דק'
              </span>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">
                {formatDateHebrew(new Date(session.startTime))}
                <span className="mx-1">·</span>
                <span className="text-xs">{session.type === "BREAK" ? "הפסקה" : session.type === "ONLINE" ? "אונליין" : session.type === "PHONE" ? "טלפון" : "פרונטלי"}</span>
              </p>
            </div>
          </div>

          {session.status === "SCHEDULED" && new Date(session.startTime) < new Date() ? (
            <Badge
              variant="outline"
              className="bg-orange-50 text-orange-600 border-orange-300 cursor-pointer hover:bg-orange-100 text-[10px]"
              onClick={() => {
                setUpdateDialogOpen(true);
              }}
            >
              ⚠ לא עודכן · עדכן
            </Badge>
          ) : session.status === "PENDING_APPROVAL" ? (
            <div className="flex items-center gap-1.5">
              <Badge
                variant="outline"
                className="bg-green-50 text-green-700 border-green-300 cursor-pointer hover:bg-green-100 text-[10px] px-2 py-0.5"
                onClick={async () => {
                  try {
                    const res = await fetch(`/api/sessions/${session.id}/status`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ status: "SCHEDULED" }),
                    });
                    if (res.ok) {
                      toast.success("הפגישה אושרה");
                      router.refresh();
                    } else {
                      const errorData = await res.json().catch(() => null);
                      toast.error(errorData?.message || "שגיאה באישור הפגישה");
                    }
                  } catch {
                    toast.error("שגיאה באישור הפגישה");
                  }
                }}
              >
                ✅ אשר
              </Badge>
              <Badge
                variant="outline"
                className="bg-red-50 text-red-600 border-red-300 cursor-pointer hover:bg-red-100 text-[10px] px-2 py-0.5"
                onClick={async () => {
                  try {
                    const res = await fetch(`/api/sessions/${session.id}/status`, {
                      method: "PATCH",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ status: "CANCELLED" }),
                    });
                    if (res.ok) {
                      toast.success("הפגישה נדחתה");
                      router.refresh();
                    } else {
                      const errorData = await res.json().catch(() => null);
                      toast.error(errorData?.message || "שגיאה בדחיית הפגישה");
                    }
                  } catch {
                    toast.error("שגיאה בדחיית הפגישה");
                  }
                }}
              >
                ❌ דחה
              </Badge>
            </div>
          ) : session.status !== "SCHEDULED" ? (
            <span className={`text-xs font-medium ${
              session.status === "COMPLETED" ? "text-emerald-600" :
              session.status === "CANCELLED" ? "text-red-500" :
              "text-red-500"
            }`}>
              {session.status === "COMPLETED" ? "הושלמה" :
               session.status === "CANCELLED" ? "בוטלה" : "לא הגיע"}
            </span>
          ) : null}
        </div>

        {/* Row 2: Client name - clickable */}
        {session.client ? (
          <div>
            <Link
              href={`/dashboard/clients/${session.client.id}`}
              className="text-base font-semibold hover:text-primary hover:underline transition-colors cursor-pointer inline-block"
            >
              👤 {session.client.name}
            </Link>
          </div>
        ) : (
          <div className="text-base font-semibold text-muted-foreground">🌊 הפסקה</div>
        )}

        {/* Cancellation reason */}
        {session.status === "CANCELLED" && session.cancellationReason && (
          <p className="text-xs text-muted-foreground/70 bg-red-50 rounded px-2 py-1 border border-red-100">
            סיבה: {session.cancellationReason}
          </p>
        )}

        {/* Row 3: Status indicators */}
        <SessionStatusIndicators session={session} />

        {/* Row 4: Action menu */}
        {session.client && (
          <div className="flex justify-center pt-1.5 border-t">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="default" className="gap-2" disabled={isProcessing}>
                  פעולות
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="center" className="w-56">
                {/* Client folder - always */}
                <DropdownMenuItem asChild>
                  <Link href={`/dashboard/clients/${session.client.id}`} className="cursor-pointer">
                    <User className="h-4 w-4 ml-2" />
                    תיקית מטופל
                  </Link>
                </DropdownMenuItem>

                {/* Options for scheduled session */}
                {session.status === "SCHEDULED" && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={handleFinishAndPay} disabled={isProcessing}>
                      <CheckCircle className="h-4 w-4 ml-2 text-green-600" />
                      סיים ושלם
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handleFinishWithoutPayment} disabled={isProcessing}>
                      <CheckCircle className="h-4 w-4 ml-2 text-sky-600" />
                      סיים ללא תשלום
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => {
                      setPendingAction("NO_SHOW");
                      setIsChargeDialogOpen(true);
                    }} disabled={isProcessing}>
                      <ClipboardList className="h-4 w-4 ml-2 text-red-600" />
                      אי הופעה
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => {
                      setPendingAction("CANCELLED");
                      setIsChargeDialogOpen(true);
                    }} disabled={isProcessing}>
                      <Clock className="h-4 w-4 ml-2 text-orange-600" />
                      ביטול
                    </DropdownMenuItem>
                  </>
                )}

                {/* Write/view summary - only if completed */}
                {session.status === "COMPLETED" && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link href={`/dashboard/sessions/${session.id}`} className="cursor-pointer">
                        <FileText className="h-4 w-4 ml-2" />
                        {session.sessionNote ? "צפייה/עריכת סיכום" : "כתיבת סיכום"}
                      </Link>
                    </DropdownMenuItem>
                  </>
                )}

                {/* Record payment - only if reported and has debt */}
                {(session.status === "COMPLETED" || session.status === "NO_SHOW" || session.status === "CANCELLED") &&
                 session.payment &&
                 session.payment.status !== "PAID" &&
                 session.client && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <div className="cursor-pointer">
                        <QuickMarkPaid
                          sessionId={session.id}
                          clientId={session.client.id}
                          clientName={session.client.name}
                          amount={Number(session.price) - Number(session.payment?.amount || 0)}
                          creditBalance={Number(session.client.creditBalance || 0)}
                          existingPayment={session.payment}
                          buttonText="רשום תשלום"
                          totalClientDebt={session.client.totalDebt}
                          unpaidSessionsCount={session.client.unpaidSessionsCount}
                        />
                      </div>
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        )}
      </div>

      {/* Charge Confirmation Dialog */}
      <ChargeConfirmDialog
        open={isChargeDialogOpen}
        onOpenChange={setIsChargeDialogOpen}
        pendingAction={pendingAction}
        isProcessing={isProcessing}
        onCharge={handleActionWithCharge}
      />

      {/* Update Session Dialog */}
      <UpdateSessionDialog
        open={updateDialogOpen}
        onOpenChange={setUpdateDialogOpen}
        session={{
          id: session.id,
          price: session.price,
          client: session.client,
        }}
        onUpdate={handleUpdate}
        onRecordDebt={handleRecordDebt}
        updating={updating}
      />

      {paymentData && (
        <QuickMarkPaid
          sessionId={paymentData.sessionId}
          clientId={paymentData.clientId}
          clientName={session.client?.name}
          amount={paymentData.amount}
          creditBalance={Number(session.client?.creditBalance || 0)}
          existingPayment={paymentData.paymentId ? { id: paymentData.paymentId, status: "PENDING" } : null}
          buttonText="תשלום"
          open={isPaymentDialogOpen}
          onOpenChange={(open) => {
            setIsPaymentDialogOpen(open);
            if (!open) {
              setPaymentData(null);
            }
          }}
          hideButton={true}
        />
      )}
    </>
  );
}
