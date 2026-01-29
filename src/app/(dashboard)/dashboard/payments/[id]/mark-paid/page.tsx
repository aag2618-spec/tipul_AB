"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowRight, Loader2, Check, ChevronDown, CreditCard, Wallet } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface Payment {
  id: string;
  amount: string;
  expectedAmount: string;
  method: string;
  status: string;
  notes: string | null;
  createdAt: string;
  client: { id: string; name: string; creditBalance: number };
}

interface ClientDebtInfo {
  totalDebt: number;
  unpaidSessionsCount: number;
  creditBalance: number;
}

export default function MarkPaidPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const [payment, setPayment] = useState<Payment | null>(null);
  const [clientDebt, setClientDebt] = useState<ClientDebtInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [method, setMethod] = useState("CASH");
  const [paymentMode, setPaymentMode] = useState<"FULL" | "PARTIAL">("FULL");
  const [partialAmount, setPartialAmount] = useState<string>("");
  const [useCredit, setUseCredit] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    const fetchPayment = async () => {
      try {
        const response = await fetch(`/api/payments/${id}`);
        if (response.ok) {
          const data = await response.json();
          setPayment(data);
          setMethod(data.method);
          
          // Fetch client's total debt info
          if (data.client?.id) {
            const debtResponse = await fetch(`/api/payments/client-debt/${data.client.id}`);
            if (debtResponse.ok) {
              const debtData = await debtResponse.json();
              setClientDebt({
                totalDebt: debtData.totalDebt,
                unpaidSessionsCount: debtData.unpaidSessions.length,
                creditBalance: debtData.creditBalance || 0
              });
            }
          }
        }
      } catch (error) {
        console.error("Failed to fetch payment:", error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchPayment();
  }, [id]);

  const handleMarkPaid = async () => {
    if (!payment) return;
    
    const debtAmount = Number(payment.expectedAmount) - Number(payment.amount);
    let amountToPay = paymentMode === "FULL" ? debtAmount : (parseFloat(partialAmount) || 0);
    
    if (paymentMode === "PARTIAL" && (amountToPay <= 0 || amountToPay > debtAmount)) {
      toast.error("סכום חלקי לא תקין");
      return;
    }

    const safeCredit = Number(payment.client.creditBalance) || 0;
    let creditUsed = 0;
    
    if (useCredit && safeCredit > 0) {
      creditUsed = Math.min(amountToPay, safeCredit);
      amountToPay = amountToPay - creditUsed;
    }

    // Confirmation for large amounts
    if (amountToPay > 1000 && method === "CASH") {
      const confirmed = window.confirm(
        `האם אתה בטוח שברצונך לרשום תשלום של ₪${amountToPay.toFixed(0)} במזומן?`
      );
      if (!confirmed) {
        return;
      }
    }

    setIsSaving(true);

    try {
      const response = await fetch(`/api/payments/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: paymentMode === "FULL" ? "PAID" : "PENDING",
          method,
          paidAt: new Date().toISOString(),
          amount: Number(payment.amount) + amountToPay + creditUsed,
          paymentMode,
          creditUsed,
        }),
      });

      if (!response.ok) {
        throw new Error("שגיאה בעדכון");
      }

      let successMessage = "";
      if (creditUsed > 0 && amountToPay > 0) {
        successMessage = `נרשם תשלום של ₪${amountToPay.toFixed(0)} + קרדיט ₪${creditUsed.toFixed(0)}`;
      } else if (creditUsed > 0) {
        successMessage = `נרשם תשלום מקרדיט ₪${creditUsed.toFixed(0)}`;
      } else {
        successMessage = paymentMode === "PARTIAL" 
          ? `תשלום חלקי של ₪${amountToPay.toFixed(0)} נרשם בהצלחה`
          : "התשלום סומן כשולם";
      }

      toast.success(successMessage);
      router.push("/dashboard/payments");
    } catch (error) {
      console.error("Update error:", error);
      toast.error("אירעה שגיאה בעדכון");
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="h-[50vh] flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!payment) {
    return (
      <div className="h-[50vh] flex items-center justify-center">
        <p className="text-muted-foreground">תשלום לא נמצא</p>
      </div>
    );
  }

  if (!payment) return null;

  const debtAmount = Number(payment.expectedAmount) - Number(payment.amount);
  const safeCredit = Number(payment.client.creditBalance) || 0;

  return (
    <div className="space-y-6 animate-fade-in max-w-lg mx-auto">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link href="/dashboard/payments">
            <ArrowRight className="h-5 w-5" />
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <CreditCard className="h-6 w-6" />
            תשלום חובות - {payment.client.name}
          </h1>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>סמן כשולם</CardTitle>
          <CardDescription>
            <div className="space-y-2 mt-2">
              <div className="flex items-center justify-between">
                <span>סה״כ חוב:</span>
                <span className="font-bold text-red-600 text-lg">₪{debtAmount.toFixed(0)}</span>
              </div>
              {safeCredit > 0 && (
                <Badge variant="secondary" className="w-full justify-between">
                  <span>קרדיט זמין:</span>
                  <span className="font-bold">₪{safeCredit.toFixed(0)}</span>
                </Badge>
              )}
              <p className="text-xs text-muted-foreground">
                1 תשלומים ממתינים
              </p>
            </div>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
                      : `₪${debtAmount.toFixed(0)}`
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
                    <SelectItem value="CREDIT_CARD">אשראי</SelectItem>
                    <SelectItem value="BANK_TRANSFER">העברה בנקאית</SelectItem>
                    <SelectItem value="CHECK">צ׳ק</SelectItem>
                    <SelectItem value="OTHER">אחר</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* כפתור אופציות מתקדמות */}
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
                        id="partial-payment"
                        checked={paymentMode === "PARTIAL"}
                        onChange={(e) => {
                          setPaymentMode(e.target.checked ? "PARTIAL" : "FULL");
                          if (!e.target.checked) setPartialAmount("");
                        }}
                        className="h-4 w-4"
                      />
                      <Label htmlFor="partial-payment" className="cursor-pointer">
                        תשלום חלקי
                      </Label>
                    </div>
                    
                    {paymentMode === "PARTIAL" && (
                      <div className="space-y-2 pr-6">
                        <Label htmlFor="partial-amount" className="text-sm">סכום לתשלום</Label>
                        <div className="relative">
                          <Input
                            id="partial-amount"
                            type="number"
                            placeholder="הכנס סכום"
                            value={partialAmount}
                            onChange={(e) => setPartialAmount(e.target.value)}
                            max={debtAmount}
                            min={0}
                            step="1"
                            className="pl-8 bg-white"
                          />
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
                            ₪
                          </span>
                        </div>
                        {partialAmount && parseFloat(partialAmount) < debtAmount && parseFloat(partialAmount) > 0 && (
                          <p className="text-xs text-muted-foreground">
                            נותר לתשלום: ₪{(debtAmount - parseFloat(partialAmount)).toFixed(0)}
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
                          id="use-credit"
                          checked={useCredit}
                          onChange={(e) => setUseCredit(e.target.checked)}
                          className="h-4 w-4"
                        />
                        <Label htmlFor="use-credit" className="cursor-pointer">
                          השתמש בקרדיט (זמין: ₪{safeCredit.toFixed(0)})
                        </Label>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <Button variant="outline" onClick={() => router.back()} disabled={isSaving}>
              ביטול
            </Button>
            <Button 
              onClick={handleMarkPaid} 
              disabled={isSaving || (paymentMode === "PARTIAL" && (!partialAmount || parseFloat(partialAmount) <= 0))}
              className="flex-1 gap-2 bg-green-600 hover:bg-green-700"
            >
              {isSaving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  מעבד...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4" />
                  {(() => {
                    const totalAmount = paymentMode === "FULL" ? debtAmount : (parseFloat(partialAmount) || 0);
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
          </div>

          {/* Show "Pay All Debt" button only if there are additional unpaid sessions */}
          {clientDebt && clientDebt.unpaidSessionsCount > 1 && (
            <div className="pt-4 border-t mt-4">
              <p className="text-sm text-muted-foreground mb-3">
                למטופל יש עוד {clientDebt.unpaidSessionsCount - 1} פגישות ממתינות לתשלום
                (סה"כ חוב: ₪{clientDebt.totalDebt.toFixed(0)})
              </p>
              <Button 
                variant="outline" 
                className="w-full gap-2" 
                asChild
              >
                <Link href={`/dashboard/payments/pay/${payment.client.id}`}>
                  <Wallet className="h-4 w-4" />
                  שלם את כל החוב
                </Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}







