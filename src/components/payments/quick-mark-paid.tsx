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
import { CreditCard, Loader2, Check, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

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
}

export function QuickMarkPaid({
  sessionId,
  clientId,
  clientName,
  amount,
  creditBalance = 0,
  existingPayment,
  buttonText = "סמן כשולם",
}: QuickMarkPaidProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [method, setMethod] = useState<string>("CASH");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [paymentType, setPaymentType] = useState<"FULL" | "PARTIAL" | "ADVANCE" | "CREDIT">("FULL");
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
      let actualAmount = amount;
      let actualPaymentType: "FULL" | "PARTIAL" | "ADVANCE" = "FULL";
      let useCredit = false;

      if (paymentType === "PARTIAL") {
        actualAmount = parseFloat(partialAmount) || 0;
        actualPaymentType = "PARTIAL";
        if (actualAmount <= 0 || actualAmount > amount) {
          toast.error("סכום חלקי לא תקין");
          setIsLoading(false);
          return;
        }
      } else if (paymentType === "CREDIT") {
        if (creditBalance < amount) {
          toast.error("אין מספיק קרדיט");
          setIsLoading(false);
          return;
        }
        useCredit = true;
      }

      if (existingPayment) {
        // Update existing payment
        const response = await fetch(`/api/payments/${existingPayment.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: "PAID",
            method,
            paidAt: new Date().toISOString(),
            useCredit,
          }),
        });

        if (!response.ok) throw new Error("Failed to update payment");
      } else {
        // Create new payment and mark as paid
        const response = await fetch("/api/payments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientId,
            sessionId: paymentType === "ADVANCE" ? null : sessionId,
            amount: paymentType === "ADVANCE" ? parseFloat(partialAmount) || 0 : actualAmount,
            expectedAmount: paymentType === "PARTIAL" ? amount : undefined,
            paymentType: paymentType === "ADVANCE" ? "ADVANCE" : actualPaymentType,
            method,
            status: "PAID",
          }),
        });

        if (!response.ok) throw new Error("Failed to create payment");
      }

      const successMessage = 
        paymentType === "CREDIT" ? "התשלום נוכה מהקרדיט" :
        paymentType === "PARTIAL" ? "תשלום חלקי נרשם" :
        paymentType === "ADVANCE" ? "תשלום מראש נוסף לקרדיט" :
        "התשלום סומן כשולם";
      
      toast.success(successMessage);
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
          {/* תשלום */}
          <div className="space-y-3 p-4 rounded-lg border bg-muted/30">
            <div className="flex items-center justify-between">
              <Label className="text-lg font-bold">רישום תשלום 💰</Label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="amount-display">סכום</Label>
                <div className="relative">
                  <Input
                    id="amount-display"
                    type="number"
                    value={amount}
                    disabled
                    className="pl-8"
                  />
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                    ₪
                  </span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="method">אמצעי תשלום</Label>
                <Select value={method} onValueChange={setMethod}>
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

            {/* Advanced Options */}
            <Button 
              type="button"
              variant="ghost" 
              size="sm" 
              className="w-full justify-between"
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              <span>אופציות מתקדמות</span>
              {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
            {showAdvanced && (
              <div className="space-y-2 rounded-lg border p-3">
                <Label>סוג תשלום</Label>
                <div className="grid gap-2">
                  <Button
                    type="button"
                    variant={paymentType === "FULL" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setPaymentType("FULL")}
                    className="justify-start"
                  >
                    תשלום מלא (₪{amount})
                  </Button>
                  
                  {creditBalance >= amount && (
                    <Button
                      type="button"
                      variant={paymentType === "CREDIT" ? "default" : "outline"}
                      size="sm"
                      onClick={() => setPaymentType("CREDIT")}
                      className="justify-start"
                    >
                      משיכה מקרדיט (₪{creditBalance} זמין)
                    </Button>
                  )}
                  
                  <Button
                    type="button"
                    variant={paymentType === "PARTIAL" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setPaymentType("PARTIAL")}
                    className="justify-start"
                  >
                    תשלום חלקי
                  </Button>
                  
                  {paymentType === "PARTIAL" && (
                    <div className="pr-4">
                      <Input
                        type="number"
                        placeholder="הכנס סכום"
                        value={partialAmount}
                        onChange={(e) => setPartialAmount(e.target.value)}
                        max={amount}
                        min={0}
                        step="0.01"
                      />
                      {partialAmount && parseFloat(partialAmount) < amount && (
                        <p className="text-xs text-muted-foreground mt-1">
                          נותר לתשלום: ₪{amount - parseFloat(partialAmount)}
                        </p>
                      )}
                    </div>
                  )}
                  
                  <Button
                    type="button"
                    variant={paymentType === "ADVANCE" ? "default" : "outline"}
                    size="sm"
                    onClick={() => setPaymentType("ADVANCE")}
                    className="justify-start"
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
            disabled={isLoading}
            className="gap-2 font-bold bg-green-600 hover:bg-green-700"
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                מעדכן...
              </>
            ) : (
              <>
                <Check className="h-4 w-4" />
                {paymentType === "ADVANCE" ? "הוסף לקרדיט" : "סיום ושלם"}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
