import type { NextConfig } from "next";

// בdev mode, Next.js webpack משתמש ב-eval() ל-HMR ול-source maps.
// בproduction אסור — היה rich attack vector. נכלול 'unsafe-eval' רק בdev.
const isDev = process.env.NODE_ENV !== "production";
const scriptSrc = isDev
  ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
  : "script-src 'self' 'unsafe-inline'";

const securityHeaders = [
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "X-DNS-Prefetch-Control",
    value: "on",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(self), geolocation=(), payment=(self), usb=(), magnetometer=(), gyroscope=(), accelerometer=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "Cross-Origin-Opener-Policy",
    value: "same-origin",
  },
  {
    key: "Cross-Origin-Resource-Policy",
    value: "same-origin",
  },
  // CSP — Enforced (Stage 1.20 → enforcement).
  // היה במצב Report-Only לאיסוף נתונים על 3rd-party origins.
  // עכשיו אכוף — הדפדפן יחסום inline scripts/styles שלא תואמים למדיניות.
  // אם משהו נשבר אחרי deploy → בדוק DevTools console להפרות, והוסף את ה-origin.
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      // H3: 'unsafe-eval' מותר רק בdev (Next.js HMR משתמש בו). בproduction חסום.
      // 'unsafe-inline' נשאר כי Next.js משתמש ב-inline scripts ל-hydration;
      // הסרתו תדרוש nonces על כל inline script.
      scriptSrc,
      // Google Fonts CSS (fonts.googleapis.com) — נדרש לטעינת הגופן Heebo בעברית
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "img-src 'self' data: blob: https:",
      // Google Fonts WOFF/WOFF2 files (fonts.gstatic.com) — קבצי הגופן עצמם
      "font-src 'self' data: https://fonts.gstatic.com",
      "connect-src 'self' https://*.cardcom.solutions https://*.googleapis.com https://generativelanguage.googleapis.com https://api.resend.com",
      "frame-src 'self' https://*.cardcom.solutions",
      "frame-ancestors 'none'",
      "form-action 'self' https://*.cardcom.solutions",
      "base-uri 'self'",
      "object-src 'none'",
    ].join("; "),
  },
];

// Stage 6-A.1 — anti-reverse-engineering: לוודא שלא נחשפים source-maps בייצור.
// ברירת המחדל של Next.js היא false, אך מציינים מפורש כדי שלא יוחלף בטעות.
// אם מישהו ינסה להפעיל debugger / DevTools / sources tab — יקבל קוד מינופי בלבד.
const productionBrowserSourceMaps = false;

// Stage 6-A.4 — Headers שחוסמים מנועי חיפוש מנתיבים פרטיים.
// זה defense-in-depth מעבר ל-public/robots.txt: גם מי שמתעלם מ-robots
// (scrapers זדוניים, archive.org) יקבל הוראת noindex/nofollow ברמת ה-HTTP header.
const noIndexHeaders = [
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive, nosnippet" },
];

const nextConfig: NextConfig = {
  // Stage 1.19 — hide framework fingerprint from response headers.
  poweredByHeader: false,
  productionBrowserSourceMaps,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
      // נתיבים פרטיים — חסומים מאינדוקס ברמת HTTP header.
      { source: "/admin/:path*", headers: noIndexHeaders },
      { source: "/dashboard/:path*", headers: noIndexHeaders },
      { source: "/clinic-admin/:path*", headers: noIndexHeaders },
      { source: "/api/:path*", headers: noIndexHeaders },
      // עמודי ציבור עם טוקן (departure-choice, receipts/public וכו') —
      // הקישורים נשלחים ישירות למטופל ולא צריכים להופיע בחיפוש.
      { source: "/p/:path*", headers: noIndexHeaders },
      { source: "/auth/:path*", headers: noIndexHeaders },
    ];
  },
};

export default nextConfig;
