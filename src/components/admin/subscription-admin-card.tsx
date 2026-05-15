"use client";

// src/components/admin/subscription-admin-card.tsx
// Stage 6 — קומפוננטת תצוגה: היסטוריית תשלומים, חבילות, ועסקאות כושלות.
//
// מציגה:
//   - 10 SubscriptionPayments אחרונים + status + כפתור "החזר כספי" (אם APPROVED)
//   - 20 UserPackagePurchase אחרונים + מי הזין + status reverted
//   - 10 CardcomTransaction אחרונים שלא APPROVED (debug)
//
// פעולות:
//   - החזר כספי (דיאלוג: amount + reason) → POST /api/admin/users/[id]/refund-payment
//
// הענקת חבילה מטופלת ב-SubscriptionActionsCard נפרד (admin-subscription-actions).

import { useState, useEffect, useCallback } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  CreditCard,
  RefreshCw,
  Loader2,
  Package as PackageIcon,
  AlertCircle,
  Download,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface SubscriptionPaymentItem {
  id: string;
  amount: number;
  currency: string;
  status: string;
  description: string | null;
  periodStartIso: string | null;
  periodEndIso: string | null;
  paidAtIso: string | null;
  createdAtIso: string;
  planTier: string | null;
  autoChargeEnabled: boolean;
  chargeAttempts: number;
  lastChargeError: string | null;
  cardcomTransaction: {
    id: string;
    status: string;
    amount: number;
    refundedAmount: number;
    refundableAmount: number;
    completedAtIso: string | null;
    transactionId: string | null;
    cardLast4: string | null;
  } | null;
  invoicePdfUrl: string | null;
  invoiceDocNumber: string | null;
}

interface PackagePurchaseItem {
  id: string;
  type: "SMS" | "AI_DETAILED_ANALYSIS";
  credits: number;
  creditsUsed: number;
  note: string | null;
  source: "MANUAL" | "CARDCOM" | "PROMO";
  externalId: string | null;
  reverted: boolean;
  revertedAtIso: string | null;
  createdAtIso: string;
  grantedByUser: { id: string; name: string | null; email: string | null } | null;
}

interface CardcomTxItem {
  id: string;
  status: string;
  amount: number;
  refundedAmount: number;
  purpose: string | null;
  createdAtIso: string;
  completedAtIso: string | null;
  errorMessage: string | null;
  errorCode: string | null;
  cardLast4: string | null;
  transactionId: string | null;
}

interface FinancialData {
  subscriptionPayments: SubscriptionPaymentItem[];
  packagePurchases: PackagePurchaseItem[];
  cardcomTransactions: CardcomTxItem[];
}

const STATUS_HE: Record<string, string> = {
  PENDING: "ממתין",
  PAID: "שולם",
  OVERDUE: "באיחור",
  CANCELLED: "בוטל",
  REFUNDED: "הוחזר",
  APPROVED: "אושר",
  DECLINED: "נדחה",
  FAILED: "כשל",
  EXPIRED: "פג",
};

const STATUS_COLOR: Record<string, string> = {
  PAID: "bg-green-100 text-green-800",
  PENDING: "bg-yellow-100 text-yellow-800",
  CANCELLED: "bg-gray-100 text-gray-800",
  REFUNDED: "bg-purple-100 text-purple-800",
  APPROVED: "bg-green-100 text-green-800",
  DECLINED: "bg-red-100 text-red-800",
  FAILED: "bg-red-100 text-red-800",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("he-IL", {
    timeZone: "Asia/Jerusalem",
  });
}

function formatAmount(n: number, currency: string = "ILS"): string {
  const symbol = currency === "ILS" ? "₪" : currency;
  return `${symbol}${n.toLocaleString("he-IL")}`;
}

export default function SubscriptionAdminCard({ userId }: { userId: string }) {
  const [data, setData] = useState<FinancialData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showRefundDialog, setShowRefundDialog] =
    useState<SubscriptionPaymentItem | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/financial`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err.message || "שגיאה בטעינת נתונים פיננסיים");
        return;
      }
      const json = await res.json();
      setData(json);
    } catch {
      toast.error("שגיאה בטעינה");
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-6" dir="rtl">
      {/* SubscriptionPayments */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="h-5 w-5" />
                תשלומי מנוי
              </CardTitle>
              <CardDescription>10 התשלומים האחרונים. ADMIN יכול לבצע החזר כספי על תשלום שאושר.</CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {data.subscriptionPayments.length === 0 ? (
            <p className="text-sm text-muted-foreground">אין תשלומי מנוי.</p>
          ) : (
            <div className="space-y-2">
              {data.subscriptionPayments.map((sp) => (
                <div
                  key={sp.id}
                  className="p-3 bg-muted/30 rounded-md border border-border space-y-1"
                >
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        {formatAmount(sp.amount, sp.currency)}
                      </span>
                      <Badge
                        className={
                          STATUS_COLOR[sp.status] ?? "bg-gray-100 text-gray-800"
                        }
                      >
                        {STATUS_HE[sp.status] ?? sp.status}
                      </Badge>
                      {sp.planTier && (
                        <Badge variant="outline" className="text-xs">
                          {sp.planTier}
                        </Badge>
                      )}
                      {sp.cardcomTransaction?.refundedAmount &&
                      sp.cardcomTransaction.refundedAmount > 0 ? (
                        <Badge
                          variant="outline"
                          className="text-xs text-purple-700"
                        >
                          הוחזר ₪{sp.cardcomTransaction.refundedAmount}
                        </Badge>
                      ) : null}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatDate(sp.paidAtIso || sp.createdAtIso)}
                    </span>
                  </div>
                  {sp.description && (
                    <div className="text-xs text-muted-foreground">
                      {sp.description}
                    </div>
                  )}
                  {sp.cardcomTransaction && (
                    <div className="text-xs text-muted-foreground">
                      Cardcom #{sp.cardcomTransaction.transactionId ?? "—"}{" "}
                      {sp.cardcomTransaction.cardLast4 &&
                        `· ****${sp.cardcomTransaction.cardLast4}`}
                    </div>
                  )}
                  {sp.chargeAttempts > 0 && (
                    <div className="text-xs text-amber-700">
                      <AlertCircle className="h-3 w-3 inline ml-1" />
                      ניסיונות חיוב: {sp.chargeAttempts}
                      {sp.lastChargeError && ` — ${sp.lastChargeError}`}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2 mt-1">
                    {sp.invoicePdfUrl && (
                      <a
                        href={sp.invoicePdfUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                      >
                        <Download className="h-3 w-3" />
                        קבלה #{sp.invoiceDocNumber ?? ""}
                      </a>
                    )}
                    {sp.cardcomTransaction?.status === "APPROVED" &&
                      sp.cardcomTransaction.refundableAmount > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs h-7"
                          onClick={() => setShowRefundDialog(sp)}
                        >
                          <RefreshCw className="h-3 w-3 ml-1" />
                          החזר כספי (זמין: ₪{sp.cardcomTransaction.refundableAmount})
                        </Button>
                      )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Packages */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2">
              <PackageIcon className="h-5 w-5" />
              חבילות SMS / AI
            </CardTitle>
            <CardDescription>
              20 רכישות אחרונות. להענקת חבילה השתמש/י ב&quot;פעולות מנוי&quot; למעלה.
            </CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          {data.packagePurchases.length === 0 ? (
            <p className="text-sm text-muted-foreground">אין רכישות חבילה.</p>
          ) : (
            <div className="space-y-2">
              {data.packagePurchases.map((p) => {
                const remaining = Math.max(0, p.credits - p.creditsUsed);
                return (
                  <div
                    key={p.id}
                    className={`p-3 rounded-md border space-y-1 ${
                      p.reverted
                        ? "bg-muted/10 border-dashed opacity-60"
                        : "bg-muted/30 border-border"
                    }`}
                  >
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs">
                          {p.type === "SMS" ? "SMS" : "AI"}
                        </Badge>
                        <span className="font-medium">
                          {remaining}/{p.credits}
                        </span>
                        <Badge variant="outline" className="text-xs">
                          {p.source === "MANUAL"
                            ? "ידני (אדמין)"
                            : p.source === "CARDCOM"
                              ? "Cardcom"
                              : "מתנה"}
                        </Badge>
                        {p.reverted && (
                          <Badge className="bg-red-100 text-red-800 text-xs">
                            בוטל{p.revertedAtIso && ` ב-${formatDate(p.revertedAtIso)}`}
                          </Badge>
                        )}
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {formatDate(p.createdAtIso)}
                      </span>
                    </div>
                    {p.note && (
                      <div className="text-xs text-muted-foreground">
                        {p.note}
                      </div>
                    )}
                    {p.grantedByUser && (
                      <div className="text-xs text-muted-foreground">
                        הוענק ע״י: {p.grantedByUser.name ?? p.grantedByUser.email}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* CardcomTransactions — Debug section */}
      {data.cardcomTransactions.some((t) => t.status !== "APPROVED") && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertCircle className="h-4 w-4" />
              עסקאות Cardcom — לדיבוג
            </CardTitle>
            <CardDescription>עסקאות שלא אושרו (FAILED/DECLINED/EXPIRED).</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-1.5">
              {data.cardcomTransactions
                .filter((t) => t.status !== "APPROVED")
                .map((t) => (
                  <div
                    key={t.id}
                    className="p-2 bg-muted/20 rounded text-xs space-y-0.5"
                  >
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <Badge
                          className={
                            STATUS_COLOR[t.status] ?? "bg-gray-100 text-gray-800"
                          }
                        >
                          {STATUS_HE[t.status] ?? t.status}
                        </Badge>
                        <span>{formatAmount(t.amount)}</span>
                        {t.purpose && (
                          <Badge variant="outline" className="text-xs">
                            {t.purpose}
                          </Badge>
                        )}
                      </div>
                      <span className="text-muted-foreground">
                        {formatDate(t.completedAtIso || t.createdAtIso)}
                      </span>
                    </div>
                    {t.errorMessage && (
                      <div className="text-red-700">
                        {t.errorCode}: {t.errorMessage}
                      </div>
                    )}
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Dialog — Refund בלבד. הענקת חבילה ב-SubscriptionActionsCard נפרד. */}
      <RefundPaymentDialog
        payment={showRefundDialog}
        onClose={() => setShowRefundDialog(null)}
        userId={userId}
        onSuccess={() => {
          setShowRefundDialog(null);
          fetchData();
        }}
      />
    </div>
  );
}

// ============================================================================
// RefundPaymentDialog
// ============================================================================

function RefundPaymentDialog({
  payment,
  onClose,
  userId,
  onSuccess,
}: {
  payment: SubscriptionPaymentItem | null;
  onClose: () => void;
  userId: string;
  onSuccess: () => void;
}) {
  const refundable = payment?.cardcomTransaction?.refundableAmount ?? 0;
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (payment) {
      setAmount(String(refundable));
      setReason("");
    }
  }, [payment, refundable]);

  const handleSubmit = async () => {
    if (!payment) return;
    const amountNum = parseFloat(amount);
    if (!Number.isFinite(amountNum) || amountNum <= 0) {
      toast.error("סכום חייב להיות חיובי");
      return;
    }
    if (amountNum > refundable) {
      toast.error(`הסכום עולה על היתרה הזמינה (${refundable})`);
      return;
    }
    if (!reason.trim()) {
      toast.error("יש לציין סיבה");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/refund-payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscriptionPaymentId: payment.id,
          amount: amountNum,
          reason: reason.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data.message || "שגיאה ב-refund");
        return;
      }
      toast.success(data.message || "ה-refund בוצע");
      onSuccess();
    } catch {
      toast.error("שגיאה ב-refund");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={payment !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl">
        <DialogHeader>
          <DialogTitle>החזר כספי דרך Cardcom</DialogTitle>
          <DialogDescription>
            הפעולה תבוצע מיידית מול Cardcom והכסף יוחזר ללקוח. לא ניתן לבטל.
          </DialogDescription>
        </DialogHeader>
        {payment && (
          <div className="space-y-4 py-2">
            <div className="p-3 bg-muted/30 rounded-md text-sm space-y-1">
              <div className="text-xs text-muted-foreground">
                תאריך תשלום: {formatDate(payment.paidAtIso)}
                {payment.planTier && ` · מסלול ${payment.planTier}`}
              </div>
              <div>
                סכום מקורי: {formatAmount(payment.amount, payment.currency)}
              </div>
              <div>הוחזר עד כה: ₪{payment.cardcomTransaction?.refundedAmount ?? 0}</div>
              <div className="font-medium">זמין להחזר: ₪{refundable}</div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="amount">סכום להחזר</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0.01"
                max={refundable}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="reason">סיבה (חובה, תופיע ב-audit log)</Label>
              <Input
                id="reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={500}
                placeholder="לדוגמה: ביטול מנוי בתוך 14 יום, פיצוי"
              />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={submitting}>
            ביטול
          </Button>
          <Button
            variant="destructive"
            onClick={handleSubmit}
            disabled={submitting}
          >
            {submitting && <Loader2 className="h-4 w-4 ml-1 animate-spin" />}
            בצע החזר כספי
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
