"use client";

import { useEffect, useState } from "react";

interface Props {
  transactionId: string | null;
}

type Status = "loading" | "pending" | "approved" | "partial" | "failed" | "timeout";

export function ThanksClient({ transactionId }: Props) {
  const [status, setStatus] = useState<Status>(transactionId ? "loading" : "approved");

  useEffect(() => {
    if (!transactionId) return;
    let cancelled = false;
    let attempts = 0;
    const MAX_ATTEMPTS = 20; // 20 × 3s = 60s window for webhook arrival

    const tick = async () => {
      if (cancelled || attempts >= MAX_ATTEMPTS) {
        // אחרי המקסימום — אם עדיין pending, מציגים timeout במקום הבטחה
        // מטעה ש"הדף יתעדכן אוטומטית" (כי ה-polling נעצר).
        if (!cancelled) setStatus("timeout");
        return;
      }
      attempts++;
      try {
        const res = await fetch(`/api/p/transaction-status?t=${encodeURIComponent(transactionId)}`);
        if (!res.ok) {
          // ⚠️ אסור fail-open ל-"approved": אם השרת מחזיר 5xx/429 לא ידוע
          // אם התשלום עבר. נשארים ב-pending ומנסים שוב עד MAX_ATTEMPTS.
          if (attempts >= MAX_ATTEMPTS) {
            setStatus("timeout");
            return;
          }
          setStatus("pending");
          setTimeout(tick, 3000);
          return;
        }
        const data = (await res.json()) as {
          status?: string;
          debtFullyPaid?: boolean;
        };
        if (data.status === "APPROVED" || data.status === "REFUNDED") {
          // הבחנה בין "החוב נסגר במלואו" ל-"חיוב חלקי אושר אבל יש יתרה".
          // ב-additive partial: CardcomTransaction=APPROVED, Payment=PENDING.
          if (data.debtFullyPaid === false) {
            setStatus("partial");
          } else {
            setStatus("approved");
          }
          return;
        }
        if (data.status === "DECLINED" || data.status === "FAILED" || data.status === "CANCELLED" || data.status === "EXPIRED") {
          setStatus("failed");
          return;
        }
        setStatus("pending");
        setTimeout(tick, 3000);
      } catch {
        if (attempts >= MAX_ATTEMPTS) {
          setStatus("timeout");
          return;
        }
        setStatus("pending");
        setTimeout(tick, 3000);
      }
    };
    tick();
    return () => {
      cancelled = true;
    };
  }, [transactionId]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4" dir="rtl">
      <div className="max-w-md w-full bg-white shadow rounded-lg p-8 text-center">
        {status === "approved" && (
          <>
            <div className="text-5xl mb-4">✅</div>
            <h1 className="text-2xl font-bold mb-2">התשלום התקבל</h1>
            <p className="text-gray-600">
              תודה רבה. קבלה תישלח אליך במייל אם הזנת כתובת.
            </p>
          </>
        )}
        {status === "partial" && (
          <>
            <div className="text-5xl mb-4">✅</div>
            <h1 className="text-2xl font-bold mb-2">החיוב באשראי אושר</h1>
            <p className="text-gray-600">
              התשלום שולם בהצלחה. אם נותרה יתרה — היא מופיעה בכרטיס שלך
              אצל המטפל. קבלה תישלח אליך במייל אם הזנת כתובת.
            </p>
          </>
        )}
        {status === "loading" && (
          <>
            <div className="text-5xl mb-4">⌛</div>
            <h1 className="text-2xl font-bold mb-2">בודק את התשלום…</h1>
          </>
        )}
        {status === "pending" && (
          <>
            <div className="text-5xl mb-4">⌛</div>
            <h1 className="text-2xl font-bold mb-2">התשלום בעיבוד</h1>
            <p className="text-gray-600">
              התשלום שלך מתעבד. הדף יתעדכן אוטומטית.
            </p>
          </>
        )}
        {status === "timeout" && (
          <>
            <div className="text-5xl mb-4">⏱️</div>
            <h1 className="text-2xl font-bold mb-2">העיבוד לוקח יותר זמן מהרגיל</h1>
            <p className="text-gray-600">
              לא קיבלנו עדיין אישור סופי מ-Cardcom. אם חויבת — האישור
              יגיע בדקות הקרובות. במקרה של ספק, פנה/י למטפל לקבלת
              עדכון, או רענן/י את הדף.
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
            <div className="text-5xl mb-4">⚠️</div>
            <h1 className="text-2xl font-bold mb-2">התשלום לא הושלם</h1>
            <p className="text-gray-600">פנה למטפל שלך לקישור חדש.</p>
          </>
        )}
      </div>
    </div>
  );
}
