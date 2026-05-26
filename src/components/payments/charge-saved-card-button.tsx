"use client";

// src/components/payments/charge-saved-card-button.tsx
// כפתור "חייב כרטיס שמור" — מוצג רק אם ללקוח יש לפחות טוקן פעיל אחד.
// טוען את רשימת הטוקנים lazy, פותח דיאלוג אישור עם בחירת כרטיס + תיאור,
// וקורא ל-/api/payments/[id]/charge-saved-token כדי לחייב מיידית.

import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Loader2, CreditCard, AlertCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { ReceiptPreviewDialog } from "@/components/payments/receipt-preview-dialog";

interface SavedToken {
  id: string;
  cardLast4: string;
  cardHolder: string;
  cardBrand: string | null;
  expiryMonth: number;
  expiryYear: number;
  isExpired: boolean;
}

interface ChargeSavedCardButtonProps {
  paymentId: string;
  clientId: string;
  amount: number;
  /** טקסט קצר לתצוגה בדיאלוג (למשל שם הלקוח). */
  clientName?: string;
  onPaymentSuccess?: () => Promise<void> | void;
  /** טקסט הכפתור. ברירת מחדל: "חייב כרטיס שמור". */
  label?: string;
  className?: string;
  size?: "sm" | "default" | "lg";
}

export function ChargeSavedCardButton({
  paymentId,
  clientId,
  amount,
  clientName,
  onPaymentSuccess,
  label = "חייב כרטיס שמור",
  className,
  size = "default",
}: ChargeSavedCardButtonProps) {
  const [tokens, setTokens] = useState<SavedToken[] | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedTokenId, setSelectedTokenId] = useState<string | null>(null);
  const [isCharging, setIsCharging] = useState(false);
  // תצוגת קבלה in-page אחרי חיוב מוצלח. Cardcom חייב webhook ליצירת
  // הקבלה — ה-Dialog עושה polling עד 30s.
  const [receiptDialogOpen, setReceiptDialogOpen] = useState(false);
  // ⭐ receiptPaymentId — ב-additive partial ה-API מחזיר id של child
  // חדש; חייבים לפתוח את הדיאלוג עם ה-id הזה ולא עם ה-prop paymentId
  // (שהוא ה-parent). אחרת polling יחזיר null ויסתיים ב-timeout.
  const [receiptPaymentId, setReceiptPaymentId] = useState<string>(paymentId);
  // Per-token delete state (id מסומן כמתחייב מחיקה).
  const [deletingTokenId, setDeletingTokenId] = useState<string | null>(null);
  const inFlightRef = useRef<boolean>(false);
  const idempotencyKeyRef = useRef<string | null>(null);
  // ⚠️ אותו דפוס כמו ב-ChargeCardcomDialog: דוחים את onPaymentSuccess עד
  // סגירת דיאלוג הקבלה כדי למנוע unmount race של ה-parent בזמן שהקבלה
  // עוד לא הופיעה.
  const pendingPaymentSuccessRef = useRef<
    (() => Promise<void> | void) | null
  >(null);
  // ⭐ דגל success-path — ראה הערה זהה ב-charge-cardcom-dialog.tsx.
  const receiptScheduledRef = useRef<boolean>(false);

  // ⭐ סנכרון receiptPaymentId כש-prop משתנה — מונע stale id אם
  // ה-component נטען מחדש על תשלום שונה.
  useEffect(() => {
    setReceiptPaymentId(paymentId);
  }, [paymentId]);

  // טעינת רשימת הטוקנים (פעם אחת בעת mount).
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoadingList(true);
      try {
        const res = await fetch(`/api/clients/${clientId}/saved-cards`);
        if (!res.ok) {
          if (!cancelled) setTokens([]);
          return;
        }
        const data = (await res.json()) as { tokens: SavedToken[] };
        if (!cancelled) setTokens(data.tokens ?? []);
      } catch {
        if (!cancelled) setTokens([]);
      } finally {
        if (!cancelled) setLoadingList(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  // אם אין טוקנים פעילים — אין כפתור. אם עדיין נטען — אל תציג.
  if (loadingList || !tokens || tokens.length === 0) {
    return null;
  }
  // סינון: רק טוקנים שלא פגי תוקף.
  const usableTokens = tokens.filter((t) => !t.isExpired);
  if (usableTokens.length === 0) {
    return null;
  }

  const handleOpen = (next: boolean) => {
    if (next) {
      setSelectedTokenId(usableTokens[0]?.id ?? null);
      // Idempotency-Key יציב לפר-דיאלוג: שימוש חוזר בלחיצה כפולה ⇒ אותה תוצאה.
      const r = crypto.getRandomValues(new Uint8Array(16));
      idempotencyKeyRef.current =
        Date.now().toString(36) +
        "-" +
        Array.from(r, (b) => b.toString(16).padStart(2, "0")).join("");
    } else {
      setSelectedTokenId(null);
      setIsCharging(false);
      inFlightRef.current = false;
      idempotencyKeyRef.current = null;
      // ⚠️ flush pendingPaymentSuccessRef רק ב-cancel-path — ראה הערה
      // ב-charge-cardcom-dialog.tsx.
      if (
        !receiptScheduledRef.current &&
        !receiptDialogOpen &&
        pendingPaymentSuccessRef.current
      ) {
        const pending = pendingPaymentSuccessRef.current;
        pendingPaymentSuccessRef.current = null;
        queueMicrotask(async () => {
          try {
            await pending();
          } catch {
            // refresh failure non-fatal
          }
        });
      }
      receiptScheduledRef.current = false;
    }
    setDialogOpen(next);
  };

  const handleDeleteToken = async (tokenId: string, last4: string): Promise<void> => {
    if (deletingTokenId) return;
    if (
      typeof window !== "undefined" &&
      !window.confirm(
        `למחוק את הכרטיס המסתיים ב-${last4}? לא ניתן יהיה לחייב אותו יותר. ` +
          `(החיובים הקודמים יישמרו בהיסטוריה.)`
      )
    ) {
      return;
    }
    setDeletingTokenId(tokenId);
    try {
      const res = await fetch(
        `/api/clients/${clientId}/saved-cards/${tokenId}`,
        { method: "DELETE" }
      );
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        message?: string;
        alreadyDeleted?: boolean;
      };
      if (!res.ok) {
        toast.error(data.message ?? "מחיקת הכרטיס נכשלה");
        return;
      }
      // הסרה אופטימית מהרשימה. אם זה היה הכרטיס הנבחר, מאפסים את הבחירה.
      setTokens((prev) => (prev ? prev.filter((t) => t.id !== tokenId) : prev));
      setSelectedTokenId((prev) => (prev === tokenId ? null : prev));
      toast.success(
        data.alreadyDeleted ? "הכרטיס כבר היה מחוק" : "הכרטיס נמחק"
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "מחיקת הכרטיס נכשלה");
    } finally {
      setDeletingTokenId(null);
    }
  };

  const handleCharge = async () => {
    if (inFlightRef.current) return;
    if (!selectedTokenId) {
      toast.error("יש לבחור כרטיס");
      return;
    }
    inFlightRef.current = true;
    setIsCharging(true);
    try {
      const res = await fetch(
        `/api/payments/${paymentId}/charge-saved-token`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Idempotency-Key":
              idempotencyKeyRef.current ?? `fallback-${Date.now().toString(36)}`,
          },
          body: JSON.stringify({ savedCardTokenId: selectedTokenId }),
        }
      );
      const data = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        message?: string;
        errorMessage?: string;
        approvalNumber?: string;
        // ⭐ paymentId האפקטיבי שעליו נכתבה הקבלה. ב-additive partial זה
        // child חדש שונה מ-paymentId שב-prop. חיוני ל-ReceiptPreviewDialog.
        paymentId?: string;
      };
      if (!res.ok) {
        throw new Error(data.message ?? "חיוב נכשל");
      }
      if (!data.success) {
        toast.error(data.errorMessage ?? "החיוב נדחה");
        return;
      }
      toast.success(
        data.approvalNumber
          ? `החיוב אושר (אישור ${data.approvalNumber})`
          : "החיוב אושר"
      );
      // ⚠️ דוחים את onPaymentSuccess עד סגירת דיאלוג הקבלה (unmount race).
      pendingPaymentSuccessRef.current = onPaymentSuccess ?? null;
      // ⭐ עדכון receiptPaymentId לפני פתיחת הדיאלוג — נופל ל-prop רק אם
      // ה-API לא מחזיר effective id (תאימות לאחור).
      setReceiptPaymentId(data.paymentId ?? paymentId);
      // ⭐ דגל success-path — מונע flush מוקדם ב-handleOpen(false) שיגרום
      // ל-onPaymentSuccess לרוץ לפני שהקבלה הופיעה (ה-parent עלול להיות
      // unmounted לפני שהמטפל יראה את הקבלה).
      receiptScheduledRef.current = true;
      handleOpen(false);
      // ── הצגת קבלה in-page (במקום window.open שנחסם) ──
      // ב-saved-card-token החיוב + הקבלה synchroni (route /charge-saved-token
      // קורא ל-Documents API באותה תגובה). אם data.receiptUrl קיים, polling
      // יסתיים ב-iteration ראשון; אחרת polling עד 30s לפי isCardcom.
      setTimeout(() => setReceiptDialogOpen(true), 220);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "חיוב נכשל");
    } finally {
      setIsCharging(false);
      inFlightRef.current = false;
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size={size}
        className={className}
        onClick={() => handleOpen(true)}
      >
        <CreditCard className="h-4 w-4 ml-1" />
        {label}
      </Button>

      <Dialog open={dialogOpen} onOpenChange={handleOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-blue-600" />
              חיוב כרטיס שמור
            </DialogTitle>
            <DialogDescription>
              {clientName ? `לחיוב ${clientName} בסך ` : "לחיוב "}
              <span className="font-bold">₪{amount}</span>
              {" "}
              באמצעות כרטיס אשראי שמור.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="bg-blue-50 border border-blue-200 rounded p-3 text-sm flex items-start gap-2">
              <AlertCircle className="h-4 w-4 text-blue-600 mt-0.5 shrink-0" />
              <span className="text-blue-800">
                החיוב יתבצע מיידית דרך Cardcom. הלקוח יקבל קבלה אוטומטית.
              </span>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-medium">בחר כרטיס</p>
              {usableTokens.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">
                  אין כרטיסים שמורים זמינים. סגור את הדיאלוג ופתח חיוב חדש כדי לשמור כרטיס.
                </p>
              ) : (
                usableTokens.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center gap-2 p-3 rounded border hover:bg-muted/50"
                  >
                    <label className="flex items-center gap-3 cursor-pointer flex-1">
                      <input
                        type="radio"
                        name="saved-card"
                        value={t.id}
                        checked={selectedTokenId === t.id}
                        onChange={() => setSelectedTokenId(t.id)}
                        className="h-4 w-4"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <CreditCard className="h-4 w-4 text-blue-600" />
                          <span dir="ltr" className="font-mono text-sm">
                            **** {t.cardLast4}
                          </span>
                          {t.cardBrand && (
                            <span className="text-xs text-muted-foreground">
                              ({t.cardBrand})
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {t.cardHolder} · תוקף{" "}
                          <span dir="ltr">
                            {String(t.expiryMonth).padStart(2, "0")}/
                            {String(t.expiryYear).slice(-2)}
                          </span>
                        </div>
                      </div>
                    </label>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-red-600 hover:text-red-700 hover:bg-red-50 shrink-0"
                      onClick={() => handleDeleteToken(t.id, t.cardLast4)}
                      disabled={
                        deletingTokenId === t.id || isCharging
                      }
                      title="מחק כרטיס שמור"
                      aria-label={`מחק כרטיס המסתיים ב-${t.cardLast4}`}
                    >
                      {deletingTokenId === t.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                ))
              )}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => handleOpen(false)}
              disabled={isCharging}
            >
              ביטול
            </Button>
            <Button
              onClick={handleCharge}
              disabled={isCharging || !selectedTokenId}
              className="gap-1"
            >
              {isCharging ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  מחייב...
                </>
              ) : (
                <>
                  <CreditCard className="h-4 w-4" />
                  חייב ₪{amount}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ReceiptPreviewDialog
        open={receiptDialogOpen}
        onOpenChange={async (next) => {
          setReceiptDialogOpen(next);
          if (!next) {
            // ⭐ איפוס דגל ה-success-path: עכשיו אם המשתמש יסגור דיאלוג
            // נוסף לפני שקבלה תיפתח, ה-flush handler יעבוד נכון.
            receiptScheduledRef.current = false;
            const pending = pendingPaymentSuccessRef.current;
            pendingPaymentSuccessRef.current = null;
            if (pending) {
              try {
                await pending();
              } catch {
                // refresh failure non-fatal
              }
            }
          }
        }}
        paymentId={receiptPaymentId}
        isCardcom={true}
        title="קבלת Cardcom"
      />
    </>
  );
}
