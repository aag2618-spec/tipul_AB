import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";

import { withAudit } from "@/lib/audit";
import { cleanupExpiredIdempotencyKeys } from "@/lib/idempotency";

export const dynamic = "force-dynamic";

/**
 * GET /api/cron/cleanup-idempotency — ניקוי יומי של מפתחות idempotency שפגו.
 *
 * Stage 1.18.2 — נקרא על ידי Render Cron Job (יומי, 04:00 ישראל).
 *
 * לא דורש session — משתמש ב-CRON_SECRET ב-Authorization header.
 * actor = `{kind: "system", source: "CRON"}` (audit log מקבל adminId=null +
 * adminName="[SYSTEM:CRON]", ראה `src/lib/audit.ts:119`).
 *
 * ב-prod: הגדר ב-Render → Cron Jobs → Schedule `0 4 * * *` + header
 * `Authorization: Bearer $CRON_SECRET`.
 *
 * שלא כמו /api/admin/idempotency (מנהל ידני): פה לא צריך requirePermission —
 * זה cron שרץ מטעם המערכת.
 */
export async function GET(req: NextRequest) {
  try {
    // אימות cron secret — מגן מפני קריאה חיצונית.
    const cronSecret = process.env.CRON_SECRET;
    if (!cronSecret) {
      logger.error("[cron cleanup-idempotency] CRON_SECRET not configured");
      return NextResponse.json(
        { message: "CRON_SECRET not configured" },
        { status: 503 }
      );
    }
    const authHeader = req.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ message: "לא מורשה" }, { status: 401 });
    }

    const count = await withAudit(
      { kind: "system", source: "CRON", externalRef: "cleanup-idempotency" },
      {
        action: "cron_cleanup_idempotency",
        targetType: "idempotency_key",
        details: { reason: "daily_scheduled_cleanup" },
      },
      async (tx) => cleanupExpiredIdempotencyKeys(tx)
    );

    logger.info("[cron cleanup-idempotency] completed", { deletedCount: count });

    return NextResponse.json({
      success: true,
      deletedCount: count,
      message: `נמחקו ${count} מפתחות idempotency פגי-תוקף`,
    });
  } catch (error) {
    logger.error("[cron cleanup-idempotency] error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה בניקוי idempotency" },
      { status: 500 }
    );
  }
}
