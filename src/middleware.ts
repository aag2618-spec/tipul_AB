import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

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
  // API מפתחות/הגדרות עולמיות
  "/api/admin/set-admin",
  "/api/admin/backfill-user-numbers",
  "/api/admin/tier-limits",
  "/api/admin/feature-flags",
  "/api/admin/ai-settings",
  "/api/admin/terms",
];

function isAdminOnlyPath(pathname: string): boolean {
  return ADMIN_ONLY_PATHS.some((p) => pathname.startsWith(p));
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Get the token from the request
  const token = await getToken({ 
    req: request, 
    secret: process.env.NEXTAUTH_SECRET 
  });

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

// Configure which paths should be processed by the middleware
export const config = {
  matcher: [
    "/admin/:path*",
    "/api/admin/:path*",
    "/dashboard/:path*",
  ],
};

