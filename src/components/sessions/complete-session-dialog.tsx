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
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckCircle, Loader2, FileText, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

// New interface with session object
interface NewCompleteSessionDialogProps {
  session: {
    id: string;
    startTime: string;
    endTime: string;
    price: number;
    client: {
      id: string;
      name: string;
      creditBalance?: number;
    } | null;
  };
  onSuccess?: () => void;
  buttonText?: string;
}

// Legacy interface with individual props
interface LegacyCompleteSessionDialogProps {
  sessionId: string;
  clientId: string;
  clientName: string;
  sessionDate: string;
  defaultAmount: number;
  creditBalance?: number;
  hasNote?: boolean;
  hasPayment?: boolean;
  buttonText?: string;
}

type CompleteSessionDialogProps = NewCompleteSessionDialogProps | LegacyCompleteSessionDialogProps;

export function CompleteSessionDialog(props: CompleteSessionDialogProps) {
  // Support both new and legacy props
  const session = 'session' in props ? props.session : undefined;
  const onSuccess = 'onSuccess' in props ? props.onSuccess : undefined;
  const sessionId = session?.id || ('sessionId' in props ? props.sessionId : "");
  const clientId = session?.client?.id || ('clientId' in props ? props.clientId : "");
  const clientName = session?.client?.name || ('clientName' in props ? props.clientName : "");
  const sessionDate = session ? new Date(session.startTime).toLocaleString("he-IL") : ('sessionDate' in props ? props.sessionDate : "");
  const defaultAmount = session?.price || ('defaultAmount' in props ? props.defaultAmount : 0);
  const creditBalance = session?.client?.creditBalance || ('creditBalance' in props ? props.creditBalance || 0 : 0);
  const hasNote = 'hasNote' in props ? props.hasNote || false : false;
  const hasPayment = 'hasPayment' in props ? props.hasPayment || false : false;
  const buttonText = props.buttonText || "סיים מפגש";

  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [summary, setSummary] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<string>("CASH");
  const [amount, setAmount] = useState(defaultAmount.toString());
  const [includePayment, setIncludePayment] = useState(!hasPayment);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [paymentType, setPaymentType] = useState<"FULL" | "PARTIAL" | "ADVANCE" | "CREDIT">("FULL");
  const [partialAmount, setPartialAmount] = useState<string>("");
  const [issueReceipt, setIssueReceipt] = useState<boolean>(false);
  const [receiptMode, setReceiptMode] = useState<"ALWAYS" | "ASK" | "NEVER">("ASK");
  const [businessType, setBusinessType] = useState<"NONE" | "EXEMPT" | "LICENSED">("NONE");
  const router = useRouter();

  useEffect(() => {
    if (isOpen) {
      fetch("/api/user/business-settings")
        .then((res) => res.json())
        .then((data) => {
          if (data.businessType) setBusinessType(data.businessType);
          if (data.receiptDefaultMode) setReceiptMode(data.receiptDefaultMode);
          if (data.receiptDefaultMode === "ALWAYS") setIssueReceipt(true);
          else if (data.receiptDefaultMode === "NEVER") setIssueReceipt(false);
        })
        .catch(() => {});
    }
  }, [isOpen]);

  const handleComplete = async () => {
    setIsLoading(true);
    try {
      let actualAmount = parseFloat(amount);
      let actualPaymentType: "FULL" | "PARTIAL" | "ADVANCE" = "FULL";
      let creditToUse = 0;

      if (paymentType === "PARTIAL") {
        actualAmount = parseFloat(partialAmount) || 0;
        actualPaymentType = "PARTIAL";
        if (actualAmount <= 0 || actualAmount > defaultAmount) {
          toast.error("סכום חלקי לא תקין");
          setIsLoading(false);
          return;
        }
      } else if (paymentType === "CREDIT") {
        if (creditBalance < defaultAmount) {
          toast.error("אין מספיק קרדיט");
          setIsLoading(false);
          return;
        }
        creditToUse = actualAmount;
      } else if (paymentType === "ADVANCE") {
        actualPaymentType = "ADVANCE";
        actualAmount = parseFloat(partialAmount) || 0;
      }

      // Step 1: Create payment first (with receipt)
      const paymentRes = await fetch("/api/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId,
          sessionId: paymentType === "ADVANCE" ? null : sessionId,
          amount: actualAmount,
          expectedAmount: paymentType === "PARTIAL" ? defaultAmount : undefined,
          paymentType: actualPaymentType,
          method: paymentType === "CREDIT" ? "CREDIT" : paymentMethod,
          status: paymentType === "PARTIAL" ? undefined : "PAID",
          issueReceipt: businessType !== "NONE" && issueReceipt,
          creditUsed: creditToUse > 0 ? creditToUse : undefined,
        }),
      });

      if (!paymentRes.ok) throw new Error("Payment failed");
      const paymentResult = await paymentRes.json();

      // Step 2: Update session status (payment already exists, session PUT will find it and skip)
      await fetch(`/api/sessions/${sessionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "COMPLETED" }),
      });

      if (paymentResult?.receiptError) {
        toast.error(`שגיאה בהפקת קבלה: ${paymentResult.receiptError}`, { duration: 8000 });
      }

      toast.success("המפגש הושלם בהצלחה!");
      setIsOpen(false);
      setSummary("");
      setShowAdvanced(false);
      setPaymentType("FULL");
      setPartialAmount("");
      
      // Call onSuccess callback if provided, otherwise navigate
      if (onSuccess) {
        onSuccess();
      } else {
        router.push(`/dashboard/sessions/${sessionId}`);
      }
    } catch (error) {
      toast.error("שגיאה בסיום המפגש");
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
          {buttonText}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-primary" />
            סיום מפגש - {clientName}
          </DialogTitle>
          <DialogDescription>
            <div>{sessionDate}</div>
            {creditBalance > 0 && (
              <Badge variant="secondary" className="mt-1">
                קרדיט זמין: ₪{creditBalance}
              </Badge>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* כפתור סיום ללא תשלום */}
          <div className="space-y-2">
            <Button
              variant="outline"
              className="w-full font-bold text-base"
              onClick={async () => {
                setIsLoading(true);
                try {
                  await fetch(`/api/sessions/${sessionId}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ status: "COMPLETED" }),
                  });
                  toast.success("המפגש הושלם ללא תשלום");
                  setIsOpen(false);
                  
                  // Call onSuccess callback if provided, otherwise navigate
                  if (onSuccess) {
                    onSuccess();
                  } else {
                    router.push(`/dashboard/sessions/${sessionId}`);
                  }
                } catch {
                  toast.error("שגיאה בסיום המפגש");
                } finally {
                  setIsLoading(false);
                }
              }}
              disabled={isLoading}
            >
              סיום ללא תשלום
            </Button>
          </div>

          {/* תשלום */}
          {!hasPayment && (
            <div className="space-y-3 p-4 rounded-lg border bg-muted/30">
              <div className="flex items-center justify-between">
                <Label className="text-lg font-bold">סיום ותשלום 💰</Label>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="amount">סכום</Label>
                  <div className="relative">
                    <Input
                      id="amount"
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="pl-8"
                      disabled={paymentType !== "FULL"}
                    />
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                      ₪
                    </span>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="method">אמצעי תשלום</Label>
                  <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CASH">מזומן</SelectItem>
                      <SelectItem value="CREDIT_CARD">אשראי</SelectItem>
                      <SelectItem value="BANK_TRANSFER">העברה</SelectItem>
                      <SelectItem value="CHECK">צ׳ק</SelectItem>
                      <SelectItem value="OTHER">אחר</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* הוצאת קבלה */}
              {businessType !== "NONE" && receiptMode !== "NEVER" && (
                <div className="flex items-center gap-3 py-2 px-3 bg-sky-50 rounded-lg border border-sky-200">
                  <Checkbox
                    id="issue-receipt-complete"
                    checked={issueReceipt}
                    onCheckedChange={(checked) => setIssueReceipt(checked === true)}
                    disabled={receiptMode === "ALWAYS"}
                  />
                  <Label htmlFor="issue-receipt-complete" className="cursor-pointer flex items-center gap-2 text-sky-800">
                    <FileText className="h-4 w-4" />
                    הוצא קבלה
                    {receiptMode === "ALWAYS" && (
                      <span className="text-xs text-sky-600">(ברירת מחדל)</span>
                    )}
                  </Label>
                </div>
              )}

              {/* Advanced Options */}
              <div className="space-y-3">
                <Button 
                  type="button"
                  variant="ghost" 
                  size="sm" 
                  className="w-full justify-between font-semibold"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                >
                  <span className="font-bold">אופציות מתקדמות</span>
                  {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                </Button>
                    {showAdvanced && (
                      <div className="space-y-2 pt-2">
                        <div className="grid gap-2">
                          <Button
                            type="button"
                            variant={paymentType === "FULL" ? "default" : "outline"}
                            size="sm"
                            onClick={() => setPaymentType("FULL")}
                          >
                            תשלום מלא (₪{defaultAmount})
                          </Button>
                          
                          {creditBalance >= defaultAmount && (
                            <Button
                              type="button"
                              variant={paymentType === "CREDIT" ? "default" : "outline"}
                              size="sm"
                              onClick={() => setPaymentType("CREDIT")}
                            >
                              משיכה מקרדיט (₪{creditBalance} זמין)
                            </Button>
                          )}
                          
                          <Button
                            type="button"
                            variant={paymentType === "PARTIAL" ? "default" : "outline"}
                            size="sm"
                            onClick={() => setPaymentType("PARTIAL")}
                          >
                            תשלום חלקי
                          </Button>
                          
                          {paymentType === "PARTIAL" && (
                            <div className="pr-4 space-y-1">
                              <Input
                                type="number"
                                placeholder="הכנס סכום"
                                value={partialAmount}
                                onChange={(e) => setPartialAmount(e.target.value)}
                                max={defaultAmount}
                                min={0}
                                step="0.01"
                              />
                              {partialAmount && parseFloat(partialAmount) < defaultAmount && (
                                <p className="text-xs text-muted-foreground">
                                  נותר לתשלום: ₪{defaultAmount - parseFloat(partialAmount)}
                                </p>
                              )}
                            </div>
                          )}
                          
                          <Button
                            type="button"
                            variant={paymentType === "ADVANCE" ? "default" : "outline"}
                            size="sm"
                            onClick={() => setPaymentType("ADVANCE")}
                          >
                            תשלום מראש (הוספה לקרדיט)
                          </Button>
                          
                          {paymentType === "ADVANCE" && (
                            <div className="pr-4">
                              <Input
                                type="number"
                                placeholder="הכנס סכום לקרדיט"
                                value={partialAmount}
                                onChange={(e) => setPartialAmount(e.target.value)}
                                min={0}
                                step="0.01"
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

          {hasNote && (
            <p className="text-sm text-muted-foreground">
              ✓ למפגש זה כבר יש סיכום
            </p>
          )}

          {hasPayment && (
            <p className="text-sm text-muted-foreground">
              ✓ תשלום כבר נרשם למפגש זה
            </p>
          )}
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
          {!hasPayment && (
            <Button 
              onClick={handleComplete} 
              disabled={isLoading}
              className="gap-2 font-bold bg-green-600 hover:bg-green-700"
            >
              {isLoading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  שומר...
                </>
              ) : (
                <>
                  <CheckCircle className="h-4 w-4" />
                  סיום ושלם
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
