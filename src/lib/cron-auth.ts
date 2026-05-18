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
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { checkRateLimit, CRON_RATE_LIMIT } from "@/lib/rate-limit";

// M10.6: AdminAlert ייווצר כש-CRON_SECRET_PREVIOUS נמצא בשימוש — מסמן rotation
// שלא הסתיים. dedupe לפי title, fire-and-forget. cache קצר בזיכרון מונע
// hammering של DB כש-cron רץ כל דקה (לא לבזבז query על rows כפולות).
let lastRotationAlertCheckAt = 0;
const ROTATION_ALERT_CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 דקות

async function ensureRotationAlert(): Promise<void> {
  try {
    const existing = await prisma.adminAlert.findFirst({
      where: {
        type: "SYSTEM",
        status: "PENDING",
        title: "CRON_SECRET rotation incomplete",
      },
      select: { id: true },
    });
    if (!existing) {
      await prisma.adminAlert.create({
        data: {
          type: "SYSTEM",
          priority: "HIGH",
          title: "CRON_SECRET rotation incomplete",
          message:
            "Cron נקרא עם CRON_SECRET_PREVIOUS — סימן ש-rotation התחיל אבל לא הסתיים. " +
            "ה-secret הישן עדיין פעיל, וצריך להסיר אותו אחרי שכל ה-jobs בריאים עם החדש (24-48ש').",
          actionRequired:
            "להסיר את CRON_SECRET_PREVIOUS מ-ENV (Render dashboard → Environment).",
        },
      });
    }
  } catch (err) {
    // לא להעיף את ה-cron אם DB לא זמין — רק logger fallback.
    logger.warn("[cron-auth] failed to create rotation alert (continuing)", {
      err: err instanceof Error ? err.message : String(err),
    });
  }
}

/** Constant-time Bearer compare — protects against timing side channels. */
export function bearerEquals(authHeader: string | null, expected: string): boolean {
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
  // ─ שלב 1: CRON_SECRET (עם rotation support) ─
  // Stage 2.0 hardening: תומך ב-CRON_SECRET_PREVIOUS לתקופת חפיפה של
  // zero-downtime rotation. רוטציה: (1) להגדיר את הנוכחי כ-PREVIOUS,
  // (2) להגדיר סוד חדש כ-CRON_SECRET, (3) לאחר 24-48ש' שכל ה-cron בריאים — להסיר את PREVIOUS.
  const primarySecret = process.env.CRON_SECRET;
  const previousSecret = process.env.CRON_SECRET_PREVIOUS;
  if (!primarySecret) {
    logger.error("[cron-auth] CRON_SECRET not configured");
    // החזר 401 עם הודעה גנרית — לא מסגיר ל-attacker שה-secret חסר.
    return NextResponse.json({ message: "לא מורשה" }, { status: 401 });
  }
  const authHeader = req.headers.get("authorization");
  const matchesPrimary = bearerEquals(authHeader, primarySecret);
  const matchesPrevious = previousSecret
    ? bearerEquals(authHeader, previousSecret)
    : false;

  if (!matchesPrimary && !matchesPrevious) {
    return NextResponse.json({ message: "לא מורשה" }, { status: 401 });
  }

  // אם נכנסנו דרך הסוד הישן — מתעדים אזהרה כדי שאדמין יראה שצריך לסיים rotation.
  if (matchesPrevious) {
    logger.warn(
      "[cron-auth] cron called with CRON_SECRET_PREVIOUS — finish rotation by removing it"
    );

    // M10.6: alert ב-AdminAlert (dedupe לפי title) — fire-and-forget +
    // throttled ל-5 דקות כדי לא להציף את ה-DB ב-cron שרץ כל דקה.
    const now = Date.now();
    if (now - lastRotationAlertCheckAt > ROTATION_ALERT_CHECK_INTERVAL_MS) {
      lastRotationAlertCheckAt = now;
      void ensureRotationAlert();
    }
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
