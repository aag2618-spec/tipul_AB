// src/app/api/integrations/cardcom/setup/revoke-previous-secret/route.ts
// Emergency endpoint: immediately invalidate `previousWebhookSecret` (the
// 24h grace-period secret kept after a rotation). Use when the OLD secret
// is known to have leaked — without this, an attacker with the old secret
// can keep forging webhooks for up to 24 hours.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { withAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

export async function POST() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { userId, session } = auth;

  try {
    const result = await withAudit(
      { kind: "user", session },
      {
        action: "user_cardcom_force_revoke_previous_secret",
        targetType: "billing_provider",
        targetId: userId,
        details: { reason: "emergency revoke" },
      },
      async (tx) => {
        return tx.billingProvider.updateMany({
          where: { userId, provider: "CARDCOM" },
          data: {
            previousWebhookSecret: null,
            previousWebhookSecretValidUntil: null,
          },
        });
      }
    );

    return NextResponse.json({ revoked: result.count > 0 });
  } catch (err) {
    logger.error("[integrations/cardcom/setup/revoke-previous-secret] failed", {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ message: "שגיאה בביטול" }, { status: 500 });
  }
}
