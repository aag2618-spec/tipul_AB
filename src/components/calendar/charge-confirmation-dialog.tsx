"use client";

import { useEffect, useState } from "react";
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
  /**
   * Phase 3: שולט אם להציג מסלולי חיוב (עדכון וחייב / רשום חוב). מזכירה
   * ללא canViewPayments תקבל false → רואה רק את מסלול "ללא חיוב". השרת
   * חוסם את handleCharge/handleRecordDebt בלאו הכי (PUT /api/sessions/[id]
   * מחזיר 403 על createPayment/markAsPaid), אבל הסתרת ה-UI נקייה יותר
   * ומונעת toasts שגיאה מבלבלים. ברירת מחדל true (כל non-secretary +
   * מזכירה עם הרשאת תשלומים).
   */
  canViewPayments?: boolean;
}

export function ChargeConfirmationDialog({
  open,
  onOpenChange,
  session,
  pendingAction,
  onDismissAll,
  onRequestPayment,
  onDataChanged,
  canViewPayments = true,
}: ChargeConfirmationDialogProps) {
  const router = useRouter();
  const [isProcessing, setIsProcessing] = useState(false);
  const [reason, setReason] = useState("");
  const [noChargeReason, setNoChargeReason] = useState("");
  // Phase 3: כשהמזכירה ללא canViewPayments פותחת — אתחול ל-true כך שתראה
  // מיד את מסלול "ללא חיוב" (textarea + "אשר ללא חיוב") במקום מסך שאלת
  // חיוב שכפתוריו ממילא מוסתרים.
  const [showExemptReason, setShowExemptReason] = useState(!canViewPayments);

  // Race-condition guard: useMyPermissions מתחיל ב-OPTIMISTIC (true) ועובר
  // ל-false כשהתשובה מגיעה. אם המזכירה פתחה את הדיאלוג בחלון האופטימי,
  // showExemptReason נשאר false ודרכי החיוב היו נראות לרגע. כאשר
  // canViewPayments הופך ל-false תוך כדי שהדיאלוג פתוח — מאלצים מצב פטור.
  useEffect(() => {
    if (!canViewPayments) {
      setShowExemptReason(true);
    }
  }, [canViewPayments]);

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
    // ⭐ paidAmount מהשרת — בלעדיו, חישוב על payment.amount בלבד מטעה אחרי
    // אשראי חלקי שסולק (parent.amount כבר 200 אבל status=PENDING+CC, חישוב
    // amount-paid יחזיר 0 וננסה לחייב את כל ה-300 שוב). ראה /api/sessions.
    const paidAmount =
      typeof session.payment?.paidAmount === "number"
        ? Number(session.payment.paidAmount)
        : session.payment?.status === "PAID"
        ? Number(session.payment?.amount || 0)
        : 0;
    const amount = session.price - paidAmount;

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

  const actionTitle = isCancelled ? "ביטול פגישה" : "אי הופעה";
  const price = session?.price || 0;

  return (
    <Dialog open={open} onOpenChange={(o) => {
      if (!o) {
        setReason("");
        setNoChargeReason("");
        // Phase 3: reset לערך ההתחלתי לפי canViewPayments — למזכירה ללא
        // הרשאה זה true (מצב פטור קבוע). reset קשיח ל-false היה גורם
        // למזכירה לראות מסך שאלה ריק בפתיחה הבאה (כל הכפתורים מוסתרים).
        setShowExemptReason(!canViewPayments);
      }
      onOpenChange(o);
    }}>
      <DialogContent className="sm:max-w-[500px] max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="text-center">{actionTitle} - {session?.client?.name}</DialogTitle>
          <DialogDescription className="text-center">
            {canViewPayments
              ? (isCancelled
                  ? "הפגישה בוטלה. מה לעשות עם התשלום?"
                  : "המטופל לא הגיע. מה לעשות עם התשלום?")
              : (isCancelled
                  ? "הפגישה בוטלה. תיעוד הפעולה ללא חיוב."
                  : "המטופל לא הגיע. תיעוד הפעולה ללא חיוב.")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* שדה סיבה */}
          <div className="space-y-2">
            <label className="text-sm font-medium">{reasonLabel}</label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={reasonPlaceholder}
              className="w-full text-sm p-2.5 rounded-lg border resize-none bg-muted/20 border-muted-foreground/10"
              rows={2}
            />
          </div>

          {/* כפתור פטור מתשלום — Phase 3: מוסתר ממזכירה ללא canViewPayments,
              כי showExemptReason כבר מאולץ ל-true עבורה (מצב פטור קבוע). */}
          {canViewPayments && (
            <Button
              type="button"
              variant="outline"
              className="w-full font-bold text-base"
              onClick={() => setShowExemptReason(!showExemptReason)}
              disabled={isProcessing}
            >
              {isCancelled ? "ביטול ללא חיוב" : "אי הופעה ללא חיוב"}
            </Button>
          )}

          {/* אזור פטור - מוצג רק בלחיצה */}
          {showExemptReason && (
            <div className="space-y-3 p-3 rounded-lg border bg-orange-50/50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800">
              <label className="text-sm text-orange-700 dark:text-orange-300 font-medium">סיבה לאי חיוב (אופציונלי)</label>
              <textarea
                value={noChargeReason}
                onChange={(e) => setNoChargeReason(e.target.value)}
                placeholder="לדוגמה: סיכום מראש, פגישת היכרות, הסדר מיוחד..."
                className="w-full text-sm p-2.5 rounded-lg border resize-none bg-background"
                rows={2}
              />
            </div>
          )}

          {/* אזור חיוב — Phase 3: מוסתר ממזכירה ללא הרשאה (היא ממילא במצב פטור
              קבוע ולא תוכל ליצור payment). */}
          {!showExemptReason && price > 0 && canViewPayments && (
            <div className="space-y-3 p-4 rounded-lg border bg-muted/30">
              <div className="text-center">
                <p className="text-lg font-bold">
                  {isCancelled ? "דמי ביטול 💰" : "חיוב אי הופעה 💰"}
                </p>
                <p className="text-2xl font-bold mt-1">₪{price}</p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex gap-2 sm:justify-start">
          {showExemptReason ? (
            <>
              <Button
                onClick={handleExempt}
                disabled={isProcessing}
                variant="default"
                className="flex-1 bg-emerald-600 hover:bg-emerald-700"
              >
                אשר ללא חיוב
              </Button>
              {/* "חזרה לתשלום" — Phase 3: מוסתר ממזכירה ללא הרשאה (אין לאן
                  לחזור — מסלולי החיוב חסומים). מציגים במקום זה כפתור סגירה. */}
              {canViewPayments ? (
                <Button variant="outline" onClick={() => setShowExemptReason(false)} disabled={isProcessing} className="flex-1">
                  חזרה לתשלום
                </Button>
              ) : (
                <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isProcessing} className="flex-1">
                  ביטול
                </Button>
              )}
            </>
          ) : (
            <>
              {/* כפתורי חיוב — Phase 3: מוסתרים ממזכירה ללא canViewPayments.
                  השרת חוסם handleCharge/handleRecordDebt דרך 403 על PUT עם
                  createPayment/markAsPaid, אבל הסתרה כאן מונעת UX מבלבל. */}
              {canViewPayments && (
                <>
                  <Button
                    onClick={handleCharge}
                    disabled={isProcessing}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                  >
                    עדכון וחייב
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleRecordDebt}
                    disabled={isProcessing}
                    className="flex-1 text-orange-600 border-orange-300 hover:bg-orange-50"
                  >
                    עדכון ורשום חוב
                  </Button>
                </>
              )}
              <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={isProcessing}>
                ביטול
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
