import { NextResponse } from "next/server";
import { getShabbatStatus } from "@/lib/shabbat";
import { checkRateLimit, BOOKING_GET_RATE_LIMIT } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/get-client-ip";

/**
 * Endpoint ציבורי (authenticated users בלבד — אין PII) שמחזיר את מצב השבת/חג הנוכחי.
 * בשימוש ע"י useShabbat hook בדשבורד כדי להפעיל/לכבות כפתורים ידניים.
 *
 * ב-FAIL_CLOSED: מחזיר `isShabbat: true, isDegraded: true, reason: null`.
 * ה-UI יראה "המערכת בתחזוקה" במקום "שבת שלום".
 */

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const ip = getClientIp(request);
  const rl = checkRateLimit(`shabbat:${ip}`, BOOKING_GET_RATE_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json({ error: "יותר מדי בקשות" }, { status: 429 });
  }

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
