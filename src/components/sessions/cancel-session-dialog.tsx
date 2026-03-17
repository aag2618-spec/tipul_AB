"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Ban, Loader2 } from "lucide-react";

interface CancelSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clientName: string;
  startTime: string;
  price: number;
  cancelling: boolean;
  onCancel: (charge: boolean, reason: string) => void;
  onClose: () => void;
}

export function CancelSessionDialog({
  open,
  onOpenChange,
  clientName,
  startTime,
  price,
  cancelling,
  onCancel,
  onClose,
}: CancelSessionDialogProps) {
  const [cancelReason, setCancelReason] = useState("");
  const [cancelCharge, setCancelCharge] = useState<"ask" | "charge" | "free">("ask");

  const isWithin24h = (st: string) => {
    const sessionTime = new Date(st).getTime();
    const nowTime = Date.now();
    return sessionTime - nowTime <= 24 * 60 * 60 * 1000;
  };

  const handleClose = () => {
    setCancelReason("");
    setCancelCharge("ask");
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => {
      if (!o) handleClose();
      else onOpenChange(o);
    }}>
      <DialogContent className="sm:max-w-md" dir="rtl">
        <DialogHeader>
          <DialogTitle>ביטול פגישה</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          {clientName && (
            <p className="text-sm text-muted-foreground">
              האם לבטל את הפגישה עם <span className="font-medium text-foreground">{clientName}</span>?
            </p>
          )}
          <div>
            <label className="text-sm font-medium mb-1.5 block">סיבת ביטול (אופציונלי)</label>
            <Textarea
              value={cancelReason}
              onChange={e => setCancelReason(e.target.value)}
              placeholder="לדוגמה: מחלה, בקשת מטופל..."
              className="resize-none h-20 bg-muted/20 border-muted-foreground/10"
            />
          </div>

          {isWithin24h(startTime) && price > 0 && cancelCharge === "ask" && (
            <div className="p-3 rounded-lg border bg-amber-50 border-amber-200">
              <p className="text-sm font-semibold text-amber-800 mb-2">
                הפגישה תוך 24 שעות - האם לחייב דמי ביטול?
              </p>
              <p className="text-xs text-amber-700 mb-3">
                סכום: ₪{price}
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="flex-1 bg-amber-600 hover:bg-amber-700"
                  onClick={() => setCancelCharge("charge")}
                >
                  כן, לחייב
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setCancelCharge("free")}
                >
                  לא, פטור
                </Button>
              </div>
            </div>
          )}

          {cancelCharge === "charge" && (
            <div className="p-3 rounded-lg border bg-emerald-50 border-emerald-200">
              <p className="text-sm text-emerald-700">
                ✓ ייווצר חיוב של ₪{price} למטופל
              </p>
            </div>
          )}

          {cancelCharge === "free" && (
            <div className="p-3 rounded-lg border bg-sky-50 border-sky-200">
              <p className="text-sm text-sky-700">
                ✓ הביטול יהיה ללא חיוב
              </p>
            </div>
          )}
        </div>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={handleClose}
            disabled={cancelling}
          >
            חזרה
          </Button>
          <Button
            variant="destructive"
            onClick={() => onCancel(cancelCharge === "charge", cancelReason)}
            disabled={cancelling || (isWithin24h(startTime) && price > 0 && cancelCharge === "ask")}
            className="bg-red-500 hover:bg-red-600"
          >
            {cancelling ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : <Ban className="h-4 w-4 ml-1" />}
            {cancelCharge === "charge" ? "בטל וחייב" : "בטל פגישה"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
