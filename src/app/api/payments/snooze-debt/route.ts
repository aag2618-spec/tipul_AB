import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/api-auth";
import { loadScopeUserWithMode } from "@/lib/secretary-mode";
import { snoozeDebtSchema, unsnoozeDebtSchema } from "@/lib/validations/payment";

export const dynamic = "force-dynamic";

/**
 * אימות scope: מותר לדחות/לבטל דחייה של חוב רק למטופל שבסקופ של המבצע —
 * המטופל שלו (therapistId === userId) או באותו ארגון. תואם לדפוס
 * /api/sessions/overlaps/dismiss. מחזיר את ה-client (או null) או תשובת שגיאה.
 */
async function authorizeClient(userId: string, clientId: string) {
  const scopeUser = await loadScopeUserWithMode(userId);
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true, therapistId: true, organizationId: true },
  });
  if (!client) {
    return { error: NextResponse.json({ message: "מטופל לא נמצא" }, { status: 404 }) };
  }
  const mine = client.therapistId === userId;
  const myOrg =
    !!scopeUser.organizationId &&
    client.organizationId === scopeUser.organizationId;
  if (!mine && !myOrg) {
    return { error: NextResponse.json({ message: "אין הרשאה" }, { status: 403 }) };
  }
  return { client };
}

/**
 * POST /api/payments/snooze-debt
 *
 * דוחה את התראת החוב של מטופל ("אל תזכיר לי") עד snoozeUntil. החוב לא ייספר
 * בעיגול שליד "תשלומים" בתפריט ויסומן "נדחה עד..." בדף התשלומים, עד שהתאריך
 * יעבור או שתבוטל הדחייה. הדחייה משותפת ברמת המטופל (SnoozedDebt.clientId
 * unique) — לא פר-משתמש.
 */
export async function POST(request: Request) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ message: "גוף הבקשה אינו תקין" }, { status: 400 });
    }

    const parsed = snoozeDebtSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ message: "נתונים לא תקינים" }, { status: 400 });
    }
    const { clientId, snoozeUntil } = parsed.data;

    const authz = await authorizeClient(userId, clientId);
    if ("error" in authz) return authz.error;

    await prisma.snoozedDebt.upsert({
      where: { clientId },
      create: { clientId, snoozeUntil: new Date(snoozeUntil), snoozedById: userId },
      update: { snoozeUntil: new Date(snoozeUntil), snoozedById: userId },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error("Snooze debt error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ message: "אירעה שגיאה" }, { status: 500 });
  }
}

/**
 * DELETE /api/payments/snooze-debt
 *
 * מבטל את דחיית החוב של מטופל — החוב חוזר להיספר ולהופיע כרגיל.
 */
export async function DELETE(request: Request) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ message: "גוף הבקשה אינו תקין" }, { status: 400 });
    }

    const parsed = unsnoozeDebtSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ message: "נתונים לא תקינים" }, { status: 400 });
    }
    const { clientId } = parsed.data;

    const authz = await authorizeClient(userId, clientId);
    if ("error" in authz) return authz.error;

    // deleteMany — אידמפוטנטי (לא זורק אם אין דחייה פעילה).
    await prisma.snoozedDebt.deleteMany({ where: { clientId } });

    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error("Unsnooze debt error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ message: "אירעה שגיאה" }, { status: 500 });
  }
}
