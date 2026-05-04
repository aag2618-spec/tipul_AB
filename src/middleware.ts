import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import {
  checkRateLimit,
  getAdminRateLimitTier,
  getAdminRateLimitKey,
  ADMIN_RATE_LIMIT_BY_TIER,
} from "@/lib/rate-limit";

// חובה — rate-limit משתמש ב-Map in-memory ב-Node.js
// ללא זה Next.js מריץ middleware ב-Edge Runtime שבו Map לא נשמר בין בקשות
// (שיקולי ביצועים נשקלו — Node.js runtime בסדר ב-Render single-instance)
export const runtime = "nodejs";

// דפים שלא דורשים מנוי פעיל (מדויקים!)
const SUBSCRIPTION_EXEMPT_PATHS = [
  "/dashboard/settings/billing",
];

// דפים שפטורים בהתאמה מדויקת (לא startsWith)
const SUBSCRIPTION_EXEMPT_EXACT = [
  "/dashboard/settings",  // רק דף הגדרות ראשי, לא תת-דפים
];

// ========================================================================
// Admin route permissions (Stage 1.3 of admin UI redesign)
// ========================================================================
// נתיבים שרק ADMIN יכול לגשת. MANAGER יקבל 403.
// שאר /admin/* ו-/api/admin/* פתוחים ל-ADMIN ו-MANAGER.
// הרשאה ספציפית פר-endpoint נבדקת ב-route handler עצמו דרך requirePermission().
const ADMIN_ONLY_PATHS = [
  // דפי admin עם הגדרות מערכת קריטיות
  "/admin/feature-flags",
  "/admin/tier-settings",
  "/admin/terms",
  "/admin/coupons",
  "/admin/ai-usage/settings",
  // Cardcom — Stage Cardcom (ADMIN בלבד: הגדרות מסוף, פרטי עסק)
  "/admin/billing/cardcom-setup",
  "/admin/billing/business-settings",
  // API מפתחות/הגדרות עולמיות
  "/api/admin/set-admin",
  "/api/admin/backfill-user-numbers",
  "/api/admin/tier-limits",
  "/api/admin/feature-flags",
  "/api/admin/ai-settings",
  "/api/admin/terms",
  "/api/admin/coupons",
  "/api/admin/idempotency", // Stage 1.18 — ADMIN-only, defense-in-depth
  // Cardcom API — ADMIN בלבד רק עבור setup + business-settings
  // (charge/transactions/create-payment-page זמינים ל-MANAGER דרך requirePermission)
  "/api/admin/cardcom/setup",
  "/api/admin/business-settings",
];

function isAdminOnlyPath(pathname: string): boolean {
  // חשוב: לוודא התאמה מדויקת או prefix עם גרש, כדי למנוע false positive
  // למשל `/admin/feature-flagsomething` לא יזוהה בטעות כחלק מ-`/admin/feature-flags`.
  return ADMIN_ONLY_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Get the token from the request
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET
  });

  // 2FA gate: משתמש עם token.requires2FA לא יכול לגשת ל-dashboard/admin/API.
  // ל-API: 403 JSON. לדפים: redirect ל-/auth/2fa-verify.
  // ה-matcher של middleware מוגדר באופן שלא תופס את /auth/2fa-verify
  // ולא את /api/auth/* (כדי שה-flow של 2FA יוכל לרוץ — אין loop).
  if (token?.requires2FA === true) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { message: "נדרש אימות דו-שלבי" },
        { status: 403 }
      );
    }
    const verifyUrl = new URL("/auth/2fa-verify", request.url);
    return NextResponse.redirect(verifyUrl);
  }

  // H1: isBlocked gate ל-API. ה-middleware בודק כבר את isBlocked לדפי
  // dashboard בהמשך, אבל ה-API צריך הגנה מקבילה — אחרת משתמש חסום
  // עם cookie תקף יוכל להמשיך לקרוא לAPI ישירות.
  //
  // Allowlist (מינימלי בכוונה): רק נתיבים שמשתמש חסום צריך כדי לשלם
  // חוב ולצאת מחסימה, או לראות מצב.
  // - /api/payments/* — flow תשלום
  // - /api/integrations/billing/* — Cardcom/Meshulam
  // - /api/admin/billing/* — לחסום אדמינים גם, אך הם לרוב לא חסומים
  // - GET-only של פרופיל/usage/tier כדי שדף billing יוכל להציג מידע
  // - /api/subscription/status — קריאה
  // - /api/subscription/create — משתמש חסום משלם כדי לצאת מחסימה (POST)
  // **לא** מאפשרים: /api/subscription/cancel (אחרת חסום יבטל במקום לשלם),
  // PUT/DELETE על /api/user/* (אחרת ניתן לערוך פרופיל/businessSettings/קלנדר),
  // /api/user/booking-settings/send-link (וקטור spam).
  if (token?.isBlocked === true && pathname.startsWith("/api/")) {
    const isReadOnly = request.method === "GET" || request.method === "HEAD";
    const isUserReadOnly = isReadOnly && pathname.startsWith("/api/user/");
    const blockedAllowlist =
      pathname.startsWith("/api/payments/") ||
      pathname.startsWith("/api/integrations/billing/") ||
      pathname.startsWith("/api/admin/billing/") ||
      pathname.startsWith("/api/p/") ||
      pathname === "/api/subscription/status" ||
      pathname === "/api/subscription/create" ||
      isUserReadOnly;
    if (!blockedAllowlist) {
      return NextResponse.json(
        { message: "החשבון מושבת. נא ליצור קשר עם התמיכה." },
        { status: 403 }
      );
    }
  }

  // Protect /clinic-admin routes — require CLINIC_OWNER or ADMIN.
  // הסשן לא מכיל clinicRole/organizationId; ה-layout עושה את הבדיקה העמוקה.
  // כאן רק חוסמים את הברורים: לא מחובר → login; CLINIC_SECRETARY/USER → dashboard.
  if (pathname.startsWith("/clinic-admin")) {
    if (!token) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }
    // ADMIN/CLINIC_OWNER מותרים. אחרים — מועברים לדשבורד.
    if (token.role !== "ADMIN" && token.role !== "CLINIC_OWNER") {
      const dashboardUrl = new URL("/dashboard", request.url);
      dashboardUrl.searchParams.set("error", "clinic_owner_only");
      return NextResponse.redirect(dashboardUrl);
    }
  }

  // Protect /api/clinic-admin routes — require CLINIC_OWNER or ADMIN.
  if (pathname.startsWith("/api/clinic-admin")) {
    if (!token) {
      return NextResponse.json(
        { message: "לא מורשה - נדרשת התחברות" },
        { status: 401 }
      );
    }
    if (token.role !== "ADMIN" && token.role !== "CLINIC_OWNER") {
      return NextResponse.json(
        { message: "לא מורשה - הפעולה זמינה לבעלי קליניקה בלבד" },
        { status: 403 }
      );
    }
  }

  // Protect /admin routes — require ADMIN or MANAGER
  // ADMIN_ONLY_PATHS (feature-flags, tier-settings, terms) require ADMIN specifically
  if (pathname.startsWith("/admin")) {
    // If not authenticated, redirect to login
    if (!token) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }

    // Neither ADMIN nor MANAGER → dashboard
    if (token.role !== "ADMIN" && token.role !== "MANAGER") {
      const dashboardUrl = new URL("/dashboard", request.url);
      dashboardUrl.searchParams.set("error", "unauthorized");
      return NextResponse.redirect(dashboardUrl);
    }

    // MANAGER trying to access ADMIN-only path → dashboard
    if (token.role === "MANAGER" && isAdminOnlyPath(pathname)) {
      const dashboardUrl = new URL("/admin", request.url);
      dashboardUrl.searchParams.set("error", "admin_only");
      return NextResponse.redirect(dashboardUrl);
    }
  }

  // Protect /api/admin routes — require ADMIN or MANAGER
  // Exceptions: reset-password (x-admin-key header) + backfill-user-numbers (CRON_SECRET)
  if (pathname.startsWith("/api/admin") && !pathname.includes("/reset-password") && !pathname.includes("/backfill-user-numbers")) {
    if (!token) {
      return NextResponse.json(
        { message: "לא מורשה - נדרשת התחברות" },
        { status: 401 }
      );
    }

    if (token.role !== "ADMIN" && token.role !== "MANAGER") {
      return NextResponse.json(
        { message: "לא מורשה - נדרשות הרשאות מנהל" },
        { status: 403 }
      );
    }

    // MANAGER trying to reach ADMIN-only API → 403
    if (token.role === "MANAGER" && isAdminOnlyPath(pathname)) {
      return NextResponse.json(
        { message: "פעולה זו זמינה לבעל המערכת בלבד" },
        { status: 403 }
      );
    }

    // === Rate limiting (Stage 1.8) — 3 שכבות אכיפה על /api/admin/* ===
    const adminId = token.sub ?? (token.id as string | undefined);
    if (adminId) {
      const tier = getAdminRateLimitTier(pathname, request.method);
      const key = getAdminRateLimitKey(pathname, adminId, tier);
      const config = ADMIN_RATE_LIMIT_BY_TIER[tier];
      const result = checkRateLimit(`admin:${tier}:${key}`, config);
      if (!result.allowed) {
        return NextResponse.json(
          {
            message:
              tier === "sensitive"
                ? "יותר מדי פעולות רגישות. חכה דקה ונסה שוב."
                : "יותר מדי בקשות. חכה דקה ונסה שוב.",
          },
          {
            status: 429,
            headers: {
              "Retry-After": String(
                Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000))
              ),
              "X-RateLimit-Remaining": "0",
              "X-RateLimit-Reset": String(result.resetAt),
              "X-RateLimit-Tier": tier,
            },
          }
        );
      }
    }
  }

  // בדיקת סטטוס מנוי לדפי dashboard (למעט דפים פטורים)
  if (pathname.startsWith("/dashboard") && token) {
    // מנהלים (ADMIN) לא נחסמים על ידי בדיקת מנוי
    if (token.role === "ADMIN") {
      return NextResponse.next();
    }

    // בדיקה אם הדף פטור מבדיקת מנוי
    const isExemptPrefix = SUBSCRIPTION_EXEMPT_PATHS.some(path => pathname.startsWith(path));
    const isExemptExact = SUBSCRIPTION_EXEMPT_EXACT.includes(pathname);
    
    if (!isExemptPrefix && !isExemptExact) {
      // בדיקת סטטוס מנוי
      const subscriptionStatus = token.subscriptionStatus as string;
      const isBlocked = token.isBlocked as boolean;

      // אם המשתמש חסום
      if (isBlocked) {
        const blockedUrl = new URL("/blocked", request.url);
        return NextResponse.redirect(blockedUrl);
      }

      // אם המנוי לא פעיל
      if (subscriptionStatus === "CANCELLED") {
        // CANCELLED = תקופת חסד נגמרה - חסימה מלאה
        const billingUrl = new URL("/dashboard/settings/billing", request.url);
        billingUrl.searchParams.set("status", "cancelled");
        return NextResponse.redirect(billingUrl);
      }
      
      if (subscriptionStatus === "PAST_DUE") {
        // PAST_DUE = תקופת חסד פעילה - מאפשרים גישה עם הודעת אזהרה
        // ה-header יגרום ל-UI להציג באנר אזהרה
        const response = NextResponse.next();
        response.headers.set("x-subscription-warning", "past_due");
        const gracePeriodEndsAt = token.gracePeriodEndsAt as string;
        if (gracePeriodEndsAt) {
          response.headers.set("x-grace-period-ends", gracePeriodEndsAt);
        }
        return response;
      }
    }
  }

  return NextResponse.next();
}

// Configure which paths should be processed by the middleware.
// Note: matcher uses negative lookahead via Next.js syntax to exclude
// /api/auth/* (NextAuth + 2FA endpoints), /api/health, /api/webhooks/*
// (signed webhooks have their own auth), and /api/cron/* (CRON_SECRET).
// This ensures the 2FA gate covers all sensitive APIs without breaking
// the 2FA flow itself.
export const config = {
  matcher: [
    "/admin/:path*",
    "/clinic-admin/:path*",
    "/dashboard/:path*",
    "/api/((?!auth/|health|webhooks/|cron/).*)",
  ],
};

