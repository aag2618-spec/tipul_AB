import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

// דפים שלא דורשים מנוי פעיל (מדויקים!)
const SUBSCRIPTION_EXEMPT_PATHS = [
  "/dashboard/settings/billing",
  "/api/subscription",
  "/api/user",
  "/api/auth",
];

// דפים שפטורים בהתאמה מדויקת (לא startsWith)
const SUBSCRIPTION_EXEMPT_EXACT = [
  "/dashboard/settings",  // רק דף הגדרות ראשי, לא תת-דפים
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Get the token from the request
  const token = await getToken({ 
    req: request, 
    secret: process.env.NEXTAUTH_SECRET 
  });

  // Protect /admin routes - require ADMIN role
  if (pathname.startsWith("/admin")) {
    // If not authenticated, redirect to login
    if (!token) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }

    // If not admin, redirect to dashboard with error
    if (token.role !== "ADMIN") {
      const dashboardUrl = new URL("/dashboard", request.url);
      dashboardUrl.searchParams.set("error", "unauthorized");
      return NextResponse.redirect(dashboardUrl);
    }
  }

  // Protect /api/admin routes - require ADMIN role
  // Exception: reset-password route uses secret key instead of session
  if (pathname.startsWith("/api/admin") && !pathname.includes("/reset-password")) {
    if (!token) {
      return NextResponse.json(
        { message: "לא מורשה - נדרשת התחברות" },
        { status: 401 }
      );
    }

    if (token.role !== "ADMIN") {
      return NextResponse.json(
        { message: "לא מורשה - נדרשות הרשאות מנהל" },
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

