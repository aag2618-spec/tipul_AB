"use client";

import { useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";

// Map Cardcom Operation strings to Hebrew. Free-form fallback for unknown values.
const OPERATION_HE: Record<string, string> = {
  Chargeback: "החזר חיוב (chargeback)",
  Reverse: "ביטול עסקה (reverse)",
  Refund: "החזר כספי",
  Cancel: "ביטול",
};

function operationLabel(op: string): string {
  return OPERATION_HE[op] ?? op;
}

interface ChargebackItem {
  id: string;
  transactionId: string;
  cardcomTransactionExternalId: string | null;
  tenant: "ADMIN" | "USER";
  operation: string;
  amount: number;
  currency: string;
  reviewedAt: string | null;
  reviewNote: string | null;
  reconciled: boolean;
  createdAt: string;
  cardLast4: string | null;
  cardHolder: string | null;
  userName: string | null;
  userEmail: string | null;
  userId: string | null;
  paymentId: string | null;
  subscriptionPaymentId: string | null;
}

interface Props {
  initialItems: ChargebackItem[];
  canReview: boolean;
}

type Filter = "all" | "open" | "unreconciled" | "reviewed_unreconciled";

export function ChargebacksTable({ initialItems, canReview }: Props) {
  const [items, setItems] = useState(initialItems);
  const [filter, setFilter] = useState<Filter>("all");
  const [reviewing, setReviewing] = useState<ChargebackItem | null>(null);
  const [note, setNote] = useState("");
  const [reconciled, setReconciled] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Confirmation gate when flipping reconciled=false → true (irreversible-ish:
  // hides from default queue, affects reconciliation totals).
  const [confirmingReconcile, setConfirmingReconcile] = useState(false);

  const filtered = items.filter((it) => {
    if (filter === "open") return !it.reviewedAt;
    if (filter === "unreconciled") return !it.reconciled;
    if (filter === "reviewed_unreconciled") return !!it.reviewedAt && !it.reconciled;
    return true;
  });

  const openReview = (it: ChargebackItem) => {
    setReviewing(it);
    setNote(it.reviewNote ?? "");
    setReconciled(it.reconciled);
  };

  const closeReview = () => {
    setReviewing(null);
    setNote("");
    setReconciled(false);
  };

  // Two-step submit: if user is flipping to reconciled=true and the row was
  // previously unreconciled, ask for confirmation first (one-click gate).
  const handleSubmitClick = () => {
    if (!reviewing) return;
    if (reconciled && !reviewing.reconciled) {
      setConfirmingReconcile(true);
      return;
    }
    void submitReview();
  };

  const submitReview = async () => {
    if (!reviewing) return;
    setConfirmingReconcile(false);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/chargebacks/${reviewing.id}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note: note.trim() || undefined, reconciled }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { message?: string };
        throw new Error(body.message ?? `HTTP ${res.status}`);
      }
      const updated = (await res.json()) as {
        id: string;
        reviewedAt: string | null;
        reviewNote: string | null;
        reconciled: boolean;
      };
      setItems((prev) =>
        prev.map((it) =>
          it.id === updated.id
            ? {
                ...it,
                reviewedAt: updated.reviewedAt,
                reviewNote: updated.reviewNote,
                reconciled: updated.reconciled,
              }
            : it
        )
      );
      toast.success("נשמר בהצלחה");
      closeReview();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "שגיאה בשמירה");
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleString("he-IL", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Jerusalem",
    });

  return (
    <>
      {/* פילטר */}
      <div className="flex flex-wrap gap-2 mb-4">
        <Button
          size="sm"
          variant={filter === "all" ? "default" : "outline"}
          onClick={() => setFilter("all")}
        >
          הכל ({items.length})
        </Button>
        <Button
          size="sm"
          variant={filter === "open" ? "default" : "outline"}
          onClick={() => setFilter("open")}
        >
          ממתין לבדיקה ({items.filter((i) => !i.reviewedAt).length})
        </Button>
        <Button
          size="sm"
          variant={filter === "unreconciled" ? "default" : "outline"}
          onClick={() => setFilter("unreconciled")}
        >
          לא הותאם ({items.filter((i) => !i.reconciled).length})
        </Button>
        <Button
          size="sm"
          variant={filter === "reviewed_unreconciled" ? "default" : "outline"}
          onClick={() => setFilter("reviewed_unreconciled")}
        >
          נסקרו אך לא הותאמו ({items.filter((i) => !!i.reviewedAt && !i.reconciled).length})
        </Button>
      </div>

      <div className="bg-white rounded-lg shadow-sm border overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-700">
            <tr>
              <th className="px-3 py-2 text-right font-semibold">תאריך</th>
              <th className="px-3 py-2 text-right font-semibold">סוג</th>
              <th className="px-3 py-2 text-right font-semibold">סכום</th>
              <th className="px-3 py-2 text-right font-semibold">פעולה</th>
              <th className="px-3 py-2 text-right font-semibold">משתמש</th>
              <th className="px-3 py-2 text-right font-semibold">כרטיס</th>
              <th className="px-3 py-2 text-right font-semibold">סטטוס</th>
              <th className="px-3 py-2 text-right font-semibold">פעולות</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-gray-500">
                  אין שורות להצגה
                </td>
              </tr>
            ) : (
              filtered.map((it) => (
                <tr
                  key={it.id}
                  className={`border-t ${!it.reconciled ? "bg-red-50/40" : ""}`}
                >
                  <td className="px-3 py-2 whitespace-nowrap">{formatDate(it.createdAt)}</td>
                  <td className="px-3 py-2">
                    <Badge variant={it.tenant === "ADMIN" ? "default" : "secondary"}>
                      {it.tenant === "ADMIN" ? "חיוב מערכת" : "חיוב מטופל"}
                    </Badge>
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap font-semibold">
                    <span dir="ltr" className="inline-block">
                      {it.currency === "ILS" ? "₪" : it.currency}
                      {it.amount.toLocaleString("he-IL", { maximumFractionDigits: 2 })}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-gray-700">{operationLabel(it.operation)}</td>
                  <td className="px-3 py-2">
                    {it.userId && it.userName ? (
                      <Link
                        href={`/admin/users/${it.userId}`}
                        className="text-blue-600 hover:underline"
                      >
                        {it.userName}
                      </Link>
                    ) : (
                      <span className="text-gray-500">—</span>
                    )}
                    {it.userEmail && (
                      <div className="text-xs text-gray-500">{it.userEmail}</div>
                    )}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {it.cardLast4 ? (
                      <span dir="ltr" className="font-mono text-xs">
                        ****{it.cardLast4}
                      </span>
                    ) : (
                      <span className="text-gray-400">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex flex-col gap-1">
                      {it.reviewedAt ? (
                        <Badge variant="outline" className="text-xs w-fit">
                          נסקר {formatDate(it.reviewedAt)}
                        </Badge>
                      ) : (
                        <Badge variant="destructive" className="text-xs w-fit">
                          ממתין לבדיקה
                        </Badge>
                      )}
                      {it.reconciled ? (
                        <Badge variant="outline" className="text-xs w-fit text-green-700 border-green-300">
                          ✓ הותאם
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs w-fit text-red-700 border-red-300">
                          לא הותאם
                        </Badge>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    {canReview ? (
                      <Button size="sm" variant="outline" onClick={() => openReview(it)}>
                        סקירה
                      </Button>
                    ) : (
                      <span className="text-xs text-gray-400">אין הרשאה</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* דיאלוג סקירה */}
      <Dialog open={reviewing !== null} onOpenChange={(open) => !open && closeReview()}>
        <DialogContent dir="rtl" className="max-w-lg">
          <DialogHeader>
            <DialogTitle>סקירת החזרת חיוב</DialogTitle>
            <DialogDescription>
              סמן ✓ אם בוצעה התאמה מקומית (refund/void) והוסף הערה על הבדיקה.
            </DialogDescription>
          </DialogHeader>

          {reviewing && (
            <div className="space-y-4">
              <div className="bg-gray-50 p-3 rounded text-sm space-y-1">
                <div>
                  <strong>סכום:</strong>{" "}
                  <span dir="ltr">₪{reviewing.amount.toLocaleString("he-IL")}</span>
                </div>
                <div>
                  <strong>פעולה:</strong> {operationLabel(reviewing.operation)}
                </div>
                <div>
                  <strong>תאריך:</strong> {formatDate(reviewing.createdAt)}
                </div>
                {reviewing.userName && (
                  <div>
                    <strong>משתמש:</strong> {reviewing.userName} ({reviewing.userEmail})
                  </div>
                )}
              </div>

              <div className="flex items-start gap-2">
                <Checkbox
                  id="reconciled"
                  checked={reconciled}
                  onCheckedChange={(v) => setReconciled(v === true)}
                />
                <Label htmlFor="reconciled" className="cursor-pointer leading-tight">
                  בוצעה התאמה מקומית (החיוב בוטל / החזר כספי הועבר)
                  <div className="text-xs text-gray-500 mt-0.5 font-normal">
                    סמן את התיבה רק אחרי שביצעת בפועל את ההתאמה — השורה לא תחזור לרשימה הפתוחה
                  </div>
                </Label>
              </div>

              <div>
                <Label htmlFor="note">הערת בדיקה</Label>
                <Textarea
                  id="note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={4}
                  maxLength={2000}
                  placeholder="מה בדקת, מה ביצעת, מספרי אסמכתא..."
                />
                <div className="text-xs text-gray-500 mt-1">
                  {note.length}/2000 תווים
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={closeReview} disabled={submitting}>
              ביטול
            </Button>
            <Button onClick={handleSubmitClick} disabled={submitting}>
              {submitting ? "שומר..." : "שמור סקירה"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* אישור מעבר ל"הותאם" — פעולה שמשפיעה על ספירת ההתאמות */}
      <AlertDialog
        open={confirmingReconcile}
        onOpenChange={(open) => !open && setConfirmingReconcile(false)}
      >
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>אישור סימון כ"הותאם"</AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>
                <strong>שים לב:</strong> סימון השורה כ&quot;הותאם&quot; אומר שכבר ביצעת ידנית את
                ההתאמה אצלנו (ביטלת את ה-Payment או רשמת refund). השורה תיעלם מהרשימה הפתוחה ולא
                תופיע יותר בספירת ה-chargebacks הלא־מותאמים.
              </p>
              <p>וודא שאכן ביצעת את ההתאמה לפני האישור.</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>בטל</AlertDialogCancel>
            <AlertDialogAction onClick={() => void submitReview()}>
              כן, הותאם
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
