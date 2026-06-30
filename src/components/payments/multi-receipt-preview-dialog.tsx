"use client";

// ──────────────────────────────────────────────────────────────────
// MultiReceiptPreviewDialog — מציג כמה קבלות בבת אחת (תשלום מצרפי על כמה
// פגישות עם "קבלה לכל פגישה"). חלון אחד עם גלילה אנכית + כפתור "הדפס הכל"
// שמדפיס את כולן, כל קבלה בעמוד נפרד.
//
// למה רכיב נפרד מ-ReceiptPreviewDialog? ReceiptPreviewDialog מציג קבלה
// אחת לפי paymentId יחיד (עם polling). כאן יש רשימת קבלות שכבר הופקו
// (receiptUrl זמין מיד — תשלום מזומן/העברה/צ'ק סינכרוני), אז טוענים את
// כולן במקביל ומרנדרים בלולאה.
//
// הדפסה — שונה מקבלה בודדת:
// • container עם id="mytipul-receipts-print" מרונדר כ-Portal ישיר
//   ב-document.body (לא בתוך ה-Radix dialog), כדי שכלל ה-print ב-globals.css
//   יוכל להשתמש ב-position:static + break-after:page בלי להתנגש עם ה-transform
//   של Radix. fixed (כמו בקבלה בודדת) היה חוזר על כל עמוד במקום לזלוג.
// • קבלות Cardcom (cross-origin) אינן ניתנות לרינדור/הדפסה inline — מוצגות
//   ככרטיס עם קישור פתיחה. הן ממילא נשלחות ללקוח אוטומטית ע"י Cardcom.
// ──────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  CreditCard,
} from "lucide-react";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { parseInternalReceipt, safeHttpUrl } from "@/lib/receipt-utils";

export interface MultiReceiptItem {
  paymentId: string;
  receiptNumber: string | null;
  receiptUrl: string | null;
}

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
  description?: string;
  therapist: {
    name: string;
    businessName: string;
    phone: string;
    address: string;
  };
}

type LoadState = "loading" | "ready" | "error";

interface LoadedReceipt {
  source: MultiReceiptItem;
  /** קבלת Cardcom (cross-origin) — לא ניתנת לרינדור inline. */
  isCardcom: boolean;
  state: LoadState;
  data: InternalReceiptData | null;
  /** עבור Cardcom — קישור בטוח לפתיחה/הדפסה בלשונית. */
  externalUrl: string | null;
}

const METHOD_LABELS: Record<string, string> = {
  CASH: "מזומן",
  CREDIT_CARD: "אשראי",
  BANK_TRANSFER: "העברה בנקאית",
  CHECK: "המחאה",
  CREDIT: "קרדיט",
  OTHER: "אחר",
};

interface MultiReceiptPreviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** רשימת הקבלות שהופקו. נחשב יציב (מ-state של ההורה) — לא ליצור inline. */
  receipts: MultiReceiptItem[];
}

export function MultiReceiptPreviewDialog({
  open,
  onOpenChange,
  receipts,
}: MultiReceiptPreviewDialogProps) {
  const [loaded, setLoaded] = useState<LoadedReceipt[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  // generation guard — מונע race של fetch ישן שחוזר אחרי close/reopen.
  const generationRef = useRef(0);

  useEffect(() => {
    if (!open || receipts.length === 0) {
      generationRef.current++;
      setLoaded([]);
      setIsLoading(false);
      return;
    }

    const gen = ++generationRef.current;
    setIsLoading(true);

    // אתחול: פנימית (טעינה מ-public) או Cardcom (קישור בלבד, ready מיד).
    const initial: LoadedReceipt[] = receipts.map((r) => {
      const internal = parseInternalReceipt(r.receiptUrl ?? null);
      if (internal) {
        return {
          source: r,
          isCardcom: false,
          state: "loading",
          data: null,
          externalUrl: null,
        };
      }
      // Cardcom / חיצוני — receiptUrl ישיר אם בטוח, אחרת redirect endpoint.
      const ext =
        safeHttpUrl(r.receiptUrl) ??
        safeHttpUrl(`/api/payments/${r.paymentId}/cardcom-receipt-pdf`);
      return {
        source: r,
        isCardcom: true,
        state: "ready",
        data: null,
        externalUrl: ext,
      };
    });
    setLoaded(initial);

    const internalItems = receipts
      .map((r, idx) => ({ idx, parsed: parseInternalReceipt(r.receiptUrl ?? null) }))
      .filter((x): x is { idx: number; parsed: { id: string; token: string } } => !!x.parsed);

    if (internalItems.length === 0) {
      setIsLoading(false);
      return;
    }

    void Promise.all(
      internalItems.map(async ({ idx, parsed }) => {
        try {
          const res = await fetch(
            `/api/receipts/${parsed.id}/public?t=${encodeURIComponent(parsed.token)}`,
          );
          if (!res.ok) return { idx, state: "error" as LoadState, data: null };
          const data = (await res.json()) as InternalReceiptData;
          return { idx, state: "ready" as LoadState, data };
        } catch {
          return { idx, state: "error" as LoadState, data: null };
        }
      }),
    ).then((results) => {
      if (gen !== generationRef.current) return;
      setLoaded((prev) => {
        const next = [...prev];
        for (const { idx, state, data } of results) {
          if (next[idx]) next[idx] = { ...next[idx], state, data };
        }
        return next;
      });
      setIsLoading(false);
    });
  }, [open, receipts]);

  const handlePrintAll = (): void => {
    // מאפשרים לדפדפן לסיים render לפני triggering print (כמו בקבלה בודדת).
    setTimeout(() => window.print(), 50);
  };

  const internalReadyCount = loaded.filter(
    (r) => !r.isCardcom && r.state === "ready" && r.data,
  ).length;
  // "הדפס הכל" מדפיס קבלות פנימיות בלבד (Cardcom נשלח ללקוח בנפרד). אם אין
  // אף קבלה פנימית מוכנה — אין מה להדפיס.
  const printDisabled = isLoading || internalReadyCount === 0;

  // ── גוף קבלה פנימית (משותף למסך ולהדפסה) ─────────────────────
  const renderReceiptBody = (data: InternalReceiptData, fallbackId: string) => {
    const businessName =
      data.therapist.businessName || data.therapist.name || "MyTipul";
    const dateStr = format(
      new Date(data.paidAt || data.createdAt),
      "dd בMMMM yyyy",
      { locale: he },
    );
    const methodLabel = METHOD_LABELS[data.method] || data.method;
    const receiptNum =
      data.receiptNumber || `R-${fallbackId.slice(0, 8).toUpperCase()}`;
    const sessionDateStr = data.sessionDate
      ? format(new Date(data.sessionDate), "dd/MM/yyyy")
      : null;

    return (
      <div
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
            {data.therapist.phone && <p>טלפון: {data.therapist.phone}</p>}
            {data.therapist.address && <p>כתובת: {data.therapist.address}</p>}
          </div>
          <div className="text-sm text-gray-500 text-left space-y-1 shrink-0">
            <p>קבלה מס׳: {receiptNum}</p>
            <p>תאריך: {dateStr}</p>
          </div>
        </div>

        <div className="px-8 py-5 border-b border-gray-200">
          <p className="text-xs font-semibold text-teal-700 mb-1">התקבל מאת:</p>
          <p className="text-lg font-semibold text-gray-900">{data.clientName}</p>
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
                  {data.description
                    ? data.description
                    : `פגישה טיפולית${sessionDateStr ? ` - ${sessionDateStr}` : ""}`}
                </td>
                <td className="py-4 px-4 text-sm text-gray-800 text-center border-b">
                  {methodLabel}
                </td>
                <td className="py-4 px-4 text-sm font-semibold text-gray-900 text-left border-b">
                  ₪{data.amount.toLocaleString()}
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div className="px-8 py-5 bg-gray-50 border-t-2 border-teal-500">
          <div className="flex justify-between items-center">
            <span className="text-xl font-bold text-teal-700">
              סה״כ שולם: ₪{data.amount.toLocaleString()}
            </span>
          </div>
          {data.isPartial && (
            <div className="mt-3 pt-3 border-t border-gray-200 text-sm text-gray-600 space-y-1">
              <div className="flex justify-between">
                <span>סכום מלא לפגישה:</span>
                <span className="font-medium">
                  ₪{data.expectedAmount.toLocaleString()}
                </span>
              </div>
              <div className="flex justify-between">
                <span>נותר לתשלום:</span>
                <span className="font-medium text-orange-600">
                  ₪{data.remaining.toLocaleString()}
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
            {format(new Date(data.paidAt || data.createdAt), "dd/MM/yyyy")}
          </p>
        </div>
      </div>
    );
  };

  // ── תצוגת קבלה במסך (פנימית / Cardcom / טעינה / שגיאה) ─────────
  const renderScreenCard = (item: LoadedReceipt, index: number) => {
    const label = `קבלה ${index + 1} מתוך ${loaded.length}`;
    return (
      <div key={item.source.paymentId} className="space-y-2">
        {/* תווית "קבלה N מתוך M" — רק כשיש כמה. לקבלה יחידה מס' הקבלה
            ממילא מופיע בתוך גוף הקבלה. */}
        {loaded.length > 1 && (
          <div className="flex items-center justify-between px-1">
            <span className="text-sm font-semibold text-muted-foreground">
              {label}
            </span>
            {item.source.receiptNumber && (
              <span className="text-xs text-muted-foreground font-mono">
                מס׳ {item.source.receiptNumber}
              </span>
            )}
          </div>
        )}

        {item.isCardcom ? (
          // קבלת Cardcom — אי אפשר לרנדר inline (cross-origin).
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm text-blue-900">
              <CreditCard className="h-4 w-4 shrink-0" />
              <span>קבלת אשראי (Cardcom) — נשלחה ללקוח אוטומטית.</span>
            </div>
            {item.externalUrl && (
              <a
                href={item.externalUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-md border bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent shrink-0"
              >
                <ExternalLink className="h-4 w-4" />
                פתח/הדפס
              </a>
            )}
          </div>
        ) : item.state === "loading" ? (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            טוענים קבלה...
          </div>
        ) : item.state === "error" || !item.data ? (
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-center gap-2 text-sm text-amber-800">
            <AlertCircle className="h-4 w-4 shrink-0" />
            לא ניתן לטעון את הקבלה כאן. ניתן לראות אותה בדף &quot;קבלות&quot;.
          </div>
        ) : (
          renderReceiptBody(item.data, item.source.paymentId)
        )}
      </div>
    );
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          showCloseButton={false}
          dir="rtl"
          className="sm:max-w-[860px] max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden"
        >
          <DialogHeader className="p-4 pb-3 border-b shrink-0 sm:text-right">
            <DialogTitle className="flex items-center gap-2 text-right">
              <Printer className="h-5 w-5 text-primary" />
              <span>
                {loaded.length === 1 ? "קבלה" : `קבלות (${loaded.length})`}
              </span>
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground text-right">
              {isLoading
                ? "טוענים את הקבלה..."
                : loaded.length === 1
                  ? 'הקבלה מוכנה. לחיצה על "הדפס" תפתח את חלון ההדפסה.'
                  : 'כל הקבלות מוצגות כאן. לחיצה על "הדפס הכל" תדפיס את כולן, כל קבלה בעמוד נפרד.'}
            </DialogDescription>
          </DialogHeader>

          {/* min-h-0 חיוני: בלעדיו flex-item עם תוכן גבוה לא מתכווץ, וכשגובה
              הדיאלוג (max-h-[90vh]) קטן מהתוכן — הקבלות "גולשות" מתחת לקופסת
              ה-DialogContent (overflow-hidden) אל אזור ה-overlay, שמיירט את
              הקליקים והופך את כפתורי "פתח/הדפס" לבלתי-לחיצים. עם min-h-0
              ה-overflow-y-auto נכנס לפעולה והקבלות נשארות בתוך הקופסה הלחיצה. */}
          <div className="flex-1 min-h-0 bg-gray-50 dark:bg-gray-900/40 overflow-y-auto p-4 space-y-6">
            {loaded.map((item, idx) => renderScreenCard(item, idx))}
          </div>

          <DialogFooter className="p-3 border-t bg-background shrink-0 gap-2 flex-row-reverse sm:justify-between">
            <Button
              onClick={handlePrintAll}
              disabled={printDisabled}
              className="gap-1.5 bg-teal-600 hover:bg-teal-700 font-bold"
            >
              <Printer className="h-4 w-4" />
              {loaded.length === 1 ? "הדפס" : "הדפס הכל"}
            </Button>
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

      {/* תוכן ההדפסה — Portal ישיר ל-document.body (מחוץ ל-Radix). מוסתר
          במסך (hidden), גלוי בהדפסה דרך הכלל ב-globals.css. כולל רק קבלות
          פנימיות מוכנות; Cardcom נשלח ללקוח בנפרד ולא ניתן להדפסה inline. */}
      {open &&
        typeof document !== "undefined" &&
        createPortal(
          <div id="mytipul-receipts-print" className="hidden">
            {loaded
              .filter((item) => !item.isCardcom && item.state === "ready" && item.data)
              .map((item) => (
                <div key={item.source.paymentId} className="mytipul-receipt-page">
                  {renderReceiptBody(item.data!, item.source.paymentId)}
                </div>
              ))}
          </div>,
          document.body,
        )}
    </>
  );
}
