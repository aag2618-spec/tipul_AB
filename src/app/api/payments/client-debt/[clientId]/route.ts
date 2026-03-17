import { NextRequest, NextResponse } from "next/server";
import { getClientDebtSummary } from "@/lib/payment-service";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ clientId: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const { clientId } = await params;
    const result = await getClientDebtSummary(userId, clientId);

    if (!result) {
      return NextResponse.json({ message: "מטופל לא נמצא" }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (error) {
    logger.error("Get client debt error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "שגיאה בטעינת נתונים" },
      { status: 500 }
    );
  }
}
