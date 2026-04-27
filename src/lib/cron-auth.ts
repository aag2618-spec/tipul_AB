/**
 * Cron auth + rate-limit helper — Stage 1.17 wire-up.
 *
 * עוטף את הדפוס המשותף לכל cron route:
 *   1. בדיקת CRON_SECRET (Authorization header).
 *   2. Rate-limit per-IP (הגנה אם הסוד נחשף).
 *   3. החזרת errorResponse או null אם הכל תקין.
 *
 * שימוש:
 *   const guard = await checkCronAuth(req);
 *   if (guard) return guard;  // 401 / 429 / 503
 *   // ... handler logic
 *
 * סוכן 5 (security review) זיהה: ל-cron אין session, ה-middleware לא מגן עליו.
 * אם CRON_SECRET נחשף, אין rate-limit → DoS / audit log flooding.
 * הפתרון: per-IP rate limit כ-defense-in-depth.
 */

import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { checkRateLimit, CRON_RATE_LIMIT } from "@/lib/rate-limit";

/** Constant-time Bearer compare — protects against timing side channels. */
function bearerEquals(authHeader: string | null, expected: string): boolean {
  if (!authHeader) return false;
  const prefix = "Bearer ";
  if (!authHeader.startsWith(prefix)) return false;
  const provided = authHeader.slice(prefix.length);
  if (provided.length !== expected.length) return false;
  try {
    return timingSafeEqual(
      Buffer.from(provided, "utf8"),
      Buffer.from(expected, "utf8")
    );
  } catch {
    return false;
  }
}

/**
 * מחזיר NextResponse של שגיאה אם cron auth/rate-limit נכשלים.
 * מחזיר null אם הכל תקין — ה-handler יכול להמשיך.
 */
export async function checkCronAuth(
  req: NextRequest
): Promise<NextResponse | null> {
  // ─ שלב 1: CRON_SECRET ─
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    logger.error("[cron-auth] CRON_SECRET not configured");
    // החזר 401 עם הודעה גנרית — לא מסגיר ל-attacker שה-secret חסר.
    return NextResponse.json({ message: "לא מורשה" }, { status: 401 });
  }
  const authHeader = req.headers.get("authorization");
  if (!bearerEquals(authHeader, cronSecret)) {
    return NextResponse.json({ message: "לא מורשה" }, { status: 401 });
  }

  // ─ שלב 2: Rate limit per-IP ─
  // x-forwarded-for נשלח על ידי Render proxy. fallback: x-real-ip / remote.
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  const rateCheck = checkRateLimit(`cron:${ip}`, CRON_RATE_LIMIT);
  if (!rateCheck.allowed) {
    logger.warn("[cron-auth] rate limit exceeded", { ip });
    return NextResponse.json(
      { message: "יותר מדי בקשות, נסה שוב בעוד דקה" },
      {
        status: 429,
        headers: {
          "Retry-After": String(
            Math.max(1, Math.ceil((rateCheck.resetAt - Date.now()) / 1000))
          ),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": String(Math.ceil(rateCheck.resetAt / 1000)),
        },
      }
    );
  }

  return null;
}
