import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";

import { requirePermission } from "@/lib/api-auth";
import { withAudit } from "@/lib/audit";
import { cleanupExpiredIdempotencyKeys } from "@/lib/idempotency";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/admin/idempotency — ניקוי ידני של מפתחות idempotency שפגו.
 *
 * Stage 1.18 — ADMIN-only (`idempotency.clear` permission, rank 10).
 *
 * ברירת מחדל: מוחק רק רשומות שה-TTL שלהן עבר (כמו ה-cron היומי, אבל מיידי).
 * עטוף ב-withAudit כי מוחק רשומות כסף-רגישות (webhook של Cardcom שעבר TTL).
 *
 * שימוש: כאשר יש חשד ל-idempotency keys שתוקעים ראוטים (למשל אחרי migration
 * או debugging של webhook כפול), ADMIN יכול לכפות ניקוי מידי.
 */
export async function DELETE(_req: NextRequest) {
  try {
    const auth = await requirePermission("idempotency.clear");
    if ("error" in auth) return auth.error;
    const { session } = auth;

    const count = await withAudit(
      { kind: "user", session },
      {
        action: "clear_expired_idempotency_keys",
        targetType: "idempotency_key",
        details: { reason: "manual_admin_trigger" },
      },
      async () => cleanupExpiredIdempotencyKeys()
    );

    return NextResponse.json({
      success: true,
      deletedCount: count,
      message:
        count === 0
          ? "לא נמצאו מפתחות פגי-תוקף למחיקה"
          : `נמחקו ${count} מפתחות idempotency פגי-תוקף`,
    });
  } catch (error) {
    logger.error("Admin idempotency clear error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה בניקוי מפתחות idempotency" },
      { status: 500 }
    );
  }
}
