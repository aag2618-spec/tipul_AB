"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2, AlertCircle, CheckCircle2, Ban, UserX, ChevronUp, ChevronDown, Wallet, FileText } from "lucide-react";
import Link from "next/link";

interface Session {
  id: string;
  startTime: string;
  endTime: string;
  status: string;
  type: string;
  price: number;
  client: {
    id: string;
    name: string;
    email?: string | null;
    phone?: string | null;
    defaultSessionPrice?: number | null;
    creditBalance?: number | null;
  } | null;
  payment?: { id: string; status: string; amount?: number; expectedAmount?: number } | null;
  sessionNote?: string | null;
}

interface CalendarUpdateDialogProps {
  updateDialogOpen: boolean;
  resetUpdateDialog: () => void;
  selectedSession: Session | null;
  setSelectedSession: (session: Session | null) => void;
  updateStatus: string;
  setUpdateStatus: (status: string) => void;
  updateReason: string;
  setUpdateReason: (reason: string) => void;
  updating: boolean;
  updatePaymentMethod: string;
  setUpdatePaymentMethod: (method: string) => void;
  updatePaymentAmount: string;
  setUpdatePaymentAmount: (amount: string) => void;
  showUpdatePayment: boolean;
  setShowUpdatePayment: (show: boolean) => void;
  showUpdateAdvanced: boolean;
  setShowUpdateAdvanced: (show: boolean) => void;
  updatePaymentType: "FULL" | "PARTIAL";
  setUpdatePaymentType: (type: "FULL" | "PARTIAL") => void;
  updatePartialAmount: string;
  setUpdatePartialAmount: (amount: string) => void;
  updateNoChargeReason: string;
  setUpdateNoChargeReason: (reason: string) => void;
  updateClientDebt: { total: number; count: number } | null;
  updateIssueReceipt: boolean;
  setUpdateIssueReceipt: (issue: boolean) => void;
  updateReceiptMode: string;
  updateBusinessType: string;
  handleUpdateSession: () => Promise<void>;
  fetchData: () => Promise<void>;
}

export function CalendarUpdateDialog({
  updateDialogOpen,
  resetUpdateDialog,
  selectedSession,
  setSelectedSession,
  updateStatus,
  setUpdateStatus,
  updateReason,
  setUpdateReason,
  updating,
  updatePaymentMethod,
  setUpdatePaymentMethod,
  updatePaymentAmount,
  setUpdatePaymentAmount,
  showUpdatePayment,
  setShowUpdatePayment,
  showUpdateAdvanced,
  setShowUpdateAdvanced,
  updatePaymentType,
  setUpdatePaymentType,
  updatePartialAmount,
  setUpdatePartialAmount,
  updateNoChargeReason,
  setUpdateNoChargeReason,
  updateClientDebt,
  updateIssueReceipt,
  setUpdateIssueReceipt,
  updateReceiptMode,
  updateBusinessType,
  handleUpdateSession,
  fetchData,
}: CalendarUpdateDialogProps) {
  return (
    <Dialog open={updateDialogOpen} onOpenChange={(o) => { if (!o) resetUpdateDialog(); }}>
      <DialogContent className="sm:max-w-[550px] max-h-[90vh] overflow-y-auto" dir="rtl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-orange-500" />
            עדכון פגישה - {selectedSession?.client?.name}
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
              onClick={() => { setUpdateStatus("COMPLETED"); setShowUpdatePayment(true); }}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              הושלמה
            </Button>
            <Button
              type="button"
              variant={updateStatus === "CANCELLED" ? "default" : "outline"}
              size="sm"
              className={`h-10 text-xs gap-1 ${updateStatus === "CANCELLED" ? "bg-red-500 hover:bg-red-600" : ""}`}
              onClick={() => { setUpdateStatus("CANCELLED"); setShowUpdatePayment(true); }}
            >
              <Ban className="h-3.5 w-3.5" />
              בוטלה
            </Button>
            <Button
              type="button"
              variant={updateStatus === "NO_SHOW" ? "default" : "outline"}
              size="sm"
              className={`h-10 text-xs gap-1 ${updateStatus === "NO_SHOW" ? "bg-amber-500 hover:bg-amber-600" : ""}`}
              onClick={() => { setUpdateStatus("NO_SHOW"); setShowUpdatePayment(true); }}
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

          {updateStatus && selectedSession && selectedSession.price > 0 && (
            <>
              {updateStatus !== "COMPLETED" && (
                <Button
                  type="button"
                  variant="outline"
                  className="w-full font-bold text-base"
                  onClick={() => setShowUpdatePayment(false)}
                >
                  {updateStatus === "CANCELLED" ? "ביטול ללא חיוב" : "אי הגעה ללא חיוב"}
                </Button>
              )}

              {!showUpdatePayment && (
                <div className="space-y-2 p-3 rounded-lg border bg-orange-50/50 border-orange-200">
                  <Label className="text-sm text-orange-700">סיבה לאי חיוב (אופציונלי)</Label>
                  <Textarea
                    value={updateNoChargeReason}
                    onChange={e => setUpdateNoChargeReason(e.target.value)}
                    placeholder="לדוגמה: סיכום מראש, פגישת היכרות, הסדר מיוחד..."
                    className="resize-none h-16 bg-white/80 border-orange-200 text-sm"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-xs text-sky-600"
                    onClick={() => setShowUpdatePayment(true)}
                  >
                    ← חזרה לתשלום
                  </Button>
                </div>
              )}

              {showUpdatePayment && (
                <div className="space-y-3 p-4 rounded-lg border bg-muted/30">
                  <div className="flex items-center justify-between">
                    <Label className="text-lg font-bold">
                      {updateStatus === "COMPLETED" ? "עדכון ותשלום 💰" : updateStatus === "CANCELLED" ? "דמי ביטול 💰" : "חיוב אי הגעה 💰"}
                    </Label>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label>סכום</Label>
                      <div className="relative">
                        <Input
                          type="number"
                          value={updatePaymentAmount}
                          onChange={e => setUpdatePaymentAmount(e.target.value)}
                          className="pl-8"
                          disabled={updatePaymentType !== "FULL"}
                        />
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">₪</span>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>אמצעי תשלום</Label>
                      <Select value={updatePaymentMethod} onValueChange={setUpdatePaymentMethod}>
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

                  {updateBusinessType !== "NONE" && updateReceiptMode !== "NEVER" && (
                    <div className="flex items-center gap-3 py-2 px-3 bg-sky-50 rounded-lg border border-sky-200">
                      <Checkbox
                        id="cal-update-issue-receipt"
                        checked={updateIssueReceipt}
                        onCheckedChange={(checked) => setUpdateIssueReceipt(checked === true)}
                        disabled={updateReceiptMode === "ALWAYS"}
                      />
                      <Label htmlFor="cal-update-issue-receipt" className="cursor-pointer flex items-center gap-2 text-sky-800">
                        <FileText className="h-4 w-4" />
                        הוצא קבלה
                        {updateReceiptMode === "ALWAYS" && (
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
                      onClick={() => setShowUpdateAdvanced(!showUpdateAdvanced)}
                    >
                      <span className="font-bold">אופציות מתקדמות</span>
                      {showUpdateAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                    </Button>
                    {showUpdateAdvanced && (
                      <div className="space-y-2 pt-2">
                        <div className="grid gap-2">
                          <Button
                            type="button"
                            variant={updatePaymentType === "FULL" ? "default" : "outline"}
                            size="sm"
                            onClick={() => setUpdatePaymentType("FULL")}
                          >
                            תשלום מלא (₪{selectedSession.price})
                          </Button>
                          <Button
                            type="button"
                            variant={updatePaymentType === "PARTIAL" ? "default" : "outline"}
                            size="sm"
                            onClick={() => setUpdatePaymentType("PARTIAL")}
                          >
                            תשלום חלקי
                          </Button>
                          {updatePaymentType === "PARTIAL" && (
                            <div className="pr-4 space-y-1">
                              <Input
                                type="number"
                                placeholder="הכנס סכום"
                                value={updatePartialAmount}
                                onChange={e => setUpdatePartialAmount(e.target.value)}
                                max={selectedSession.price}
                                min={0}
                                step="0.01"
                              />
                              {updatePartialAmount && parseFloat(updatePartialAmount) < selectedSession.price && (
                                <p className="text-xs text-muted-foreground">
                                  נותר לתשלום: ₪{selectedSession.price - parseFloat(updatePartialAmount)}
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

          {updateStatus && updateClientDebt && updateClientDebt.count > 0 && updateClientDebt.total > 0 && (
            <div className="pt-3 border-t mt-2">
              <p className="text-sm text-muted-foreground mb-2 text-center">
                למטופל יש {updateClientDebt.count} פגישות ממתינות לתשלום
                (סה״כ חוב: ₪{updateClientDebt.total.toFixed(0)})
              </p>
              <Button
                variant="outline"
                className="w-full gap-2"
                asChild
              >
                <Link href={`/dashboard/payments/pay/${selectedSession?.client?.id}`}>
                  <Wallet className="h-4 w-4" />
                  שלם את כל החוב
                </Link>
              </Button>
            </div>
          )}
        </div>
        <DialogFooter className="flex flex-wrap gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={resetUpdateDialog}
            disabled={updating}
            className="font-medium"
          >
            ביטול
          </Button>
          {updateStatus && showUpdatePayment && selectedSession && selectedSession.price > 0 && (
            <Button
              variant="outline"
              className="gap-2 font-bold border-amber-300 text-amber-700 hover:bg-amber-50"
              onClick={async () => {
                if (!selectedSession.client) return;
                const statusBody: Record<string, unknown> = { status: updateStatus, createPayment: true, markAsPaid: false };
                if (updateStatus === "CANCELLED") {
                  statusBody.cancellationReason = updateReason.trim() || undefined;
                }
                const response = await fetch(`/api/sessions/${selectedSession.id}`, {
                  method: "PUT",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify(statusBody),
                });
                if (response.ok) {
                  const { toast } = await import("sonner");
                  toast.success("הפגישה עודכנה והחוב נרשם");
                  resetUpdateDialog();
                  setSelectedSession(null);
                  fetchData();
                } else {
                  const errorData = await response.json().catch(() => null);
                  const { toast } = await import("sonner");
                  toast.error(errorData?.message || "שגיאה בעדכון הפגישה");
                }
              }}
              disabled={updating}
            >
              {updating ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : <Wallet className="h-4 w-4 ml-1" />}
              עדכן ורשום חוב
            </Button>
          )}
          {showUpdatePayment && selectedSession && selectedSession.price > 0 ? (
            <Button
              onClick={handleUpdateSession}
              disabled={updating || !updateStatus}
              className="gap-2 font-bold bg-emerald-600 hover:bg-emerald-700"
            >
              {updating ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {updateStatus === "COMPLETED" ? "עדכן ושלם" : updateStatus === "CANCELLED" ? "בטל וחייב" : updateStatus === "NO_SHOW" ? "עדכן וחייב" : "עדכן"}
            </Button>
          ) : (
            <Button
              onClick={handleUpdateSession}
              disabled={updating || !updateStatus}
              className={
                updateStatus === "COMPLETED" ? "bg-emerald-600 hover:bg-emerald-700" :
                updateStatus === "CANCELLED" ? "bg-red-500 hover:bg-red-600" :
                updateStatus === "NO_SHOW" ? "bg-amber-500 hover:bg-amber-600" : ""
              }
            >
              {updating ? <Loader2 className="h-4 w-4 animate-spin ml-1" /> : null}
              עדכן
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
