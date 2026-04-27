"use client";

// src/components/payments/refund-cardcom-dialog.tsx
// דיאלוג ביטול/זיכוי לעסקת Cardcom (USER tenant) — תוך 14 יום מאישור.
// תומך בזיכוי מלא או חלקי, עם שדה "סיבה" חובה (לאודיט וחשבונית הזיכוי).

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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, RotateCcw, AlertCircle } from "lucide-react";
import { toast } from "sonner";

type RefundType = "FULL" | "PARTIAL";

interface RefundCardcomDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  paymentId: string;
  /** היתרה הזמינה לזיכוי (לפני זיכוי קודם, אם היה). */
  maxAmount: number;
  onRefundSuccess?: () => Promise<void> | void;
}

export function RefundCardcomDialog({
  open,
  onOpenChange,
  paymentId,
  maxAmount,
  onRefundSuccess,
}: RefundCardcomDialogProps) {
  const [type, setType] = useState<RefundType>("FULL");
  const [amount, setAmount] = useState<string>("");
  const [reason, setReason] = useState<string>("");
  const [isLoading, setIsLoading] = useState<boolean>(false);
  // ⚠️ Synchronous click guard: setIsLoading is async (next render); a
  // second click between two clicks can sneak past the disabled prop.
  // useRef updates are synchronous, so `inFlightRef.current = true` blocks
  // the rapid double-click before React has a chance to re-render.
  const inFlightRef = useRef<boolean>(false);
  // Stable idempotency key per dialog open. We generate a fresh one each
  // time the dialog opens; ALL clicks within that open session share it.
  // This way, a double-click hits the SAME server-side idempotency row
  // and the second response is the cached first result (not a 2nd refund).
  const idempotencyKeyRef = useRef<string | null>(null);

  const reset = () => {
    setType("FULL");
    setAmount("");
    setReason("");
    setIsLoading(false);
    inFlightRef.current = false;
    idempotencyKeyRef.current = null;
  };

  const handleClose = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  // Generate a fresh idempotency key every time the dialog opens.
  useEffect(() => {
    if (open && !idempotencyKeyRef.current) {
      const r = crypto.getRandomValues(new Uint8Array(16));
      idempotencyKeyRef.current =
        Date.now().toString(36) +
        "-" +
        Array.from(r, (b) => b.toString(16).padStart(2, "0")).join("");
    }
  }, [open]);

  const handleRefund = async () => {
    // Sync guard — wins the race vs disabled prop / setState lag.
    if (inFlightRef.current) return;
    inFlightRef.current = true;

    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      inFlightRef.current = false;
      toast.error("נא להזין סיבת זיכוי");
      return;
    }
    let refundAmount: number | undefined;
    if (type === "PARTIAL") {
      const n = parseFloat(amount);
      if (!Number.isFinite(n) || n <= 0) {
        inFlightRef.current = false;
        toast.error("סכום זיכוי לא תקין");
        return;
      }
      if (n > maxAmount + 0.01) {
        inFlightRef.current = false;
        toast.error(`סכום הזיכוי חורג מהיתרה (₪${maxAmount})`);
        return;
      }
      refundAmount = n;
    }

    // Use the dialog-session-stable idempotency key (set on dialog open).
    const idempotencyKey =
      idempotencyKeyRef.current ?? `fallback-${Date.now().toString(36)}`;

    setIsLoading(true);
    try {
      const res = await fetch(`/api/payments/${paymentId}/cardcom-refund`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": idempotencyKey,
        },
        body: JSON.stringify({
          amount: refundAmount,
          reason: trimmedReason,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        message?: string;
        success?: boolean;
        isPartial?: boolean;
        refundedAmount?: number;
      };
      if (!res.ok || !data.success) {
        throw new Error(data.message ?? "זיכוי נכשל");
      }
      toast.success(
        data.isPartial
          ? `זיכוי חלקי בוצע (₪${data.refundedAmount ?? refundAmount})`
          : "הזיכוי בוצע במלואו"
      );
      if (onRefundSuccess) {
        try {
          await onRefundSuccess();
        } catch {
          // Refresh failure is non-fatal — toast above already confirmed
          // the refund itself succeeded. Avoid leaking details to console.
        }
      }
      handleClose(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "זיכוי נכשל");
    } finally {
      setIsLoading(false);
      inFlightRef.current = false;
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="h-5 w-5 text-amber-600" />
            ביטול/זיכוי עסקת אשראי
          </DialogTitle>
          <DialogDescription>
            הזיכוי יתבצע ישירות דרך Cardcom וייווצר מסמך זיכוי במערכת.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="bg-amber-50 border border-amber-200 rounded p-3 text-sm flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="font-medium text-amber-800">חוק הגנת הצרכן</p>
              <p className="text-amber-700 text-xs">
                הזיכוי זמין עד 14 יום ממועד אישור העסקה. יתרה ניתנת לזיכוי: ₪{maxAmount}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <Label>סוג זיכוי</Label>
            <div className="space-y-2">
              <label className="flex items-center gap-3 cursor-pointer p-2 rounded hover:bg-muted/50">
                <input
                  type="radio"
                  name="refund-type"
                  value="FULL"
                  checked={type === "FULL"}
                  onChange={() => setType("FULL")}
                  className="h-4 w-4"
                />
                <span>
                  <span className="font-medium">זיכוי מלא</span>
                  <span className="block text-xs text-muted-foreground">
                    החזר של ₪{maxAmount} ללקוח
                  </span>
                </span>
              </label>
              <label className="flex items-center gap-3 cursor-pointer p-2 rounded hover:bg-muted/50">
                <input
                  type="radio"
                  name="refund-type"
                  value="PARTIAL"
                  checked={type === "PARTIAL"}
                  onChange={() => setType("PARTIAL")}
                  className="h-4 w-4"
                />
                <span>
                  <span className="font-medium">זיכוי חלקי</span>
                  <span className="block text-xs text-muted-foreground">
                    החזר סכום מסוים בלבד
                  </span>
                </span>
              </label>
            </div>
          </div>

          {type === "PARTIAL" && (
            <div className="space-y-2">
              <Label htmlFor="refund-amount">סכום לזיכוי (₪)</Label>
              <Input
                id="refund-amount"
                type="number"
                inputMode="decimal"
                step="0.01"
                min={0.01}
                max={maxAmount}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder={`עד ₪${maxAmount}`}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="refund-reason">סיבת זיכוי</Label>
            <Textarea
              id="refund-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="למשל: ביטול פגישה, טעות בסכום, בקשת לקוח..."
              rows={3}
              maxLength={500}
            />
            <p className="text-xs text-muted-foreground">
              הסיבה תופיע במסמך הזיכוי וביומן האודיט
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => handleClose(false)}
            disabled={isLoading}
          >
            ביטול
          </Button>
          <Button
            onClick={handleRefund}
            disabled={isLoading || !reason.trim()}
            className="bg-amber-600 hover:bg-amber-700 gap-1"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                מבצע זיכוי...
              </>
            ) : (
              <>
                <RotateCcw className="h-4 w-4" />
                בצע זיכוי
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
