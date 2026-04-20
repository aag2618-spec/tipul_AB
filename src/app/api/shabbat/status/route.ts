import { NextResponse } from "next/server";
import { getShabbatStatus } from "@/lib/shabbat";

/**
 * Endpoint ציבורי (authenticated users בלבד — אין PII) שמחזיר את מצב השבת/חג הנוכחי.
 * בשימוש ע"י useShabbat hook בדשבורד כדי להפעיל/לכבות כפתורים ידניים.
 *
 * ב-FAIL_CLOSED: מחזיר `isShabbat: true, isDegraded: true, reason: null`.
 * ה-UI יראה "המערכת בתחזוקה" במקום "שבת שלום".
 */

export const dynamic = "force-dynamic";

export async function GET() {
  const status = getShabbatStatus();
  return NextResponse.json(
    {
      isShabbat: status.isShabbat,
      reason: status.reason,
      endsAt: status.endsAt?.toISOString() ?? null,
      name: status.name,
      isDegraded: status.isDegraded,
    },
    {
      // cache פרטי של 60 שניות — מקבל עדכונים מהר סביב כניסה/יציאת שבת
      headers: { "Cache-Control": "private, max-age=60" },
    },
  );
}
