"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { CheckCircle2, Ban, UserX, Loader2, ChevronDown, ChevronUp, AlertCircle, Wallet, FileText, ArrowLeft } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";

export interface UpdateSessionDialogParams {
  updateStatus: string;
  showPayment: boolean;
  paymentMethod: string;
  paymentType: "FULL" | "PARTIAL";
  paymentAmount: string;
  partialAmount: string;
  issueReceipt: boolean;
  businessType: string;
  updateReason: string;
  noChargeReason: string;
}

export interface UpdateSessionDialogProps {
  open: boolean;
  sessionId: string;
  clientName: string;
  clientId: string;
  price: number;
  existingPaymentId?: string;
  updating: boolean;
  onClose: () => void;
  onUpdate: (params: UpdateSessionDialogParams) => Promise<void>;
  onRecordDebt: (params: { updateStatus: string; updateReason: string }) => Promise<void>;
}

export function UpdateSessionDialog({
  open,
  sessionId,
  clientName,
  clientId,
  price,
  existingPaymentId,
  updating,
  onClose,
  onUpdate,
  onRecordDebt,
}: UpdateSessionDialogProps) {
  const router = useRouter();
  const [updateStatus, setUpdateStatus] = useState<string>("");
  const [updateReason, setUpdateReason] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [showPayment, setShowPayment] = useState(true);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [paymentType, setPaymentType] = useState<"FULL" | "PARTIAL">("FULL");
  const [partialAmount, setPartialAmount] = useState("");
  const [noChargeReason, setNoChargeReason] = useState("");
  const [clientDebt, setClientDebt] = useState<{ total: number; count: number } | null>(null);
  const [issueReceipt, setIssueReceipt] = useState(false);
  const [receiptMode, setReceiptMode] = useState<string>("ASK");
  const [businessType, setBusinessType] = useState<string>("NONE");

  useEffect(() => {
    if (open && clientId) {
      fetch(`/api/payments/client-debt/${clientId}`)
        .then(res => res.json())
        .then(data => {
          setClientDebt({
            total: Number(data.totalDebt || 0),
            count: data.unpaidSessions?.length || 0,
          });
        })
        .catch(() => setClientDebt(null));
    } else {
      setClientDebt(null);
    }
  }, [open, clientId]);

  useEffect(() => {
    if (open) {
      fetch("/api/user/business-settings")
        .then(res => res.json())
        .then(data => {
          if (data.businessType) setBusinessType(data.businessType);
          if (data.receiptDefaultMode) setReceiptMode(data.receiptDefaultMode);
          if (data.receiptDefaultMode === "ALWAYS") setIssueReceipt(true);
          else if (data.receiptDefaultMode === "NEVER") setIssueReceipt(false);
        })
        .catch(() => {});
    }
  }, [open]);

  useEffect(() => {
    if (open) {
      setPaymentAmount(price ? price.toString() : "");
    }
  }, [open, price]);

  const resetAndClose = () => {
    setUpdateStatus("");
    setUpdateReason("");
    setPaymentAmount("");
    setShowPayment(true);
    setShowAdvanced(false);
    setPaymentType("FULL");
    setPartialAmount("");
    setNoChargeReason("");
    setIssueReceipt(false);
    onClose();
  };

  const handleUpdateClick = async () => {
    await onUpdate({
      updateStatus,
      showPayment,
      paymentMethod,
      paymentType,
      paymentAmount,
      partialAmount,
      issueReceipt,
      businessType,
      updateReason,
      noChargeReason,
    });
    resetAndClose();
  };

  const handleRecordDebtClick = async () => {
    await onRecordDebt({
      updateStatus,
      updateReason,
    });
    resetAndClose();
  };

  const handleFinishAndPayAll = async () => {
    await onRecordDebt({
      updateStatus,
      updateReason,
    });
    resetAndClose();
    router.push(`/dashboard/payments/pay/${clientId}`);
  };

  const hasOldDebts = clientDebt && clientDebt.count > 0 && clientDebt.total > 0;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) resetAndClose(); }}>
      <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-orange-500" />
            עדכון פגישה - {clientName}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">הפגישה לא עודכנה. מה קרה?</p>

          <div className="grid grid-cols-3 gap-2">
            <Button
              type="button"
              variant={updateStatus === "COMPLETED" ? "default" : "outline"}
              size="sm"
              className={`h-10 text-xs gap-1 ${updateStatus === "COMPLETED" ? "bg-emerald-600 hover:bg-emerald-700" : ""}`}
              onClick={() => { setUpdateStatus("COMPLETED"); setShowPayment(true); }}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              הושלמה
            </Button>
            <Button
              type="button"
              variant={updateStatus === "CANCELLED" ? "default" : "outline"}
              size="sm"
              className={`h-10 text-xs gap-1 ${updateStatus === "CANCELLED" ? "bg-red-500 hover:bg-red-600" : ""}`}
              onClick={() => { setUpdateStatus("CANCELLED"); setShowPayment(true); }}
            >
              <Ban className="h-3.5 w-3.5" />
              בוטלה
            </Button>
            <Button
              type="button"
              variant={updateStatus === "NO_SHOW" ? "default" : "outline"}
              size="sm"
              className={`h-10 text-xs gap-1 ${updateStatus === "NO_SHOW" ? "bg-amber-500 hover:bg-amber-600" : ""}`}
              onClick={() => { setUpdateStatus("NO_SHOW"); setShowPayment(true); }}
            >
              <UserX className="h-3.5 w-3.5" />
              לא הגיע
            </Button>
          </div>

          {updateStatus === "CANCELLED" && (
            <div className="space-y-2">
              <Label className="text-sm">סיבת ביטול (אופציונלי)</Label>
              <Textarea
                value={updateReason}
                onChange={e => setUpdateReason(e.target.value)}
                placeholder="לדוגמה: מחלה, בקשת מטופל..."
                className="resize-none h-16 bg-muted/20 border-muted-foreground/10 text-sm"
              />
            </div>
          )}

          {updateStatus && price > 0 && (
            <>
              {updateStatus !== "COMPLETED" && !hasOldDebts && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full font-bold text-base"
                  onClick={() => setShowPayment(false)}
                >
                  {updateStatus === "CANCELLED" ? "ביטול ללא חיוב" : "אי הגעה ללא חיוב"}
                </Button>
              )}

              {!showPayment && (
                <div className="space-y-2 p-3 rounded-lg border bg-orange-50/50 border-orange-200">
                  <Label className="text-sm text-orange-700">סיבה לאי חיוב (אופציונלי)</Label>
                  <Textarea
                    value={noChargeReason}
                    onChange={e => setNoChargeReason(e.target.value)}
                    placeholder="לדוגמה: סיכום מראש, פגישת היכרות, הסדר מיוחד..."
                    className="resize-none h-16 bg-white/80 border-orange-200 text-sm"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-xs text-sky-600"
                    onClick={() => setShowPayment(true)}
                  >
                    ← חזרה לתשלום
                  </Button>
                </div>
              )}

              {showPayment && hasOldDebts && (
                <div className="space-y-3 p-4 rounded-lg border bg-amber-50/50 border-amber-200">
                  <p className="text-sm text-center font-medium">
                    💡 למטופל זה יש {clientDebt!.count} פגישות שעדיין לא שולמו
                  </p>
                  <p className="text-sm text-center text-muted-foreground">
                    (סה״כ חוב: ₪{clientDebt!.total.toFixed(0)})
                  </p>
                  <div className="space-y-2 pt-2">
                    <Button
                      type="button"
                      className="w-full gap-2 font-bold bg-emerald-600 hover:bg-emerald-700"
                      onClick={handleFinishAndPayAll}
                      disabled={updating}
                    >
                      {updating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
                      סיים ועבור לתשלום הכל
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="w-full gap-2 border-amber-300 text-amber-700 hover:bg-amber-50"
                      onClick={handleRecordDebtClick}
                      disabled={updating}
                    >
                      {updating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
                      סיים ורשום כחוב
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="w-full gap-2 text-muted-foreground"
                      onClick={() => setUpdateStatus("")}
                    >
                      <ArrowLeft className="h-3 w-3" />
                      חזור
                    </Button>
                  </div>
                </div>
              )}

              {showPayment && !hasOldDebts && (
                <div className="space-y-3 p-4 rounded-lg border bg-muted/30">
                  <div className="flex items-center justify-between">
                    <Label className="text-lg font-bold">
                      {updateStatus === "COMPLETED" ? "עדכון ותשלום 💰" : updateStatus === "CANCELLED" ? "דמי ביטול 💰" : "חיוב אי הגעה 💰"}
                    </Label>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="update-amount">סכום</Label>
                      <div className="relative">
                        <Input
                          id="update-amount"
                          type="number"
                          value={paymentAmount}
                          onChange={e => setPaymentAmount(e.target.value)}
                          className="pl-8"
                          disabled={paymentType !== "FULL"}
                        />
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">₪</span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="update-method">אמצעי תשלום</Label>
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

                  {businessType !== "NONE" && receiptMode !== "NEVER" && (
                    <div className="flex items-center gap-3 py-2 px-3 bg-sky-50 rounded-lg border border-sky-200">
                      <Checkbox
                        id="update-issue-receipt"
                        checked={issueReceipt}
                        onCheckedChange={(checked) => setIssueReceipt(checked === true)}
                        disabled={receiptMode === "ALWAYS"}
                      />
                      <Label htmlFor="update-issue-receipt" className="cursor-pointer flex items-center gap-2 text-sky-800">
                        <FileText className="h-4 w-4" />
                        הוצא קבלה
                        {receiptMode === "ALWAYS" && (
                          <span className="text-xs text-sky-600">(ברירת מחדל)</span>
                        )}
                      </Label>
                    </div>
                  )}

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
                            תשלום מלא (₪{price})
                          </Button>
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
                                onChange={e => setPartialAmount(e.target.value)}
                                max={price}
                                min={0}
                                step="0.01"
                              />
                              {partialAmount && parseFloat(partialAmount) < price && (
                                <p className="text-xs text-muted-foreground">
                                  נותר לתשלום: ₪{price - parseFloat(partialAmount)}
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
        <DialogFooter className="flex flex-wrap gap-2 sm:gap-2">
          {/* כשיש חובות ישנים - הכפתורים כבר בתוך הלייאאוט למעלה */}
          {!(updateStatus && showPayment && hasOldDebts && price > 0) && (
            <>
              <Button
                variant="outline"
                onClick={resetAndClose}
                disabled={updating}
                className="font-medium"
              >
                ביטול
              </Button>
              {updateStatus && showPayment && price > 0 && (
                <Button
                  variant="outline"
                  className="gap-2 font-bold border-amber-300 text-amber-700 hover:bg-amber-50"
                  onClick={handleRecordDebtClick}
                  disabled={updating}
                >
                  {updating ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : <Wallet className="h-4 w-4 ml-1" />}
                  עדכון ורשום חוב
                </Button>
              )}
              {showPayment && price > 0 ? (
                <Button
                  onClick={handleUpdateClick}
                  disabled={updating || !updateStatus}
                  className="gap-2 font-bold bg-emerald-600 hover:bg-emerald-700"
                >
                  {updating ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                  {updateStatus === "COMPLETED" ? "עדכון ושלם" : updateStatus === "CANCELLED" ? "בטל וחייב" : updateStatus === "NO_SHOW" ? "עדכון וחייב" : "עדכון"}
                </Button>
              ) : (
                <Button
                  onClick={handleUpdateClick}
                  disabled={updating || !updateStatus}
                  className={
                    updateStatus === "COMPLETED" ? "bg-emerald-600 hover:bg-emerald-700" :
                    updateStatus === "CANCELLED" ? "bg-red-500 hover:bg-red-600" :
                    updateStatus === "NO_SHOW" ? "bg-amber-500 hover:bg-amber-600" : ""
                  }
                >
                  {updating ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : null}
                  עדכון
                </Button>
              )}
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
