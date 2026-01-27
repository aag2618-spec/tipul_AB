"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CreditCard, Loader2, Check, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface PayClientDebtsProps {
  clientId: string;
  clientName: string;
  totalDebt: number;
  creditBalance: number;
  unpaidPayments: Array<{
    paymentId: string;
    amount: number;
  }>;
  onPaymentComplete?: () => void;
  onOptimisticUpdate?: (amountPaid: number) => void;
}

export function PayClientDebts({
  clientId,
  clientName,
  totalDebt,
  creditBalance,
  unpaidPayments,
  onPaymentComplete,
  onOptimisticUpdate,
}: PayClientDebtsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [paymentMode, setPaymentMode] = useState<"FULL" | "PARTIAL">("FULL");
  const [method, setMethod] = useState<string>("CASH");
  const [partialAmount, setPartialAmount] = useState<string>("");
  const router = useRouter();

  // Reset form when dialog closes
  const handleDialogOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      // Reset all fields when closing
      setPaymentMode("FULL");
      setMethod("CASH");
      setPartialAmount("");
    }
  };

  const handlePayment = async () => {
    setIsLoading(true);
    try {
      let amountToPay = totalDebt;
      
      if (paymentMode === "PARTIAL") {
        amountToPay = parseFloat(partialAmount) || 0;
        if (amountToPay <= 0 || amountToPay > totalDebt) {
          toast.error("סכום חלקי לא תקין");
          setIsLoading(false);
          return;
        }
      }

      // Confirmation for large amounts
      if (amountToPay > 1000 && method === "CASH") {
        const confirmed = window.confirm(
          `האם אתה בטוח שברצונך לרשום תשלום של ₪${amountToPay.toFixed(0)} במזומן?`
        );
        if (!confirmed) {
          setIsLoading(false);
          return;
        }
      }

      // Optimistic update - update UI immediately
      if (onOptimisticUpdate) {
        onOptimisticUpdate(amountToPay);
      }

      // Pay all debts (or partial amount distributed across debts)
      const response = await fetch("/api/payments/pay-client-debts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          paymentIds: unpaidPayments.map(p => p.paymentId),
          totalAmount: amountToPay,
          method,
          paymentMode,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to process payment");
      }

      const successMessage = 
        paymentMode === "PARTIAL" 
          ? `תשלום חלקי של ₪${amountToPay} נרשם בהצלחה`
          : "כל החובות שולמו בהצלחה";
      
      toast.success(successMessage);
      setIsOpen(false);
      
      if (onPaymentComplete) {
        onPaymentComplete();
      }
      
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "שגיאה בעיבוד התשלום");
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  if (totalDebt <= 0) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleDialogOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm" className="gap-2">
          <CreditCard className="h-4 w-4" />
          תשלום
          <ChevronDown className="h-3 w-3" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            תשלום חובות - {clientName}
          </DialogTitle>
          <DialogDescription>
            <div className="space-y-2 mt-2">
              <div className="flex items-center justify-between">
                <span>סה״כ חוב:</span>
                <span className="font-bold text-red-600 text-lg">₪{totalDebt.toFixed(0)}</span>
              </div>
              {creditBalance > 0 && (
                <Badge variant="secondary" className="w-full justify-between">
                  <span>קרדיט זמין:</span>
                  <span className="font-bold">₪{creditBalance.toFixed(0)}</span>
                </Badge>
              )}
              <p className="text-xs text-muted-foreground">
                {unpaidPayments.length} תשלומים ממתינים
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* בחירת סוג תשלום */}
          <div className="space-y-3">
            <Label className="text-base font-semibold">סוג תשלום</Label>
            <div className="grid gap-2">
              <Button
                type="button"
                variant={paymentMode === "FULL" ? "default" : "outline"}
                size="sm"
                onClick={() => setPaymentMode("FULL")}
                className="justify-start h-auto py-3"
              >
                <div className="text-right w-full">
                  <div className="font-bold">תשלום מלא</div>
                  <div className="text-xs opacity-80">תשלום כל החוב (₪{totalDebt.toFixed(0)})</div>
                </div>
              </Button>
              
              <Button
                type="button"
                variant={paymentMode === "PARTIAL" ? "default" : "outline"}
                size="sm"
                onClick={() => setPaymentMode("PARTIAL")}
                className="justify-start h-auto py-3"
              >
                <div className="text-right w-full">
                  <div className="font-bold">תשלום חלקי</div>
                  <div className="text-xs opacity-80">תשלום חלק מהחוב</div>
                </div>
              </Button>
            </div>

            {paymentMode === "PARTIAL" && (
              <div className="space-y-2 pr-4 pt-2">
                <Label htmlFor="partial-amount">סכום לתשלום</Label>
                <div className="relative">
                  <Input
                    id="partial-amount"
                    type="number"
                    placeholder="הכנס סכום"
                    value={partialAmount}
                    onChange={(e) => setPartialAmount(e.target.value)}
                    max={totalDebt}
                    min={0}
                    step="1"
                    className="pl-8"
                  />
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    ₪
                  </span>
                </div>
                {partialAmount && parseFloat(partialAmount) < totalDebt && parseFloat(partialAmount) > 0 && (
                  <p className="text-xs text-muted-foreground">
                    נותר לתשלום: ₪{(totalDebt - parseFloat(partialAmount)).toFixed(0)}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* אמצעי תשלום */}
          <div className="space-y-2">
            <Label htmlFor="payment-method">אמצעי תשלום</Label>
            <Select value={method} onValueChange={setMethod}>
              <SelectTrigger id="payment-method">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CASH">מזומן</SelectItem>
                <SelectItem value="CREDIT_CARD">אשראי</SelectItem>
                <SelectItem value="BANK_TRANSFER">העברה בנקאית</SelectItem>
                <SelectItem value="CHECK">צ׳ק</SelectItem>
                <SelectItem value="OTHER">אחר</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => setIsOpen(false)}
            disabled={isLoading}
          >
            ביטול
          </Button>
          <Button 
            onClick={handlePayment} 
            disabled={isLoading || (paymentMode === "PARTIAL" && (!partialAmount || parseFloat(partialAmount) <= 0))}
            className="gap-2 bg-green-600 hover:bg-green-700"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                מעבד...
              </>
            ) : (
              <>
                <Check className="h-4 w-4" />
                {paymentMode === "FULL" 
                  ? `שלם ₪${totalDebt.toFixed(0)}` 
                  : `שלם ₪${partialAmount || "0"}`
                }
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
