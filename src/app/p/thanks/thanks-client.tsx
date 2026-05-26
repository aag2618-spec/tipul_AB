"use client";

import { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { he } from "date-fns/locale";
import { safeHttpUrl, parseInternalReceipt } from "@/lib/receipt-utils";

interface Props {
  transactionId: string | null;
}

type Status =
  | "loading"
  | "pending"
  | "approved"
  | "partial"
  | "refunded"
  | "failed"
  | "timeout";

// "ready-internal": רינדור inline של קבלה פנימית (יש internalData).
// "ready-cardcom": כפתור פתיחה ל-PDF הרשמי של Cardcom.
// "ready-fallback": יש receiptUrl פנימי אבל public-receipt API נכשל →
//   מציעים פתיחה בדף נפרד (כי inline אי אפשר). מונע dead-zone.
// "polling-receipt": APPROVED אבל אין עדיין receiptUrl — webhook בעיבוד.
type ReceiptStatus =
  | "idle"
  | "polling"
  | "polling-receipt"
  | "ready-internal"
  | "ready-cardcom"
  | "ready-fallback"
  | "timeout"
  | "error";

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

interface TxStatusResponse {
  status?: string;
  debtFullyPaid?: boolean;
  paymentId?: string | null;
  receiptUrl?: string | null;
  receiptNumber?: string | null;
  hasReceipt?: boolean;
}

// Best-effort sanitization של נתוני הקבלה הציבוריים. שדות שמגיעים כ-NaN/
// undefined/format פגום עלולים להפיל את ה-render (`format(new Date(NaN))`).
function isValidInternalReceiptData(data: unknown): data is InternalReceiptData {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  if (typeof d.amount !== "number" || !Number.isFinite(d.amount)) return false;
  if (typeof d.method !== "string") return false;
  if (typeof d.clientName !== "string") return false;
  if (!d.therapist || typeof d.therapist !== "object") return false;
  // createdAt חייב להיות parsable; paidAt יכול להיות null.
  if (typeof d.createdAt !== "string") return false;
  const dateMs = new Date(d.createdAt).getTime();
  if (!Number.isFinite(dateMs)) return false;
  return true;
}

export function ThanksClient({ transactionId }: Props) {
  const [status, setStatus] = useState<Status>(transactionId ? "loading" : "approved");
  const [receiptStatus, setReceiptStatus] = useState<ReceiptStatus>("idle");
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const [receiptNumber, setReceiptNumber] = useState<string | null>(null);
  const [internalData, setInternalData] = useState<InternalReceiptData | null>(null);
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [hasReceipt, setHasReceipt] = useState<boolean>(false);

  // generation guard + timer ref — מניעת stale setState אחרי unmount /
  // navigation. timeoutRef מאפשר clearTimeout מפורש ב-cleanup
  // (defense-in-depth מעבר ל-cancelled flag).
  const generationRef = useRef<number>(0);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!transactionId) return;
    const gen = ++generationRef.current;
    let cancelled = false;
    let attempts = 0;
    // 30 ניסיונות × 3s = 90s — זמן רחב גם כש-webhook של Cardcom מתעכב.
    const MAX_ATTEMPTS = 30;

    const scheduleNext = (delayMs: number, fn: () => void) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(fn, delayMs);
    };

    const tick = async () => {
      if (cancelled || gen !== generationRef.current) return;
      if (attempts >= MAX_ATTEMPTS) {
        if (!cancelled) {
          setStatus((s) =>
            s === "approved" || s === "partial" || s === "refunded" ? s : "timeout",
          );
          setReceiptStatus((rs) =>
            rs === "ready-internal" || rs === "ready-cardcom" || rs === "ready-fallback"
              ? rs
              : "timeout",
          );
        }
        return;
      }
      attempts++;
      try {
        const res = await fetch(
          `/api/p/transaction-status?t=${encodeURIComponent(transactionId)}`,
        );
        if (cancelled || gen !== generationRef.current) return;
        if (!res.ok) {
          // אסור fail-open ל-"approved" על 5xx/429.
          if (attempts >= MAX_ATTEMPTS) {
            setStatus("timeout");
            return;
          }
          setStatus("pending");
          scheduleNext(3000, tick);
          return;
        }
        const data = (await res.json()) as TxStatusResponse;
        if (cancelled || gen !== generationRef.current) return;

        // ── עדכון status התשלום ────────────────────────────────────
        if (data.status === "REFUNDED") {
          setStatus("refunded");
          // החזר — אין צורך להציג קבלה (החזר אינו קבלה רגילה).
          setReceiptStatus("idle");
          return;
        }
        if (data.status === "APPROVED") {
          setStatus(data.debtFullyPaid === false ? "partial" : "approved");
        } else if (
          data.status === "DECLINED" ||
          data.status === "FAILED" ||
          data.status === "CANCELLED" ||
          data.status === "EXPIRED"
        ) {
          setStatus("failed");
          return;
        } else {
          setStatus("pending");
        }

        // ── Receipt resolution (רק ב-APPROVED) ────────────────────
        if (data.status !== "APPROVED") {
          scheduleNext(3000, tick);
          return;
        }

        // הוספת paymentId/hasReceipt — נשמש ב-fallback ל-cardcom-receipt-pdf
        // אם יש hasReceipt+receiptNumber בלי receiptUrl.
        if (data.paymentId) setPaymentId(data.paymentId);
        if (data.hasReceipt) setHasReceipt(true);

        if (data.receiptUrl) {
          const safe = safeHttpUrl(data.receiptUrl);
          if (safe) {
            setReceiptUrl(safe);
            setReceiptNumber(data.receiptNumber ?? null);
            const internal = parseInternalReceipt(safe);
            if (internal) {
              try {
                const r = await fetch(
                  `/api/receipts/${internal.id}/public?t=${encodeURIComponent(internal.token)}`,
                );
                if (cancelled || gen !== generationRef.current) return;
                if (r.ok) {
                  const d: unknown = await r.json();
                  if (isValidInternalReceiptData(d)) {
                    setInternalData(d);
                    setReceiptStatus("ready-internal");
                    return;
                  }
                  // נתונים פגומים — מציעים פתיחה ב-link הפנימי כ-fallback
                  // (ה-/receipt/{id} עצמו ירנדר נכון).
                  setReceiptStatus("ready-fallback");
                  return;
                }
                // public API נכשל (4xx/5xx) — fallback לפתיחה בדף נפרד
                // במקום dead-zone של "תוצג כאן" בלי קבלה.
                setReceiptStatus("ready-fallback");
                return;
              } catch {
                if (cancelled || gen !== generationRef.current) return;
                setReceiptStatus("ready-fallback");
                return;
              }
            }
            // Cardcom URL — לא inline; כפתור "הדפס/צפה".
            setReceiptStatus("ready-cardcom");
            return;
          }
          // safeHttpUrl נכשל — URL לא חוקי.
          setReceiptStatus("error");
          return;
        }

        // אין receiptUrl אבל hasReceipt+receiptNumber → Cardcom מחזיר
        // DocumentNumber לפני שיש URL. אפשר לתת הוראה ללקוח להמתין/בדוק
        // מייל. ממשיכים polling קצר ואז עוברים ל-ready-cardcom עם
        // /api/payments/[id]/cardcom-receipt-pdf (lazy-resolve).
        if (data.hasReceipt && data.receiptNumber && data.paymentId) {
          // נסיון fallback אחד דרך cardcom-receipt-pdf endpoint.
          // (זה endpoint redirect שמבצע lazy-resolve מול Cardcom.)
          // לא קוראים ל-API עכשיו — רק חושפים את האפשרות בכפתור.
          setReceiptUrl(`/api/payments/${data.paymentId}/cardcom-receipt-pdf`);
          setReceiptNumber(data.receiptNumber);
          setReceiptStatus("ready-cardcom");
          return;
        }

        // עדיין אין מה להציג — webhook עוד לא הפיק. ממשיכים polling.
        setReceiptStatus("polling-receipt");
        scheduleNext(3000, tick);
      } catch {
        if (cancelled || gen !== generationRef.current) return;
        if (attempts >= MAX_ATTEMPTS) {
          setStatus("timeout");
          return;
        }
        setStatus("pending");
        scheduleNext(3000, tick);
      }
    };
    tick();
    return () => {
      cancelled = true;
      generationRef.current++;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [transactionId]);

  // ── Print handlers ─────────────────────────────────────────────
  const handlePrintInternal = (): void => {
    setTimeout(() => window.print(), 50);
  };

  // ⚠️ window.open הוסר — Cardcom לחצנים נטענים כ-<a href target="_blank">.
  // popup-blocker חוסם window.open גם בלחיצה ישירה במיוחד ב-public landing
  // page בלי היסטוריה של ה-domain. anchor click הוא ניווט מובהק ולא נחסם.
  const safeReceiptUrl = safeHttpUrl(receiptUrl);
  const isReady =
    receiptStatus === "ready-internal" ||
    receiptStatus === "ready-cardcom" ||
    receiptStatus === "ready-fallback";

  return (
    <div className="min-h-screen bg-gray-50 p-4 print:bg-white print:p-0" dir="rtl">
      {/* כרטיס סטטוס תשלום */}
      <div
        className="max-w-md w-full bg-white shadow rounded-lg p-8 text-center mx-auto print:hidden"
        aria-live="polite"
      >
        {(status === "approved" || status === "partial") && (
          <>
            <div className="text-5xl mb-4" aria-hidden="true">✅</div>
            <h1 className="text-2xl font-bold mb-2">
              {status === "partial" ? "החיוב באשראי אושר" : "התשלום התקבל"}
            </h1>
            <p className="text-gray-600">
              {status === "partial"
                ? "התשלום שולם בהצלחה. אם נותרה יתרה — היא מופיעה בכרטיס שלך אצל המטפל."
                : isReady
                  ? "תודה רבה. הקבלה מוכנה למטה — אפשר להדפיס."
                  : "תודה רבה. הקבלה תוצג כאן להדפסה ברגע שתופק."}
            </p>
            {receiptStatus === "polling-receipt" && (
              <p className="text-sm text-gray-500 mt-3">
                מכינים את הקבלה...
              </p>
            )}
          </>
        )}
        {status === "refunded" && (
          <>
            <div className="text-5xl mb-4" aria-hidden="true">↩️</div>
            <h1 className="text-2xl font-bold mb-2">התשלום הוחזר</h1>
            <p className="text-gray-600">
              ההחזר עובד בהצלחה. לפרטים נוספים פנה/י למטפל.
            </p>
          </>
        )}
        {status === "loading" && (
          <>
            <div className="text-5xl mb-4" aria-hidden="true">⌛</div>
            <h1 className="text-2xl font-bold mb-2">בודק את התשלום...</h1>
          </>
        )}
        {status === "pending" && (
          <>
            <div className="text-5xl mb-4" aria-hidden="true">⌛</div>
            <h1 className="text-2xl font-bold mb-2">התשלום בעיבוד</h1>
            <p className="text-gray-600">
              התשלום שלך מתעבד. הדף יתעדכן אוטומטית.
            </p>
          </>
        )}
        {status === "timeout" && (
          <>
            <div className="text-5xl mb-4" aria-hidden="true">⏱️</div>
            <h1 className="text-2xl font-bold mb-2">העיבוד לוקח יותר זמן מהרגיל</h1>
            <p className="text-gray-600">
              לא קיבלנו עדיין אישור סופי מ-Cardcom. אם חויבת — האישור
              יגיע בדקות הקרובות. רענן/י את הדף או פנה/י למטפל.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="mt-4 inline-flex items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-white text-sm font-medium hover:bg-blue-700"
            >
              רענן
            </button>
          </>
        )}
        {status === "failed" && (
          <>
            <div className="text-5xl mb-4" aria-hidden="true">⚠️</div>
            <h1 className="text-2xl font-bold mb-2">התשלום לא הושלם</h1>
            <p className="text-gray-600">פנה/י למטפל שלך לקישור חדש.</p>
          </>
        )}
      </div>

      {/* ── תצוגת קבלה ─────────────────────────────────────────── */}
      {/* קבלה פנימית — רינדור inline + print */}
      {receiptStatus === "ready-internal" &&
        (status === "approved" || status === "partial") &&
        internalData && (
          <div className="max-w-2xl mx-auto mt-6 print:mt-0">
            {/* Footer פעולות — ב-RTL primary-action ימינה דרך flex-row-reverse. */}
            <div className="flex flex-row-reverse items-center justify-between gap-3 mb-3 print:hidden">
              <div className="flex flex-row-reverse gap-2">
                <button
                  onClick={handlePrintInternal}
                  className="inline-flex items-center justify-center rounded-md bg-teal-600 px-4 py-2 text-white text-sm font-bold hover:bg-teal-700"
                  aria-label="הדפס את הקבלה"
                >
                  הדפס קבלה
                </button>
                {safeReceiptUrl && (
                  <a
                    href={safeReceiptUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    פתח בדף נפרד
                  </a>
                )}
              </div>
              <p className="text-sm text-gray-600">
                {receiptNumber ? `קבלה מס׳ ${receiptNumber}` : "קבלה מוכנה להדפסה"}
              </p>
            </div>
            <ReceiptCard data={internalData} />
          </div>
        )}

      {/* קבלה פנימית fallback — public API נכשל; פתיחת ה-link הישיר */}
      {receiptStatus === "ready-fallback" &&
        (status === "approved" || status === "partial") &&
        safeReceiptUrl && (
          <div className="max-w-md mx-auto mt-6 bg-white shadow rounded-lg p-6 text-center print:hidden">
            <div className="text-3xl mb-2" aria-hidden="true">📄</div>
            <h2 className="text-lg font-bold mb-1">הקבלה מוכנה</h2>
            {receiptNumber && (
              <p className="text-sm text-gray-500 mb-3">
                מס׳ קבלה: <span className="font-mono">{receiptNumber}</span>
              </p>
            )}
            <p className="text-sm text-gray-600 mb-4">
              לחץ/י כדי לפתוח את הקבלה בדף נפרד להדפסה.
            </p>
            <a
              href={safeReceiptUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center rounded-md bg-teal-600 px-4 py-2 text-white text-sm font-bold hover:bg-teal-700"
            >
              פתח את הקבלה
            </a>
          </div>
        )}

      {/* קבלת Cardcom — לא ניתן inline (XFO:DENY). כפתור פתיחה/הדפסה. */}
      {receiptStatus === "ready-cardcom" &&
        (status === "approved" || status === "partial") &&
        safeReceiptUrl && (
          <div className="max-w-md mx-auto mt-6 bg-white shadow rounded-lg p-6 text-center print:hidden">
            <div className="text-3xl mb-2" aria-hidden="true">📄</div>
            <h2 className="text-lg font-bold mb-1">הקבלה הרשמית מוכנה</h2>
            {receiptNumber && (
              <p className="text-sm text-gray-500 mb-3">
                מס׳ קבלה: <span className="font-mono">{receiptNumber}</span>
              </p>
            )}
            <p className="text-sm text-gray-600 mb-2">
              הקבלה הופקה ע&quot;י Cardcom. לחץ/י כדי לפתוח אותה בדף נפרד
              להדפסה או שמירה.
            </p>
            <p className="text-xs text-gray-500 mb-4">
              עותק נוסף נשלח אליך באימייל אם הזנת כתובת.
            </p>
            <div className="flex flex-col items-center gap-2">
              {/* primary action — <a href target="_blank"> במקום window.open
                  כי popup-blocker חוסם window.open גם בלחיצה ישירה (במיוחד
                  מ-page חיצוני בלי history של ה-domain). <a> אינו popup. */}
              <a
                href={safeReceiptUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center rounded-md bg-teal-600 px-4 py-2 text-white text-sm font-bold hover:bg-teal-700"
                aria-label="הדפס או צפה בקבלה בלשונית חדשה"
              >
                הדפס / צפה בקבלה
              </a>
            </div>
          </div>
        )}

      {/* error state — receiptUrl לא חוקי */}
      {receiptStatus === "error" && (
        <div className="max-w-md mx-auto mt-6 bg-amber-50 border border-amber-200 rounded-lg p-4 text-center text-sm text-amber-800 print:hidden">
          לא הצלחנו להציג את הקבלה כאן. תוכל/י לקבל אותה במייל מהמטפל.
        </div>
      )}

      {/* timeout של receipt לאחר APPROVED */}
      {receiptStatus === "timeout" &&
        (status === "approved" || status === "partial") && (
          <div className="max-w-md mx-auto mt-6 bg-amber-50 border border-amber-200 rounded-lg p-4 text-center text-sm text-amber-800 print:hidden">
            הקבלה עדיין בהפקה. תקבל/י אותה במייל תוך כמה דקות, או פנה/י
            למטפל לבדיקה.
          </div>
        )}

      {/* עזרה דבאג למפתחים: paymentId+hasReceipt משמשים ב-cardcom-receipt-pdf
          fallback אבל לא נחשף ב-UI חוץ מ-aria. */}
      <span className="sr-only">
        {paymentId ? `payment ${paymentId.slice(0, 6)}` : ""}
        {hasReceipt ? " has-receipt" : ""}
      </span>
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────
// ReceiptCard — רינדור ויזואלי של קבלה פנימית.
// id="mytipul-receipt-print" חיוני: ה-CSS ב-globals.css מסתיר את
// כל הדף בעת הדפסה ומותיר רק את האלמנט הזה (body:has scope).
// ──────────────────────────────────────────────────────────────────
function ReceiptCard({ data }: { data: InternalReceiptData }) {
  const businessName =
    data.therapist.businessName || data.therapist.name || "MyTipul";
  const dateStr = format(
    new Date(data.paidAt || data.createdAt),
    "dd בMMMM yyyy",
    { locale: he },
  );
  const methodLabel = METHOD_LABELS[data.method] || "תשלום";
  const receiptNum = data.receiptNumber || "—";
  const sessionDateStr = data.sessionDate
    ? format(new Date(data.sessionDate), "dd/MM/yyyy")
    : null;

  return (
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
                פגישה טיפולית{sessionDateStr ? ` - ${sessionDateStr}` : ""}
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
}
