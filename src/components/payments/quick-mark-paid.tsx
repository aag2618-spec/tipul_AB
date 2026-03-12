"use client";

import { useState, useEffect } from "react";
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
import { CreditCard, Loader2, Check, ChevronDown, ChevronUp, Wallet, FileText } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
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
  buttonClassName?: string;
  totalClientDebt?: number;
  unpaidSessionsCount?: number;
  // אפשרות לשליטה מבחוץ (אופציונלי - לשימוש ביומן)
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideButton?: boolean;
  children?: React.ReactNode;
  onPaymentSuccess?: () => Promise<void> | void;
}

export function QuickMarkPaid({
  sessionId,
  clientId,
  clientName,
  amount,
  creditBalance = 0,
  existingPayment,
  buttonText = "סמן כשולם",
  buttonClassName,
  totalClientDebt,
  unpaidSessionsCount,
  open,
  onOpenChange,
  hideButton = false,
  children,
  onPaymentSuccess,
}: QuickMarkPaidProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  
  // שימוש בשליטה חיצונית אם קיימת, אחרת שליטה פנימית
  const isOpen = open !== undefined ? open : internalOpen;
  const setIsOpen = (value: boolean) => {
    if (onOpenChange) {
      onOpenChange(value);
    } else {
      setInternalOpen(value);
    }
  };
  const [isLoading, setIsLoading] = useState(false);
  const [method, setMethod] = useState<string>("CASH");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [paymentType, setPaymentType] = useState<"FULL" | "PARTIAL" | "CREDIT">("FULL");
  const [partialAmount, setPartialAmount] = useState<string>("");
  const [issueReceipt, setIssueReceipt] = useState<boolean>(false);
  const [receiptMode, setReceiptMode] = useState<"ALWAYS" | "ASK" | "NEVER">("ASK");
  const [businessType, setBusinessType] = useState<"NONE" | "EXEMPT" | "LICENSED">("NONE");
  const router = useRouter();
  
  // State for auto-fetched debt info
  const [fetchedDebt, setFetchedDebt] = useState<number | null>(null);
  const [fetchedUnpaidCount, setFetchedUnpaidCount] = useState<number | null>(null);
  
  // Use provided props or fetched values
  const effectiveDebt = totalClientDebt ?? fetchedDebt;
  const effectiveUnpaidCount = unpaidSessionsCount ?? fetchedUnpaidCount;
  
  // Fetch debt info when dialog opens if not provided
  useEffect(() => {
    if (isOpen && clientId && (totalClientDebt === undefined || unpaidSessionsCount === undefined)) {
      fetch(`/api/payments/client-debt/${clientId}`)
        .then((res) => res.json())
        .then((data) => {
          if (data.totalDebt !== undefined) {
            setFetchedDebt(Number(data.totalDebt));
          }
          // API returns unpaidSessions array, get count from length
          if (data.unpaidSessions !== undefined) {
            setFetchedUnpaidCount(data.unpaidSessions.length);
          }
        })
        .catch((err) => {
          console.error("Failed to fetch client debt info:", err);
        });
    }
  }, [isOpen, clientId, totalClientDebt, unpaidSessionsCount]);

  // Fetch business settings for receipt handling
  useEffect(() => {
    if (isOpen) {
      fetch("/api/user/business-settings")
        .then((res) => res.json())
        .then((data) => {
          if (data.businessType) setBusinessType(data.businessType);
          if (data.receiptDefaultMode) setReceiptMode(data.receiptDefaultMode);
          // Set initial receipt state based on mode
          if (data.receiptDefaultMode === "ALWAYS") {
            setIssueReceipt(true);
          } else if (data.receiptDefaultMode === "NEVER") {
            setIssueReceipt(false);
          }
        })
        .catch((err) => {
          console.error("Failed to fetch business settings:", err);
        });
    }
  }, [isOpen]);

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

      let result: { receiptError?: string } | undefined;

      if (existingPayment) {
        const response = await fetch(`/api/payments/${existingPayment.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: totalAmount,
            paymentMode: paymentType === "PARTIAL" ? "PARTIAL" : "FULL",
            creditUsed: creditToUse,
            method,
            paidAt: new Date().toISOString(),
            issueReceipt: businessType !== "NONE" && issueReceipt,
          }),
        });

        if (!response.ok) throw new Error("Failed to update payment");
        result = await response.json();
      } else {
        const isFullPayment = paymentType !== "PARTIAL" || totalAmount >= amount;
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
            status: isFullPayment ? "PAID" : "PENDING",
            creditUsed: creditToUse,
            issueReceipt: businessType !== "NONE" && issueReceipt,
          }),
        });

        if (!response.ok) throw new Error("Failed to create payment");
        result = await response.json();
      }

      const successMessage = 
        creditToUse > 0 && cashAmount > 0 ? `התשלום בוצע (₪${cashAmount.toFixed(0)} + קרדיט ₪${creditToUse.toFixed(0)})` :
        creditToUse > 0 ? "התשלום נוכה מהקרדיט" :
        paymentType === "PARTIAL" ? "תשלום חלקי בוצע" :
        "התשלום סומן כשולם";
      
      if (onPaymentSuccess) {
        try {
          await onPaymentSuccess();
        } catch (err) {
          console.error("onPaymentSuccess error:", err);
        }
      }

      toast.success(successMessage);

      if (result?.receiptError) {
        toast.error(`שגיאה בהפקת קבלה: ${result.receiptError}`, { duration: 8000 });
      }
      setIsOpen(false);
      setShowAdvanced(false);
      setPaymentType("FULL");
      setPartialAmount("");
      
      router.refresh();
    } catch (error) {
      toast.error("שגיאה בעדכון התשלום");
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      {children ? (
        <DialogTrigger asChild>
          <div className="cursor-pointer outline-none focus:outline-none focus:ring-0 [&:focus-visible]:outline-none">{children}</div>
        </DialogTrigger>
      ) : !hideButton ? (
        <DialogTrigger asChild>
          <Button 
            variant={buttonClassName ? "ghost" : "default"}
            size="sm" 
            className={buttonClassName || "gap-1"}
            onClick={(e) => e.stopPropagation()}
          >
            <CreditCard className="h-3 w-3" />
            {buttonText}
          </Button>
        </DialogTrigger>
      ) : null}
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

              {/* הוצאת קבלה - מוצג רק אם סוג העסק מאפשר */}
              {businessType !== "NONE" && receiptMode !== "NEVER" && (
                <div className="flex items-center gap-3 py-2 px-3 bg-sky-50 rounded-lg border border-sky-200">
                  <Checkbox
                    id="issue-receipt"
                    checked={issueReceipt}
                    onCheckedChange={(checked) => setIssueReceipt(checked === true)}
                    disabled={receiptMode === "ALWAYS"}
                  />
                  <Label htmlFor="issue-receipt" className="cursor-pointer flex items-center gap-2 text-sky-800">
                    <FileText className="h-4 w-4" />
                    הוצא קבלה
                    {receiptMode === "ALWAYS" && (
                      <span className="text-xs text-sky-600">(ברירת מחדל)</span>
                    )}
                  </Label>
                </div>
              )}

              {/* כפתור אופציות מתקדמות - תיקון הבאג */}
              <div
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowAdvanced(!showAdvanced);
                }}
                onPointerDown={(e) => e.stopPropagation()}
                onMouseDown={(e) => e.stopPropagation()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
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
        {effectiveUnpaidCount && effectiveUnpaidCount > 0 && effectiveDebt && (
          <div className="pt-4 border-t mt-4">
            <p className="text-sm text-muted-foreground mb-3 text-center">
              למטופל יש {effectiveUnpaidCount} פגישות ממתינות לתשלום
              (סה"כ חוב: ₪{effectiveDebt.toFixed(0)})
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
