// src/app/api/cron/impersonation-hardkill/route.ts
//
// Stage 2.0 — hardkill של impersonation sessions שעברו את הסף.
//
// מוטיבציה: ה-timeout הקיים (lazy ב-jwt callback) מסתמך על JWT callback שירוץ
// שוב — אם המשתמש סגר את הדפדפן בלי logout, הסשן ב-DB יישאר endedAt=null
// לנצח אפילו ש-token כבר לא יכול להשתמש בו (token ב-client). דבר זה יוצר
// 2 בעיות:
//   1. אדמין שרואה את רשימת ה-sessions החיים יראה sessions זומבי.
//   2. ה-partial unique index על impersonatorId WHERE endedAt IS NULL חוסם
//      OWNER מלהתחיל impersonation חדש כי הקיים עדיין "פעיל" ב-DB.
//
// פעולה: מסמן endedAt=now + endedReason="TIMEOUT" לכל ImpersonationSession
// שבו startedAt < now-30m ו-endedAt IS NULL.
//
// H4 (2026-05-17): הסף קוצר מ-4h ל-30 דקות בעקבות סקירת אבטחה. PHI מצריך
// חלון impersonation קצר. ה-cron עדיין רץ כל 30 דקות, אבל הוא בעיקר rescue
// — ה-lazy check ב-JWT callback (auth.ts) הוא ההגנה הרגעית.

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { withAudit } from "@/lib/audit";
import { checkCronAuth } from "@/lib/cron-auth";

export const dynamic = "force-dynamic";

const IMPERSONATION_TIMEOUT_MS = 30 * 60 * 1000;

export async function GET(req: NextRequest) {
  try {
    const guard = await checkCronAuth(req);
    if (guard) return guard;

    const cutoff = new Date(Date.now() - IMPERSONATION_TIMEOUT_MS);

    const result = await withAudit(
      { kind: "system", source: "CRON", externalRef: "impersonation-hardkill" },
      {
        action: "cron_impersonation_hardkill",
        targetType: "impersonation_session",
        details: { cutoff: cutoff.toISOString(), reason: "30m_timeout" },
      },
      async (tx) => {
        return tx.impersonationSession.updateMany({
          where: {
            endedAt: null,
            startedAt: { lt: cutoff },
          },
          data: {
            endedAt: new Date(),
            endedReason: "TIMEOUT_30M",
          },
        });
      }
    );

    if (result.count > 0) {
      logger.info("[cron impersonation-hardkill] terminated stale sessions", {
        count: result.count,
        cutoff: cutoff.toISOString(),
      });
    }

    return NextResponse.json({
      success: true,
      terminated: result.count,
      message: `סיים ${result.count} impersonation sessions שעברו 30 דקות`,
    });
  } catch (error) {
    logger.error("[cron impersonation-hardkill] error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה ב-hardkill של impersonation sessions" },
      { status: 500 }
    );
  }
}
