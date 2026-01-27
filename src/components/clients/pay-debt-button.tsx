"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { CreditCard } from "lucide-react";
import { PayClientDebts } from "@/components/payments/pay-client-debts";

interface PayDebtButtonProps {
  clientId: string;
  clientName: string;
  totalDebt: number;
  creditBalance: number;
  unpaidPayments: Array<{
    paymentId: string;
    amount: number;
  }>;
}

export function PayDebtButton({
  clientId,
  clientName,
  totalDebt,
  creditBalance,
  unpaidPayments,
}: PayDebtButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button size="sm" onClick={() => setIsOpen(true)}>
        <CreditCard className="h-4 w-4 ml-1" />
        שלם
      </Button>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>תשלום חובות - {clientName}</DialogTitle>
            <DialogDescription>
              בחר אמצעי תשלום ואופן התשלום
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-center p-4">
            <PayClientDebts
              clientId={clientId}
              clientName={clientName}
              totalDebt={totalDebt}
              creditBalance={creditBalance}
              unpaidPayments={unpaidPayments}
              onPaymentComplete={() => {
                setIsOpen(false);
                window.location.reload();
              }}
            />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
