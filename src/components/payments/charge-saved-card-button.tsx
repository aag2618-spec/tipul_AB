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
import { Loader2, CreditCard, AlertCircle } from "lucide-react";
import { toast } from "sonner";

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
  const inFlightRef = useRef<boolean>(false);
  const idempotencyKeyRef = useRef<string | null>(null);

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
    }
    setDialogOpen(next);
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
      if (onPaymentSuccess) {
        try {
          await onPaymentSuccess();
        } catch {
          // refresh failure non-fatal
        }
      }
      handleOpen(false);
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
              {usableTokens.map((t) => (
                <label
                  key={t.id}
                  className="flex items-center gap-3 cursor-pointer p-3 rounded border hover:bg-muted/50"
                >
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
              ))}
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
    </>
  );
}
