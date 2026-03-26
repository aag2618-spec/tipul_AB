"use client";

import Link from "next/link";

interface SessionStatusIndicatorsProps {
  session: {
    id: string;
    status: string;
    price: number;
    sessionNote: string | null;
    payment: {
      id: string;
      status: string;
      amount: number;
      expectedAmount?: number;
    } | null;
    client: {
      id: string;
      name: string;
    } | null;
  };
}

export function SessionStatusIndicators({ session }: SessionStatusIndicatorsProps) {
  // Indicators for completed sessions
  if (session.status === "COMPLETED" && session.client) {
    return (
      <div className="flex items-center gap-3 text-xs pt-1.5 border-t">
        {/* Payment indicator */}
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">💵 תשלום:</span>
          {session.payment?.status === "PAID" ? (
            <span className="text-green-600 font-medium">✓ שולם</span>
          ) : session.payment && session.payment.amount > 0 && session.payment.amount < Number(session.price) ? (
            <span className="text-blue-600 font-medium">⏳ שולם חלקית (₪{session.payment.amount})</span>
          ) : (
            <span className="text-orange-600 font-medium">⏳ לא שולם</span>
          )}
        </div>

        {/* Summary indicator */}
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">📝 סיכום:</span>
          {session.sessionNote ? (
            <Link
              href={`/dashboard/sessions/${session.id}`}
              className="text-green-600 font-medium hover:text-green-700 hover:underline transition-colors"
            >
              ✓ נכתב
            </Link>
          ) : (
            <Link
              href={`/dashboard/sessions/${session.id}`}
              className="text-sky-600 font-medium hover:text-sky-700 hover:underline transition-colors"
            >
              כתוב סיכום
            </Link>
          )}
        </div>
      </div>
    );
  }

  // Indicators for no-show/cancelled sessions
  if ((session.status === "NO_SHOW" || session.status === "CANCELLED") && session.client) {
    return (
      <div className="space-y-1 text-xs pt-1.5 border-t">
        <div className="flex items-center gap-1.5">
          <span className="text-muted-foreground">💵 תשלום:</span>
          {session.payment?.status === "PAID" ? (
            <span className="text-green-600 font-medium">✓ שולם</span>
          ) : session.payment && session.payment.amount > 0 && session.payment.amount < Number(session.price) ? (
            <span className="text-blue-600 font-medium">⏳ שולם חלקית (₪{session.payment.amount})</span>
          ) : session.payment ? (
            <span className="text-orange-600 font-medium">⏳ חויב - לא שולם</span>
          ) : (
            <span className="text-gray-600 font-medium">✓ פטור מתשלום</span>
          )}
        </div>
        {/* סיבת פטור - אם אין payment ויש הערה */}
        {!session.payment && session.sessionNote && (
          <p className="text-muted-foreground/70 truncate">סיבת אי חיוב: {session.sessionNote}</p>
        )}
      </div>
    );
  }

  return null;
}
