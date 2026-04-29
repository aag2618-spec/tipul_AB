import type { NextConfig } from "next";

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
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data:",
      "connect-src 'self' https://*.cardcom.solutions https://*.googleapis.com https://generativelanguage.googleapis.com https://api.resend.com",
      "frame-src 'self' https://*.cardcom.solutions",
      "frame-ancestors 'none'",
      "form-action 'self' https://*.cardcom.solutions",
      "base-uri 'self'",
      "object-src 'none'",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  // Stage 1.19 — hide framework fingerprint from response headers.
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
