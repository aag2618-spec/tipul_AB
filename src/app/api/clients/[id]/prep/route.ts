import { NextRequest, NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { buildClientWhere, isSecretary, loadScopeUser } from "@/lib/scope";
import { sanitizeUserHtml } from "@/lib/sanitize-html";

// PHI scoped למשתמש — מונע cache. נטען על-פי-דרישה מכרטיס "הכנה לפגישה" בדשבורד.
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const { id } = await params;
    const scopeUser = await loadScopeUser(userId);

    // "הכנה לפגישה" = תוכן קליני (נושאים + סיכומים). מזכירה חסומה לחלוטין —
    // כמו דף ההכנה וכמו GET /api/clients/[id]/summaries.
    if (isSecretary(scopeUser)) {
      logger.warn("[clients/prep] Secretary attempted clinical access", {
        userId,
        clientId: id,
      });
      return NextResponse.json(
        { message: "אין הרשאה לתוכן קליני (הכנה לפגישה)" },
        { status: 403 }
      );
    }

    const clientWhere = buildClientWhere(scopeUser);

    // topic + sessionNote.content מוצפנים at-rest; ה-Prisma extension מפענח בקריאה.
    // buildClientWhere מתחם את הגישה למטופלי המשתמש/הקליניקה (multi-tenant scope).
    const client = await prisma.client.findFirst({
      where: { AND: [{ id }, clientWhere] },
      select: {
        id: true,
        therapySessions: {
          where: { type: { not: "BREAK" } },
          orderBy: { startTime: "desc" },
          take: 200, // cap בטיחותי — תואם לדף ההכנה
          select: {
            id: true,
            startTime: true,
            endTime: true,
            type: true,
            topic: true,
            sessionNote: { select: { content: true } },
          },
        },
      },
    });

    if (!client) {
      return NextResponse.json({ message: "מטופל לא נמצא" }, { status: 404 });
    }

    const sessions = client.therapySessions;

    // נושאים חוזרים — ספירת ערכי topic (נירמול whitespace בלבד; בלי מיזוג טקסט).
    const topicMap = new Map<string, number>();
    for (const s of sessions) {
      const t = s.topic?.trim();
      if (!t) continue;
      topicMap.set(t, (topicMap.get(t) ?? 0) + 1);
    }
    const topicCounts = Array.from(topicMap.entries())
      .map(([topic, count]) => ({ topic, count }))
      .sort((a, b) => b.count - a.count || a.topic.localeCompare(b.topic, "he"));

    // סיכומים — sanitizeUserHtml server-side (defense-in-depth מעל הסניטציה בכתיבה).
    // sessions כבר ממוין מהחדש לישן.
    const summaries = sessions
      .filter((s) => s.sessionNote?.content)
      .map((s) => ({
        id: s.id,
        startTime: s.startTime.toISOString(),
        endTime: s.endTime.toISOString(),
        type: s.type as string,
        contentHtml: sanitizeUserHtml(s.sessionNote!.content),
      }));

    return NextResponse.json({ topicCounts, summaries });
  } catch (error) {
    logger.error("Get client prep error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה בטעינת ההכנה לפגישה" },
      { status: 500 }
    );
  }
}
