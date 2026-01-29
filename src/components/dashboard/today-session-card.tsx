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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CheckCircle, ClipboardList, Clock, FileText, MoreVertical, User } from "lucide-react";
import { QuickMarkPaid } from "@/components/payments/quick-mark-paid";
import { toast } from "sonner";
import { format } from "date-fns";
import { he } from "date-fns/locale";

interface TodaySessionCardProps {
  session: {
    id: string;
    startTime: Date;
    endTime: Date;
    type: string;
    price: number;
    status: string;
    sessionNote: string | null;
    payment: {
      id: string;
      status: string;
      amount: number;
    } | null;
    client: {
      id: string;
      name: string;
      creditBalance: number;
    } | null;
  };
}

// Helper to get Israel time components from UTC
function getIsraelTime(utcDate: Date) {
  const date = new Date(utcDate);
  const month = date.getUTCMonth() + 1;
  const isDST = month >= 3 && month <= 10;
  const offsetMs = (isDST ? 3 : 2) * 60 * 60 * 1000;
  
  const israelTimeMs = date.getTime() + offsetMs;
  const israelDate = new Date(israelTimeMs);
  
  return {
    hours: israelDate.getUTCHours(),
    minutes: israelDate.getUTCMinutes(),
    date: israelDate.getUTCDate(),
    month: israelDate.getUTCMonth() + 1,
    year: israelDate.getUTCFullYear(),
    dayOfWeek: israelDate.getUTCDay(),
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
        toast.success("הפגישה הושלמה, מעבר לדף תשלום...");
        window.location.href = `/dashboard/payments/pay/${session.client.id}`;
      }
    } catch {
      toast.error("שגיאה בעדכון הפגישה");
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
        toast.success(pendingAction === "CANCELLED" ? "הפגישה בוטלה וחויבה, מעבר לדף תשלום..." : "נרשם כאי הופעה וחויב, מעבר לדף תשלום...");
        // Navigate to payment page with null safety check
        const clientId = session.client?.id;
        if (clientId) {
          setTimeout(() => {
            window.location.href = `/dashboard/payments/pay/${clientId}`;
          }, 500);
        } else {
          toast.error("שגיאה: לא נמצא מזהה מטופל");
          setIsProcessing(false);
        }
      } else {
        toast.success(pendingAction === "CANCELLED" ? "הפגישה בוטלה ללא חיוב" : "נרשם כאי הופעה ללא חיוב");
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
      <div className="p-3 rounded-lg border border-border bg-background space-y-2">
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
              </p>
              <p className="text-sm text-muted-foreground">
                {session.type === "BREAK" ? "הפסקה" : session.type === "ONLINE" ? "אונליין" : session.type === "PHONE" ? "טלפון" : "פרונטלי"}
              </p>
            </div>
          </div>

          <Badge
            variant={
              session.status === "COMPLETED"
                ? "default"
                : session.status === "CANCELLED"
                ? "destructive"
                : session.status === "NO_SHOW"
                ? "destructive"
                : "secondary"
            }
          >
            {session.status === "SCHEDULED"
              ? "✅ מתוכנן"
              : session.status === "COMPLETED"
              ? "✅ הושלם"
              : session.status === "CANCELLED"
              ? "🚫 בוטל"
              : "❌ אי הופעה"}
          </Badge>
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
                  className="text-blue-600 font-medium hover:text-blue-700 hover:underline transition-colors"
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
                      <CheckCircle className="h-4 w-4 ml-2 text-blue-600" />
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

                {/* כתוב/צפה בסיכום - רק אם הושלם */}
                {session.status === "COMPLETED" && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem asChild>
                      <Link href={`/dashboard/sessions/${session.id}`} className="cursor-pointer">
                        <FileText className="h-4 w-4 ml-2" />
                        {session.sessionNote ? "צפה/ערוך סיכום" : "כתוב סיכום"}
                      </Link>
                    </DropdownMenuItem>
                  </>
                )}

                {/* רשום תשלום - אם לא שולם */}
                {session.payment?.status !== "PAID" && (
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
                : "המטופל לא הגיע לפגישה. האם ברצונך לחייב אותו בתשלום?"}
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
    </>
  );
}
