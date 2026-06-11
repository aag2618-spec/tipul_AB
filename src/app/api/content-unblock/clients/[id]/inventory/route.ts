import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/api-auth";
import { buildClientWhere, buildSessionWhere, isSecretary, loadScopeUser } from "@/lib/scope";
import { requireContentFilterEnabled } from "@/lib/content-unblock";

export const dynamic = "force-dynamic";

// מצאי תוכן קליני של מטופל מסוים — מטה-דאטה + דגלי "יש תוכן" בלבד.
// עיקרון קריטי: אף עמודה קלינית/מוצפנת (content/notes) לא נבחרת. דגלים
// מחושבים דרך קיום relation (select id) / count. כך הדף לעולם לא מציג תוכן.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;
    const { id } = await params;

    const scopeUser = await loadScopeUser(userId);
    if (isSecretary(scopeUser)) {
      return NextResponse.json({ message: "אין הרשאה לתוכן קליני" }, { status: 403 });
    }
    const gate = await requireContentFilterEnabled(userId);
    if (gate) return gate;

    const clientWhere = buildClientWhere(scopeUser);
    const sessionWhere = buildSessionWhere(scopeUser);

    // בעלות: המטופל חייב להיות ב-scope של המשתמש.
    const client = await prisma.client.findFirst({
      where: { AND: [{ id }, clientWhere] },
      select: { id: true, name: true },
    });
    if (!client) {
      return NextResponse.json({ message: "מטופל לא נמצא" }, { status: 404 });
    }

    // שאילתות במקביל (אחרי אימות בעלות). אף אחת לא בוחרת תוכן קליני.
    const [sessionsRaw, profileCount] = await Promise.all([
      prisma.therapySession.findMany({
        where: { AND: [{ clientId: id }, sessionWhere] },
        select: {
          id: true,
          startTime: true,
          type: true,
          status: true,
          skipSummary: true,
          sessionNote: { select: { id: true } },
        },
        orderBy: { startTime: "desc" },
      }),
      prisma.client.count({
        where: {
          id,
          OR: [
            { notes: { not: null } },
            { initialDiagnosis: { not: null } },
            { intakeNotes: { not: null } },
            { approachNotes: { not: null } },
            { culturalContext: { not: null } },
          ],
        },
      }),
    ]);

    const sessions = sessionsRaw
      .map((s) => ({
        id: s.id,
        startTime: s.startTime,
        type: s.type,
        status: s.status,
        skipSummary: s.skipSummary,
        hasNote: s.sessionNote != null,
      }))
      .filter((s) => s.hasNote);

    return NextResponse.json({
      client: { id: client.id, name: client.name },
      sessions,
      clinicalProfile: { has: profileCount > 0 },
    });
  } catch (error) {
    logger.error("content-unblock inventory error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "אירעה שגיאה בטעינת המצאי" },
      { status: 500 }
    );
  }
}
