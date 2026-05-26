// src/lib/rate-limit.ts
// Rate Limiter פשוט בזיכרון (in-memory) - ללא תלות חיצונית
// מתאים לסביבת production עם שרת אחד (Render).
//
// ════════════════════════════════════════════════════════════════════
// ⚠️ Scaling note (Stage 2.0 — security review fix #2)
// ════════════════════════════════════════════════════════════════════
// המימוש הזה הוא in-memory בכל instance של Node. ברגע שעוברים מ-1
// instance ל-multi-instance (horizontal scaling, Render plan upgrade,
// או deploy של multiple regions) — ה-counters לא משותפים בין instances:
//   • ל-`webhook:cardcom:user:global` כל instance שומר 200/דקה משלו →
//     הסך האפקטיבי מתרבה ב-N (N=מספר ה-instances).
//   • לrate limit per-IP, אם load balancer דוחף בקשות round-robin,
//     תוקף יקבל אפקטיבית 30*N/דקה במקום 30/דקה.
//   • ל-login ולכל פעולה sensitive — ה-counters per-user יכולים
//     להתאפס "כאילו" כשבקשה הבאה נופלת על instance אחר.
//
// ── מתי לעבור ל-Redis ──
// אינדיקטורים שזה הזמן:
//   1. Render plan upgrade ל-multi-instance (Pro / Standard).
//   2. שינוי ל-Vercel/AWS Lambda (serverless = process קצר חיים → store
//      נמחק בכל invocation, rate limit לא עובד).
//   3. תקריות אבטחה שמראות שתוקפים מצליחים להרוויח יותר ממה שצפוי.
//
// ── איך לעבור (Upstash Redis המומלץ — חינם 10K commands/day) ──
//   1. `npm i @upstash/ratelimit @upstash/redis`
//   2. ב-Render: להגדיר UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
//      (sync: false, ידני בדאשבורד).
//   3. להחליף את checkRateLimit כך ש-store יהיה Upstash במקום Map:
//      ```ts
//      import { Ratelimit } from "@upstash/ratelimit";
//      import { Redis } from "@upstash/redis";
//      const limiter = new Ratelimit({
//        redis: Redis.fromEnv(),
//        limiter: Ratelimit.slidingWindow(maxRequests, `${windowMs} ms`),
//      });
//      const { success, remaining, reset } = await limiter.limit(identifier);
//      ```
//   4. השאיר את הסיגנטורה זהה (sync API → async) — קריאה אחת ב-route,
//      `await checkRateLimit(...)` במקום checkRateLimit(...) sync.
//      רוב ה-routes כבר ב-async function אז זה change מינורי.
//   5. בדיקה: deploy ל-staging עם 2 instances → להריץ load test → לוודא
//      שה-counters משותפים (limit על IP אחד נשמר גם אחרי חציית load
//      balancer לinstance השני).
//
// עד שזה קורה — לעקוב אחר render metrics ולא לאשר scale-out בלי המעבר.

import { NextResponse } from "next/server";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// ניקוי אוטומטי כל 5 דקות.
// Cursor סיבוב 1.17 Quality 1: unref() כדי שה-timer לא ימנע exit נקי של Node
// (חשוב ל-vitest, ל-build, ול-graceful shutdown של Render).
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (entry.resetAt < now) {
      store.delete(key);
    }
  }
}, 5 * 60 * 1000);
if (typeof cleanupTimer.unref === "function") {
  cleanupTimer.unref();
}

interface RateLimitConfig {
  /** מספר בקשות מותר */
  maxRequests: number;
  /** תקופת זמן במילישניות */
  windowMs: number;
}

interface RateLimitResult {
  /** האם הבקשה מותרת */
  allowed: boolean;
  /** כמה בקשות נותרו */
  remaining: number;
  /** מתי ה-window מתאפס (Unix timestamp) */
  resetAt: number;
}

/**
 * איפוס rate limit ל-key מסוים.
 * שימושי אחרי login מוצלח — מאפס את המונה כדי שמשתמש לגיטימי לא יחסם בעקבות
 * תוקף שניסה brute force על אותו email לפניו (DoS prevention).
 */
export function resetRateLimit(identifier: string): void {
  store.delete(identifier);
}

/**
 * בדיקת rate limit
 * @param identifier - מזהה ייחודי (IP, userId, etc.)
 * @param config - הגדרות rate limit
 */
export function checkRateLimit(
  identifier: string,
  config: RateLimitConfig
): RateLimitResult {
  const now = Date.now();
  const entry = store.get(identifier);

  // אין רשומה או שהחלון פג - מתחילים מחדש
  if (!entry || entry.resetAt < now) {
    store.set(identifier, {
      count: 1,
      resetAt: now + config.windowMs,
    });
    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetAt: now + config.windowMs,
    };
  }

  // יש רשומה - בודקים אם עדיין בחלון
  entry.count++;
  
  if (entry.count > config.maxRequests) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: entry.resetAt,
    };
  }

  return {
    allowed: true,
    remaining: config.maxRequests - entry.count,
    resetAt: entry.resetAt,
  };
}

// ========================================
// הגדרות מוכנות לשימוש
// ========================================

/** API כללי - 100 בקשות לדקה */
export const API_RATE_LIMIT = { maxRequests: 100, windowMs: 60 * 1000 };

/** התחברות - 10 ניסיונות ל-15 דקות (משמש לפי IP) */
export const AUTH_RATE_LIMIT = { maxRequests: 10, windowMs: 15 * 60 * 1000 };

/** התחברות לפי email — 5 ניסיונות ל-5 דקות.
 *  חלון קצר יותר מ-AUTH_RATE_LIMIT כדי למזער DoS על משתמש לגיטימי שתוקף יודע את ה-email שלו. */
export const LOGIN_EMAIL_RATE_LIMIT = { maxRequests: 5, windowMs: 5 * 60 * 1000 };

/** יצירת מנוי - 5 ניסיונות לשעה */
export const SUBSCRIPTION_RATE_LIMIT = { maxRequests: 5, windowMs: 60 * 60 * 1000 };

/** שליחת מיילים - 20 בקשות לדקה */
export const EMAIL_RATE_LIMIT = { maxRequests: 20, windowMs: 60 * 1000 };

/** API AI - 30 בקשות לדקה */
export const AI_RATE_LIMIT = { maxRequests: 30, windowMs: 60 * 1000 };

/** Webhooks - 50 בקשות לדקה */
export const WEBHOOK_RATE_LIMIT = { maxRequests: 50, windowMs: 60 * 1000 };

/**
 * H9 (סבב אבטחה 14, 2026-05-19) — Booking GET per-IP: 30/דקה.
 * ה-route הציבורי `/api/booking/[slug]` חושף את שעות העבודה והפגישות הקיימות
 * של המטפל (slot availability). תוקף שמשערה slug יכול לעשות recon על מטפלים
 * (מאיזה שעות פועלים, מתי "עמוסים") + lookup של slug-ים שונים בכוח אכזרי.
 * 30/דקה מאפשרים שימוש legitimate (לקוח שטוען slots לתאריך אחד או שניים בו-זמנית)
 * ועוצרים scraping מהיר. ה-POST של booking כבר rate-limited (BOOKING_RATE_LIMIT).
 */
export const BOOKING_GET_RATE_LIMIT = { maxRequests: 30, windowMs: 60 * 1000 };

/**
 * Cardcom webhook (per-IP) — 30/דקה. הוקשח מ-100/דקה לשכבת הגנה ראשונה
 * נגד botnet שמזייפים IP של Cardcom. הצמצום אגרסיבי כי IP יחיד אמיתי
 * של Cardcom לא צריך לעבור 30/דקה בנסיבות נורמליות.
 */
export const CARDCOM_WEBHOOK_PER_IP = { maxRequests: 30, windowMs: 60 * 1000 };

/**
 * Cardcom webhook (global) — 200/דקה לכל ה-instance. שכבה שנייה: גם אם
 * תוקף מתפצל על מאות IPs, לא יוכל לעלות על 200 webhook calls/min.
 * הסכום משקף עומס legit מקסימלי (≈3-4 webhooks/sec בשעת שיא של חברת תשלומים בינונית).
 */
export const CARDCOM_WEBHOOK_GLOBAL = { maxRequests: 200, windowMs: 60 * 1000 };

/**
 * Send Payment History — 3/שעה לפי clientId.
 * משתמש לא צריך לשלוח היסטוריית תשלומים יותר מ-3 פעמים בשעה לאותו לקוח.
 * מונע ניצול לרעה (spam) בעלות שליחת מייל.
 */
export const PAYMENT_HISTORY_RATE_LIMIT = { maxRequests: 3, windowMs: 60 * 60 * 1000 };

/**
 * Email Send (per-user) — 30/שעה. מונע שמטפל ייצור spam לאחר חשבון נפרץ
 * או UI bug שלוחץ "שלח" מאות פעמים.
 */
export const EMAIL_SEND_USER_RATE_LIMIT = { maxRequests: 30, windowMs: 60 * 60 * 1000 };

/**
 * SMS Send (per-user) — 10/שעה. נמוך יותר מ-email כי SMS עולה כסף לכל הודעה.
 */
export const SMS_SEND_USER_RATE_LIMIT = { maxRequests: 10, windowMs: 60 * 60 * 1000 };

/**
 * M13.3 — Recording upload (per-user): 10 העלאות / דקה.
 * validateBase64Size כבר מגביל גודל פר request (~50MB), אבל ללא rate-limit
 * תוקף עם חשבון פעיל יכול להציף את ה-disk (10 × 50MB = 500MB בדקה).
 * מטפל לגיטימי לא צריך להעלות יותר מ-10 הקלטות בדקה.
 */
export const RECORDING_UPLOAD_PER_USER = { maxRequests: 10, windowMs: 60 * 1000 };

/**
 * M13.4 — Bulk exports (per-user): 3 exports / שעה.
 * exports של PHI ענקיים (clients/[id]/export, clients/export-all, payments/export)
 * הם וקטור scraping/exfiltration. מטפל לגיטימי לא יבצע יותר מ-3 בשעה.
 */
export const EXPORT_RATE_LIMIT = { maxRequests: 3, windowMs: 60 * 60 * 1000 };

/**
 * M13.2 — CSP report endpoint (per-IP): 60 reports / דקה.
 * ה-endpoint לא דורש auth (browser-initiated). דפדפן יחיד יכול לשלוח כמה
 * violations בעמוד אבל לא יותר מ-60/דקה בנסיבות סבירות. תוקף שמנסה להציף
 * את ה-logs ע"י זיוף reports → ייחסם ב-60.
 */
export const CSP_REPORT_PER_IP = { maxRequests: 60, windowMs: 60 * 1000 };

/**
 * Cron jobs — 10 בקשות לדקה לכל IP.
 * הגנה אם CRON_SECRET נחשף + מונע replay storms.
 * Stage 1.17 — זוהה ע"י סוכן 5 (security review של cleanup-idempotency).
 */
export const CRON_RATE_LIMIT = { maxRequests: 10, windowMs: 60 * 1000 };

/** Admin password reset by secret — 3 ניסיונות לשעה לכל IP.
 * Stage 1.19 (security hardening) — endpoint רגיש במיוחד שמבסס על ADMIN_SECRET.
 * אם ה-secret נחשף, מגביל את היקף הנזק לפני rotation.
 */
export const PASSWORD_RESET_RATE_LIMIT = { maxRequests: 3, windowMs: 60 * 60 * 1000 };

// ========================================
// Admin rate limits (Stage 1.8)
// ========================================
// 3 שכבות הגנה על /api/admin/*:
//   - Read:   60/דקה  — GETs, חיפושים, דשבורד
//   - Write:  20/דקה  — POST/PATCH/DELETE רגילים
//   - רגיש:    5/דקה  — grantFree, manual payment, set-admin, delete, add-package
// המפתח של 'רגיש' הוא `{adminId}:{targetUserId}` — מונע ADMIN שמבצע פעולות רגילות על
// כמה משתמשים מלהיחסם. לפעולות ללא target מוגדר fallback של `{adminId}:global`.

export const ADMIN_READ_RATE_LIMIT = { maxRequests: 60, windowMs: 60 * 1000 };
export const ADMIN_WRITE_RATE_LIMIT = { maxRequests: 20, windowMs: 60 * 1000 };
export const ADMIN_SENSITIVE_RATE_LIMIT = { maxRequests: 5, windowMs: 60 * 1000 };

/**
 * H18 — Recovery code verification (per-IP): 3 ניסיונות ל-15 דקות.
 * הגבלה מחמירה כי כל אימות = 10 השוואות bcrypt cost-10 (~500ms CPU).
 * תוקף שעובר על 100 IPs יבזבז את ה-worker. המגבלה צרה במכוון —
 * משתמש לגיטימי שאיבד טלפון ישתמש בקוד פעם אחת או שתיים, לא 5+.
 */
export const RECOVERY_CODE_RATE_LIMIT = { maxRequests: 3, windowMs: 15 * 60 * 1000 };

/**
 * H18 — Recovery code verification (per-email): 5 ניסיונות ל-15 דקות.
 * הגנה משלימה ל-RECOVERY_CODE_RATE_LIMIT (שהוא per-IP).
 * תוקף עם 100 IPs מבוזרים יכול לעבור 3×100=300 ניסיונות מ-IP-based בלבד —
 * שכבת ה-per-email סוגרת את ה-vector הזה (5 לכל email/15 דק', בלי קשר ל-IP).
 */
export const RECOVERY_CODE_EMAIL_RATE_LIMIT = { maxRequests: 5, windowMs: 15 * 60 * 1000 };

/**
 * Admin disable-2FA — global rate limit per-admin: 10 בקשות / 15 דקות.
 * שכבה שנייה מעל ADMIN_SENSITIVE_RATE_LIMIT (שמוגבל per adminId:targetId).
 * תרחיש: אדמין compromised מנסה לכבות 2FA למאסה של משתמשים — ייחסם
 * לאחר 10 קורבנות בחלון של 15 דקות.
 */
export const ADMIN_DISABLE_2FA_GLOBAL_RATE_LIMIT = { maxRequests: 10, windowMs: 15 * 60 * 1000 };

/** R18j: public receipt endpoint — 30 req/min per IP. */
export const RECEIPT_PUBLIC_RATE_LIMIT = { maxRequests: 30, windowMs: 60 * 1000 };

export const CONSENT_PUBLIC_RATE_LIMIT = { maxRequests: 30, windowMs: 60 * 1000 };

export const CONSENT_SEND_LINK_RATE_LIMIT = { maxRequests: 30, windowMs: 60 * 60 * 1000 };

/**
 * החזרת שכבת rate limit מתאימה ל-endpoint של admin.
 *   - רגיש (5/דקה): add-package, manual-payment, set-admin, delete-user,
 *     idempotency clear, grantFree (PATCH), role change.
 *   - Write (20/דקה): שאר POST/PATCH/PUT/DELETE.
 *   - Read (60/דקה): GET.
 */
export type AdminRateLimitTier = "read" | "write" | "sensitive";

export function getAdminRateLimitTier(
  pathname: string,
  method: string
): AdminRateLimitTier {
  if (method === "GET" || method === "HEAD") return "read";

  // endpoints רגישים — כתיבה עם השלכות פיננסיות/הרשאות
  const SENSITIVE_PATHS = [
    "/api/admin/users/", // כולל add-package, manual-payment, toggle-block, PATCH
    "/api/admin/set-admin",
    "/api/admin/idempotency",
    "/api/admin/billing/", // billing cycles + יצירת חיובים ידניים
    "/api/admin/packages/", // יצירת/עדכון חבילות עם השלכות פיננסיות
    "/api/admin/cardcom/", // Cardcom — setup, charge, refund, test (כל קריאה יוצרת LowProfile)
    "/api/admin/business-settings", // שינוי סוג עסק / מע"מ — רגיש חוקית
  ];
  const SENSITIVE_METHODS_ON_USERS = ["POST", "PATCH", "DELETE"];

  if (
    pathname.startsWith("/api/admin/users/") &&
    SENSITIVE_METHODS_ON_USERS.includes(method)
  ) {
    return "sensitive";
  }
  if (SENSITIVE_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return "sensitive";
  }
  return "write";
}

/**
 * החזרת מזהה לחישוב rate limit.
 * פעולות רגישות עם target user → `{adminId}:{targetUserId}`.
 * פעולות רגילות → `{adminId}` בלבד.
 */
export function getAdminRateLimitKey(
  pathname: string,
  adminId: string,
  tier: AdminRateLimitTier
): string {
  if (tier !== "sensitive") return adminId;

  // חילוץ targetUserId מהנתיב אם יש (למשל /api/admin/users/abc-123/add-package)
  const usersMatch = pathname.match(/^\/api\/admin\/users\/([^/]+)/);
  if (usersMatch) {
    return `${adminId}:${usersMatch[1]}`;
  }
  return `${adminId}:global`;
}

export const ADMIN_RATE_LIMIT_BY_TIER = {
  read: ADMIN_READ_RATE_LIMIT,
  write: ADMIN_WRITE_RATE_LIMIT,
  sensitive: ADMIN_SENSITIVE_RATE_LIMIT,
} as const;

// ========================================
// Helper לשימוש ב-NextResponse
// ========================================

/**
 * מחזיר תגובת 429 עם headers מתאימים
 */
export function rateLimitResponse(result: RateLimitResult): NextResponse {
  return NextResponse.json(
    { error: "יותר מדי בקשות. נסה שוב מאוחר יותר." },
    {
      status: 429,
      headers: {
        "Retry-After": String(Math.ceil((result.resetAt - Date.now()) / 1000)),
        "X-RateLimit-Remaining": String(result.remaining),
        "X-RateLimit-Reset": String(result.resetAt),
      },
    }
  );
}
