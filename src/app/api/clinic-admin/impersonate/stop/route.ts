import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/api-auth";
import { withAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// POST — מסיים impersonation פעיל. נקרא ע"י banner "צא ממצב התחזות".
export async function POST() {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { isImpersonating, originalUserId, actingAs, session } = auth;

    if (!isImpersonating || !actingAs) {
      return NextResponse.json(
        { message: "אינך במצב התחזות" },
        { status: 400 }
      );
    }

    await withAudit(
      { kind: "user", session },
      {
        action: "impersonate_stop",
        targetType: "User",
        targetId: actingAs.userId,
        details: {
          impersonationSessionId: actingAs.sessionId,
          originalUserId,
          targetName: actingAs.name,
          durationMs: Date.now() - actingAs.startedAt,
        },
      },
      async (tx) => {
        // updateMany כדי לא לזרוק שגיאה אם הסשן כבר נסגר ע"י cron/timeout
        await tx.impersonationSession.updateMany({
          where: { id: actingAs.sessionId, endedAt: null },
          data: { endedAt: new Date(), endedReason: "MANUAL" },
        });
      }
    );

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("[impersonate/stop] error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה בעצירת ההתחזות" },
      { status: 500 }
    );
  }
}
