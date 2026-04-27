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
import { CreditCard, Loader2, Check, ChevronDown, FileText } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const METHOD_LABELS: Record<string, string> = {
  CASH: "מזומן",
  CREDIT_CARD: "כרטיס אשראי",
  BANK_TRANSFER: "העברה בנקאית",
  CHECK: "המחאה",
  OTHER: "אחר",
};

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
  dateRange?: { from: Date; to: Date };
}

export function PayClientDebts({
  clientId,
  clientName,
  totalDebt,
  creditBalance,
  unpaidPayments,
  onPaymentComplete,
  onOptimisticUpdate,
  dateRange,
}: PayClientDebtsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [paymentMode, setPaymentMode] = useState<"FULL" | "PARTIAL">("FULL");
  const [method, setMethod] = useState<string>("CASH");
  const [partialAmount, setPartialAmount] = useState<string>("");
  const [useCredit, setUseCredit] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [issueReceipt, setIssueReceipt] = useState<boolean>(false);
  const [receiptMode, setReceiptMode] = useState<"ALWAYS" | "ASK" | "NEVER">("ASK");
  const [businessType, setBusinessType] = useState<"NONE" | "EXEMPT" | "LICENSED">("NONE");
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const router = useRouter();

  // Fetch business settings for receipt handling
  useEffect(() => {
    if (isOpen) {
      fetch("/api/user/business-settings")
        .then((res) => res.json())
        .then((data) => {
          if (data.businessType) setBusinessType(data.businessType);
          if (data.receiptDefaultMode) setReceiptMode(data.receiptDefaultMode);
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

  // Reset form when dialog closes
  const handleDialogOpenChange = (open: boolean) => {
    setIsOpen(open);
    if (!open) {
      // Reset all fields when closing
      setPaymentMode("FULL");
      setMethod("CASH");
      setPartialAmount("");
      setUseCredit(false);
      setShowAdvanced(false);
      setIssueReceipt(false);
    }
  };

  // בדיקת תקינות ואישור לפני תשלום
  const handlePaymentClick = () => {
    // CRITICAL: סליקה מצרפית אמיתית ב-Cardcom דורשת "umbrella payment" + עדכון
    // children אטומי ב-webhook. עד שהמנגנון הזה ייבנה — חוסמים CREDIT_CARD
    // בתשלום מצרפי כדי למנוע מצב של "אומברלה PAID + children PENDING" שיוביל
    // לספירה כפולה בהכנסה או חוב מובלע. מפנים למסלול אישי-לפגישה.
    if (method === "CREDIT_CARD") {
      toast.error(
        "תשלום מצרפי באשראי טרם נתמך. כדי לחייב באשראי - היכנסי לכל פגישה ושלמי בנפרד, או בחרי אמצעי אחר (מזומן/בנק/המחאה) לתשלום מצרפי."
      );
      return;
    }

    if (paymentMode === "PARTIAL") {
      const amount = parseFloat(partialAmount) || 0;
      if (amount <= 0 || amount > totalDebt) {
        toast.error("סכום חלקי לא תקין");
        return;
      }
    }

    const totalAmount = paymentMode === "FULL" ? (Number(totalDebt) || 0) : (parseFloat(partialAmount) || 0);

    // אישור לתשלום מעל 500 שח
    if (totalAmount > 500) {
      setShowConfirmDialog(true);
      return;
    }

    executePayment();
  };

  const executePayment = async () => {
    setShowConfirmDialog(false);
    setIsLoading(true);
    try {
      let amountToPay = Number(totalDebt) || 0;
      let creditUsed = 0;

      if (paymentMode === "PARTIAL") {
        amountToPay = parseFloat(partialAmount) || 0;
        if (amountToPay <= 0 || amountToPay > totalDebt) {
          toast.error("סכום חלקי לא תקין");
          setIsLoading(false);
          return;
        }
      }

      // חישוב שימוש בקרדיט
      if (useCredit && safeCredit > 0) {
        creditUsed = Math.min(amountToPay, safeCredit);
        amountToPay = amountToPay - creditUsed;
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
          totalAmount: amountToPay + creditUsed, // Total amount including credit
          method,
          paymentMode,
          creditUsed, // Amount paid from credit
          issueReceipt: businessType !== "NONE" && issueReceipt,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Failed to process payment");
      }

      let successMessage = "";
      if (creditUsed > 0 && amountToPay > 0) {
        successMessage = `בוצע תשלום של ₪${amountToPay.toFixed(0)} + קרדיט ₪${creditUsed.toFixed(0)}`;
      } else if (creditUsed > 0) {
        successMessage = `בוצע תשלום מקרדיט ₪${creditUsed.toFixed(0)}`;
      } else {
        successMessage = paymentMode === "PARTIAL" 
          ? `תשלום חלקי של ₪${amountToPay.toFixed(0)} בוצע בהצלחה`
          : "כל החובות שולמו בהצלחה";
      }
      
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

  const safeDebt = Number(totalDebt) || 0;
  const safeCredit = Number(creditBalance) || 0;

  if (safeDebt <= 0) {
    return null;
  }

  return (
    <>
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
                <span>סה״כ חוב</span>
                <span className="font-bold text-red-600 text-lg">₪{safeDebt.toFixed(0)}</span>
              </div>
              {safeCredit > 0 && (
                <Badge variant="secondary" className="w-full justify-between">
                  <span>קרדיט זמין</span>
                  <span className="font-bold">₪{safeCredit.toFixed(0)}</span>
                </Badge>
              )}
              <p className="text-xs text-muted-foreground">
                {unpaidPayments.length} תשלומים ממתינים
                {dateRange && ` | ${format(new Date(dateRange.from), "dd/MM")} - ${format(new Date(dateRange.to), "dd/MM")}`}
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* תיבת רישום תשלום */}
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
                    {paymentMode === "PARTIAL" && partialAmount 
                      ? `₪${partialAmount}` 
                      : `₪${safeDebt.toFixed(0)}`
                    }
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
                <div
                  className="flex items-center gap-3 py-2 px-3 bg-sky-50 rounded-lg border border-sky-200"
                  onClick={(e) => e.stopPropagation()}
                  onPointerDown={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <Checkbox
                    id="issue-receipt-debts"
                    checked={issueReceipt}
                    onCheckedChange={(checked) => {
                      setIssueReceipt(checked === true);
                    }}
                    disabled={receiptMode === "ALWAYS"}
                  />
                  <Label htmlFor="issue-receipt-debts" className="cursor-pointer flex items-center gap-2 text-sky-800">
                    <FileText className="h-4 w-4" />
                    הוצא קבלה
                    {receiptMode === "ALWAYS" && (
                      <span className="text-xs text-sky-600">(ברירת מחדל)</span>
                    )}
                  </Label>
                </div>
              )}

              {/* כפתור אופציות מתקדמות */}
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
                        id="partial-payment-debts"
                        checked={paymentMode === "PARTIAL"}
                        onChange={(e) => {
                          setPaymentMode(e.target.checked ? "PARTIAL" : "FULL");
                          if (!e.target.checked) setPartialAmount("");
                        }}
                        className="h-4 w-4"
                      />
                      <Label htmlFor="partial-payment-debts" className="cursor-pointer">
                        תשלום חלקי
                      </Label>
                    </div>
                    
                    {paymentMode === "PARTIAL" && (
                      <div className="space-y-2 pr-6">
                        <Label htmlFor="partial-amount-debts" className="text-sm">סכום לתשלום</Label>
                        <div className="relative">
                          <Input
                            id="partial-amount-debts"
                            type="number"
                            placeholder="הזן סכום"
                            value={partialAmount}
                            onChange={(e) => setPartialAmount(e.target.value)}
                            max={safeDebt}
                            min={0}
                            step="1"
                            className="pl-8 bg-white"
                          />
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                            ₪
                          </span>
                        </div>
                        {partialAmount && parseFloat(partialAmount) < safeDebt && parseFloat(partialAmount) > 0 && (
                          <p className="text-xs text-muted-foreground">
                            נותר: ₪{(safeDebt - parseFloat(partialAmount)).toFixed(0)}
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  {/* שימוש בקרדיט */}
                  {safeCredit > 0 && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="use-credit-debts"
                          checked={useCredit}
                          onChange={(e) => setUseCredit(e.target.checked)}
                          className="h-4 w-4"
                        />
                        <Label htmlFor="use-credit-debts" className="cursor-pointer">
                          השתמש בקרדיט (זמין: ₪{safeCredit.toFixed(0)})
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
          >
            ביטול
          </Button>
          <Button
            onClick={handlePaymentClick}
            disabled={isLoading || (paymentMode === "PARTIAL" && (!partialAmount || parseFloat(partialAmount) <= 0))}
            className="gap-2 bg-green-600 hover:bg-green-700"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                מתבצע...
              </>
            ) : (
              <>
                <Check className="h-4 w-4" />
                {(() => {
                  const totalAmount = paymentMode === "FULL" ? safeDebt : (parseFloat(partialAmount) || 0);
                  const creditToUse = useCredit ? Math.min(totalAmount, safeCredit) : 0;
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
      </DialogContent>
    </Dialog>

    {/* אישור תשלום */}
    <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>אישור תשלום</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>האם לבצע את התשלום הבא?</p>
              <div className="bg-slate-50 rounded-lg p-3 space-y-1 text-sm">
                <div className="flex justify-between">
                  <span>מטופל:</span>
                  <span className="font-medium">{clientName}</span>
                </div>
                <div className="flex justify-between">
                  <span>סכום:</span>
                  <span className="font-bold text-lg">₪{paymentMode === "FULL" ? safeDebt.toFixed(0) : (parseFloat(partialAmount) || 0).toFixed(0)}</span>
                </div>
                <div className="flex justify-between">
                  <span>אמצעי תשלום:</span>
                  <span>{METHOD_LABELS[method] || method}</span>
                </div>
                <div className="flex justify-between">
                  <span>פגישות:</span>
                  <span>{unpaidPayments.length}</span>
                </div>
                {useCredit && safeCredit > 0 && (
                  <div className="flex justify-between text-green-600">
                    <span>קרדיט:</span>
                    <span>₪{Math.min(paymentMode === "FULL" ? safeDebt : (parseFloat(partialAmount) || 0), safeCredit).toFixed(0)}</span>
                  </div>
                )}
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isLoading}>ביטול</AlertDialogCancel>
          <AlertDialogAction
            onClick={executePayment}
            disabled={isLoading}
            className="bg-green-600 hover:bg-green-700"
          >
            {isLoading ? "מעבד..." : "אישור תשלום"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
