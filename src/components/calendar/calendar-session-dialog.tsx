"use client";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { User, FileText, Trash2 } from "lucide-react";
import { QuickMarkPaid } from "@/components/payments/quick-mark-paid";
import { format } from "date-fns";
import { toast } from "sonner";

interface Client {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  defaultSessionPrice?: number | null;
  creditBalance?: number | null;
}

interface Session {
  id: string;
  startTime: string;
  endTime: string;
  status: string;
  type: string;
  price: number;
  client: Client | null;
  payment?: { id: string; status: string; amount?: number; expectedAmount?: number } | null;
  sessionNote?: string | null;
}

interface CalendarSessionDialogProps {
  isSessionDialogOpen: boolean;
  setIsSessionDialogOpen: (open: boolean) => void;
  selectedSession: Session | null;
  setSelectedSession: (session: Session | null) => void;
  formData: {
    clientId: string;
    startTime: string;
    endTime: string;
    type: string;
    price: string;
    isRecurring: boolean;
    weeksToRepeat: number;
  };
  setFormData: React.Dispatch<React.SetStateAction<{
    clientId: string;
    startTime: string;
    endTime: string;
    type: string;
    price: string;
    isRecurring: boolean;
    weeksToRepeat: number;
  }>>;
  setIsDialogOpen: (open: boolean) => void;
  handleDeleteSession: () => Promise<void>;
  fetchData: () => Promise<void>;
  router: ReturnType<typeof import("next/navigation").useRouter>;
  setPendingAction: (action: "CANCELLED" | "NO_SHOW" | null) => void;
  setIsChargeDialogOpen: (open: boolean) => void;
  setPaymentData: (data: {
    sessionId: string;
    clientId: string;
    amount: number;
    paymentId?: string;
    pendingSessionStatus?: string;
  } | null) => void;
  setIsPaymentDialogOpen: (open: boolean) => void;
}

export function CalendarSessionDialog({
  isSessionDialogOpen,
  setIsSessionDialogOpen,
  selectedSession,
  setSelectedSession,
  formData,
  setFormData,
  setIsDialogOpen,
  handleDeleteSession,
  fetchData,
  router,
  setPendingAction,
  setIsChargeDialogOpen,
  setPaymentData,
  setIsPaymentDialogOpen,
}: CalendarSessionDialogProps) {
  return (
    <Dialog open={isSessionDialogOpen} onOpenChange={setIsSessionDialogOpen}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>פרטי פגישה</DialogTitle>
          {selectedSession && (
            <DialogDescription>
              {selectedSession.client?.name || "הפסקה"} • {format(new Date(selectedSession.startTime), "d/M/yyyy HH:mm")}
            </DialogDescription>
          )}
        </DialogHeader>

        {selectedSession && (
          <div className="space-y-4">
            {/* Status Badge */}
            <div className="flex items-center gap-2 pb-2 border-b">
              <p className="text-sm text-muted-foreground">סטטוס:</p>
              <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
                selectedSession.status === "COMPLETED"
                  ? "bg-green-100 text-green-800"
                  : selectedSession.status === "NO_SHOW"
                  ? "bg-red-100 text-red-800"
                  : selectedSession.status === "CANCELLED"
                  ? "bg-gray-100 text-gray-800"
                  : selectedSession.status === "PENDING_APPROVAL"
                  ? "bg-amber-100 text-amber-800"
                  : "bg-sky-100 text-sky-800"
              }`}>
                {selectedSession.status === "COMPLETED"
                  ? "✅ הושלם"
                  : selectedSession.status === "NO_SHOW"
                  ? "⚠️ אי הופעה"
                  : selectedSession.status === "CANCELLED"
                  ? "❌ בוטל"
                  : selectedSession.status === "PENDING_APPROVAL"
                  ? "📋 ממתין לאישור"
                  : "🕐 מתוכנן"}
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">סוג</p>
                <p className="font-medium">
                  {selectedSession.type === "ONLINE" ? "אונליין" :
                   selectedSession.type === "PHONE" ? "טלפון" :
                   selectedSession.type === "BREAK" ? "הפסקה" : "פרונטלי"}
                </p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">מחיר</p>
                <p className="font-medium">₪{selectedSession.price}</p>
              </div>
            </div>

            {/* Time Editor - Show for future sessions */}
            {selectedSession.status === "SCHEDULED" && new Date(selectedSession.startTime) > new Date() && (
              <div className="border rounded-lg p-4 bg-slate-50 space-y-3">
                <p className="text-sm font-medium mb-3">עריכת זמן פגישה</p>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edit-startTime" className="text-xs">שעת התחלה</Label>
                    <Input
                      id="edit-startTime"
                      type="datetime-local"
                      value={format(new Date(selectedSession.startTime), "yyyy-MM-dd'T'HH:mm")}
                      onChange={(e) => {
                        const newStartTime = new Date(e.target.value);
                        const duration = new Date(selectedSession.endTime).getTime() - new Date(selectedSession.startTime).getTime();
                        const newEndTime = new Date(newStartTime.getTime() + duration);

                        fetch(`/api/sessions/${selectedSession.id}`, {
                          method: "PUT",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            startTime: newStartTime.toISOString(),
                            endTime: newEndTime.toISOString(),
                          }),
                        }).then(res => {
                          if (res.ok) {
                            toast.success("הזמן עודכן בהצלחה");
                            fetchData();
                            res.json().then(updated => setSelectedSession(updated));
                          } else {
                            toast.error("שגיאה בעדכון הזמן");
                          }
                        });
                      }}
                      dir="ltr"
                      className="text-sm"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="edit-endTime" className="text-xs">שעת סיום</Label>
                    <Input
                      id="edit-endTime"
                      type="datetime-local"
                      value={format(new Date(selectedSession.endTime), "yyyy-MM-dd'T'HH:mm")}
                      onChange={(e) => {
                        const newEndTime = new Date(e.target.value);

                        fetch(`/api/sessions/${selectedSession.id}`, {
                          method: "PUT",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            endTime: newEndTime.toISOString(),
                          }),
                        }).then(res => {
                          if (res.ok) {
                            toast.success("הזמן עודכן בהצלחה");
                            fetchData();
                            res.json().then(updated => setSelectedSession(updated));
                          } else {
                            toast.error("שגיאה בעדכון הזמן");
                          }
                        });
                      }}
                      dir="ltr"
                      className="text-sm"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Delete Button - Show for future sessions (but not for breaks) */}
            {selectedSession.status === "SCHEDULED" && new Date(selectedSession.startTime) > new Date() && selectedSession.type !== "BREAK" && (
              <Button
                onClick={handleDeleteSession}
                variant="destructive"
                className="w-full gap-2"
              >
                <Trash2 className="h-4 w-4" />
                מחק פגישה
              </Button>
            )}

            <div className="flex flex-col gap-2">
              {/* Different buttons for BREAK vs regular sessions */}
              {selectedSession.type === "BREAK" ? (
                <>
                  <Button
                    onClick={() => {
                      setIsSessionDialogOpen(false);
                      setIsDialogOpen(true);
                      setFormData({
                        ...formData,
                        startTime: format(new Date(selectedSession.startTime), "yyyy-MM-dd'T'HH:mm"),
                        endTime: format(new Date(selectedSession.endTime), "yyyy-MM-dd'T'HH:mm"),
                        type: "IN_PERSON"
                      });
                    }}
                    className="w-full"
                  >
                    📅 הקבע פגישה במקום ההפסקה
                  </Button>

                  <Button
                    onClick={async () => {
                      if (confirm("האם אתה בטוח שברצונך למחוק את ההפסקה?")) {
                        try {
                          await fetch(`/api/sessions/${selectedSession.id}`, {
                            method: "DELETE",
                          });
                          setIsSessionDialogOpen(false);
                          toast.success("ההפסקה נמחקה בהצלחה");
                          fetchData();
                        } catch {
                          toast.error("שגיאה במחיקת ההפסקה");
                        }
                      }
                    }}
                    variant="destructive"
                    className="w-full"
                  >
                    🗑️ מחק הפסקה
                  </Button>
                </>
              ) : selectedSession.status === "PENDING_APPROVAL" ? (
                <>
                  <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-3">
                    <p className="text-sm font-medium text-amber-800 text-center">פגישה זו נקבעה דרך זימון עצמי וממתינה לאישורך</p>
                    {(selectedSession.client?.email || selectedSession.client?.phone) && (
                      <div className="text-sm text-amber-700 space-y-1 border-t border-amber-200 pt-2">
                        {selectedSession.client.phone && (
                          <p><strong>טלפון:</strong> <a href={`tel:${selectedSession.client.phone}`} className="underline">{selectedSession.client.phone}</a></p>
                        )}
                        {selectedSession.client.email && (
                          <p><strong>מייל:</strong> <a href={`mailto:${selectedSession.client.email}`} className="underline">{selectedSession.client.email}</a></p>
                        )}
                      </div>
                    )}
                    <div className="flex gap-2">
                      <Button
                        onClick={async () => {
                          const res = await fetch(`/api/sessions/${selectedSession.id}/status`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ status: "SCHEDULED" }),
                          });
                          if (res.ok) {
                            toast.success("הפגישה אושרה!");
                            fetchData();
                            setIsSessionDialogOpen(false);
                          } else {
                            const errorData = await res.json().catch(() => null);
                            toast.error(errorData?.message || "שגיאה באישור הפגישה");
                          }
                        }}
                        className="flex-1 bg-green-600 hover:bg-green-700"
                      >
                        ✅ אשר פגישה
                      </Button>
                      <Button
                        onClick={async () => {
                          const res = await fetch(`/api/sessions/${selectedSession.id}/status`, {
                            method: "PATCH",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ status: "CANCELLED" }),
                          });
                          if (res.ok) {
                            toast.success("הפגישה נדחתה");
                            fetchData();
                            setIsSessionDialogOpen(false);
                          } else {
                            const errorData = await res.json().catch(() => null);
                            toast.error(errorData?.message || "שגיאה בדחיית הפגישה");
                          }
                        }}
                        variant="destructive"
                        className="flex-1"
                      >
                        ❌ דחה
                      </Button>
                    </div>
                  </div>
                </>
              ) : selectedSession.status === "SCHEDULED" ? (
                <>
                  <div className="border rounded-lg divide-y">
                    <p className="text-sm font-medium text-center py-2 bg-muted/50">בחר פעולה:</p>

                    {/* 1. סיים ושלם */}
                    <button
                      onClick={() => {
                        if (!selectedSession.client) return;
                        setIsSessionDialogOpen(false);
                        setPaymentData({
                          sessionId: selectedSession.id,
                          clientId: selectedSession.client.id,
                          amount: selectedSession.price - Number(selectedSession.payment?.amount || 0),
                          pendingSessionStatus: "COMPLETED",
                        });
                        setIsPaymentDialogOpen(true);
                      }}
                      className="w-full py-3 px-4 text-right hover:bg-green-50 transition-colors flex items-center gap-3"
                    >
                      <span className="flex items-center justify-center w-7 h-7 rounded-full bg-green-600 text-white text-sm font-bold">1</span>
                      <span className="flex-1 font-medium">✅ סיים ושלם</span>
                    </button>

                    {/* 2. סיים ללא תשלום */}
                    <button
                      onClick={async () => {
                        try {
                          await fetch(`/api/sessions/${selectedSession.id}`, {
                            method: "PUT",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ status: "COMPLETED" }),
                          });
                          toast.success("הפגישה הושלמה ללא תשלום");
                          setIsSessionDialogOpen(false);
                          fetchData();
                        } catch {
                          toast.error("שגיאה בעדכון הפגישה");
                        }
                      }}
                      className="w-full py-3 px-4 text-right hover:bg-sky-50 transition-colors flex items-center gap-3"
                    >
                      <span className="flex items-center justify-center w-7 h-7 rounded-full bg-sky-600 text-white text-sm font-bold">2</span>
                      <span className="flex-1 font-medium">סיים ללא תשלום</span>
                    </button>

                    {/* 3. אי הופעה */}
                    <button
                      onClick={() => {
                        setPendingAction("NO_SHOW");
                        setIsChargeDialogOpen(true);
                      }}
                      className="w-full py-3 px-4 text-right hover:bg-red-50 transition-colors flex items-center gap-3"
                    >
                      <span className="flex items-center justify-center w-7 h-7 rounded-full bg-red-600 text-white text-sm font-bold">3</span>
                      <span className="flex-1 font-medium">🚫 אי הופעה</span>
                    </button>

                    {/* 4. ביטול */}
                    <button
                      onClick={async () => {
                        if (!selectedSession) return;
                        const sessionStart = new Date(selectedSession.startTime);
                        const hoursUntil = (sessionStart.getTime() - Date.now()) / (1000 * 60 * 60);

                        if (hoursUntil > 24) {
                          if (!confirm("האם אתה בטוח שברצונך לבטל את הפגישה?")) return;
                          try {
                            await fetch(`/api/sessions/${selectedSession.id}`, {
                              method: "PUT",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({ status: "CANCELLED" }),
                            });
                            toast.success("הפגישה בוטלה");
                            setIsSessionDialogOpen(false);
                            setSelectedSession(null);
                            fetchData();
                          } catch {
                            toast.error("שגיאה בביטול הפגישה");
                          }
                        } else {
                          setPendingAction("CANCELLED");
                          setIsChargeDialogOpen(true);
                        }
                      }}
                      className="w-full py-3 px-4 text-right hover:bg-orange-50 transition-colors flex items-center gap-3"
                    >
                      <span className="flex items-center justify-center w-7 h-7 rounded-full bg-orange-600 text-white text-sm font-bold">4</span>
                      <span className="flex-1 font-medium">❌ ביטול פגישה</span>
                    </button>
                  </div>
                </>
              ) : selectedSession.status === "COMPLETED" ? (
                <>
                  <div className="space-y-2">
                    <Button
                      onClick={() => {
                        setIsSessionDialogOpen(false);
                        router.push(`/dashboard/clients/${selectedSession.client?.id}`);
                      }}
                      className="w-full gap-2"
                    >
                      <User className="h-4 w-4" />
                      תיקית מטופל
                    </Button>
                    <Button
                      onClick={() => {
                        setIsSessionDialogOpen(false);
                        router.push(`/dashboard/sessions/${selectedSession.id}`);
                      }}
                      className="w-full gap-2"
                      variant="outline"
                    >
                      <FileText className="h-4 w-4" />
                      סיכום פגישה
                    </Button>
                    {selectedSession.payment && selectedSession.client ? (
                      <QuickMarkPaid
                        sessionId={selectedSession.id}
                        clientId={selectedSession.client.id}
                        clientName={selectedSession.client.name}
                        amount={selectedSession.price - Number(selectedSession.payment?.amount || 0)}
                        creditBalance={Number(selectedSession.client.creditBalance || 0)}
                        existingPayment={selectedSession.payment}
                        buttonText="רשום תשלום / הצג קבלה"
                      />
                    ) : (
                      <div className="space-y-2">
                        <div className="w-full py-3 px-4 text-center rounded-lg bg-emerald-50 dark:bg-emerald-950 border-2 border-emerald-200 dark:border-emerald-800">
                          <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">💚 פטור מתשלום</p>
                          <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">לא מחייב</p>
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs text-muted-foreground">הערה (אופציונלי):</label>
                          <textarea
                            placeholder="למה לא מחייב? (למשל: מטופל ביטל מראש, חופש, וכו')"
                            defaultValue={selectedSession.sessionNote || ""}
                            className="w-full text-xs p-2 rounded border resize-none"
                            rows={2}
                            onBlur={async (e) => {
                              try {
                                await fetch(`/api/sessions/${selectedSession.id}/note`, {
                                  method: "PUT",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ note: e.target.value }),
                                });
                                toast.success("הערה נשמרה");
                              } catch {
                                toast.error("שגיאה בשמירת הערה");
                              }
                            }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                </>
              ) : selectedSession.status === "NO_SHOW" ? (
                <>
                  <div className="space-y-2">
                    <Button
                      onClick={() => {
                        setIsSessionDialogOpen(false);
                        router.push(`/dashboard/clients/${selectedSession.client?.id}`);
                      }}
                      className="w-full gap-2"
                    >
                      <User className="h-4 w-4" />
                      תיקית מטופל
                    </Button>
                    <Button
                      onClick={() => {
                        setIsSessionDialogOpen(false);
                        router.push(`/dashboard/sessions/${selectedSession.id}`);
                      }}
                      className="w-full gap-2"
                      variant="outline"
                    >
                      <FileText className="h-4 w-4" />
                      הוסף הערה
                    </Button>
                    {selectedSession.client && (
                      selectedSession.payment ? (
                        <QuickMarkPaid
                          sessionId={selectedSession.id}
                          clientId={selectedSession.client.id}
                          clientName={selectedSession.client.name}
                          amount={selectedSession.price - Number(selectedSession.payment?.amount || 0)}
                          creditBalance={Number(selectedSession.client.creditBalance || 0)}
                          existingPayment={selectedSession.payment}
                          buttonText="רשום תשלום"
                        />
                      ) : (
                        <div className="space-y-2">
                          <div className="w-full py-3 px-4 text-center rounded-lg bg-emerald-50 dark:bg-emerald-950 border-2 border-emerald-200 dark:border-emerald-800">
                            <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300">💚 פטור מתשלום</p>
                            <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">לא מחייב</p>
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs text-muted-foreground">הערה (אופציונלי):</label>
                            <textarea
                              placeholder="למה לא מחייב? (למשל: מטופל ביטל מראש, חופש, וכו')"
                              defaultValue={selectedSession.sessionNote || ""}
                              className="w-full text-xs p-2 rounded border resize-none"
                              rows={2}
                              onBlur={async (e) => {
                                try {
                                  await fetch(`/api/sessions/${selectedSession.id}/note`, {
                                    method: "PUT",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ note: e.target.value }),
                                  });
                                  toast.success("הערה נשמרה");
                                } catch {
                                  toast.error("שגיאה בשמירת הערה");
                                }
                              }}
                            />
                          </div>
                        </div>
                      )
                    )}
                  </div>
                </>
              ) : null}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setIsSessionDialogOpen(false)}>
            סגור
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
