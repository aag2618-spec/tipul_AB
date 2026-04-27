"use client";

import { useEffect, useState } from "react";

interface Props {
  transactionId: string | null;
}

type Status = "loading" | "pending" | "approved" | "failed";

export function ThanksClient({ transactionId }: Props) {
  const [status, setStatus] = useState<Status>(transactionId ? "loading" : "approved");

  useEffect(() => {
    if (!transactionId) return;
    let cancelled = false;
    let attempts = 0;
    const MAX_ATTEMPTS = 20; // 20 × 3s = 60s window for webhook arrival

    const tick = async () => {
      if (cancelled || attempts >= MAX_ATTEMPTS) return;
      attempts++;
      try {
        const res = await fetch(`/api/p/transaction-status?t=${encodeURIComponent(transactionId)}`);
        if (!res.ok) {
          setStatus("approved"); // fail-open — don't worry the customer
          return;
        }
        const data = (await res.json()) as { status?: string };
        if (data.status === "APPROVED" || data.status === "REFUNDED") {
          setStatus("approved");
          return;
        }
        if (data.status === "DECLINED" || data.status === "FAILED" || data.status === "CANCELLED" || data.status === "EXPIRED") {
          setStatus("failed");
          return;
        }
        setStatus("pending");
        setTimeout(tick, 3000);
      } catch {
        // Network blip — keep polling.
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
              תודה רבה. קבלה תישלח אליך במייל בדקות הקרובות.
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
