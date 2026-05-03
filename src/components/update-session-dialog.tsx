"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
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
import { CheckCircle2, Ban, UserX, Loader2, ChevronDown, ChevronUp, AlertCircle, Wallet, FileText, ArrowLeft, CreditCard } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { ChargeCardcomDialog } from "@/components/payments/charge-cardcom-dialog";

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
  /**
   * נקרא כשהדיאלוג סיים להכין Payment לסליקת Cardcom והאב צריך לפתוח את
   * ה-ChargeCardcomDialog בעצמו. חיוני בעמודים שבהם הדיאלוג נטען בתנאי
   * (למשל calendar/page.tsx) ולכן יורד מה-DOM ברגע שקוראים ל-onClose() —
   * שם דיאלוג מקומי לא יוכל להיפתח. אם prop זה לא מועבר, נשתמש
   * בדיאלוג Cardcom מקומי כמו עד עכשיו.
   */
  onCardcomRequested?: (params: {
    paymentId: string;
    amount: number;
    clientName: string;
    clientId: string;
  }) => void;
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
  onCardcomRequested,
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
  // ── Cardcom intercept state ────────────────────────────────
  // נדלק כשהמשתמש בוחר אשראי. נסגרים כדי לפתוח את ChargeCardcomDialog.
  const [cardcomOpen, setCardcomOpen] = useState(false);
  const [cardcomPaymentId, setCardcomPaymentId] = useState<string | undefined>(undefined);
  const [cardcomAmount, setCardcomAmount] = useState<number>(0);
  const [routingToCardcom, setRoutingToCardcom] = useState(false);
  // CRITICAL: setRoutingToCardcom (state) הוא אסינכרוני — שני קליקים רצופים
  // יכולים שניהם לעבור את `if (routingToCardcom)` לפני שה-state מתעדכן.
  // useRef מתעדכן סינכרונית ⇒ בלוק אטומי אמיתי. בלעדיו, יש סיכון תיאורטי
  // ל-2 PUT/PATCH על אותה פגישה + 2 POST /api/payments (מוגן ברמת DB
  // ע"י Payment.sessionId @unique, אבל זה defense-in-depth ב-UI).
  const routingInFlightRef = useRef(false);

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
    // ── Cardcom intercept ───────────────────────────────────────
    // אם המשתמש בחר תשלום באשראי — חייבים לבצע סליקה אמיתית במקום
    // לרשום PAID ידנית. הזרימה: מעדכנים את סטטוס הפגישה (CANCELLED/NO_SHOW)
    // אם נדרש, יוצרים Payment ב-PENDING, פותחים את ChargeCardcomDialog. אחרי
    // הצלחת הסליקה ה-webhook יסמן את ה-Payment כ-PAID. אם נכשל, הפגישה
    // עדיין מעודכנת והחוב יישאר ל-pickup ידני.
    if (
      paymentMethod === "CREDIT_CARD" &&
      showPayment &&
      price > 0 &&
      updateStatus // סטטוס נבחר — אחרת לא נכון לפעול
    ) {
      // PARTIAL + Cardcom חסום זמנית: ה-webhook מסמן PAID בלי לבדוק
      // amount==expectedAmount, ולכן מצב חלקי+אשראי משאיר Payment ב-PAID
      // עם חוב מובלע — לא עקבי עם partial cash. נפתח לאחר תיקון מקיף.
      if (paymentType === "PARTIAL") {
        toast.error("תשלום חלקי באשראי טרם נתמך. בחרי תשלום מלא או אמצעי אחר.");
        return;
      }
      const amt = parseFloat(paymentAmount) || 0;
      if (amt <= 0) {
        toast.error("סכום לתשלום לא תקין");
        return;
      }
      // mutex סינכרוני — מונע race של שני קליקים בו-זמנית. לבדוק לפני
      // setRoutingToCardcom (שאסינכרוני).
      if (routingInFlightRef.current) {
        return;
      }
      routingInFlightRef.current = true;
      setRoutingToCardcom(true);
      try {
        // עדכון סטטוס תחילה — כדי שהפגישה תהיה מסונכרנת גם אם הסליקה נכשלת.
        // CRITICAL: בודקים response.ok — אחרת ניצור Payment על פגישה שלא עודכנה.
        if (updateStatus === "COMPLETED") {
          const sessRes = await fetch(`/api/sessions/${sessionId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "COMPLETED" }),
          });
          if (!sessRes.ok) {
            const err = await sessRes.json().catch(() => ({}));
            toast.error(err?.message || "עדכון סטטוס הפגישה נכשל");
            return;
          }
        } else if (updateStatus === "CANCELLED" || updateStatus === "NO_SHOW") {
          const statusBody: Record<string, unknown> = { status: updateStatus };
          if (updateReason.trim()) statusBody.cancellationReason = updateReason.trim();
          const sessRes = await fetch(`/api/sessions/${sessionId}/status`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(statusBody),
          });
          if (!sessRes.ok) {
            const err = await sessRes.json().catch(() => ({}));
            toast.error(err?.message || "עדכון סטטוס הפגישה נכשל");
            return;
          }
        }

        // יצירת Payment ב-PENDING — Cardcom יעדכן ל-PAID דרך webhook.
        const paymentRes = await fetch("/api/payments", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientId,
            sessionId,
            amount: amt,
            expectedAmount: amt,
            paymentType: "FULL",
            method: "CREDIT_CARD",
            status: "PENDING",
            // הקבלה תופק ע״י Cardcom Documents API ב-webhook.
            issueReceipt: false,
          }),
        });
        if (!paymentRes.ok) {
          const err = await paymentRes.json().catch(() => ({}));
          toast.error(err?.message || "יצירת רישום תשלום נכשלה");
          return;
        }
        const created = (await paymentRes.json()) as { id: string };

        // אם הוגדר callback מהאב — הוא יחזיק את ChargeCardcomDialog בעצמו
        // (חובה בעמודים שמשחררים את ה-UpdateSessionDialog מה-DOM ב-onClose,
        // למשל calendar/page.tsx). אחרת — נופלים ל-Dialog מקומי.
        if (onCardcomRequested) {
          onCardcomRequested({
            paymentId: created.id,
            amount: amt,
            clientName,
            clientId,
          });
          onClose();
        } else {
          setCardcomPaymentId(created.id);
          setCardcomAmount(amt);
          // לדיאלוג מקומי: סוגרים אבל ה-state מקומי שורד כי האב משאיר
          // את הקומפוננט mounted (today-session-card וכד׳).
          onClose();
          setTimeout(() => setCardcomOpen(true), 220);
        }
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "מעבר לסליקה נכשל");
      } finally {
        setRoutingToCardcom(false);
        routingInFlightRef.current = false;
      }
      return;
    }

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

  // אחרי תשלום מוצלח של Cardcom — רענון נתונים לאם.
  // נסמך על ה-onClose של הדיאלוג הראשי שכבר רץ; כאן רק להודיע למסך האב.
  const handleCardcomSuccess = async (): Promise<void> => {
    // ה-Cardcom webhook כבר עדכן את ה-Payment ל-PAID. צריך גם לרענן את
    // נתוני היומן כדי שהשינוי יופיע. אין לנו refetch ישיר, נשתמש ב-router.
    if (typeof window !== "undefined") {
      router.refresh();
    }
    setCardcomPaymentId(undefined);
    setCardcomAmount(0);
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
    toast.success("הפגישה עודכנה, מעבר לדף תשלום החובות...");
    router.push(`/dashboard/payments/pay/${clientId}`);
  };

  const hasOldDebts = clientDebt && clientDebt.count > 0 && clientDebt.total > 0;

  return (
    <>
    <Dialog open={open} onOpenChange={(o) => { if (!o) resetAndClose(); }}>
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-[550px] max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-orange-500" />
            עדכון פגישה - {clientName}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">הפגישה לא עודכנה. מה קרה?</p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
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
              אי הופעה
            </Button>
          </div>

          {(updateStatus === "CANCELLED" || updateStatus === "NO_SHOW") && (
            <div className="space-y-2">
              <Label className="text-sm">
                {updateStatus === "CANCELLED" ? "סיבת ביטול (אופציונלי)" : "סיבת אי הופעה (אופציונלי)"}
              </Label>
              <Textarea
                value={updateReason}
                onChange={e => setUpdateReason(e.target.value)}
                placeholder={updateStatus === "CANCELLED" ? "לדוגמה: מחלה, בקשת מטופל..." : "לדוגמה: לא ענה לטלפון, שכח..."}
                className="resize-none h-16 bg-muted/20 border-muted-foreground/10 text-sm"
              />
            </div>
          )}

          {updateStatus && price > 0 && (
            <>
              {updateStatus !== "COMPLETED" && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full font-bold text-base"
                  onClick={() => setShowPayment(false)}
                >
                  {updateStatus === "CANCELLED" ? "ביטול ללא חיוב" : "אי הופעה ללא חיוב"}
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
                      {updateStatus === "COMPLETED" ? "עדכון ותשלום 💰" : updateStatus === "CANCELLED" ? "דמי ביטול 💰" : "חיוב אי הופעה 💰"}
                    </Label>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
                  disabled={updating || routingToCardcom || !updateStatus}
                  className="gap-2 font-bold bg-emerald-600 hover:bg-emerald-700"
                >
                  {updating || routingToCardcom ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : paymentMethod === "CREDIT_CARD" ? (
                    <CreditCard className="h-4 w-4" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  {paymentMethod === "CREDIT_CARD"
                    ? "המשך לסליקה ב-Cardcom"
                    : updateStatus === "COMPLETED" ? "עדכון ושלם" : updateStatus === "CANCELLED" ? "בטל וחייב" : updateStatus === "NO_SHOW" ? "עדכון וחייב" : "עדכון"}
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

    <ChargeCardcomDialog
      open={cardcomOpen}
      onOpenChange={setCardcomOpen}
      paymentId={cardcomPaymentId}
      sessionId={sessionId}
      clientId={clientId}
      clientName={clientName}
      amount={cardcomAmount}
      defaultDescription="פגישה"
      onPaymentSuccess={handleCardcomSuccess}
    />
    </>
  );
}
