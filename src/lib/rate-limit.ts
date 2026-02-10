// src/lib/rate-limit.ts
// Rate Limiter פשוט בזיכרון (in-memory) - ללא תלות חיצונית
// מתאים לסביבת production עם שרת אחד (Render)

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// ניקוי אוטומטי כל 5 דקות
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (entry.resetAt < now) {
      store.delete(key);
    }
  }
}, 5 * 60 * 1000);

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

// ========================================
// Helper לשימוש ב-NextResponse
// ========================================

import { NextResponse } from "next/server";

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
