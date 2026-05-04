import { NextResponse } from "next/server";
import { getAllClientsDebtSummary } from "@/lib/payment-service";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/api-auth";
import { loadScopeUser } from "@/lib/scope";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const scopeUser = await loadScopeUser(userId);
    const clientDebts = await getAllClientsDebtSummary(userId, scopeUser);
    return NextResponse.json(clientDebts);
  } catch (error) {
    logger.error("Get client debts error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "שגיאה בטעינת החובות" },
      { status: 500 }
    );
  }
}
