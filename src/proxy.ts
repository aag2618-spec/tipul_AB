import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
// M3 — מאלץ הרצת validateEnv() ב-startup (env.ts קורא לזה ב-import time).
// בלי import זה, ה-validation היה dead code.
import "@/lib/env";
import {
  checkRateLimit,
  getAdminRateLimitTier,
  getAdminRateLimitKey,
  ADMIN_RATE_LIMIT_BY_TIER,
} from "@/lib/rate-limit";
import { isCrossOriginMutation } from "@/lib/csrf";

// Next 16 proxy: rate-limit משתמש ב-Map in-memory. ב-Next 16 proxy תמיד
// רץ ב-Node.js runtime (לפי docs — "Proxy always runs on Node.js runtime"),
// אז ה-Map נשמר בין בקשות. ב-middleware הישן צריך היה `export const runtime`
// כדי לעקוף Edge — ב-proxy זה אסור ("Route segment config is not allowed").

// CSP — תאימות ל-NetFree (סינון אינטרנט נפוץ בקהל היעד החרדי).
//
// רקע: סבב 16h הציג CSP nonce-based עם 'strict-dynamic'. אבל NetFree הוא
// פרוקסי שמפענח HTTPS, משכתב את ה-HTML, ומזריק scripts משלו
// (netfree.link/injection-script/*). 'strict-dynamic' מבטל host-allowlist
// ומחייב nonce תקף לכל script — וה-nonce של ה-scripts של Next.js "נשבר"
// בשכתוב של NetFree. התוצאה: כל ה-scripts (כולל של המערכת) נחסמים, ה-JS לא
// רץ, ודפי clinic-admin/admin (העטופים ב-ClientOnly) נתקעים בגלגל-טעינה לנצח.
// אומת ב-DevTools console אצל משתמש מאחורי NetFree (21 הפרות CSP, 2026-06-22).
//
// פתרון: script-src ללא nonce/strict-dynamic — 'self' + 'unsafe-inline' (זהה
// ל-CSP הסטטי ב-next.config.ts שעובד עם NetFree). NetFree מוסיף את ה-origins
// שלו ל-allowlist בעצמו (כפי שהוא עושה לדפים הסטטיים). שאר ה-directives
// (frame-ancestors/object-src/base-uri) נשמרים מחמירים.
function buildCsp(isDev: boolean): string {
  const scriptSrc = isDev
    ? `script-src 'self' 'unsafe-inline' 'unsafe-eval'`
    : `script-src 'self' 'unsafe-inline'`;
  return [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data: https://fonts.gstatic.com",
    "connect-src 'self' https://*.cardcom.solutions https://*.googleapis.com https://generativelanguage.googleapis.com https://api.resend.com",
    "frame-src 'self' https://*.cardcom.solutions",
    "frame-ancestors 'none'",
    "form-action 'self' https://*.cardcom.solutions",
    "base-uri 'self'",
    "object-src 'none'",
    "report-uri /api/csp-report",
  ].join("; ");
}

function applyCsp(response: NextResponse, csp: string): NextResponse {
  // override ה-CSP הסטטי מ-next.config.ts (זהה לו, פרט ל-script-src תואם-NetFree).
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

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
  // Cardcom — Stage Cardcom (ADMIN בלבד: הגדרות מסוף, פרטי עסק)
  "/admin/billing/cardcom-setup",
  "/admin/billing/business-settings",
  "/admin/billing/landing-settings",
  // API מפתחות/הגדרות עולמיות
  "/api/admin/set-admin",
  "/api/admin/backfill-user-numbers",
  "/api/admin/tier-limits",
  "/api/admin/feature-flags",
  "/api/admin/terms",
  "/api/admin/coupons",
  "/admin/promotions",
  "/api/admin/promotions",
  "/admin/leads",
  "/api/admin/idempotency", // Stage 1.18 — ADMIN-only, defense-in-depth
  // Cardcom API — ADMIN בלבד רק עבור setup + business-settings
  // (charge/transactions/create-payment-page זמינים ל-MANAGER דרך requirePermission)
  "/api/admin/cardcom/setup",
  "/api/admin/business-settings",
  "/api/admin/landing-settings",
];

function isAdminOnlyPath(pathname: string): boolean {
  // חשוב: לוודא התאמה מדויקת או prefix עם גרש, כדי למנוע false positive
  // למשל `/admin/feature-flagsomething` לא יזוהה בטעות כחלק מ-`/admin/feature-flags`.
  return ADMIN_ONLY_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
}

// ========================================================================
// Phase 4 follow-up — CLINIC_SECRETARY whitelist ל-/clinic-admin/*
// ========================================================================
// כברירת מחדל CLINIC_SECRETARY נחסם/ת מ-/clinic-admin/* ומ-/api/clinic-admin/*
// (clinic ownership flows). הוספנו הרשאה גרנולרית `canTransferClient`
// שמאפשרת למזכירה לבצע העברות מטופלים — אבל ה-JWT לא נושא את ה-flag הזה,
// כך שהמידלוור לא יודע לאשר/לדחות פר-הרשאה.
//
// פתרון: רשימה מצומצמת של נתיבים שמותר ל-CLINIC_SECRETARY *להגיע* אליהם
// (מבחינת middleware), כשהאכיפה האמיתית — האם יש לה ההרשאה הספציפית —
// מתבצעת ב-route handler עצמו דרך requireClinicAdminAccess({ allowSecretaryWith }).
// השאר (overview, departures, invitations, billing, settings) נשאר owner-only.
//
// תאימות לאחור: מזכירה ללא canTransferClient תקבל 403 ידידותי מה-route handler;
// לא תיתקל ב-redirect מוזר ל-/dashboard.
const SECRETARY_CLINIC_ADMIN_PATHS = [
  "/clinic-admin/transfer",
  "/clinic-admin/members/by-therapist",
  // צ׳אט צוות בתוך לייאאוט הקליניקה — לא owner-only: זהו פיצ'ר לכל חבר/ת
  // קליניקה (הדף אוכף isMember). מזכיר/ה עם הרשאת העברה רואה את הקישור ב-sidebar
  // הקליניקה; בלי הנתיב כאן ה-middleware היה מפנה אותה ל-/dashboard. ה-API של
  // הצ'אט (/api/chat/*) אינו תחת /api/clinic-admin ולכן לא דורש whitelist.
  "/clinic-admin/team-chat",
  "/api/clinic-admin/me",
  "/api/clinic-admin/clients",
  "/api/clinic-admin/clients-by-therapist",
  "/api/clinic-admin/transfer-client",
  // מטלות צוות — נגיש למזכיר/ה עם canAssignTasks. ה-handlers אוכפים
  // canManageStaffTasks per-request (מזכירה בלי ההרשאה מקבלת 403 מה-handler).
  // בלי הנתיבים כאן, מזכירה מורשית היתה נחסמת ע"י ה-proxy והפיצ'ר לא היה זמין לה.
  "/clinic-admin/tasks",
  "/api/clinic-admin/tasks",
  "/api/clinic-admin/staff",
];

function isSecretaryAllowedClinicAdminPath(pathname: string): boolean {
  return SECRETARY_CLINIC_ADMIN_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/")
  );
}

/**
 * round18-fix: Next 16 לא מאפשר `export const config` בקובץ proxy.ts
 * ("Route segment config is not allowed in Proxy file"). המtracker
 * שהיה ב-config.matcher עבר ל-pathMatches inline בתחילת הפונקציה.
 *
 * הלוגיקה זהה ל-matcher הישן:
 *   "/admin/:path*", "/clinic-admin/:path*", "/dashboard/:path*",
 *   "/api/((?!auth/|health|webhooks/|cron/).*)"
 */
function pathShouldRunProxy(pathname: string): boolean {
  if (
    pathname.startsWith("/admin/") ||
    pathname === "/admin" ||
    pathname.startsWith("/clinic-admin/") ||
    pathname === "/clinic-admin" ||
    pathname.startsWith("/dashboard/") ||
    pathname === "/dashboard"
  ) {
    return true;
  }
  if (pathname.startsWith("/api/")) {
    // exclude /api/auth/*, /api/health, /api/webhooks/*, /api/cron/*
    if (pathname.startsWith("/api/auth/")) return false;
    if (pathname === "/api/health" || pathname.startsWith("/api/health/")) return false;
    if (pathname.startsWith("/api/webhooks/")) return false;
    if (pathname.startsWith("/api/cron/")) return false;
    return true;
  }
  return false;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // round18-fix: matcher inline (אסור export const config ב-Next 16 proxy.ts)
  if (!pathShouldRunProxy(pathname)) {
    return NextResponse.next();
  }

  // CSRF — שכבת הגנה נוספת (defense-in-depth) מעבר ל-SameSite=Lax בעוגיית הסשן.
  // חוסם מוטציות (POST/PUT/PATCH/DELETE) חוצות-מקור לנתיבי /api/* בלבד.
  // וובהוקים (/api/webhooks/*), cron (/api/cron/*) ו-NextAuth (/api/auth/*) מוחרגים
  // כבר ב-pathShouldRunProxy, כך שספקי תשלום/OAuth החיצוניים לא מושפעים. Server
  // Actions (POST לדפים) מוגנים-CSRF נייטיבית ע"י Next.js ולכן אינם כלולים כאן.
  if (
    pathname.startsWith("/api/") &&
    isCrossOriginMutation(
      request.method,
      request.headers,
      request.headers.get("host") ?? request.nextUrl.host
    )
  ) {
    // לוג קליל (ללא PHI — רק מטא של הבקשה) לזיהוי תקיפות *וגם* false-positive
    // בפרודקשן: אם משתמש אמיתי נחסם בטעות, זו הדרך היחידה לראות זאת.
    console.warn(
      JSON.stringify({
        level: "warn",
        msg: "[csrf] blocked cross-origin mutation",
        method: request.method,
        pathname,
        origin: request.headers.get("origin"),
        secFetchSite: request.headers.get("sec-fetch-site"),
      })
    );
    return NextResponse.json(
      { message: "הבקשה נחסמה: מקור לא מורשה." },
      { status: 403 }
    );
  }

  // CSP תואם-NetFree (ראה buildCsp). אין nonce per-request: NetFree שובר
  // nonces בשכתוב ה-HTML, לכן ה-CSP מסתמך על 'self' + 'unsafe-inline'.
  const isDev = process.env.NODE_ENV !== "production";
  const cspHeader = buildCsp(isDev);

  const requestHeaders = new Headers(request.headers);

  // Get the token from the request
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET
  });

  // C7: password rotation gate. אם token.passwordStale=true (הסיסמה
  // הוחלפה אחרי הנפקת ה-token), מאלצים login מחדש. ל-API: 401 JSON.
  // לדפים: redirect ל-/login. מבוצע לפני 2FA gate כי הוא יותר חמור
  // (token גנוב צריך להפסיק לעבוד מיד).
  if (token?.passwordStale === true) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { message: "הסיסמה שונתה. נא להתחבר מחדש." },
        { status: 401 }
      );
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("error", "password_changed");
    return NextResponse.redirect(loginUrl);
  }

  // H6 (סבב אבטחה 14): sessionVersion gate. אם token.sessionStale=true
  // (DB.sessionVersion > token.sv), המשתמש ביצע 2FA enable/disable או נחסם
  // ע"י admin אחרי הנפקת ה-token. מאלצים login מחדש — מונע שימוש ב-cookies
  // גנובות אחרי שינוי credentials/הרשאות.
  if (token?.sessionStale === true) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { message: "ההגדרות שלך שונו. נא להתחבר מחדש." },
        { status: 401 }
      );
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("error", "session_invalidated");
    return NextResponse.redirect(loginUrl);
  }

  // C9: absolute session lifetime gate. סשן ישן יותר מ-30 ימים נדחה
  // ומאלץ login מחדש. מונע "infinite session" — חיוני במערכת רפואית.
  if (token?.sessionExpired === true) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { message: "הסשן פג. נא להתחבר מחדש." },
        { status: 401 }
      );
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("error", "session_expired");
    return NextResponse.redirect(loginUrl);
  }

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
  // יוצא דופן: CLINIC_SECRETARY עם canTransferClient — מורשית רק לנתיבים
  // ספציפיים (transfer, members/by-therapist + ה-APIs שלהם). ה-flag עצמו
  // נאכף עמוק יותר ב-requireClinicAdminAccess; המידלוור רק מאפשר *הגעה*.
  if (pathname.startsWith("/clinic-admin")) {
    if (!token) {
      const loginUrl = new URL("/login", request.url);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }
    const isPrivileged =
      token.role === "ADMIN" || token.role === "CLINIC_OWNER";
    const isSecretaryOnWhitelist =
      token.role === "CLINIC_SECRETARY" &&
      isSecretaryAllowedClinicAdminPath(pathname);
    if (!isPrivileged && !isSecretaryOnWhitelist) {
      const dashboardUrl = new URL("/dashboard", request.url);
      dashboardUrl.searchParams.set("error", "clinic_owner_only");
      return NextResponse.redirect(dashboardUrl);
    }
  }

  // Protect /api/clinic-admin routes — require CLINIC_OWNER or ADMIN.
  // יוצא דופן זהה ל-/clinic-admin: CLINIC_SECRETARY מורשית רק ל-APIs ב-whitelist
  // (me, clients, clients-by-therapist, transfer-client + preview). הרשאה
  // גרנולרית canTransferClient נאכפת ב-route handler עצמו.
  if (pathname.startsWith("/api/clinic-admin")) {
    if (!token) {
      return NextResponse.json(
        { message: "לא מורשה - נדרשת התחברות" },
        { status: 401 }
      );
    }
    const isPrivileged =
      token.role === "ADMIN" || token.role === "CLINIC_OWNER";
    const isSecretaryOnWhitelist =
      token.role === "CLINIC_SECRETARY" &&
      isSecretaryAllowedClinicAdminPath(pathname);
    if (!isPrivileged && !isSecretaryOnWhitelist) {
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
      return applyCsp(
        NextResponse.next({ request: { headers: requestHeaders } }),
        cspHeader
      );
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
        const response = NextResponse.next({ request: { headers: requestHeaders } });
        response.headers.set("x-subscription-warning", "past_due");
        const gracePeriodEndsAt = token.gracePeriodEndsAt as string;
        if (gracePeriodEndsAt) {
          response.headers.set("x-grace-period-ends", gracePeriodEndsAt);
        }
        return applyCsp(response, cspHeader);
      }
    }
  }

  return applyCsp(
    NextResponse.next({ request: { headers: requestHeaders } }),
    cspHeader
  );
}

// round18-fix: ב-Next 16 proxy.ts לא מאפשר `export const config`.
// ה-matcher עבר ל-pathShouldRunProxy() inline בתחילת ה-proxy() function.
// הלוגיקה זהה:
//   "/admin/:path*", "/clinic-admin/:path*", "/dashboard/:path*",
//   "/api/((?!auth/|health|webhooks/|cron/).*)"
// ה-early-return ב-NextResponse.next() שומר על אותה התנהגות.

