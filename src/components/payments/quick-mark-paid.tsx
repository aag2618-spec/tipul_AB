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
import { CreditCard, Loader2, Check, ChevronDown, ChevronUp, Wallet } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface QuickMarkPaidProps {
  sessionId: string;
  clientId: string;
  clientName?: string;
  amount: number;
  creditBalance?: number;
  existingPayment?: {
    id: string;
    status: string;
    method?: string;
  } | null;
  buttonText?: string;
  totalClientDebt?: number;
  unpaidSessionsCount?: number;
}

export function QuickMarkPaid({
  sessionId,
  clientId,
  clientName,
  amount,
  creditBalance = 0,
  existingPayment,
  buttonText = "סמן כשולם",
  totalClientDebt,
  unpaidSessionsCount,
}: QuickMarkPaidProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [method, setMethod] = useState<string>("CASH");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [paymentType, setPaymentType] = useState<"FULL" | "PARTIAL" | "CREDIT">("FULL");
  const [partialAmount, setPartialAmount] = useState<string>("");
  const router = useRouter();

  // If already paid, show badge
  if (existingPayment?.status === "PAID") {
    return (
      <Badge variant="default" className="gap-1">
        <Check className="h-3 w-3" />
        שולם
      </Badge>
    );
  }

  const handleMarkPaid = async () => {
    setIsLoading(true);
    try {
      // Calculate payment amounts
      let totalAmount = amount;
      if (paymentType === "PARTIAL") {
        totalAmount = parseFloat(partialAmount) || 0;
        if (totalAmount <= 0 || totalAmount > amount) {
          toast.error("סכום חלקי לא תקין");
          setIsLoading(false);
          return;
        }
      }

      const creditToUse = paymentType === "CREDIT" ? Math.min(totalAmount, creditBalance) : 0;
      const cashAmount = totalAmount - creditToUse;

      if (existingPayment) {
        // Update existing payment
        const response = await fetch(`/api/payments/${existingPayment.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: totalAmount,
            paymentMode: paymentType === "PARTIAL" ? "PARTIAL" : "FULL",
            creditUsed: creditToUse,
            method,
            paidAt: new Date().toISOString(),
          }),
        });

        if (!response.ok) throw new Error("Failed to update payment");
      } else {
        // Create new payment
        const response = await fetch("/api/payments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientId,
            sessionId,
            amount: totalAmount,
            expectedAmount: amount,
            paymentType: paymentType === "PARTIAL" ? "PARTIAL" : "FULL",
            method,
            status: "PAID",
            creditUsed: creditToUse,
          }),
        });

        if (!response.ok) throw new Error("Failed to create payment");
      }

      const successMessage = 
        creditToUse > 0 && cashAmount > 0 ? `התשלום בוצע (₪${cashAmount.toFixed(0)} + קרדיט ₪${creditToUse.toFixed(0)})` :
        creditToUse > 0 ? "התשלום נוכה מהקרדיט" :
        paymentType === "PARTIAL" ? "תשלום חלקי בוצע" :
        "התשלום סומן כשולם";
      
      toast.success(successMessage);
      setIsOpen(false);
      setShowAdvanced(false);
      setPaymentType("FULL");
      setPartialAmount("");
      
      // Force a hard refresh to update credit balance
      window.location.reload();
    } catch (error) {
      toast.error("שגיאה בעדכון התשלום");
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button 
          variant="default" 
          size="sm" 
          className="gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          <CreditCard className="h-3 w-3" />
          {buttonText}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            תשלום - {clientName || "מטופל"}
          </DialogTitle>
          <DialogDescription>
            <div className="font-semibold">סכום: ₪{amount}</div>
            {creditBalance > 0 && (
              <Badge variant="secondary" className="mt-1">
                קרדיט זמין: ₪{creditBalance}
              </Badge>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* תיבת רישום תשלום - עיצוב זהה ליומן */}
          <div className="border rounded-lg p-4 bg-orange-50 border-orange-200">
            <h3 className="text-center font-bold text-lg mb-4 flex items-center justify-center gap-2">
              💰 רישום תשלום
            </h3>
            
            <div className="space-y-4">
              {/* סכום */}
              <div className="grid grid-cols-2 gap-4 items-center">
                <Label className="text-right">סכום</Label>
                <div className="text-left">
                  <div className="text-2xl font-bold">
                    ₪{paymentType === "PARTIAL" && partialAmount ? partialAmount : amount}
                  </div>
                </div>
              </div>

              {/* אמצעי תשלום */}
              <div className="grid grid-cols-2 gap-4 items-center">
                <Label htmlFor="payment-method" className="text-right">אמצעי תשלום</Label>
                <Select value={method} onValueChange={setMethod}>
                  <SelectTrigger id="payment-method" className="bg-white">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CASH">מזומן</SelectItem>
                    <SelectItem value="CREDIT_CARD">כרטיס אשראי</SelectItem>
                    <SelectItem value="BANK_TRANSFER">העברה בנקאית</SelectItem>
                    <SelectItem value="CHECK">המחאה</SelectItem>
                    <SelectItem value="OTHER">אחר</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* כפתור אופציות מתקדמות - תיקון הבאג */}
              <div
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowAdvanced(!showAdvanced);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setShowAdvanced(!showAdvanced);
                  }
                }}
                className="w-full flex items-center justify-between px-4 py-2 text-sm rounded-md cursor-pointer hover:bg-orange-100 transition-colors"
              >
                <span>אופציות מתקדמות</span>
                <ChevronDown className={`h-4 w-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
              </div>

              {/* אופציות מתקדמות - מתרחב */}
              {showAdvanced && (
                <div className="space-y-4 pt-2 border-t animate-in slide-in-from-top-2">
                  {/* תשלום חלקי */}
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="partial-payment-quick"
                        checked={paymentType === "PARTIAL"}
                        onChange={(e) => {
                          setPaymentType(e.target.checked ? "PARTIAL" : "FULL");
                          if (!e.target.checked) setPartialAmount("");
                        }}
                        className="h-4 w-4"
                      />
                      <Label htmlFor="partial-payment-quick" className="cursor-pointer">
                        תשלום חלקי
                      </Label>
                    </div>
                    
                    {paymentType === "PARTIAL" && (
                      <div className="space-y-2 pr-6">
                        <Label htmlFor="partial-amount-quick" className="text-sm">סכום לתשלום</Label>
                        <div className="relative">
                          <Input
                            id="partial-amount-quick"
                            type="number"
                            placeholder="הזן סכום"
                            value={partialAmount}
                            onChange={(e) => setPartialAmount(e.target.value)}
                            max={amount}
                            min={0}
                            step="1"
                            className="pl-8 bg-white"
                          />
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                            ₪
                          </span>
                        </div>
                        {partialAmount && parseFloat(partialAmount) < amount && parseFloat(partialAmount) > 0 && (
                          <p className="text-xs text-muted-foreground">
                            נותר: ₪{(amount - parseFloat(partialAmount)).toFixed(0)}
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* שימוש בקרדיט */}
                  {creditBalance > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="use-credit-quick"
                          checked={paymentType === "CREDIT"}
                          onChange={(e) => setPaymentType(e.target.checked ? "CREDIT" : "FULL")}
                          className="h-4 w-4"
                        />
                        <Label htmlFor="use-credit-quick" className="cursor-pointer">
                          השתמש בקרדיט (זמין: ₪{creditBalance.toFixed(0)})
                        </Label>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={() => setIsOpen(false)}
            disabled={isLoading}
            className="font-medium"
          >
            ביטול
          </Button>
          <Button 
            onClick={handleMarkPaid} 
            disabled={isLoading || (paymentType === "PARTIAL" && (!partialAmount || parseFloat(partialAmount) <= 0))}
            className="gap-2 font-bold bg-green-600 hover:bg-green-700"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                מעבד...
              </>
            ) : (
              <>
                <Check className="h-4 w-4" />
                {(() => {
                  const totalAmount = paymentType === "PARTIAL" ? (parseFloat(partialAmount) || 0) : amount;
                  const creditToUse = paymentType === "CREDIT" ? Math.min(totalAmount, creditBalance) : 0;
                  const cashAmount = totalAmount - creditToUse;
                  
                  if (creditToUse > 0 && cashAmount > 0) {
                    return `סיים ושלם (₪${cashAmount.toFixed(0)} + קרדיט ₪${creditToUse.toFixed(0)})`;
                  } else if (creditToUse > 0) {
                    return `סיים ושלם (קרדיט ₪${creditToUse.toFixed(0)})`;
                  } else {
                    return `סיים ושלם (₪${cashAmount.toFixed(0)})`;
                  }
                })()}
              </>
            )}
          </Button>
        </DialogFooter>

        {/* Show "Pay All Debt" button only if there are additional unpaid sessions */}
        {unpaidSessionsCount && unpaidSessionsCount > 1 && totalClientDebt && (
          <div className="pt-4 border-t mt-4">
            <p className="text-sm text-muted-foreground mb-3 text-center">
              למטופל יש עוד {unpaidSessionsCount - 1} פגישות ממתינות לתשלום
              (סה"כ חוב: ₪{totalClientDebt.toFixed(0)})
            </p>
            <Button 
              variant="outline" 
              className="w-full gap-2" 
              asChild
            >
              <Link href={`/dashboard/payments/pay/${clientId}`} onClick={() => setIsOpen(false)}>
                <Wallet className="h-4 w-4" />
                שלם את כל החוב
              </Link>
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
