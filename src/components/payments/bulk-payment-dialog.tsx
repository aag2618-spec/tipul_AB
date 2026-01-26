"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle, AlertCircle, Info } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

interface UnpaidSession {
  paymentId: string;
  amount: number;
  date: Date;
  sessionId: string | null;
}

interface ClientDebt {
  id: string;
  firstName: string;
  lastName: string;
  fullName: string;
  totalDebt: number;
  creditBalance: number;
  unpaidSessionsCount: number;
  unpaidSessions: UnpaidSession[];
}

interface BulkPaymentDialogProps {
  client: ClientDebt;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function BulkPaymentDialog({
  client,
  open,
  onClose,
  onSuccess,
}: BulkPaymentDialogProps) {
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [notes, setNotes] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [paymentPreview, setPaymentPreview] = useState<Array<{
    date: string;
    amount: number;
    status: "full" | "partial" | "none";
    remaining?: number;
  }>>([]);

  useEffect(() => {
    if (paymentAmount) {
      calculatePaymentDistribution();
    } else {
      setPaymentPreview([]);
    }
  }, [paymentAmount, client.unpaidSessions]);

  const calculatePaymentDistribution = () => {
    const amount = parseFloat(paymentAmount) || 0;
    if (amount <= 0) {
      setPaymentPreview([]);
      return;
    }

    let remaining = amount;
    const preview: typeof paymentPreview = [];

    const sortedSessions = [...client.unpaidSessions].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    for (const session of sortedSessions) {
      if (remaining <= 0) {
        preview.push({
          date: format(new Date(session.date), "dd/MM/yyyy"),
          amount: 0,
          status: "none",
        });
        continue;
      }

      const sessionAmount = session.amount;
      const payAmount = Math.min(remaining, sessionAmount);

      if (payAmount >= sessionAmount) {
        preview.push({
          date: format(new Date(session.date), "dd/MM/yyyy"),
          amount: payAmount,
          status: "full",
        });
      } else {
        preview.push({
          date: format(new Date(session.date), "dd/MM/yyyy"),
          amount: payAmount,
          status: "partial",
          remaining: sessionAmount - payAmount,
        });
      }

      remaining -= payAmount;
    }

    setPaymentPreview(preview);
  };

  const handlePayAll = () => {
    setPaymentAmount(client.totalDebt.toString());
  };

  const handleSubmit = async () => {
    const amount = parseFloat(paymentAmount);
    
    if (!amount || amount <= 0) {
      toast.error("נא להזין סכום תקין");
      return;
    }

    if (amount > client.totalDebt && paymentMethod !== "CREDIT") {
      toast.error(`הסכום גבוה מהחוב הכולל (₪${client.totalDebt})`);
      return;
    }

    if (paymentMethod === "CREDIT" && amount > client.creditBalance) {
      toast.error(`קרדיט לא מספיק. זמין: ₪${client.creditBalance}`);
      return;
    }

    try {
      setIsProcessing(true);

      const response = await fetch("/api/payments/bulk-payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientId: client.id,
          amount,
          method: paymentMethod,
          notes,
          useCredit: paymentMethod === "CREDIT",
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || "שגיאה בעיבוד התשלום");
      }

      toast.success(data.message);
      onSuccess();
    } catch (error) {
      console.error("Payment error:", error);
      toast.error(error instanceof Error ? error.message : "שגיאה בעיבוד התשלום");
    } finally {
      setIsProcessing(false);
    }
  };

  const canUseCredit = client.creditBalance > 0;

  return (
    <Dialog open={open} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>פירוט ותשלום - {client.fullName}</DialogTitle>
          <DialogDescription>
            סה"כ חוב: ₪{client.totalDebt} | קרדיט זמין: ₪{client.creditBalance}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* Unpaid Sessions List */}
          <div>
            <h3 className="font-semibold mb-2">פגישות שטרם שולמו:</h3>
            <div className="space-y-2 max-h-40 overflow-y-auto border rounded-lg p-3 bg-muted/30">
              {client.unpaidSessions
                .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                .map((session, index) => (
                  <div
                    key={session.paymentId}
                    className="flex justify-between items-center text-sm"
                  >
                    <span className="text-muted-foreground">
                      {format(new Date(session.date), "dd/MM/yyyy")} - פגישה #{index + 1}
                    </span>
                    <Badge variant="outline">₪{session.amount}</Badge>
                  </div>
                ))}
            </div>
          </div>

          {/* Payment Form */}
          <div className="space-y-4">
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <Label htmlFor="amount">סכום לתשלום</Label>
                <Input
                  id="amount"
                  type="number"
                  placeholder="0"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  disabled={isProcessing}
                />
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={handlePayAll}
                disabled={isProcessing}
              >
                שלם הכל - ₪{client.totalDebt}
              </Button>
            </div>

            <div>
              <Label>אמצעי תשלום</Label>
              <RadioGroup
                value={paymentMethod}
                onValueChange={setPaymentMethod}
                disabled={isProcessing}
                className="grid grid-cols-2 gap-3 mt-2"
              >
                <div className="flex items-center space-x-2 border rounded-lg p-3 cursor-pointer hover:bg-muted">
                  <RadioGroupItem value="CASH" id="cash" />
                  <Label htmlFor="cash" className="cursor-pointer flex-1">
                    מזומן
                  </Label>
                </div>
                <div className="flex items-center space-x-2 border rounded-lg p-3 cursor-pointer hover:bg-muted">
                  <RadioGroupItem value="BANK_TRANSFER" id="bank" />
                  <Label htmlFor="bank" className="cursor-pointer flex-1">
                    העברה בנקאית
                  </Label>
                </div>
                <div className="flex items-center space-x-2 border rounded-lg p-3 cursor-pointer hover:bg-muted">
                  <RadioGroupItem value="CREDIT_CARD" id="card" />
                  <Label htmlFor="card" className="cursor-pointer flex-1">
                    כרטיס אשראי
                  </Label>
                </div>
                <div className="flex items-center space-x-2 border rounded-lg p-3 cursor-pointer hover:bg-muted">
                  <RadioGroupItem value="CHECK" id="check" />
                  <Label htmlFor="check" className="cursor-pointer flex-1">
                    שיק
                  </Label>
                </div>
                <div
                  className={`flex items-center space-x-2 border rounded-lg p-3 ${
                    canUseCredit ? "cursor-pointer hover:bg-muted" : "opacity-50 cursor-not-allowed"
                  }`}
                >
                  <RadioGroupItem value="CREDIT" id="credit" disabled={!canUseCredit} />
                  <Label
                    htmlFor="credit"
                    className={`flex-1 ${canUseCredit ? "cursor-pointer" : "cursor-not-allowed"}`}
                  >
                    קרדיט (₪{client.creditBalance} זמין)
                  </Label>
                </div>
              </RadioGroup>
            </div>

            <div>
              <Label htmlFor="notes">הערות (אופציונלי)</Label>
              <Textarea
                id="notes"
                placeholder="הערות לתשלום..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={isProcessing}
                rows={2}
              />
            </div>
          </div>

          {/* Payment Preview */}
          {paymentPreview.length > 0 && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start gap-2 mb-3">
                <Info className="h-5 w-5 text-blue-600 mt-0.5" />
                <div>
                  <h4 className="font-semibold text-blue-900">
                    התשלום יחולק אוטומטית לפי סדר זמן:
                  </h4>
                </div>
              </div>
              <div className="space-y-1.5">
                {paymentPreview.map((preview, index) => (
                  <div key={index} className="flex items-center justify-between text-sm">
                    <span className="text-blue-900">
                      {preview.status === "full" && <CheckCircle className="h-4 w-4 inline ml-1 text-green-600" />}
                      {preview.status === "partial" && <AlertCircle className="h-4 w-4 inline ml-1 text-amber-600" />}
                      {preview.status === "none" && <span className="inline-block w-4 ml-1" />}
                      {preview.date}
                    </span>
                    <span className="font-medium text-blue-900">
                      {preview.status === "full" && `₪${preview.amount} (משולם במלואה)`}
                      {preview.status === "partial" &&
                        `₪${preview.amount} (חלקי - נותרו ₪${preview.remaining})`}
                      {preview.status === "none" && "₪0 (לא שולם)"}
                    </span>
                  </div>
                ))}
              </div>
              <div className="mt-3 pt-3 border-t border-blue-300">
                <div className="flex justify-between font-semibold text-blue-900">
                  <span>יתרת חוב לאחר תשלום:</span>
                  <span>₪{(client.totalDebt - parseFloat(paymentAmount || "0")).toFixed(0)}</span>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isProcessing}>
            בטל
          </Button>
          <Button onClick={handleSubmit} disabled={isProcessing || !paymentAmount}>
            {isProcessing && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
            אשר תשלום - ₪{paymentAmount || "0"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
