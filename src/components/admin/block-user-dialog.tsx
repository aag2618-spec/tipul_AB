"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";

export type BlockReason = "DEBT" | "TOS_VIOLATION" | "MANUAL";

const REASON_OPTIONS: Array<{
  value: BlockReason;
  title: string;
  description: string;
}> = [
  {
    value: "DEBT",
    title: "חוב פתוח",
    description:
      "תשלום מנוי שטרם הוסדר. החסימה תוסר אוטומטית כשתתקבל הוכחת תשלום (Cardcom/Meshulam/Sumit).",
  },
  {
    value: "TOS_VIOLATION",
    title: "הפרת תנאי שימוש",
    description:
      "הפרה משמעתית או חקירה פתוחה. תשלום לא יסיר את החסימה — נדרשת החלטה ידנית של אדמין.",
  },
  {
    value: "MANUAL",
    title: "חסימה ידנית — סיבה אחרת",
    description:
      "מקרים אחרים שאינם חוב או הפרת ToS. תשלום לא יסיר את החסימה.",
  },
];

interface BlockUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userName: string;
  onConfirm: (reason: BlockReason) => Promise<void> | void;
}

export function BlockUserDialog({
  open,
  onOpenChange,
  userName,
  onConfirm,
}: BlockUserDialogProps) {
  const [selectedReason, setSelectedReason] = useState<BlockReason>("DEBT");
  const [submitting, setSubmitting] = useState(false);

  const handleConfirm = async () => {
    setSubmitting(true);
    try {
      await onConfirm(selectedReason);
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="sm:max-w-[480px]">
        <DialogHeader className="text-right">
          <DialogTitle>חסימת משתמש</DialogTitle>
          <DialogDescription>
            בחר את סיבת החסימה של {userName}. הסיבה משפיעה על האם תשלום עתידי
            ישחרר את החסימה אוטומטית.
          </DialogDescription>
        </DialogHeader>

        <RadioGroup
          dir="rtl"
          value={selectedReason}
          onValueChange={(v) => setSelectedReason(v as BlockReason)}
          className="my-2"
        >
          {REASON_OPTIONS.map((opt) => (
            <div
              key={opt.value}
              className="flex items-start gap-3 rounded-md border p-3 hover:bg-muted/40"
            >
              <RadioGroupItem
                value={opt.value}
                id={`reason-${opt.value}`}
                className="mt-1"
              />
              <Label
                htmlFor={`reason-${opt.value}`}
                className="flex flex-1 cursor-pointer flex-col items-start gap-1 text-right"
              >
                <span className="font-semibold">{opt.title}</span>
                <span className="text-xs text-muted-foreground">
                  {opt.description}
                </span>
              </Label>
            </div>
          ))}
        </RadioGroup>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            ביטול
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={submitting}
          >
            {submitting ? "חוסם..." : "חסום משתמש"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
