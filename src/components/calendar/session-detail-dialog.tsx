"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, User, Phone, UserCheck, CalendarPlus, Stethoscope, Columns2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { QuickMarkPaid } from "@/components/payments/quick-mark-paid";
import { safeHttpUrl } from "@/lib/receipt-utils";
import { copayApplies } from "@/lib/commitments";
import { getTherapistAccent } from "@/lib/calendar/event-colors";
import type { CalendarSession } from "@/hooks/use-calendar-data";

// ── Types ──

export interface PaymentRequest {
  sessionId: string;
  clientId: string;
  amount: number;
  pendingSessionStatus: string;
  /**
   * If a Payment row already exists for this session, pass its id. The
   * Cardcom flow needs to operate on the existing row (e.g. a previous
   * abandoned attempt left a PENDING Payment with the right amount and
   * an in-flight CardcomTransaction). Without this, ChargeCardcomDialog's
   * ensurePaymentId() would POST /api/payments and createPaymentForSession
   * would create cascading child PAID rows and corrupt status.
   */
  paymentId?: string;
}

// שלב 2 (חדרים): אפשרות חדר לבורר "החלפת חדר". מגיע מ-/api/clinic/rooms
// (ריק למטפל/ת עצמאי/ת — אז הבורר לא יוצג).
interface ClinicRoomOption {
  id: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
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
  onRequestTimeUpdate: (params: {
    sessionId: string;
    oldStart: Date;
    oldEnd: Date;
    newStart: Date;
    newEnd: Date;
    source?: "manual" | "drag";
  }) => void;
  /**
   * Phase 3: שולט אם להציג מידע/פעולות תשלום. מזכירה ללא canViewPayments
   * תקבל undefined כאן או false → renderPaymentSection מוחזר כ-null
   * וכפתור "סיים ושלם" ב-SCHEDULED מוסתר. ברירת מחדל true לכל non-secretary
   * וכמו גם למזכירה שיש לה ההרשאה.
   */
  canViewPayments?: boolean;
  // יומן רב-מטפלים: מזהה המשתמש המחובר — כדי להציג "מטפל: X" רק כשהפגישה
  // שייכת למטפל אחר (לא מציגים למשתמש את שמו שלו).
  currentTherapistId?: string | null;
  // יומן רב-מטפלים: האם להציג "קבע פגישה במקביל" (קליניקה עם יותר ממטפל אחד).
  // למטפל יחיד / עצמאי לא מועבר → הכפתור לא מוצג והדיאלוג זהה לקודם.
  multiTherapist?: boolean;
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
  onRequestTimeUpdate,
  canViewPayments = true,
  currentTherapistId,
  multiTherapist = false,
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

  const [activeCommitment, setActiveCommitment] = useState<{
    copaymentAmount: number | null;
    healthFund: string | null;
    approvedSessions: number | null;
    usedSessions: number;
  } | null>(null);

  useEffect(() => {
    if (!open || !session?.client?.id) {
      setActiveCommitment(null);
      return;
    }
    fetch(`/api/clients/${session.client.id}/commitments`)
      .then((res) => res.ok ? res.json() : [])
      .then((commitments: Array<{ status: string; copaymentAmount: number | null; approvedSessions: number | null; usedSessions: number }>) => {
        const active = commitments.find((c: { status: string }) => c.status === "ACTIVE");
        if (active) {
          fetch(`/api/clients/${session.client!.id}?fields=basic`)
            .then((res) => res.ok ? res.json() : null)
            .then((clientData: { healthFund?: string } | null) => {
              setActiveCommitment({
                copaymentAmount: active.copaymentAmount != null ? Number(active.copaymentAmount) : null,
                healthFund: clientData?.healthFund || null,
                approvedSessions: active.approvedSessions,
                usedSessions: active.usedSessions,
              });
            })
            .catch(() => {
              setActiveCommitment({
                copaymentAmount: active.copaymentAmount != null ? Number(active.copaymentAmount) : null,
                healthFund: null,
                approvedSessions: active.approvedSessions,
                usedSessions: active.usedSessions,
              });
            });
        } else {
          setActiveCommitment(null);
        }
      })
      .catch(() => setActiveCommitment(null));
    // ESLint רואה ב-`session.client!.id` שימוש ב-`session.client` כ-dep. אבל
    // ה-id הוא היחיד שמעניין אותנו (כבר ב-deps), ו-`session.client` עצמו
    // עלול להיות אובייקט חדש בכל render של ההורה (גם עם אותו id). הוספתו
    // ל-deps תגרום לרי-פץ' אינסופי של commitments. הסכמה: ה-deps הנוכחי נכון.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, session?.client?.id]);

  // שלב 2 (חדרים): טעינת חדרי הקליניקה לבורר "החלפת חדר". ה-GET מחזיר [] למטפל/ת
  // עצמאי/ת (אין קליניקה) → הבורר פשוט לא יוצג והדיאלוג זהה לקודם (אילוץ קדוש).
  const [clinicRooms, setClinicRooms] = useState<ClinicRoomOption[]>([]);
  const [savingRoom, setSavingRoom] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    fetch("/api/clinic/rooms", { cache: "no-store" })
      .then(async (res) => {
        if (cancelled || !res.ok) return;
        const data = await res.json();
        if (!cancelled) setClinicRooms(Array.isArray(data) ? data : []);
      })
      .catch(() => {
        // שקט — בלי חדרים הבורר פשוט לא יוצג, השדה הטקסטואלי הקיים לא מושפע.
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!session) return null;

  // רק חדרים פעילים בבורר. למטפל/ת עצמאי/ת — מערך ריק → הבורר לא יוצג.
  const activeRooms = clinicRooms.filter((r) => r.isActive);
  // אם החדר המשויך כרגע הושבת — עדיין מציגים אותו בבורר (עם סימון "לא פעיל"),
  // כדי שהמשתמש יראה מה משויך ולא placeholder ריק.
  const currentRoom = session.roomId
    ? clinicRooms.find((r) => r.id === session.roomId) ?? null
    : null;
  const roomOptions =
    currentRoom && !currentRoom.isActive ? [currentRoom, ...activeRooms] : activeRooms;

  // החלפת/הסרת חדר לפגישה קיימת. שולח PUT עם roomId; השרת גוזר location=שם החדר
  // ובודק חפיפת חדר. בהצלחה — מעדכן את ה-session המוצג (onSessionChange) דרך תשובת
  // ה-PUT כדי שהבורר ישקף מיד את החדר החדש, ומרענן את היומן. בכישלון (למשל "החדר
  // תפוס") — toast עם הודעת השרת, והבורר חוזר אוטומטית לחדר הקודם (value נגזר מה-session).
  const handleRoomChange = async (value: string) => {
    const newRoomId = value === "__none__" ? "" : value;
    if ((session.roomId || "") === newRoomId) return; // ללא שינוי
    setSavingRoom(true);
    try {
      const res = await fetch(`/api/sessions/${session.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId: newRoomId }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.message || "שגיאה בעדכון החדר");
      }
      const updated = await res.json().catch(() => null);
      if (updated) onSessionChange(updated);
      toast.success(newRoomId ? "החדר עודכן" : "החדר הוסר");
      onDataChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "שגיאה בעדכון החדר");
    } finally {
      setSavingRoom(false);
    }
  };

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

  const handleTimeUpdate = (field: "startTime" | "endTime", value: string) => {
    if (!value) return;
    const newTime = new Date(value);
    if (Number.isNaN(newTime.getTime())) {
      toast.error("שעה לא תקינה");
      return;
    }
    const oldStart = new Date(session.startTime);
    const oldEnd = new Date(session.endTime);

    let newStart: Date;
    let newEnd: Date;
    if (field === "startTime") {
      const duration = oldEnd.getTime() - oldStart.getTime();
      newStart = newTime;
      newEnd = new Date(newTime.getTime() + duration);
    } else {
      newStart = oldStart;
      newEnd = newTime;
    }

    // אם לא השתנה כלום — לא שווה לפתוח דיאלוג
    if (newStart.getTime() === oldStart.getTime() && newEnd.getTime() === oldEnd.getTime()) {
      return;
    }

    onRequestTimeUpdate({
      sessionId: session.id,
      oldStart,
      oldEnd,
      newStart,
      newEnd,
      source: "manual",
    });
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
    // Phase 3: למזכירה ללא canViewPayments — לא מציגים סקציית תשלום בכלל.
    // ה-API /api/sessions/[id] כבר משמיט את payment עבורה (chunk 2), אז גם
    // אילו רצינו להציג "₪{paidAmount}" — לא היה לנו ערך אמיתי. ההסתרה כאן
    // היא ה-UI parallel ל-API gate, ומונעת מהמזכירה אפשרות ללחוץ על
    // QuickMarkPaid (שבעצמו ייכשל ב-403 בשרת אבל יוצר UX מבלבל).
    if (!canViewPayments) return null;

    const price = session.price;
    const payment = session.payment;
    // ⭐ paidAmount מחושב ע"י השרת (/api/sessions) — מטפל נכון בכל הזרמים:
    //   • PAID                              → amount (שולם מלא).
    //   • PENDING+CC + children PAID        → sum(children) (השלמת אשראי חלקי
    //                                          אחרי bumpParentOnChildApproval).
    //   • PENDING+CC + hasReceipt           → amount (אשראי חלקי ישיר).
    //   • PENDING+CC ללא receipt/children   → 0 (placeholder לסליקה ממתינה).
    //   • PENDING+CASH/CHECK/BANK           → amount (תשלום חלקי שכבר התקבל).
    // fallback ל-`Number(amount)` אם השרת לא מחזיר paidAmount (call sites ישנים).
    const paidAmount =
      typeof payment?.paidAmount === "number"
        ? Number(payment.paidAmount)
        : payment?.status === "PAID" ||
          (payment?.status === "PENDING" && payment?.method !== "CREDIT_CARD")
        ? Number(payment?.amount || 0)
        : 0;
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
      // ⭐ "הצג / הדפס קבלה" — מימוש כ-<a href target="_blank"> ולא window.open.
      //
      // ⚠️ למה לא window.open: גם בלחיצה ישירה (ללא async/fetch ביניים)
      // ה-popup-blocker של הדפדפן יכול לחסום window.open — במיוחד כש-URL
      // מכיל hash fragment (כמו /receipt/{id}#t=...). בדיקות בשטח מאששות
      // שזה קרה למטפלים בפועל (Chrome/Edge ב-Windows). <a href target="_blank">
      // הוא ניווט-משתמש מובהק ואינו נחסם.
      //
      // safeHttpUrl: אנחנו עדיין מאמתים שה-URL הוא http/https/relative
      // לפני הצגת הכפתור — receiptUrl מגיע מ-DB ויכול תיאורטית להכיל
      // javascript:/data: אם webhook מספק חיצוני יחזיר ערך מורעל.
      const safeReceiptUrl = payment.receiptUrl
        ? safeHttpUrl(payment.receiptUrl)
        : null;
      return (
        <div className="rounded-lg p-3 bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 space-y-2">
          <div>
            <p className="text-sm font-medium text-green-700 dark:text-green-300">
              ✓ שולם ₪{paidAmount}
            </p>
            <p className="text-xs text-green-600 dark:text-green-400">
              {PAYMENT_METHOD_LABELS[payment.method || ""] || ""}
              {payment.paidAt &&
                ` • ${format(new Date(payment.paidAt), "d/M/yyyy")}`}
              {payment.receiptNumber && ` • קבלה ${payment.receiptNumber}`}
            </p>
          </div>
          {payment.hasReceipt && safeReceiptUrl && (
            <a
              href={safeReceiptUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center w-full text-xs gap-2 rounded-md border border-green-300 bg-white px-3 py-2 font-medium text-green-700 hover:bg-green-100 dark:border-green-700 dark:bg-transparent dark:text-green-300 dark:hover:bg-green-900 transition-colors"
              aria-label="הצג או הדפס את הקבלה בלשונית חדשה"
            >
              📄 הצג / הדפס קבלה
            </a>
          )}
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

    // ── פטור מתשלום: זיהוי loud-fallback ─────────────────────────
    // היסטוריה: ב-2026-05-26 commit a46a514b הצמצם את calendar API ולא
    // החזיר payment, מה שגרם לכל פגישה ששולמה להיראות כ"פטור מתשלום".
    // אסור לסמוך על "אם אין payment → פטור" כי זה אותו signature של
    // "הקריאה לשרת לא החזירה את השדות".
    //
    // היוריסטיקת זיהוי: פגישה COMPLETED בלי payment ובלי sessionNote
    // ועם price > 0 — זה כמעט בטוח רגרסיה (אם המטפל בחר "ללא תשלום"
    // הוא לרוב נשאר על SCHEDULED, או נכתבת sessionNote). מציגים מסך
    // שגיאה ברור עם הנחיה לרענן + dev console warning, במקום להציג
    // "פטור מתשלום" שקרי.
    const looksLikeRegression =
      !payment &&
      !session.sessionNote &&
      price > 0 &&
      session.status === "COMPLETED";
    if (looksLikeRegression) {
      if (typeof console !== "undefined" && process.env.NODE_ENV !== "production") {
        console.warn(
          "[SessionDetailDialog] suspected data-shape regression: COMPLETED session with price>0 has no payment AND no sessionNote. Did the API drop `payment` from the include?",
          { sessionId: session.id, status: session.status, price },
        );
      }
      return (
        <div className="rounded-lg p-3 bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 space-y-2">
          <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
            ⚠️ לא הצלחנו לטעון פרטי תשלום
          </p>
          <p className="text-xs text-amber-700 dark:text-amber-300">
            פגישה זו הסתיימה אבל לא נטענו עבורה פרטי תשלום. נסה/י לרענן
            את הדף. אם הבעיה ממשיכה — פנה/י לתמיכה.
          </p>
          <button
            onClick={() => window.location.reload()}
            className="text-xs underline text-amber-700 dark:text-amber-300 hover:text-amber-900"
          >
            רענן את הדף
          </button>
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
      <DialogContent className="max-w-[calc(100vw-2rem)] sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>פרטי פגישה</DialogTitle>
          <DialogDescription>
            {session.client?.name || "הפסקה"} • {format(new Date(session.startTime), "d/M/yyyy HH:mm")}
          </DialogDescription>
          {/* יומן רב-מטפלים: שם המטפל/ת האחראי/ת — מוצג רק כשזו פגישה של מטפל
              אחר (לא של המשתמש עצמו), כדי שמזכירה/מנהלת יראו מיד עם מי הפגישה. */}
          {session.therapistName && session.therapistId !== currentTherapistId && (
            <div className="flex items-center gap-1.5 text-sm font-medium pt-0.5">
              <span
                className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: getTherapistAccent(session.therapistId) }}
                aria-hidden
              />
              <span>מטפל/ת: {session.therapistName}</span>
            </div>
          )}
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

          {/* יומן רב-מטפלים: קביעת פגישה נוספת על *אותה* משבצת (מטפל/חדר אחר).
              זמין בכל סטטוס — כך אפשר למלא שעה תפוסה בקיבולת פנויה של הקליניקה.
              מוצג רק במצב רב-מטפלים ולא להפסקה (להפסקה יש כפתור ייעודי למטה). */}
          {multiTherapist && session.type !== "BREAK" && (
            <Button
              variant="outline"
              className="w-full gap-2 border-indigo-300 text-indigo-700 hover:bg-indigo-50"
              onClick={() => {
                onOpenChange(false);
                onOpenNewSession({
                  startTime: format(new Date(session.startTime), "yyyy-MM-dd'T'HH:mm"),
                  endTime: format(new Date(session.endTime), "yyyy-MM-dd'T'HH:mm"),
                  type: "IN_PERSON",
                });
              }}
            >
              <Columns2 className="h-4 w-4" />
              קבע פגישה במקביל (אותה שעה)
            </Button>
          )}

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

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

          {/* שלב 2 (חדרים): החלפת/הסרת חדר לפגישה עתידית. מגודר ב-roomOptions.length>0 —
              למטפל/ת עצמאי/ת אין חדרים והבלוק לא מוצג כלל (אילוץ קדוש: התנהגות זהה).
              השרת גוזר location=שם החדר ובודק חפיפת חדר; "החדר תפוס" יחזור כ-toast. */}
          {session.status === "SCHEDULED" &&
            new Date(session.startTime) > new Date() &&
            session.type !== "BREAK" &&
            roomOptions.length > 0 && (
              <div className="border rounded-lg p-4 bg-slate-50 space-y-2">
                <Label htmlFor="edit-room" className="text-sm font-medium">חדר</Label>
                <Select
                  value={session.roomId || "__none__"}
                  onValueChange={handleRoomChange}
                  disabled={savingRoom}
                >
                  <SelectTrigger id="edit-room" className="text-sm">
                    <SelectValue placeholder="בחר/י חדר..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">ללא חדר</SelectItem>
                    {roomOptions.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {r.name}
                        {!r.isActive ? " (לא פעיל)" : ""}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
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
              <>{activeCommitment && activeCommitment.copaymentAmount != null && (
                copayApplies(activeCommitment) ? (
                <div className="flex items-center gap-2 p-3 mb-2 bg-blue-50 rounded-lg border border-blue-200">
                  <Stethoscope className="h-4 w-4 text-blue-700 shrink-0" />
                  <div className="text-sm text-blue-800">
                    <span className="font-semibold">
                      קופת חולים: {{ CLALIT: "כללית", MACCABI: "מכבי", MEUHEDET: "מאוחדת", LEUMIT: "לאומית" }[activeCommitment.healthFund || ""] || "לא צוינה"}
                    </span>
                    <span className="mx-1">|</span>
                    <span>השתתפות עצמית: ₪{activeCommitment.copaymentAmount}</span>
                    {activeCommitment.approvedSessions != null && (
                      <>
                        <span className="mx-1">|</span>
                        <span>טיפולים: {activeCommitment.usedSessions}/{activeCommitment.approvedSessions}</span>
                      </>
                    )}
                  </div>
                </div>
                ) : (
                <div className="flex items-center gap-2 p-3 mb-2 bg-amber-50 rounded-lg border border-amber-200">
                  <Stethoscope className="h-4 w-4 text-amber-700 shrink-0" />
                  <div className="text-sm text-amber-800">
                    <span className="font-semibold">נוצלו כל הטיפולים בהתחייבות ({activeCommitment.usedSessions}/{activeCommitment.approvedSessions})</span>
                    <span className="mx-1">|</span>
                    <span>חיוב מלא: ₪{session.price}</span>
                  </div>
                </div>
                )
              )}
              <div className="border rounded-lg divide-y">
                <p className="text-sm font-medium text-center py-2 bg-muted/50">בחר פעולה:</p>

                {/* 1. סיים ושלם — Phase 3: מוסתר ממזכירה ללא canViewPayments.
                    היא עדיין רואה "סיים ללא תשלום" (אדמיניסטרטיבי), "אי הופעה",
                    ו-"ביטול". סימון פעולת חיוב דורש הרשאת תשלומים. */}
                {canViewPayments && (
                <button
                  onClick={() => {
                    if (!session.client) return;
                    onOpenChange(false);
                    // ⭐ paidAmount מהשרת — מטפל נכון גם בהשלמת אשראי חלקי
                    // (parent.amount כבר מעודכן אבל status=PENDING+CC, לכן
                    // הבדיקה הישנה החזירה 0 וניסתה לחייב את המטופל סכום מלא
                    // נוסף → 400 "חורג מהיתרה"). ראה ההערה ב-/api/sessions.
                    const paidAmount =
                      typeof session.payment?.paidAmount === "number"
                        ? Number(session.payment.paidAmount)
                        : session.payment?.status === "PAID"
                        ? Number(session.payment?.amount || 0)
                        : 0;
                    // ההשתתפות העצמית חלה רק כל עוד נותרו טיפולים מאושרים;
                    // מוצתה המכסה → מחיר הפגישה המלא.
                    const effectivePrice =
                      activeCommitment?.copaymentAmount != null && copayApplies(activeCommitment)
                        ? activeCommitment.copaymentAmount
                        : session.price;
                    onRequestPayment({
                      sessionId: session.id,
                      clientId: session.client.id,
                      amount: effectivePrice - paidAmount,
                      paymentId: session.payment?.id,
                      pendingSessionStatus: "COMPLETED",
                    });
                  }}
                  className="w-full py-3 px-4 text-right hover:bg-green-50 transition-colors flex items-center gap-3"
                >
                  <span className="flex items-center justify-center w-7 h-7 rounded-full bg-green-600 text-white text-sm font-bold">1</span>
                  <span className="flex-1 font-medium">✅ סיים ושלם</span>
                </button>
                )}

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
                      router.push(`/dashboard/clients/new?fromQuick=${session.client?.id}`);
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
                {/* סקשן תשלום — Phase 3: עוטפים את **כל** הבלוק (כולל הכותרת)
                    ב-canViewPayments, כדי שלמזכירה ללא הרשאה לא תוצג כותרת
                    "💵 תשלום" יתומה בלי תוכן. ה-API ממילא לא מחזיר את payment
                    עבורה (chunk 2 — f0baa959). */}
                {canViewPayments && (
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-muted-foreground">💵 תשלום</p>
                    {renderPaymentSection()}
                  </div>
                )}

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
                        router.push(`/dashboard/clients/new?fromQuick=${session.client?.id}`);
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
