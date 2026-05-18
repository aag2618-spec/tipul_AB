// src/app/api/csp-report/route.ts
//
// M13.2 — CSP violation report endpoint.
//
// מקבל reports מ-`report-uri` של CSP (פורמט ישן: application/csp-report)
// ומ-Reports API (פורמט מודרני: application/reports+json). לא דורש auth —
// הדפדפן עצמו שולח את הreport.
//
// הגנות:
//   • rate-limit פר-IP אגרסיבי (60/דקה) מונע flood של זיופים מתוקף.
//   • body size cap — מונע memory pressure מ-payload ענק.
//   • logger.warn (לא error) — לא לשפוך נתוני violations ב-stderr כ-critical.
//   • payload sanitized ב-logger (יש deny-list של PII).
//
// אין שמירה ל-DB. אם נצטרך retention/aggregation בעתיד — להוסיף table חדש.

import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import {
  checkRateLimit,
  rateLimitResponse,
  CSP_REPORT_PER_IP,
} from "@/lib/rate-limit";
import { getClientIp } from "@/lib/get-client-ip";

export const dynamic = "force-dynamic";

// 16KB cap על body — CSP report סטנדרטי הוא ~1KB. כל יותר זה זיוף/abuse.
const MAX_BODY_BYTES = 16 * 1024;

interface CspReportLegacy {
  "csp-report"?: {
    "document-uri"?: string;
    referrer?: string;
    "blocked-uri"?: string;
    "violated-directive"?: string;
    "effective-directive"?: string;
    "original-policy"?: string;
    disposition?: string;
    "status-code"?: number;
    "script-sample"?: string;
    "source-file"?: string;
    "line-number"?: number;
    "column-number"?: number;
  };
}

interface CspReportModern {
  type?: string;
  age?: number;
  url?: string;
  user_agent?: string;
  body?: {
    documentURL?: string;
    referrer?: string;
    blockedURL?: string;
    effectiveDirective?: string;
    originalPolicy?: string;
    sourceFile?: string;
    lineNumber?: number;
    columnNumber?: number;
    disposition?: string;
    statusCode?: number;
  };
}

export async function POST(request: NextRequest) {
  try {
    // rate-limit פר-IP — לפני קריאת body, לחסום flood מוקדם
    const ip = getClientIp(request);
    const rateCheck = checkRateLimit(`csp-report:${ip}`, CSP_REPORT_PER_IP);
    if (!rateCheck.allowed) {
      return rateLimitResponse(rateCheck);
    }

    // body size cap
    const contentLength = Number(request.headers.get("content-length") || 0);
    if (contentLength > MAX_BODY_BYTES) {
      return new NextResponse(null, { status: 413 });
    }

    let parsed: unknown;
    try {
      parsed = await request.json();
    } catch {
      // payload לא JSON תקין — מתעלמים בשקט (לא לוגים, זה רעש)
      return new NextResponse(null, { status: 204 });
    }

    // טיפול בשני הפורמטים
    if (Array.isArray(parsed)) {
      // Reports API (modern): array של reports
      for (const item of parsed.slice(0, 10)) {
        const report = item as CspReportModern;
        if (report?.type !== "csp-violation") continue;
        const b = report.body ?? {};
        logger.warn("[csp-report] CSP violation (modern)", {
          documentURL: b.documentURL,
          blockedURL: b.blockedURL,
          effectiveDirective: b.effectiveDirective,
          sourceFile: b.sourceFile,
          lineNumber: b.lineNumber,
          disposition: b.disposition,
          userAgent: report.user_agent,
        });
      }
    } else if (parsed && typeof parsed === "object") {
      // Legacy report-uri: { "csp-report": { ... } }
      const report = (parsed as CspReportLegacy)["csp-report"];
      if (report) {
        logger.warn("[csp-report] CSP violation (legacy)", {
          documentUri: report["document-uri"],
          blockedUri: report["blocked-uri"],
          violatedDirective: report["violated-directive"],
          effectiveDirective: report["effective-directive"],
          sourceFile: report["source-file"],
          lineNumber: report["line-number"],
          disposition: report.disposition,
        });
      }
    }

    return new NextResponse(null, { status: 204 });
  } catch (error) {
    logger.error("[csp-report] handler error", {
      errorMessage: error instanceof Error ? error.message : String(error),
    });
    return new NextResponse(null, { status: 204 });
  }
}
