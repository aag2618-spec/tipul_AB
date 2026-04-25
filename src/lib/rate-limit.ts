// src/lib/rate-limit.ts
// Rate Limiter פשוט בזיכרון (in-memory) - ללא תלות חיצונית
// מתאים לסביבת production עם שרת אחד (Render)

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

/** התחברות - 10 ניסיונות ל-15 דקות */
export const AUTH_RATE_LIMIT = { maxRequests: 10, windowMs: 15 * 60 * 1000 };

/** יצירת מנוי - 5 ניסיונות לשעה */
export const SUBSCRIPTION_RATE_LIMIT = { maxRequests: 5, windowMs: 60 * 60 * 1000 };

/** שליחת מיילים - 20 בקשות לדקה */
export const EMAIL_RATE_LIMIT = { maxRequests: 20, windowMs: 60 * 1000 };

/** API AI - 30 בקשות לדקה */
export const AI_RATE_LIMIT = { maxRequests: 30, windowMs: 60 * 1000 };

/** Webhooks - 50 בקשות לדקה */
export const WEBHOOK_RATE_LIMIT = { maxRequests: 50, windowMs: 60 * 1000 };

/**
 * Cron jobs — 10 בקשות לדקה לכל IP.
 * הגנה אם CRON_SECRET נחשף + מונע replay storms.
 * Stage 1.17 — זוהה ע"י סוכן 5 (security review של cleanup-idempotency).
 */
export const CRON_RATE_LIMIT = { maxRequests: 10, windowMs: 60 * 1000 };

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
