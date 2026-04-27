"use client";

// src/components/payments/cardcom-transaction-panel.tsx
// פאנל "פרטי עסקה" של Cardcom עבור Payment ספציפי:
//   • סטטוס + 4 ספרות אחרונות + מספר אישור + מס׳ תשלומים
//   • סכום שהוחזר (אם יש)
//   • כפתור "ביטול/זיכוי" שזמין עד 14 יום מאישור העסקה
//
// טעינה lazy — מצא רק כשהסקציה הזו מורחבת בהיסטוריה.

import { useEffect, useState } from "react";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, CreditCard, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { RefundCardcomDialog } from "./refund-cardcom-dialog";

interface CardcomTx {
  id: string;
  status: string;
  amount: number;
  refundedAmount: number;
  remainingAmount: number;
  currency: string;
  numOfPayments: number;
  cardLast4: string | null;
  cardHolder: string | null;
  cardBrand: string | null;
  approvalNumber: string | null;
  cardcomTransactionId: string | null;
  completedAt: string | null;
  createdAt: string;
  errorCode: string | null;
  errorMessage: string | null;
}

interface RefundInfo {
  refundable: boolean;
  windowDays: number;
  daysLeft: number;
  reason: string | null;
}

interface CardcomTransactionPanelProps {
  paymentId: string;
  /** קולבק לרענון אחרי זיכוי מוצלח. */
  onRefundSuccess?: () => Promise<void> | void;
}

export function CardcomTransactionPanel({
  paymentId,
  onRefundSuccess,
}: CardcomTransactionPanelProps) {
  const [loading, setLoading] = useState(true);
  const [tx, setTx] = useState<CardcomTx | null>(null);
  const [refund, setRefund] = useState<RefundInfo | null>(null);
  const [refundOpen, setRefundOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/payments/${paymentId}/cardcom-transaction`);
      if (!res.ok) {
        // 404/403 — אין נתונים, שקט.
        setTx(null);
        setRefund(null);
        return;
      }
      const data = (await res.json()) as { tx: CardcomTx | null; refund?: RefundInfo };
      setTx(data.tx ?? null);
      setRefund(data.refund ?? null);
    } catch {
      toast.error("לא הצלחנו לטעון פרטי עסקה");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paymentId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
        <Loader2 className="h-3 w-3 animate-spin" />
        טוען פרטי עסקה...
      </div>
    );
  }

  if (!tx) {
    // זה Payment שלא עבר דרך Cardcom — אין מה להציג.
    return null;
  }

  const statusLabel: Record<string, string> = {
    PENDING: "ממתין",
    APPROVED: "אושר",
    DECLINED: "נדחה",
    FAILED: "כשל",
    CANCELLED: "בוטל",
    EXPIRED: "פג תוקף",
    REFUNDED: "הוחזר",
  };

  const statusVariant: Record<
    string,
    "default" | "secondary" | "destructive" | "outline"
  > = {
    APPROVED: "default",
    REFUNDED: "secondary",
    PENDING: "outline",
    DECLINED: "destructive",
    FAILED: "destructive",
    CANCELLED: "destructive",
    EXPIRED: "destructive",
  };

  const completed = tx.completedAt ? new Date(tx.completedAt) : new Date(tx.createdAt);

  return (
    <>
      <div className="bg-blue-50 border border-blue-200 rounded p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-blue-900 flex items-center gap-2">
            <CreditCard className="h-4 w-4" />
            פרטי עסקת אשראי (Cardcom)
          </p>
          <Badge variant={statusVariant[tx.status] ?? "outline"}>
            {statusLabel[tx.status] ?? tx.status}
          </Badge>
        </div>

        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          {tx.cardLast4 && (
            <div>
              <span className="text-muted-foreground">כרטיס: </span>
              <span dir="ltr" className="font-mono">
                **** {tx.cardLast4}
              </span>
              {tx.cardBrand && (
                <span className="text-muted-foreground"> ({tx.cardBrand})</span>
              )}
            </div>
          )}
          {tx.approvalNumber && (
            <div>
              <span className="text-muted-foreground">מס׳ אישור: </span>
              <span dir="ltr" className="font-mono">
                {tx.approvalNumber}
              </span>
            </div>
          )}
          {tx.numOfPayments > 1 && (
            <div>
              <span className="text-muted-foreground">תשלומים: </span>
              <span>{tx.numOfPayments}</span>
            </div>
          )}
          {tx.completedAt && (
            <div>
              <span className="text-muted-foreground">בוצע: </span>
              <span>{format(completed, "d/M/yyyy HH:mm", { locale: he })}</span>
            </div>
          )}
        </div>

        {tx.refundedAmount > 0 && (
          <div className="text-sm bg-amber-50 border border-amber-200 rounded p-2">
            <span className="text-amber-800">הוחזר: ₪{tx.refundedAmount}</span>
            {tx.remainingAmount > 0 && (
              <span className="text-amber-700">
                {" "}
                · יתרה לזיכוי: ₪{tx.remainingAmount}
              </span>
            )}
          </div>
        )}

        {tx.status === "DECLINED" && tx.errorMessage && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded p-2">
            <span className="font-medium">סיבת דחייה: </span>
            {tx.errorMessage}
            {tx.errorCode && (
              <span className="text-xs text-red-600">
                {" "}
                (קוד {tx.errorCode})
              </span>
            )}
          </div>
        )}

        {refund && (
          <div className="flex items-center justify-between pt-2 border-t border-blue-200">
            {refund.refundable ? (
              <>
                <span className="text-xs text-muted-foreground">
                  ניתן לזכות עוד {refund.daysLeft} יום
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1"
                  onClick={() => setRefundOpen(true)}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  ביטול/זיכוי
                </Button>
              </>
            ) : (
              <span className="text-xs text-muted-foreground">
                {refund.reason ?? "לא ניתן לזכות"}
              </span>
            )}
          </div>
        )}
      </div>

      <RefundCardcomDialog
        open={refundOpen}
        onOpenChange={setRefundOpen}
        paymentId={paymentId}
        maxAmount={tx.remainingAmount}
        onRefundSuccess={async () => {
          if (onRefundSuccess) await onRefundSuccess();
          await load();
        }}
      />
    </>
  );
}
