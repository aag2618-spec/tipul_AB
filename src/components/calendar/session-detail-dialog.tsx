"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Trash2, User, Phone, UserCheck, CalendarPlus } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { QuickMarkPaid } from "@/components/payments/quick-mark-paid";
import type { CalendarSession } from "@/hooks/use-calendar-data";

// ── Types ──

export interface PaymentRequest {
  sessionId: string;
  clientId: string;
  amount: number;
  pendingSessionStatus: string;
}

// ── Props ──

interface SessionDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: CalendarSession | null;
  onSessionChange: (session: CalendarSession | null) => void;
  // Callbacks to page.tsx orchestrator
  onRequestPayment: (data: PaymentRequest) => void;
  onRequestCharge: (action: "CANCELLED" | "NO_SHOW") => void;
  onOpenNewSession: (formData: { startTime: string; endTime: string; type: string }) => void;
  onDataChanged: () => void;
}

// ── Component ──

export function SessionDetailDialog({
  open,
  onOpenChange,
  session,
  onSessionChange,
  onRequestPayment,
  onRequestCharge,
  onOpenNewSession,
  onDataChanged,
}: SessionDetailDialogProps) {
  const router = useRouter();
  const [previousSessions, setPreviousSessions] = useState<Array<{
    id: string; startTime: string; status: string; topic?: string | null;
    payment?: { status: string; amount?: number } | null;
  }>>([]);

  const isQuickClient = session?.client?.isQuickClient === true;

  // טעינת פגישות קודמות לפונה (פגישת ייעוץ)
  useEffect(() => {
    if (!open || !isQuickClient || !session?.client?.id) {
      setPreviousSessions([]);
      return;
    }
    fetch(`/api/sessions?clientId=${session.client.id}`)
      .then((res) => res.ok ? res.json() : [])
      .then((sessions: Array<{ id: string; startTime: string; status: string; topic?: string | null; payment?: { status: string; amount?: number } | null }>) => {
        // כל הפגישות חוץ מהנוכחית
        setPreviousSessions(sessions.filter((s) => s.id !== session.id));
      })
      .catch(() => setPreviousSessions([]));
  }, [open, isQuickClient, session?.client?.id, session?.id]);

  if (!session) return null;

  const handleDeleteSession = async () => {
    if (!confirm("האם אתה בטוח שברצונך למחוק את הפגישה?")) return;

    try {
      const response = await fetch(`/api/sessions/${session.id}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("שגיאה במחיקת הפגישה");

      toast.success("הפגישה נמחקה בהצלחה");
      onOpenChange(false);
      onSessionChange(null);
      onDataChanged();
    } catch {
      toast.error("שגיאה במחיקת הפגישה");
    }
  };

  const handleTimeUpdate = async (field: "startTime" | "endTime", value: string) => {
    const newTime = new Date(value);
    const body: Record<string, string> = {};

    if (field === "startTime") {
      const duration = new Date(session.endTime).getTime() - new Date(session.startTime).getTime();
      body.startTime = newTime.toISOString();
      body.endTime = new Date(newTime.getTime() + duration).toISOString();
    } else {
      body.endTime = newTime.toISOString();
    }

    try {
      const res = await fetch(`/api/sessions/${session.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        toast.success("הזמן עודכן בהצלחה");
        onDataChanged();
        const updated = await res.json();
        onSessionChange(updated);
      } else {
        const err = await res.json().catch(() => null);
        toast.error(err?.message || "שגיאה בעדכון הזמן");
      }
    } catch {
      toast.error("שגיאה בעדכון הזמן");
    }
  };

  const handleSaveNote = async (note: string) => {
    // לא לשמור אם אין שינוי
    if (note === (session.sessionNote || "")) return;
    try {
      await fetch(`/api/sessions/${session.id}/note`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: note }),
      });
      toast.success("הערה נשמרה");
    } catch {
      toast.error("שגיאה בשמירת הערה");
    }
  };

  // ── Label maps ──
  const PAYMENT_METHOD_LABELS: Record<string, string> = {
    CASH: "מזומן", CREDIT_CARD: "כרטיס אשראי", BANK_TRANSFER: "העברה בנקאית",
    CHECK: "המחאה", CREDIT: "קרדיט", OTHER: "אחר",
  };
  const CANCELLED_BY_LABELS: Record<string, string> = {
    CLIENT: "המטופל", THERAPIST: "המטפל", SYSTEM: "המערכת",
  };

  // ── Section: Payment ──
  const renderPaymentSection = () => {
    const price = session.price;
    const payment = session.payment;
    const paidAmount = Number(payment?.amount || 0);
    const remaining = price - paidAmount;

    // מחיר 0
    if (price === 0) {
      return (
        <div className="rounded-lg p-3 bg-muted/50 border">
          <p className="text-sm text-muted-foreground text-center">ללא עלות</p>
        </div>
      );
    }

    // שולם מלא
    if (payment?.status === "PAID") {
      return (
        <div className="rounded-lg p-3 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 space-y-1">
          <p className="text-sm font-medium text-green-700 dark:text-green-300">✓ שולם ₪{paidAmount}</p>
          <p className="text-xs text-green-600 dark:text-green-400">
            {PAYMENT_METHOD_LABELS[payment.method || ""] || ""}
            {payment.paidAt && ` • ${format(new Date(payment.paidAt), "d/M/yyyy")}`}
          </p>
        </div>
      );
    }

    // שולם חלקי
    if (payment && paidAmount > 0 && paidAmount < price) {
      return (
        <div className="rounded-lg p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 space-y-2">
          <div>
            <p className="text-sm font-medium text-blue-700 dark:text-blue-300">שולם ₪{paidAmount} מתוך ₪{price}</p>
            <p className="text-xs font-semibold text-blue-600 dark:text-blue-400">נותר ₪{remaining}</p>
          </div>
          {session.client && (
            <QuickMarkPaid
              sessionId={session.id}
              clientId={session.client.id}
              clientName={session.client.name}
              amount={remaining}
              creditBalance={Number(session.client.creditBalance || 0)}
              existingPayment={payment}
              buttonText="השלם תשלום"
            />
          )}
        </div>
      );
    }

    // לא שולם / חוב (יש payment אבל לא PAID)
    if (payment) {
      return (
        <div className="rounded-lg p-3 bg-orange-50 dark:bg-orange-950 border border-orange-200 dark:border-orange-800 space-y-2">
          <p className="text-sm font-medium text-orange-700 dark:text-orange-300">⏳ ממתין לתשלום ₪{price}</p>
          {session.client && (
            <QuickMarkPaid
              sessionId={session.id}
              clientId={session.client.id}
              clientName={session.client.name}
              amount={remaining}
              creditBalance={Number(session.client.creditBalance || 0)}
              existingPayment={payment}
              buttonText="רשום תשלום"
            />
          )}
        </div>
      );
    }

    // פטור מתשלום (אין payment בכלל)
    // אם כבר יש סיבת אי חיוב שמורה — מציגים רק טקסט קצר, בלי textarea
    if (session.sessionNote) {
      return (
        <div className="rounded-lg p-3 bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800">
          <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300 text-center">💚 פטור מתשלום</p>
        </div>
      );
    }
    return (
      <div className="rounded-lg p-3 bg-emerald-50 dark:bg-emerald-950 border border-emerald-200 dark:border-emerald-800 space-y-2">
        <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300 text-center">💚 פטור מתשלום</p>
        <div className="space-y-1">
          <label className="text-xs text-muted-foreground">הערה (אופציונלי):</label>
          <textarea
            placeholder="למה לא מחייב? (למשל: מטופל ביטל מראש, חופש, וכו')"
            defaultValue=""
            className="w-full text-xs p-2 rounded border resize-none"
            rows={2}
            onBlur={(e) => handleSaveNote(e.target.value)}
          />
        </div>
      </div>
    );
  };

  // ── Section: Summary ──
  const renderSummarySection = () => {
    if (session.skipSummary) {
      return (
        <div className="rounded-lg p-3 bg-muted/50 border">
          <p className="text-sm text-muted-foreground">📝 סיכום דולג בכוונה</p>
        </div>
      );
    }
    if (session.sessionNote) {
      return (
        <div className="rounded-lg p-3 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 flex items-center justify-between">
          <p className="text-sm font-medium text-green-700 dark:text-green-300">📝 סיכום נכתב</p>
          <Button
            size="sm"
            variant="ghost"
            className="text-xs text-green-600 hover:text-green-700"
            onClick={() => {
              onOpenChange(false);
              router.push(`/dashboard/sessions/${session.id}`);
            }}
          >
            צפה בסיכום →
          </Button>
        </div>
      );
    }
    return (
      <div className="rounded-lg p-3 bg-sky-50 dark:bg-sky-950 border border-sky-200 dark:border-sky-800 flex items-center justify-between">
        <p className="text-sm font-medium text-sky-700 dark:text-sky-300">📝 טרם נכתב סיכום</p>
        <Button
          size="sm"
          variant="ghost"
          className="text-xs text-sky-600 hover:text-sky-700"
          onClick={() => {
            onOpenChange(false);
            router.push(`/dashboard/sessions/${session.id}`);
          }}
        >
          כתוב סיכום →
        </Button>
      </div>
    );
  };

  // ── Section: Cancellation / No-Show Info ──
  const hasCancellationInfo = session.cancelledBy || session.cancelledAt || session.cancellationReason || (!session.payment && session.sessionNote);

  const renderCancellationSection = () => {
    const isCancelled = session.status === "CANCELLED";
    const cancelledByLabel = CANCELLED_BY_LABELS[session.cancelledBy || ""] || "המטפל";

    return (
      <div className="rounded-lg p-3 bg-muted/50 border space-y-1.5">
        <p className="text-sm font-medium">{isCancelled ? "ℹ️ פרטי ביטול" : "ℹ️ אי הופעה"}</p>
        {isCancelled && session.cancelledBy && (
          <p className="text-xs text-muted-foreground">בוטל ע&quot;י: {cancelledByLabel}</p>
        )}
        {isCancelled && session.cancelledAt && (
          <p className="text-xs text-muted-foreground">{format(new Date(session.cancelledAt), "d/M/yyyy HH:mm")}</p>
        )}
        {session.cancellationReason && (
          <p className="text-xs bg-background rounded px-2 py-1 border">{isCancelled ? "סיבת ביטול" : "סיבת אי הופעה"}: {session.cancellationReason}</p>
        )}
        {/* הערת פטור - אם אין payment ויש הערה */}
        {!session.payment && session.sessionNote && (
          <p className="text-xs bg-background rounded px-2 py-1 border">סיבת אי חיוב: {session.sessionNote}</p>
        )}
      </div>
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>פרטי פגישה</DialogTitle>
          <DialogDescription>
            {session.client?.name || "הפסקה"} • {format(new Date(session.startTime), "d/M/yyyy HH:mm")}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Status Badge */}
          <div className="flex items-center gap-2 pb-2 border-b">
            <p className="text-sm text-muted-foreground">סטטוס:</p>
            <span className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-medium ${
              session.status === "COMPLETED"
                ? "bg-green-100 text-green-800"
                : session.status === "NO_SHOW"
                ? "bg-red-100 text-red-800"
                : session.status === "CANCELLED"
                ? "bg-gray-100 text-gray-800"
                : session.status === "PENDING_APPROVAL"
                ? "bg-amber-100 text-amber-800"
                : "bg-sky-100 text-sky-800"
            }`}>
              {session.status === "COMPLETED"
                ? "✅ הושלם"
                : session.status === "NO_SHOW"
                ? "⚠️ אי הופעה"
                : session.status === "CANCELLED"
                ? "❌ בוטל"
                : session.status === "PENDING_APPROVAL"
                ? "📋 ממתין לאישור"
                : "🕐 מתוכנן"}
            </span>
          </div>

          {/* נושא הפגישה */}
          {session.topic && (
            <div className="rounded-lg p-3 bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800">
              <p className="text-xs text-blue-600 dark:text-blue-400 mb-1">נושא</p>
              <p className="text-sm font-medium text-blue-800 dark:text-blue-200">{session.topic}</p>
            </div>
          )}

          {/* פרטי פונה — טלפון */}
          {isQuickClient && session.client?.phone && (
            <a
              href={`tel:${session.client.phone}`}
              className="flex items-center gap-2 rounded-lg p-2 bg-muted/50 border hover:bg-muted transition-colors"
            >
              <Phone className="h-4 w-4 text-green-600" />
              <span className="text-sm" dir="ltr">{session.client.phone}</span>
            </a>
          )}

          {/* פגישות קודמות — רק לפונה */}
          {isQuickClient && previousSessions.length > 0 && (
            <div className="rounded-lg border p-3 space-y-2">
              <p className="text-xs font-medium text-muted-foreground">פגישות קודמות ({previousSessions.length})</p>
              <div className="space-y-1 max-h-24 overflow-y-auto">
                {previousSessions.map((prev) => (
                  <div key={prev.id} className="flex items-center justify-between text-xs px-2 py-1 rounded bg-muted/30">
                    <span>{format(new Date(prev.startTime), "d/M/yy")}</span>
                    <span className="text-muted-foreground">{prev.topic || "—"}</span>
                    <span>{prev.payment?.status === "PAID" ? "✓ שולם" : "⏳"}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">סוג</p>
              <p className="font-medium">
                {session.type === "ONLINE" ? "אונליין" :
                 session.type === "PHONE" ? "טלפון" :
                 session.type === "BREAK" ? "הפסקה" : "פרונטלי"}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">מחיר</p>
              <p className="font-medium">₪{session.price}</p>
            </div>
          </div>

          {/* Time Editor - Show for future sessions */}
          {session.status === "SCHEDULED" && new Date(session.startTime) > new Date() && (
            <div className="border rounded-lg p-4 bg-slate-50 space-y-3">
              <p className="text-sm font-medium mb-3">עריכת זמן פגישה</p>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-startTime" className="text-xs">שעת התחלה</Label>
                  <Input
                    id="edit-startTime"
                    type="datetime-local"
                    value={format(new Date(session.startTime), "yyyy-MM-dd'T'HH:mm")}
                    onChange={(e) => handleTimeUpdate("startTime", e.target.value)}
                    dir="ltr"
                    className="text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-endTime" className="text-xs">שעת סיום</Label>
                  <Input
                    id="edit-endTime"
                    type="datetime-local"
                    value={format(new Date(session.endTime), "yyyy-MM-dd'T'HH:mm")}
                    onChange={(e) => handleTimeUpdate("endTime", e.target.value)}
                    dir="ltr"
                    className="text-sm"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Delete Button - Show for future sessions (but not for breaks) */}
          {session.status === "SCHEDULED" && new Date(session.startTime) > new Date() && session.type !== "BREAK" && (
            <Button onClick={handleDeleteSession} variant="destructive" className="w-full gap-2">
              <Trash2 className="h-4 w-4" />
              מחק פגישה
            </Button>
          )}

          <div className="flex flex-col gap-2">
            {/* BREAK */}
            {session.type === "BREAK" ? (
              <>
                <Button
                  onClick={async () => {
                    // מוחק את ההפסקה ופותח דיאלוג פגישה חדשה באותו זמן
                    try {
                      await fetch(`/api/sessions/${session.id}`, { method: "DELETE" });
                      onDataChanged();
                    } catch {
                      // ממשיך גם אם המחיקה נכשלה
                    }
                    onOpenChange(false);
                    onOpenNewSession({
                      startTime: format(new Date(session.startTime), "yyyy-MM-dd'T'HH:mm"),
                      endTime: format(new Date(session.endTime), "yyyy-MM-dd'T'HH:mm"),
                      type: "IN_PERSON",
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
                        await fetch(`/api/sessions/${session.id}`, { method: "DELETE" });
                        onOpenChange(false);
                        toast.success("ההפסקה נמחקה בהצלחה");
                        onDataChanged();
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

            /* PENDING_APPROVAL */
            ) : session.status === "PENDING_APPROVAL" ? (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 space-y-3">
                <p className="text-sm font-medium text-amber-800 text-center">פגישה זו נקבעה דרך זימון עצמי וממתינה לאישורך</p>
                {(session.client?.email || session.client?.phone) && (
                  <div className="text-sm text-amber-700 space-y-1 border-t border-amber-200 pt-2">
                    {session.client.phone && (
                      <p><strong>טלפון:</strong> <a href={`tel:${session.client.phone}`} className="underline">{session.client.phone}</a></p>
                    )}
                    {session.client.email && (
                      <p><strong>מייל:</strong> <a href={`mailto:${session.client.email}`} className="underline">{session.client.email}</a></p>
                    )}
                  </div>
                )}
                <div className="flex gap-2">
                  <Button
                    onClick={async () => {
                      const res = await fetch(`/api/sessions/${session.id}/status`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ status: "SCHEDULED" }),
                      });
                      if (res.ok) {
                        toast.success("הפגישה אושרה!");
                        onDataChanged();
                        onOpenChange(false);
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
                      const res = await fetch(`/api/sessions/${session.id}/status`, {
                        method: "PATCH",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ status: "CANCELLED" }),
                      });
                      if (res.ok) {
                        toast.success("הפגישה נדחתה");
                        onDataChanged();
                        onOpenChange(false);
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

            /* SCHEDULED */
            ) : session.status === "SCHEDULED" ? (
              <><div className="border rounded-lg divide-y">
                <p className="text-sm font-medium text-center py-2 bg-muted/50">בחר פעולה:</p>

                {/* 1. סיים ושלם */}
                <button
                  onClick={() => {
                    if (!session.client) return;
                    onOpenChange(false);
                    onRequestPayment({
                      sessionId: session.id,
                      clientId: session.client.id,
                      amount: session.price - Number(session.payment?.amount || 0),
                      pendingSessionStatus: "COMPLETED",
                    });
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
                      await fetch(`/api/sessions/${session.id}`, {
                        method: "PUT",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ status: "COMPLETED" }),
                      });
                      toast.success("הפגישה הושלמה ללא תשלום");
                      onOpenChange(false);
                      onDataChanged();
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
                  onClick={() => onRequestCharge("NO_SHOW")}
                  className="w-full py-3 px-4 text-right hover:bg-red-50 transition-colors flex items-center gap-3"
                >
                  <span className="flex items-center justify-center w-7 h-7 rounded-full bg-red-600 text-white text-sm font-bold">3</span>
                  <span className="flex-1 font-medium">🚫 אי הופעה</span>
                </button>

                {/* 4. ביטול */}
                <button
                  onClick={async () => {
                    const sessionStart = new Date(session.startTime);
                    const hoursUntil = (sessionStart.getTime() - Date.now()) / (1000 * 60 * 60);

                    if (hoursUntil > 48) {
                      const cancelReason = prompt("סיבת ביטול (אופציונלי):");
                      if (cancelReason === null) return; // לחץ ביטול
                      try {
                        await fetch(`/api/sessions/${session.id}`, {
                          method: "PUT",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            status: "CANCELLED",
                            cancellationReason: cancelReason || undefined,
                          }),
                        });
                        toast.success("הפגישה בוטלה");
                        onOpenChange(false);
                        onSessionChange(null);
                        onDataChanged();
                      } catch {
                        toast.error("שגיאה בביטול הפגישה");
                      }
                    } else {
                      onRequestCharge("CANCELLED");
                    }
                  }}
                  className="w-full py-3 px-4 text-right hover:bg-orange-50 transition-colors flex items-center gap-3"
                >
                  <span className="flex items-center justify-center w-7 h-7 rounded-full bg-orange-600 text-white text-sm font-bold">4</span>
                  <span className="flex-1 font-medium">❌ ביטול פגישה</span>
                </button>
              </div>

              {/* כפתורי פונה — גם ב-SCHEDULED */}
              {isQuickClient && session.client && (
                <div className="space-y-2 pt-2">
                  <Button
                    onClick={() => {
                      onOpenChange(false);
                      router.push(`/dashboard/clients/new?fromQuick=${session.client?.id}&name=${encodeURIComponent(session.client?.name || "")}&phone=${encodeURIComponent(session.client?.phone || "")}&email=${encodeURIComponent(session.client?.email || "")}`);
                    }}
                    className="w-full gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
                  >
                    <UserCheck className="h-4 w-4" />
                    הפוך למטופל קבוע
                  </Button>
                  <Button
                    onClick={() => {
                      onOpenChange(false);
                      router.push(`/dashboard/calendar?client=${session.client?.id}`);
                    }}
                    className="w-full gap-2"
                    variant="outline"
                  >
                    <CalendarPlus className="h-4 w-4" />
                    קבע פגישה חדשה
                  </Button>
                </div>
              )}
              </>

            /* COMPLETED / NO_SHOW / CANCELLED - Structured sections */
            ) : (session.status === "COMPLETED" || session.status === "NO_SHOW" || session.status === "CANCELLED") ? (
              <div className="space-y-3">
                {/* סקשן תשלום */}
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-muted-foreground">💵 תשלום</p>
                  {renderPaymentSection()}
                </div>

                {/* סקשן סיכום - רק ל-COMPLETED */}
                {session.status === "COMPLETED" && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">📝 סיכום</p>
                    {renderSummarySection()}
                  </div>
                )}

                {/* סקשן ביטול / אי הופעה - רק כשיש מידע */}
                {(session.status === "CANCELLED" || session.status === "NO_SHOW") && hasCancellationInfo && (
                  <div className="space-y-1.5">
                    {renderCancellationSection()}
                  </div>
                )}

                {/* כפתורים לפונה (פגישת ייעוץ) */}
                {isQuickClient && session.client && (
                  <div className="space-y-2 pt-2 border-t">
                    <Button
                      onClick={() => {
                        onOpenChange(false);
                        router.push(`/dashboard/clients/new?fromQuick=${session.client?.id}&name=${encodeURIComponent(session.client?.name || "")}&phone=${encodeURIComponent(session.client?.phone || "")}&email=${encodeURIComponent(session.client?.email || "")}`);
                      }}
                      className="w-full gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700"
                    >
                      <UserCheck className="h-4 w-4" />
                      הפוך למטופל קבוע
                    </Button>
                    <Button
                      onClick={() => {
                        onOpenChange(false);
                        router.push(`/dashboard/calendar?client=${session.client?.id}`);
                      }}
                      className="w-full gap-2"
                      variant="outline"
                    >
                      <CalendarPlus className="h-4 w-4" />
                      קבע פגישה חדשה
                    </Button>
                  </div>
                )}

                {/* כפתור תיקית מטופל */}
                {session.client && (
                  <Button
                    onClick={() => {
                      onOpenChange(false);
                      router.push(`/dashboard/clients/${session.client?.id}`);
                    }}
                    className="w-full gap-2"
                    variant="outline"
                  >
                    <User className="h-4 w-4" />
                    {isQuickClient ? "צפה בפרטי פונה" : "תיקית מטופל"}
                  </Button>
                )}
              </div>

            ) : null}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            סגור
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
