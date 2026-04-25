import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";

import { withAudit } from "@/lib/audit";
import { cleanupExpiredIdempotencyKeys } from "@/lib/idempotency";
import { checkCronAuth } from "@/lib/cron-auth";

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
    // checkCronAuth: CRON_SECRET + per-IP rate limit (10/min) + הודעה גנרית
    // ל-401 (לא מסגיר אם CRON_SECRET חסר). Stage 1.17 — סוכן 5 security.
    const guard = await checkCronAuth(req);
    if (guard) return guard;

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
