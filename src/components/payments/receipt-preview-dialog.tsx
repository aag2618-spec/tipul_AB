"use client";

// ──────────────────────────────────────────────────────────────────
// ReceiptPreviewDialog — מציג את הקבלה מיד אחרי תשלום עם כפתור "הדפס".
//
// למה לא window.open(receiptUrl)? — popup blockers חוסמים window.open
// לאחר await fetch (איבוד user-gesture). ואפילו כשלא חסום, פתיחה בטאב חדש
// מסיחה את המטפל מהמסך. הצגה in-page פותרת את שני הצרכים: הקבלה מופיעה
// מיד, מודפסת בלחיצה אחת, בלי לעזוב את הדף.
//
// ארכיטקטורה — שני מצבים מובחנים, כל אחד עם מסלול הצגה משלו:
//
// 1) קבלה פנימית (EXEMPT / מזומן / העברה / צ'ק):
//    receiptUrl הוא `/receipt/{id}#t=<128bit token>`. במקום iframe (שנחסם
//    ע"י X-Frame-Options:DENY של ה-route המקורי), אנחנו שולפים את התוכן
//    ישירות מ-/api/receipts/{id}/public ומציירים inline ב-React. Print
//    משתמש ב-window.print() עם print-only CSS שמסתיר את כל הדף חוץ
//    מתוכן הקבלה — שיטה אמינה יותר מ-iframe.contentWindow.print() (לא
//    תלויה ב-onload עיתוי, לא נחסמת cross-origin).
//
// 2) קבלת Cardcom:
//    Cardcom מנפיק מסמך משפטי על המסוף שלהם ושולח ללקוח אוטומטית במייל/SMS.
//    ה-URL שלהם cross-origin עם X-Frame-Options:DENY → לא ניתן לשבץ ב-iframe.
//    מציגים מסך אישור עם כפתור "הדפס" שפותח בטאב חדש (תחת user-gesture
//    תקין → לא נחסם ע"י popup-blocker) ומפעיל print() אחרי load.
//
// 3) Polling — Cardcom יוצר את הקבלה דרך webhook, יכול לקחת 2-30s.
//    הדיאלוג עושה poll על /api/payments/[id] עד שיש receiptUrl או שעבר
//    timeout. אם רק receiptNumber+hasReceipt חזרו (מקרה Cardcom שמחזיר
//    DocumentNumber בלי DocumentUrl) — עוברים למסלול redirect endpoint
//    /api/payments/[id]/cardcom-receipt-pdf שעושה lazy-resolve.
// ──────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  Printer,
  ExternalLink,
  AlertCircle,
  CheckCircle2,
  CreditCard,
  Mail,
  MessageSquare,
} from "lucide-react";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { toast } from "sonner";
import { safeHttpUrl as sharedSafeHttpUrl } from "@/lib/receipt-utils";

interface ReceiptPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** ה-paymentId שהקבלה שלו תוצג. */
  paymentId: string | null;
  /** האם זה תשלום בכרטיס אשראי דרך Cardcom — משפיע על משך ה-polling
   *  ועל סוג ה-UI שמוצג (cardcom-confirmation במקום receipt inline). */
  isCardcom?: boolean;
  /** כותרת אופציונלית להחלפת ברירת המחדל. */
  title?: string;
}

const POLL_INTERVAL_MS = 2_000;
const POLL_TIMEOUT_INTERNAL_MS = 8_000;
const POLL_TIMEOUT_CARDCOM_MS = 30_000;

// re-export עבור backward compat (קוד פנימי קורא ל-safeHttpUrl המקומית).
const safeHttpUrl = sharedSafeHttpUrl;

const METHOD_LABELS: Record<string, string> = {
  CASH: "מזומן",
  CREDIT_CARD: "אשראי",
  BANK_TRANSFER: "העברה בנקאית",
  CHECK: "המחאה",
  CREDIT: "קרדיט",
  OTHER: "אחר",
};

interface InternalReceiptData {
  receiptNumber: string | null;
  amount: number;
  expectedAmount: number;
  method: string;
  paidAt: string | null;
  createdAt: string;
  clientName: string;
  sessionDate: string | null;
  receiptUrl: string | null;
  isPartial: boolean;
  remaining: number;
  therapist: {
    name: string;
    businessName: string;
    phone: string;
    address: string;
  };
}

interface PaymentSummary {
  receiptUrl: string | null;
  receiptNumber: string | null;
  hasReceipt: boolean;
}

export function ReceiptPreviewDialog({
  open,
  onOpenChange,
  paymentId,
  isCardcom = false,
  title,
}: ReceiptPreviewDialogProps) {
  const [paymentSummary, setPaymentSummary] = useState<PaymentSummary | null>(null);
  const [internalData, setInternalData] = useState<InternalReceiptData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string>("");
  // elapsedSeconds — מציג למשתמש כמה זמן עברו במהלך polling של Cardcom.
  // 30 שניות עם spinner סטטי מרגיש כמו תקלה; counter עוזר לדעת שעדיין
  // עובדים. רץ רק כשיש isLoading + isCardcom.
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollStartedAtRef = useRef<number>(0);
  // generation guard — מונע race-condition של polls/fetches ישנים
  // שחוזרים אחרי שהדיאלוג נסגר/נפתח שוב על paymentId אחר.
  const generationRef = useRef<number>(0);

  // ── elapsedSeconds ticker — רץ במהלך isLoading של Cardcom ──
  useEffect(() => {
    if (!open || !isLoading || !isCardcom) return;
    const interval = setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(interval);
  }, [open, isLoading, isCardcom]);

  // ── Polling: GET /api/payments/[id] עד שיש receiptUrl או timeout ──
  useEffect(() => {
    if (!open || !paymentId) {
      // ניקוי טיימר polling קודם.
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      generationRef.current++;
      // איפוס תצוגה כדי שלא יישאר מצב stale של ה-payment הקודם.
      setPaymentSummary(null);
      setInternalData(null);
      setErrorMessage("");
      setIsLoading(false);
      setElapsedSeconds(0);
      return;
    }

    const gen = ++generationRef.current;
    setPaymentSummary(null);
    setInternalData(null);
    setErrorMessage("");
    setIsLoading(true);
    setElapsedSeconds(0);
    pollStartedAtRef.current = Date.now();

    const timeoutMs = isCardcom ? POLL_TIMEOUT_CARDCOM_MS : POLL_TIMEOUT_INTERNAL_MS;

    const pollOnce = async (): Promise<void> => {
      if (gen !== generationRef.current) return;
      try {
        const res = await fetch(`/api/payments/${paymentId}`);
        if (gen !== generationRef.current) return;
        if (res.ok) {
          const pd = (await res.json()) as PaymentSummary;
          if (gen !== generationRef.current) return;
          // כשיש receiptUrl — מסיימים. גם כש-receiptNumber קיים בלי URL
          // (Cardcom שהחזיר DocumentNumber בלי DocumentUrl), אפשר להציג
          // "קבלה הופקה" עם כפתור הדפסה דרך redirect endpoint.
          if (pd?.receiptUrl || (pd?.hasReceipt && pd?.receiptNumber)) {
            setPaymentSummary(pd);
            // אם זה receipt פנימי (URL מכיל /receipt/...#t=...) — נטען
            // את הנתונים מהפנימי כדי לרנדר inline במקום iframe (שנחסם
            // ע"י XFO:DENY של עמוד ה-receipt עצמו).
            if (
              !isCardcom &&
              pd.receiptUrl &&
              pd.receiptUrl.includes("/receipt/") &&
              pd.receiptUrl.includes("#t=")
            ) {
              await fetchInternalReceiptData(pd.receiptUrl, gen);
            } else {
              setIsLoading(false);
            }
            return;
          }
        }
      } catch {
        // נמשיך לנסות — שגיאת רשת חולפת.
      }
      // עדיין אין — בודקים timeout.
      if (Date.now() - pollStartedAtRef.current > timeoutMs) {
        if (gen !== generationRef.current) return;
        setIsLoading(false);
        setErrorMessage(
          isCardcom
            ? "הקבלה עדיין בהפקה ב-Cardcom. תוכל/י לראות אותה תוך כמה דקות בדף 'קבלות'."
            : "לא נמצאה קבלה מקושרת לתשלום זה.",
        );
        return;
      }
      // תזמון poll נוסף — כולל gen-guard למניעת timer מיותר אחרי close.
      if (gen !== generationRef.current) return;
      pollTimerRef.current = setTimeout(pollOnce, POLL_INTERVAL_MS);
    };

    // טעינת נתוני הקבלה הפנימית (טוקן ב-fragment → query param).
    const fetchInternalReceiptData = async (
      receiptUrl: string,
      gen: number,
    ): Promise<void> => {
      try {
        // /receipt/{id}#t={token} → ID מהנתיב, token מה-fragment.
        const url = new URL(receiptUrl, window.location.origin);
        const idMatch = url.pathname.match(/\/receipt\/([^/]+)/);
        const id = idMatch?.[1];
        const token = url.hash.startsWith("#t=")
          ? decodeURIComponent(url.hash.substring("#t=".length))
          : "";
        if (!id || !token) {
          if (gen === generationRef.current) {
            setIsLoading(false);
            setErrorMessage("קישור הקבלה לא תקין.");
          }
          return;
        }
        const res = await fetch(
          `/api/receipts/${id}/public?t=${encodeURIComponent(token)}`,
        );
        if (gen !== generationRef.current) return;
        if (!res.ok) {
          setIsLoading(false);
          setErrorMessage("שגיאה בטעינת הקבלה.");
          return;
        }
        const data = (await res.json()) as InternalReceiptData;
        if (gen !== generationRef.current) return;
        setInternalData(data);
        setIsLoading(false);
      } catch {
        if (gen === generationRef.current) {
          setIsLoading(false);
          setErrorMessage("שגיאה בטעינת הקבלה.");
        }
      }
    };

    pollOnce();

    return () => {
      if (pollTimerRef.current) {
        clearTimeout(pollTimerRef.current);
        pollTimerRef.current = null;
      }
      generationRef.current++;
    };
  }, [open, paymentId, isCardcom]);

  // ── הדפסה של הקבלה הפנימית ─────────────────────────────────
  // משתמשים ב-window.print() עם print-only CSS שמסתיר את כל הדף חוץ
  // מ-#mytipul-receipt-print. זה אמין יותר מ-iframe.contentWindow.print()
  // שתלוי ב-onload + לא תמיד עובד cross-origin.
  const handlePrintInternal = (): void => {
    if (!internalData) return;
    // מאפשרים לדפדפן לסיים render לפני triggering print.
    setTimeout(() => window.print(), 50);
  };

  // resolveOpenUrl — בוחר ומאמת URL לפתיחה. עבור Cardcom: receiptUrl
  // מ-DB (אם קיים) או fallback ל-redirect endpoint same-origin
  // /api/payments/[id]/cardcom-receipt-pdf (lazy-resolve). לא-Cardcom
  // (פנימי): receiptUrl פנימי /receipt/[id]#t=... כ-fallback
  // אם הרינדור inline נכשל. תמיד עובר safeHttpUrl.
  const resolveOpenUrl = (): string | null => {
    const candidates: (string | null | undefined)[] = [
      paymentSummary?.receiptUrl,
      isCardcom && paymentId ? `/api/payments/${paymentId}/cardcom-receipt-pdf` : null,
    ];
    for (const c of candidates) {
      const u = safeHttpUrl(c);
      if (u) return u;
    }
    return null;
  };

  // ⚠️ הוסר window.open לטובת <a href target="_blank">.
  // למה: גם בלחיצה ישירה (ללא await fetch קודם) ה-popup-blocker יכול
  // לחסום window.open — בעיקר עם URL fragment (#t=token). בדיקות בשטח
  // הראו שזה קרה למטפלים. <a href target="_blank"> הוא ניווט מובהק,
  // לא popup, ואינו נחסם.
  // לגבי הדפסה אוטומטית של Cardcom: זה היה best-effort בלבד (cross-origin
  // SOP חוסם w.print() מהורה ברוב הדפדפנים). המשתמש לוחץ Ctrl+P בלשונית.
  // לכן אובדן ה-onload-print הוא minimal לעומת הרווח של popup-blocker safe.
  const externalOpenUrl = resolveOpenUrl(); // safe http/https URL או null

  const dialogTitle =
    title ?? (isCardcom ? "קבלת Cardcom" : "קבלה");

  // ── תוכן ──────────────────────────────────────────────────
  const renderLoading = () => (
    <div className="h-full min-h-[400px] flex flex-col items-center justify-center gap-3 p-8">
      <Loader2 className="h-10 w-10 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground text-center">
        {isCardcom
          ? "ממתינים לאישור הקבלה מ-Cardcom... זה עשוי לקחת עד חצי דקה."
          : "טוענים את הקבלה..."}
      </p>
      {isCardcom && elapsedSeconds > 0 && (
        <p className="text-xs text-muted-foreground/70 tabular-nums">
          ({elapsedSeconds} שניות)
        </p>
      )}
    </div>
  );

  const renderError = () => (
    <div className="h-full min-h-[400px] flex flex-col items-center justify-center gap-3 p-8">
      <div className="h-14 w-14 rounded-full bg-amber-100 flex items-center justify-center">
        <AlertCircle className="h-8 w-8 text-amber-600" />
      </div>
      <p className="text-sm text-amber-800 text-center max-w-md font-medium">
        {errorMessage}
      </p>
      {isCardcom && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            window.open("/dashboard/receipts", "_self");
          }}
          className="mt-2"
        >
          פתח/י את דף הקבלות
        </Button>
      )}
    </div>
  );

  // תצוגת קבלה פנימית (cash/transfer/EXEMPT) — רנדור inline ב-React.
  const renderInternalReceipt = () => {
    if (!internalData) return null;
    const businessName =
      internalData.therapist.businessName ||
      internalData.therapist.name ||
      "MyTipul";
    const dateStr = format(
      new Date(internalData.paidAt || internalData.createdAt),
      "dd בMMMM yyyy",
      { locale: he },
    );
    const methodLabel =
      METHOD_LABELS[internalData.method] || internalData.method;
    const receiptNum =
      internalData.receiptNumber ||
      `R-${(paymentId ?? "").slice(0, 8).toUpperCase()}`;
    const sessionDateStr = internalData.sessionDate
      ? format(new Date(internalData.sessionDate), "dd/MM/yyyy")
      : null;

    return (
      <div className="overflow-y-auto max-h-full p-4">
        {/* id="mytipul-receipt-print" — print-only CSS מסתיר את שאר הדף
            ומציג רק את האלמנט הזה (ראה globals.css). */}
        <div
          id="mytipul-receipt-print"
          className="bg-white rounded-xl shadow-md overflow-hidden mx-auto max-w-[720px]"
          style={{ fontFamily: "'Heebo', 'Segoe UI', Arial, sans-serif" }}
        >
          <div
            className="text-center py-8 px-6"
            style={{ background: "linear-gradient(135deg, #0f766e, #14b8a6)" }}
          >
            <h2 className="text-white text-3xl font-bold m-0">קבלה</h2>
            <p className="text-white/90 text-base mt-2">{businessName}</p>
          </div>

          <div className="flex justify-between items-start px-8 py-5 border-b border-gray-200 gap-4">
            <div className="text-sm text-gray-500 space-y-1">
              {internalData.therapist.phone && (
                <p>טלפון: {internalData.therapist.phone}</p>
              )}
              {internalData.therapist.address && (
                <p>כתובת: {internalData.therapist.address}</p>
              )}
            </div>
            <div className="text-sm text-gray-500 text-left space-y-1 shrink-0">
              <p>קבלה מס׳: {receiptNum}</p>
              <p>תאריך: {dateStr}</p>
            </div>
          </div>

          <div className="px-8 py-5 border-b border-gray-200">
            <p className="text-xs font-semibold text-teal-700 mb-1">
              התקבל מאת:
            </p>
            <p className="text-lg font-semibold text-gray-900">
              {internalData.clientName}
            </p>
          </div>

          <div className="px-8 py-0">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50">
                  <th className="py-3 px-4 text-right text-sm font-semibold text-gray-500 border-b">
                    תיאור
                  </th>
                  <th className="py-3 px-4 text-center text-sm font-semibold text-gray-500 border-b">
                    אמצעי תשלום
                  </th>
                  <th className="py-3 px-4 text-left text-sm font-semibold text-gray-500 border-b">
                    סכום
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="py-4 px-4 text-sm text-gray-800 border-b">
                    פגישה טיפולית
                    {sessionDateStr ? ` - ${sessionDateStr}` : ""}
                  </td>
                  <td className="py-4 px-4 text-sm text-gray-800 text-center border-b">
                    {methodLabel}
                  </td>
                  <td className="py-4 px-4 text-sm font-semibold text-gray-900 text-left border-b">
                    ₪{internalData.amount.toLocaleString()}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="px-8 py-5 bg-gray-50 border-t-2 border-teal-500">
            <div className="flex justify-between items-center">
              <span className="text-xl font-bold text-teal-700">
                סה״כ שולם: ₪{internalData.amount.toLocaleString()}
              </span>
            </div>
            {internalData.isPartial && (
              <div className="mt-3 pt-3 border-t border-gray-200 text-sm text-gray-600 space-y-1">
                <div className="flex justify-between">
                  <span>סכום מלא לפגישה:</span>
                  <span className="font-medium">
                    ₪{internalData.expectedAmount.toLocaleString()}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span>נותר לתשלום:</span>
                  <span className="font-medium text-orange-600">
                    ₪{internalData.remaining.toLocaleString()}
                  </span>
                </div>
                <p className="text-xs text-orange-500 mt-1 font-medium">
                  * תשלום חלקי
                </p>
              </div>
            )}
          </div>

          <div className="text-center py-6 border-t border-gray-200">
            <p className="text-xs text-gray-400">
              הופק על ידי MyTipul |{" "}
              {format(
                new Date(
                  internalData.paidAt || internalData.createdAt,
                ),
                "dd/MM/yyyy",
              )}
            </p>
          </div>
        </div>
      </div>
    );
  };

  // תצוגת אישור Cardcom (לא ניתן לרנדר inline — Cardcom מנפיק על המסוף שלהם).
  const renderCardcomConfirmation = () => (
    <div className="p-6 flex flex-col items-center justify-center text-center gap-4 max-w-md mx-auto">
      <div className="h-16 w-16 rounded-full bg-emerald-100 flex items-center justify-center">
        <CheckCircle2 className="h-9 w-9 text-emerald-600" />
      </div>
      <div className="space-y-1">
        <h3 className="text-lg font-bold text-gray-900">
          הקבלה הופקה ב-Cardcom
        </h3>
        {paymentSummary?.receiptNumber && (
          <p className="text-sm text-muted-foreground">
            מספר קבלה: <span className="font-mono font-medium">{paymentSummary.receiptNumber}</span>
          </p>
        )}
      </div>
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-sm text-blue-900 space-y-2 w-full">
        <div className="flex items-center gap-2 justify-center">
          <Mail className="h-4 w-4" />
          <MessageSquare className="h-4 w-4" />
          <span>הקבלה נשלחה ללקוח אוטומטית (מייל או SMS)</span>
        </div>
        <p className="text-xs text-blue-700">
          לחיצה על &quot;הדפס&quot; תפתח את הקבלה הרשמית מ-Cardcom — לעותק
          שלך כמטפל/ת.
        </p>
      </div>
    </div>
  );

  // ── disabled-flags למניעת חזרה — מחושבים פעם אחת לכל render ──
  const externalOpenDisabled = isLoading || !resolveOpenUrl();
  const printDisabled = isLoading || (
    isCardcom
      ? !!errorMessage || !resolveOpenUrl()
      : !internalData
  );

  // ── Render ──────────────────────────────────────────────────
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/*
        showCloseButton={false} — לא רוצים את ה-X של shadcn ב-physical
        right (שלא מתאים ל-RTL); ה-DialogFooter כולל "סגור" בעברית.
        dir="rtl" — מבטיח consistency עם שאר הדיאלוגים בפרויקט (חלקם
        מסתמכים על ירושה מ-html, חלקם מציינים מפורש; כאן מציינים
        כדי למנוע flips של logical properties).
        max-w-[860px]: רוחב מספיק לקבלה (720px) + paddings.
        max-h-[90vh] + flex-col + overflow-hidden — הקבלה גוללת פנימית.
      */}
      <DialogContent
        showCloseButton={false}
        dir="rtl"
        className="sm:max-w-[860px] max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden"
      >
        <DialogHeader className="p-4 pb-3 border-b shrink-0 sm:text-right">
          <DialogTitle className="flex items-center gap-2 text-right">
            {isCardcom ? (
              <CreditCard className="h-5 w-5 text-primary" />
            ) : (
              <Printer className="h-5 w-5 text-primary" />
            )}
            <span>{dialogTitle}</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground text-right">
            {isLoading
              ? "טוענים את הקבלה..."
              : errorMessage
                ? "אירעה שגיאה בטעינת הקבלה."
                : isCardcom
                  ? "התשלום אושר. ניתן להדפיס את הקבלה הרשמית."
                  : "הקבלה מוכנה להדפסה. לחיצה על \"הדפס\" תפתח את חלון ההדפסה."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 bg-gray-50 dark:bg-gray-900/40 overflow-hidden flex flex-col">
          {/* min-h — pinning גדול לטעינה/קבלה פנימית, קטן יותר ל-cardcom-card
              שלא צריך 400px גובה ריק. */}
          <div className={isCardcom && !isLoading ? "min-h-[200px]" : "min-h-[400px]"}>
            {isLoading && renderLoading()}
            {!isLoading && errorMessage && renderError()}
            {!isLoading && !errorMessage && isCardcom && renderCardcomConfirmation()}
            {!isLoading && !errorMessage && !isCardcom && renderInternalReceipt()}
          </div>
        </div>

        {/* Footer — ב-RTL, primary action ("הדפס") צריך להיות בצד הימני
            (start). flex-row-reverse משיג זאת + sm:justify-between שומר
            על "סגור" בצד שמאל. */}
        <DialogFooter className="p-3 border-t bg-background shrink-0 gap-2 flex-row-reverse sm:justify-between">
          <div className="flex gap-2 flex-row-reverse">
            {/* כפתור "הדפס": עבור קבלה פנימית — onClick שמדפיס את ה-DOM
                המקומי. עבור Cardcom — <a href target="_blank"> שפותח את
                ה-PDF הרשמי בלשונית; המשתמש מקיש Ctrl+P שם (cross-origin
                SOP מנע בעבר w.print() מהורה — לא איבדנו פונקציונליות). */}
            {isCardcom ? (
              externalOpenUrl ? (
                <a
                  href={externalOpenUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 rounded-md bg-teal-600 px-4 py-2 text-sm font-bold text-white hover:bg-teal-700 transition-colors"
                  aria-label="פתח את הקבלה הרשמית מ-Cardcom להדפסה"
                >
                  <Printer className="h-4 w-4" />
                  הדפס
                </a>
              ) : (
                <Button
                  disabled
                  className="gap-1.5 bg-teal-600 hover:bg-teal-700 font-bold"
                >
                  <Printer className="h-4 w-4" />
                  הדפס
                </Button>
              )
            ) : (
              <Button
                onClick={handlePrintInternal}
                disabled={printDisabled}
                className="gap-1.5 bg-teal-600 hover:bg-teal-700 font-bold"
              >
                <Printer className="h-4 w-4" />
                הדפס
              </Button>
            )}
            {/* כפתור "פתח בחלון חיצוני": <a href target="_blank"> בלי כל
                onClick — popup-blocker safe. אם externalOpenUrl null
                (URL לא חוקי), מציגים Button disabled לעקביות ויזואלית. */}
            {externalOpenUrl ? (
              <a
                href={externalOpenUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-disabled={externalOpenDisabled}
                className={`inline-flex items-center justify-center gap-1.5 rounded-md border bg-background px-4 py-2 text-sm font-medium transition-colors ${
                  externalOpenDisabled
                    ? "opacity-50 pointer-events-none"
                    : "hover:bg-accent hover:text-accent-foreground"
                }`}
                title={
                  isCardcom
                    ? "פתיחת הקבלה הרשמית ב-Cardcom"
                    : "גיבוי אם התצוגה המובנית לא עובדת"
                }
              >
                <ExternalLink className="h-4 w-4" />
                פתח בחלון חיצוני
              </a>
            ) : (
              <Button
                variant="outline"
                disabled
                className="gap-1.5"
              >
                <ExternalLink className="h-4 w-4" />
                פתח בחלון חיצוני
              </Button>
            )}
          </div>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="font-medium"
          >
            סגור
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
