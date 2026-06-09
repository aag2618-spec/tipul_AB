import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/api-auth";
import { buildClientWhere, isSecretary, loadScopeUser } from "@/lib/scope";
import { requireContentFilterEnabled } from "@/lib/content-unblock";

export const dynamic = "force-dynamic";

// כלי "שחרור תיק חסום": רשימת מטופלים בלבד (שם + מונים). מטה-דאטה בלבד —
// אף שדה קליני/מוצפן לא נבחר, כדי שהדף לעולם לא ייחסם ע"י סינון תוכן.
export async function GET() {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const scopeUser = await loadScopeUser(userId);
    if (isSecretary(scopeUser)) {
      return NextResponse.json({ message: "אין הרשאה לתוכן קליני" }, { status: 403 });
    }
    const gate = await requireContentFilterEnabled(userId);
    if (gate) return gate;

    const clients = await prisma.client.findMany({
      where: buildClientWhere(scopeUser),
      select: {
        id: true,
        name: true,
        status: true,
        // comprehensiveAnalysisAt הוא חותמת זמן (לא מוצפן) — בטוח כמטה-דאטה.
        comprehensiveAnalysisAt: true,
        _count: { select: { therapySessions: true, questionnaireResponses: true } },
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({
      clients: clients.map((c) => ({
        id: c.id,
        name: c.name,
        status: c.status,
        hasComprehensive: c.comprehensiveAnalysisAt != null,
        sessionsCount: c._count.therapySessions,
        questionnairesCount: c._count.questionnaireResponses,
      })),
    });
  } catch (error) {
    logger.error("content-unblock clients error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "אירעה שגיאה בטעינת המטופלים" },
      { status: 500 }
    );
  }
}
