"use client";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface ChargeConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pendingAction: "CANCELLED" | "NO_SHOW" | null;
  isProcessing: boolean;
  onCharge: (shouldCharge: boolean) => void;
}

export function ChargeConfirmDialog({
  open,
  onOpenChange,
  pendingAction,
  isProcessing,
  onCharge,
}: ChargeConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>האם לחייב את המטופל?</DialogTitle>
          <DialogDescription>
            {pendingAction === "CANCELLED"
              ? "הפגישה בוטלה. האם ברצונך לחייב את המטופל בתשלום?"
              : "המטופל נעדר מהפגישה. האם ברצונך לחייב אותו בתשלום?"}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="gap-2">
          <Button
            variant="default"
            onClick={() => onCharge(true)}
            disabled={isProcessing}
          >
            כן, לחייב
          </Button>
          <Button
            variant="outline"
            onClick={() => onCharge(false)}
            disabled={isProcessing}
          >
            לא, פטור מתשלום
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
