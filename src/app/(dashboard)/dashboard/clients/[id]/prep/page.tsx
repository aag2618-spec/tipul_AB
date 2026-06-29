import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { buildClientWhere, isSecretary } from "@/lib/scope";
import { loadScopeUserWithMode } from "@/lib/secretary-mode";
import { sanitizeUserHtml } from "@/lib/sanitize-html";
import { logger } from "@/lib/logger";
import { SessionPrepView } from "@/components/clients/session-prep-view";

// PHI scoped למשתמש — מונע cache leak בין מטפלים. force-dynamic כמו בכרטיס המטופל.
export const dynamic = "force-dynamic";

export default async function SessionPrepPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return null;

  const { id } = await params;

  let scopeUser;
  try {
    scopeUser = await loadScopeUserWithMode(session.user.id);
  } catch (error) {
    logger.error("[SessionPrepPage] Failed to load scope user:", {
      clientId: id,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }

  // "הכנה לפגישה" = תוכן קליני (נושאים + סיכומי טיפול). מזכירה חסומה לחלוטין —
  // כמו טאב הסיכומים וכמו GET /api/clients/[id]/summaries. הדף כולו קליני,
  // ולכן 404 (ולא הסתרת חלקים) הוא החסימה הנכונה. זו שכבת ההגנה ברמת ה-route.
  if (isSecretary(scopeUser)) {
    notFound();
  }

  const clientWhere = buildClientWhere(scopeUser);

  // ⭐ topic + sessionNote.content מוצפנים at-rest; ה-Prisma extension מפענח
  // אוטומטית בקריאה (decryptDeep יורד דרך relation therapySessions). buildClientWhere
  // מתחם את הגישה למטופלים של המשתמש/הקליניקה בלבד (multi-tenant scope).
  const client = await prisma.client.findFirst({
    where: { AND: [{ id }, clientWhere] },
    select: {
      id: true,
      name: true,
      therapySessions: {
        where: { type: { not: "BREAK" } },
        orderBy: { startTime: "desc" },
        take: 200, // cap בטיחותי — מספיק להיסטוריית נושאים וסיכומים של מטופל יחיד
        select: {
          id: true,
          startTime: true,
          endTime: true,
          type: true,
          status: true,
          topic: true,
          sessionNote: { select: { content: true } },
        },
      },
    },
  });

  if (!client) {
    notFound();
  }

  const sessions = client.therapySessions;
  const now = new Date();

  // הפגישה הבאה: המוקדמת מבין העתידיות שטרם בוטלו / לא דווח עליהן אי-הופעה.
  const nextSession =
    sessions
      .filter(
        (s) =>
          new Date(s.startTime) >= now &&
          s.status !== "CANCELLED" &&
          s.status !== "NO_SHOW"
      )
      .sort(
        (a, b) =>
          new Date(a.startTime).getTime() - new Date(b.startTime).getTime()
      )[0] ?? null;

  // נושאים חוזרים — ספירת ערכי topic (בלי AI: ספירה טהורה של שדה מסודר).
  // נירמול whitespace בלבד; לא ממזגים נושאים דומים (מיזוג היה דורש "הבנת טקסט").
  const topicMap = new Map<string, number>();
  for (const s of sessions) {
    const t = s.topic?.trim();
    if (!t) continue;
    topicMap.set(t, (topicMap.get(t) ?? 0) + 1);
  }
  const topicCounts = Array.from(topicMap.entries())
    .map(([topic, count]) => ({ topic, count }))
    .sort((a, b) => b.count - a.count || a.topic.localeCompare(b.topic, "he"));

  // סיכומים — פגישות עם sessionNote. ה-content מסונן server-side (defense-in-depth
  // מעל הסניטציה בכתיבה; סיכומים legacy מלפני H4 עלולים להכיל HTML לא-מסונן).
  // sessions כבר ממוין מהחדש לישן.
  const summaries = sessions
    .filter((s) => s.sessionNote?.content)
    .map((s) => ({
      id: s.id,
      startTime: s.startTime.toString(),
      endTime: s.endTime.toString(),
      type: s.type as string,
      contentHtml: sanitizeUserHtml(s.sessionNote!.content),
    }));

  return (
    <SessionPrepView
      clientId={client.id}
      clientName={client.name}
      nextSession={
        nextSession
          ? {
              id: nextSession.id,
              startTime: nextSession.startTime.toString(),
              endTime: nextSession.endTime.toString(),
              type: nextSession.type as string,
              topic: nextSession.topic?.trim() || null,
            }
          : null
      }
      topicCounts={topicCounts}
      summaries={summaries}
    />
  );
}
