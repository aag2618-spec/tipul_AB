"use client";

import { UpdateSessionDialog as SharedUpdateSessionDialog } from "@/components/update-session-dialog";

interface UpdateSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: {
    id: string;
    price: number;
    client: {
      id: string;
      name: string;
    } | null;
  };
  onUpdate: (params: {
    updateStatus: string;
    showPayment: boolean;
    paymentMethod: string;
    paymentType: "FULL" | "PARTIAL";
    paymentAmount: string;
    partialAmount: string;
    issueReceipt: boolean;
    businessType: string;
    updateReason: string;
    noChargeReason: string;
  }) => Promise<void>;
  onRecordDebt: (params: {
    updateStatus: string;
    updateReason: string;
  }) => Promise<void>;
  updating: boolean;
}

export function UpdateSessionDialog({
  open,
  onOpenChange,
  session,
  onUpdate,
  onRecordDebt,
  updating,
}: UpdateSessionDialogProps) {
  return (
    <SharedUpdateSessionDialog
      open={open}
      sessionId={session.id}
      clientName={session.client?.name ?? "מטופל"}
      clientId={session.client?.id ?? ""}
      price={session.price}
      updating={updating}
      onClose={() => onOpenChange(false)}
      onUpdate={onUpdate}
      onRecordDebt={onRecordDebt}
    />
  );
}
