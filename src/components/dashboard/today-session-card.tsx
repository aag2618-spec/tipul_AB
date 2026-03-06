"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CheckCircle, CheckCircle2, ClipboardList, Clock, FileText, MoreVertical, User, CreditCard, Ban, UserX, Loader2, ChevronDown, ChevronUp, AlertCircle, Wallet } from "lucide-react";
import { QuickMarkPaid } from "@/components/payments/quick-mark-paid";
import { toast } from "sonner";
import { format } from "date-fns";
import { he } from "date-fns/locale";

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
  const [updateStatus, setUpdateStatus] = useState("");
  const [updateReason, setUpdateReason] = useState("");
  const [updating, setUpdating] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [showPayment, setShowPayment] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [paymentType, setPaymentType] = useState<"FULL" | "PARTIAL">("FULL");
  const [partialAmount, setPartialAmount] = useState("");
  const [noChargeReason, setNoChargeReason] = useState("");
  const [clientDebt, setClientDebt] = useState<{ total: number; count: number } | null>(null);

  useEffect(() => {
    if (updateDialogOpen && session.client?.id) {
      fetch(`/api/payments/client-debt/${session.client.id}`)
        .then(res => res.json())
        .then(data => {
          setClientDebt({
            total: Number(data.totalDebt || 0),
            count: data.unpaidSessions?.length || 0,
          });
        })
        .catch(() => setClientDebt(null));
    } else {
      setClientDebt(null);
    }
  }, [updateDialogOpen, session.client?.id]);

  const resetUpdateDialog = () => {
    setUpdateDialogOpen(false);
    setUpdateStatus("");
    setUpdateReason("");
    setPaymentAmount("");
    setShowPayment(true);
    setShowAdvanced(false);
    setPaymentType("FULL");
    setPartialAmount("");
    setNoChargeReason("");
  };

  const handleUpdate = async () => {
    if (!updateStatus) { toast.error("בחר סטטוס"); return; }
    setUpdating(true);
    try {
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
                status: "PAID",
              }),
            })
          );
        }
      }

      await Promise.all(updates);

      const labels: Record<string, string> = {
        COMPLETED: "הפגישה עודכנה כהושלמה",
        CANCELLED: "הפגישה עודכנה כבוטלה",
        NO_SHOW: "הפגישה עודכנה כלא הגיע",
      };
      toast.success(labels[updateStatus] || "הפגישה עודכנה");
      resetUpdateDialog();
      router.refresh();
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
        body: JSON.stringify({ status: "COMPLETED", markAsPaid: false }),
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
          createPayment: shouldCharge,  // ← יוצר payment record אם בוחרים לחייב
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
              window.location.href = `/dashboard/payments/${updatedSession.payment.id}/mark-paid`;
            } else {
              // Fallback to full payment page if no payment created
              window.location.href = `/dashboard/payments/pay/${clientId}`;
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
        {/* שורה 1: זמן + סוג פגישה */}
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
                setPaymentAmount(session.price ? session.price.toString() : "");
              }}
            >
              ⚠ לא עודכן · עדכן
            </Badge>
          ) : session.status === "PENDING_APPROVAL" ? (
            <span className="text-xs font-medium text-amber-600">
              📋 ממתין לאישור
            </span>
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

        {/* שורה 2: שם מטופל - קליקבלי */}
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

        {/* סיבת ביטול */}
        {session.status === "CANCELLED" && session.cancellationReason && (
          <p className="text-xs text-muted-foreground/70 bg-red-50 rounded px-2 py-1 border border-red-100">
            סיבה: {session.cancellationReason}
          </p>
        )}

        {/* שורה 3: אינדיקטורים (רק לפגישות שהושלמו) */}
        {session.status === "COMPLETED" && session.client && (
          <div className="flex items-center gap-3 text-xs pt-1.5 border-t">
            {/* אינדיקטור תשלום */}
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">💵 תשלום:</span>
              {session.payment?.status === "PAID" ? (
                <span className="text-green-600 font-medium">✓ שולם</span>
              ) : (
                <span className="text-orange-600 font-medium">⏳ לא שולם</span>
              )}
            </div>

            {/* אינדיקטור סיכום */}
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">📝 סיכום:</span>
              {session.sessionNote ? (
                <Link
                  href={`/dashboard/sessions/${session.id}`}
                  className="text-green-600 font-medium hover:text-green-700 hover:underline transition-colors"
                >
                  ✓ נכתב
                </Link>
              ) : (
                <Link
                  href={`/dashboard/sessions/${session.id}`}
                  className="text-sky-600 font-medium hover:text-sky-700 hover:underline transition-colors"
                >
                  כתוב סיכום
                </Link>
              )}
            </div>
          </div>
        )}

        {/* שורה 3: אינדיקטורים (רק לאי הופעה/ביטול) */}
        {(session.status === "NO_SHOW" || session.status === "CANCELLED") && session.client && (
          <div className="flex items-center gap-3 text-xs pt-1.5 border-t">
            {/* אינדיקטור תשלום */}
            <div className="flex items-center gap-1.5">
              <span className="text-muted-foreground">💵 תשלום:</span>
              {session.payment?.status === "PAID" ? (
                <span className="text-green-600 font-medium">✓ שולם</span>
              ) : session.payment ? (
                <span className="text-orange-600 font-medium">⏳ חויב - לא שולם</span>
              ) : (
                <span className="text-gray-600 font-medium">✓ פטור מתשלום</span>
              )}
            </div>
          </div>
        )}

        {/* שורה 4: תפריט פעולות */}
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
                {/* תיקית מטופל - תמיד */}
                <DropdownMenuItem asChild>
                  <Link href={`/dashboard/clients/${session.client.id}`} className="cursor-pointer">
                    <User className="h-4 w-4 ml-2" />
                    תיקית מטופל
                  </Link>
                </DropdownMenuItem>

                {/* אופציות לפגישה מתוכננת */}
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

                {/* כתוב/צפה בסיכום - רק אם הושלמה */}
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

                {/* רשום תשלום - רק אם דיווחת על הפגישה ויש חוב */}
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
                          amount={Number(session.price)}
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
      <Dialog open={isChargeDialogOpen} onOpenChange={setIsChargeDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>האם לחייב את המטופל?</DialogTitle>
            <DialogDescription>
              {pendingAction === "CANCELLED"
                ? "הפגישה בוטלה. האם ברצונך לחייב את המטופל בתשלום?"
                : "המטופל נעדר מהפגישה. האם ברצונך לחייב אותו בתשלום?"}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="default"
              onClick={() => handleActionWithCharge(true)}
              disabled={isProcessing}
            >
              כן, לחייב
            </Button>
            <Button
              variant="outline"
              onClick={() => handleActionWithCharge(false)}
              disabled={isProcessing}
            >
              לא, פטור מתשלום
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Update Session Dialog - identical to sessions-view */}
      <Dialog open={updateDialogOpen} onOpenChange={(o) => { if (!o) resetUpdateDialog(); }}>
        <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-orange-500" />
              עדכון פגישה - {session.client?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-muted-foreground">הפגישה לא עודכנה. מה קרה?</p>

            <div className="grid grid-cols-3 gap-2">
              <Button
                type="button"
                variant={updateStatus === "COMPLETED" ? "default" : "outline"}
                size="sm"
                className={`h-10 text-xs gap-1 ${updateStatus === "COMPLETED" ? "bg-emerald-600 hover:bg-emerald-700" : ""}`}
                onClick={() => setUpdateStatus("COMPLETED")}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                הושלמה
              </Button>
              <Button
                type="button"
                variant={updateStatus === "CANCELLED" ? "default" : "outline"}
                size="sm"
                className={`h-10 text-xs gap-1 ${updateStatus === "CANCELLED" ? "bg-red-500 hover:bg-red-600" : ""}`}
                onClick={() => setUpdateStatus("CANCELLED")}
              >
                <Ban className="h-3.5 w-3.5" />
                בוטלה
              </Button>
              <Button
                type="button"
                variant={updateStatus === "NO_SHOW" ? "default" : "outline"}
                size="sm"
                className={`h-10 text-xs gap-1 ${updateStatus === "NO_SHOW" ? "bg-amber-500 hover:bg-amber-600" : ""}`}
                onClick={() => setUpdateStatus("NO_SHOW")}
              >
                <UserX className="h-3.5 w-3.5" />
                לא הגיע
              </Button>
            </div>

            {updateStatus === "CANCELLED" && (
              <div className="space-y-2">
                <Label className="text-sm">סיבת ביטול (אופציונלי)</Label>
                <Textarea
                  value={updateReason}
                  onChange={e => setUpdateReason(e.target.value)}
                  placeholder="לדוגמה: מחלה, בקשת מטופל..."
                  className="resize-none h-16 bg-muted/20 border-muted-foreground/10 text-sm"
                />
              </div>
            )}

            {updateStatus && session.price > 0 && (
              <>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full font-bold text-base"
                  onClick={() => setShowPayment(false)}
                >
                  {updateStatus === "COMPLETED" ? "עדכון ללא תשלום" : updateStatus === "CANCELLED" ? "ביטול ללא חיוב" : "אי הגעה ללא חיוב"}
                </Button>

                {!showPayment && (
                  <div className="space-y-2 p-3 rounded-lg border bg-orange-50/50 border-orange-200">
                    <Label className="text-sm text-orange-700">סיבה לאי חיוב (אופציונלי)</Label>
                    <Textarea
                      value={noChargeReason}
                      onChange={e => setNoChargeReason(e.target.value)}
                      placeholder="לדוגמה: סיכום מראש, פגישת היכרות, הסדר מיוחד..."
                      className="resize-none h-16 bg-white/80 border-orange-200 text-sm"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-xs text-sky-600"
                      onClick={() => setShowPayment(true)}
                    >
                      ← חזרה לתשלום
                    </Button>
                  </div>
                )}

                {showPayment && (
                  <div className="space-y-3 p-4 rounded-lg border bg-muted/30">
                    <div className="flex items-center justify-between">
                      <Label className="text-lg font-bold">
                        {updateStatus === "COMPLETED" ? "עדכון ותשלום 💰" : updateStatus === "CANCELLED" ? "דמי ביטול 💰" : "חיוב אי הגעה 💰"}
                      </Label>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label>סכום</Label>
                        <div className="relative">
                          <Input
                            type="number"
                            value={paymentAmount}
                            onChange={e => setPaymentAmount(e.target.value)}
                            className="pl-8"
                            disabled={paymentType !== "FULL"}
                          />
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">₪</span>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>אמצעי תשלום</Label>
                        <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="CASH">מזומן</SelectItem>
                            <SelectItem value="CREDIT_CARD">אשראי</SelectItem>
                            <SelectItem value="BANK_TRANSFER">העברה</SelectItem>
                            <SelectItem value="CHECK">צ׳ק</SelectItem>
                            <SelectItem value="OTHER">אחר</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="w-full justify-between font-semibold"
                        onClick={() => setShowAdvanced(!showAdvanced)}
                      >
                        <span className="font-bold">אופציות מתקדמות</span>
                        {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      </Button>
                      {showAdvanced && (
                        <div className="space-y-2 pt-2">
                          <div className="grid gap-2">
                            <Button
                              type="button"
                              variant={paymentType === "FULL" ? "default" : "outline"}
                              size="sm"
                              onClick={() => setPaymentType("FULL")}
                            >
                              תשלום מלא (₪{session.price})
                            </Button>
                            <Button
                              type="button"
                              variant={paymentType === "PARTIAL" ? "default" : "outline"}
                              size="sm"
                              onClick={() => setPaymentType("PARTIAL")}
                            >
                              תשלום חלקי
                            </Button>
                            {paymentType === "PARTIAL" && (
                              <div className="pr-4 space-y-1">
                                <Input
                                  type="number"
                                  placeholder="הכנס סכום"
                                  value={partialAmount}
                                  onChange={e => setPartialAmount(e.target.value)}
                                  max={session.price}
                                  min={0}
                                  step="0.01"
                                />
                                {partialAmount && parseFloat(partialAmount) < session.price && (
                                  <p className="text-xs text-muted-foreground">
                                    נותר לתשלום: ₪{session.price - parseFloat(partialAmount)}
                                  </p>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </>
            )}

            {updateStatus && clientDebt && clientDebt.count > 1 && clientDebt.total > 0 && (
              <div className="pt-3 border-t mt-2">
                <p className="text-sm text-muted-foreground mb-2 text-center">
                  למטופל יש עוד {clientDebt.count - 1} פגישות ממתינות לתשלום
                  (סה״כ חוב: ₪{clientDebt.total.toFixed(0)})
                </p>
                <Button
                  variant="outline"
                  className="w-full gap-2"
                  asChild
                >
                  <Link href={`/dashboard/payments/pay/${session.client?.id}`}>
                    <Wallet className="h-4 w-4" />
                    שלם את כל החוב
                  </Link>
                </Button>
              </div>
            )}
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={resetUpdateDialog}
              disabled={updating}
              className="font-medium"
            >
              ביטול
            </Button>
            {showPayment && session.price > 0 ? (
              <Button
                onClick={handleUpdate}
                disabled={updating || !updateStatus}
                className="gap-2 font-bold bg-emerald-600 hover:bg-emerald-700"
              >
                {updating ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                {updateStatus === "COMPLETED" ? "עדכן ושלם" : updateStatus === "CANCELLED" ? "בטל וחייב" : updateStatus === "NO_SHOW" ? "עדכן וחייב" : "עדכן"}
              </Button>
            ) : (
              <Button
                onClick={handleUpdate}
                disabled={updating || !updateStatus}
                className={
                  updateStatus === "COMPLETED" ? "bg-emerald-600 hover:bg-emerald-700" :
                  updateStatus === "CANCELLED" ? "bg-red-500 hover:bg-red-600" :
                  updateStatus === "NO_SHOW" ? "bg-amber-500 hover:bg-amber-600" : ""
                }
              >
                {updating ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : null}
                עדכן
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
