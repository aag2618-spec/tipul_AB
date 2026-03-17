import { NextResponse } from "next/server";
import { migrateParentReceiptsToChildren } from "@/lib/payment-service";
import { logger } from "@/lib/logger";

import { requireAuth } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const result = await migrateParentReceiptsToChildren();

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
