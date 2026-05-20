import { NextResponse } from "next/server";
import { migrateParentReceiptsToChildren } from "@/lib/payment-service";
import { logger } from "@/lib/logger";

import { requireAdmin } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    // round15 (2.2): שדרוג מ-requireAuth ל-requireAdmin. השחזור של receipt
    // tokens (migrateParentReceiptsToChildren) הוא פעולה רגישה שחייבת להיות
    // מוגבלת ל-ADMIN בלבד. ב-feedback_security_fixes.md חוק 3 — admin tools
    // חייבים scope/admin check, לא רק auth.
    const auth = await requireAdmin();
    if ("error" in auth) return auth.error;
    const { session } = auth;

    // round17 (B2): מעבירים actor=user ל-withAudit ב-bulk-payment.
    const result = await migrateParentReceiptsToChildren({
      kind: "user",
      session,
    });

    return NextResponse.json({
      success: true,
      fixed: result.fixed,
      details: result.details,
      message:
        result.fixed > 0
          ? `תוקנו ${result.fixed} קבלות`
          : "אין קבלות שדורשות תיקון",
    });
  } catch (error) {
    logger.error("Fix receipts error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "שגיאה בתיקון הקבלות" },
      { status: 500 }
    );
  }
}
