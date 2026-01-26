"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, Calendar, CreditCard, Banknote, FileText } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface PaymentHistoryItem {
  id: string;
  amount: number;
  method: string;
  paidAt: Date;
  notes: string | null;
}

interface PaymentHistoryDialogProps {
  clientId: string;
  clientName: string;
  open: boolean;
  onClose: () => void;
}

export function PaymentHistoryDialog({
  clientId,
  clientName,
  open,
  onClose,
}: PaymentHistoryDialogProps) {
  const [payments, setPayments] = useState<PaymentHistoryItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [paidSessionsCount, setPaidSessionsCount] = useState(0);

  useEffect(() => {
    if (open) {
      fetchPaymentHistory();
    }
  }, [open, clientId]);

  const fetchPaymentHistory = async () => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/payments/history?clientId=${clientId}`);
      
      if (response.ok) {
        const data = await response.json();
        setPayments(data.payments);
        setPaidSessionsCount(data.paidSessionsCount);
      } else {
        toast.error("שגיאה בטעינת היסטוריה");
      }
    } catch (error) {
      console.error("Error fetching payment history:", error);
      toast.error("שגיאה בטעינת היסטוריה");
    } finally {
      setIsLoading(false);
    }
  };

  const getMethodLabel = (method: string) => {
    switch (method) {
      case "CASH":
        return "מזומן";
      case "CREDIT_CARD":
        return "כרטיס אשראי";
      case "BANK_TRANSFER":
        return "העברה בנקאית";
      case "CHECK":
        return "שיק";
      case "CREDIT":
        return "קרדיט";
      default:
        return "אחר";
    }
  };

  const getMethodIcon = (method: string) => {
    switch (method) {
      case "CASH":
        return <Banknote className="h-4 w-4" />;
      case "CREDIT_CARD":
      case "CREDIT":
        return <CreditCard className="h-4 w-4" />;
      case "BANK_TRANSFER":
        return <Banknote className="h-4 w-4" />;
      case "CHECK":
        return <FileText className="h-4 w-4" />;
      default:
        return <CreditCard className="h-4 w-4" />;
    }
  };

  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>היסטוריית תשלומים - {clientName}</DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            📊 סה"כ פגישות ששולמו: {paidSessionsCount}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : payments.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Calendar className="h-12 w-12 mx-auto mb-3 opacity-50" />
              <p>אין היסטוריית תשלומים</p>
            </div>
          ) : (
            <>
              <div className="space-y-2 max-h-[400px] overflow-y-auto">
                {payments.map((payment) => (
                  <div
                    key={payment.id}
                    className="flex items-center justify-between p-3 rounded-lg border bg-muted/30 hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10">
                        {getMethodIcon(payment.method)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">
                            📅 {format(new Date(payment.paidAt), "dd/MM/yyyy")}
                          </span>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {getMethodLabel(payment.method)}
                          {payment.notes && (
                            <span className="mr-1">• {payment.notes}</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <Badge variant="outline" className="font-bold">
                      ₪{payment.amount}
                    </Badge>
                  </div>
                ))}
              </div>

              <div className="border-t pt-4">
                <div className="flex justify-between items-center">
                  <span className="font-semibold">סה"כ שולם:</span>
                  <span className="text-2xl font-bold text-primary">
                    ₪{totalPaid.toLocaleString()}
                  </span>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end">
          <Button onClick={onClose}>סגור</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
