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
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { CheckCircle, Loader2, FileText, ChevronDown, ChevronUp } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";

interface CompleteSessionDialogProps {
  sessionId: string;
  clientId: string;
  clientName: string;
  sessionDate: string;
  defaultAmount: number;
  creditBalance?: number;
  hasNote?: boolean;
  hasPayment?: boolean;
}

export function CompleteSessionDialog({
  sessionId,
  clientId,
  clientName,
  sessionDate,
  defaultAmount,
  creditBalance = 0,
  hasNote = false,
  hasPayment = false,
}: CompleteSessionDialogProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [summary, setSummary] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<string>("CASH");
  const [amount, setAmount] = useState(defaultAmount.toString());
  const [includePayment, setIncludePayment] = useState(!hasPayment);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [paymentType, setPaymentType] = useState<"FULL" | "PARTIAL" | "ADVANCE" | "CREDIT">("FULL");
  const [partialAmount, setPartialAmount] = useState<string>("");
  const router = useRouter();

  const handleComplete = async () => {
    setIsLoading(true);
    try {
      const updates: any[] = [];

      // הוסף סיכום אם נכתב
      if (summary.trim() && !hasNote) {
        updates.push(
          fetch("/api/sessions/notes", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              sessionId,
              content: summary,
            }),
          })
        );
      }

      // הוסף תשלום אם נבחר
      if (includePayment && !hasPayment) {
        let actualAmount = parseFloat(amount);
        let actualPaymentType: "FULL" | "PARTIAL" | "ADVANCE" = "FULL";
        let useCredit = false;

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
          useCredit = true;
        } else if (paymentType === "ADVANCE") {
          actualPaymentType = "ADVANCE";
          actualAmount = parseFloat(partialAmount) || 0;
        }

        updates.push(
          fetch("/api/payments", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              clientId,
              sessionId: paymentType === "ADVANCE" ? null : sessionId,
              amount: actualAmount,
              expectedAmount: paymentType === "PARTIAL" ? defaultAmount : undefined,
              paymentType: actualPaymentType,
              method: paymentMethod,
              status: "PAID",
            }),
          }).then(async (res) => {
            if (!res.ok) throw new Error("Payment failed");
            // If using credit, update payment
            if (useCredit) {
              const paymentData = await res.json();
              return fetch(`/api/payments/${paymentData.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  status: "PAID",
                  useCredit: true,
                }),
              });
            }
            return res;
          })
        );
      }

      // עדכן סטטוס המפגש להושלם
      updates.push(
        fetch(`/api/sessions/${sessionId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            status: "COMPLETED",
          }),
        })
      );

      await Promise.all(updates);

      toast.success("המפגש הושלם בהצלחה!");
      setIsOpen(false);
      setSummary("");
      setShowAdvanced(false);
      setPaymentType("FULL");
      setPartialAmount("");
      router.refresh();
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
          <CheckCircle className="h-3 w-3" />
          סיים מפגש
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
          {/* סיכום */}
          {!hasNote && (
            <div className="space-y-2">
              <Label htmlFor="summary" className="flex items-center gap-2">
                <FileText className="h-4 w-4" />
                סיכום מפגש (אופציונלי)
              </Label>
              <Textarea
                id="summary"
                value={summary}
                onChange={(e) => setSummary(e.target.value)}
                placeholder="סכם את המפגש בקצרה..."
                rows={4}
                className="resize-none"
              />
            </div>
          )}

          {/* תשלום */}
          {!hasPayment && (
            <div className="space-y-3 p-4 rounded-lg border bg-muted/30">
              <div className="flex items-center justify-between">
                <Label className="text-base font-medium">💰 תשלום</Label>
                <Button
                  variant={includePayment ? "default" : "outline"}
                  size="sm"
                  onClick={() => setIncludePayment(!includePayment)}
                >
                  {includePayment ? "כולל תשלום" : "ללא תשלום"}
                </Button>
              </div>

              {includePayment && (
                <>
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

                  {/* Advanced Options */}
                  <div className="space-y-3">
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
                </>
              )}
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

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setIsOpen(false)}
            disabled={isLoading}
          >
            ביטול
          </Button>
          <Button onClick={handleComplete} disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                שומר...
              </>
            ) : (
              <>
                <CheckCircle className="ml-2 h-4 w-4" />
                סיים והשלם
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
