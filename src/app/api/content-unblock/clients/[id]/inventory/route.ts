import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/api-auth";
import { buildClientWhere, buildSessionWhere, isSecretary, loadScopeUser } from "@/lib/scope";
import { requireContentFilterEnabled } from "@/lib/content-unblock";

export const dynamic = "force-dynamic";

// מצאי תוכן קליני של מטופל מסוים — מטה-דאטה + דגלי "יש תוכן" בלבד.
// עיקרון קריטי: אף עמודה קלינית/מוצפנת (content/notes/aiAnalysis/insights/
// summary/answers) לא נבחרת. דגלים מחושבים דרך קיום relation (select id) /
// count. כך הדף הזה לעולם לא מציג תוכן ולכן לעולם לא ייחסם ע"י סינון.
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
      select: { id: true, name: true, comprehensiveAnalysisAt: true },
    });
    if (!client) {
      return NextResponse.json({ message: "מטופל לא נמצא" }, { status: 404 });
    }

    // ניתוחי הקלטה — scope דרך ה-recording (client או session של המשתמש).
    const recScopeWhere = {
      transcription: {
        recording: {
          OR: [
            { clientId: id, client: clientWhere },
            { session: { clientId: id, AND: [sessionWhere] } },
          ],
        },
      },
    };

    // כל השאילתות במקביל (אחרי אימות בעלות). אף אחת לא בוחרת תוכן קליני.
    const [sessionsRaw, qAnalyses, qRespAi, recAnalyses, aiInsightsCount, profileCount, sessionPreps] =
      await Promise.all([
        prisma.therapySession.findMany({
          where: { AND: [{ clientId: id }, sessionWhere] },
          select: {
            id: true,
            startTime: true,
            type: true,
            status: true,
            skipSummary: true,
            sessionNote: { select: { id: true } },
            sessionAnalysis: { select: { id: true } },
          },
          orderBy: { startTime: "desc" },
        }),
        prisma.questionnaireAnalysis.findMany({
          where: { clientId: id, client: clientWhere },
          select: {
            id: true,
            analysisType: true,
            createdAt: true,
            response: { select: { template: { select: { name: true } } } },
          },
          orderBy: { createdAt: "desc" },
        }),
        prisma.questionnaireResponse.findMany({
          where: { clientId: id, client: clientWhere, aiAnalysis: { not: null } },
          select: {
            id: true,
            createdAt: true,
            completedAt: true,
            template: { select: { name: true } },
          },
          orderBy: { createdAt: "desc" },
        }),
        prisma.analysis.findMany({
          where: recScopeWhere,
          select: { id: true, createdAt: true },
          orderBy: { createdAt: "desc" },
        }),
        prisma.aIInsight.count({ where: { clientId: id, client: clientWhere } }),
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
        // הכנות פגישה AI (SessionPrep). אין relation ל-client במודל; scope דרך
        // clientId שכבר אומת ב-scope למעלה. נבחר רק מטה-דאטה (לא content/insights).
        prisma.sessionPrep.findMany({
          where: { clientId: id },
          select: { id: true, sessionDate: true, createdAt: true },
          orderBy: { sessionDate: "desc" },
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
        hasAnalysis: s.sessionAnalysis != null,
      }))
      .filter((s) => s.hasNote || s.hasAnalysis);

    return NextResponse.json({
      client: { id: client.id, name: client.name },
      sessions,
      comprehensive: {
        has: client.comprehensiveAnalysisAt != null,
        at: client.comprehensiveAnalysisAt,
      },
      questionnaireAnalyses: qAnalyses.map((q) => ({
        id: q.id,
        analysisType: q.analysisType,
        createdAt: q.createdAt,
        templateName: q.response?.template?.name ?? null,
      })),
      questionnaireResponseAi: qRespAi.map((q) => ({
        id: q.id,
        createdAt: q.createdAt,
        completedAt: q.completedAt,
        templateName: q.template?.name ?? null,
      })),
      recordingAnalyses: recAnalyses.map((a) => ({ id: a.id, createdAt: a.createdAt })),
      sessionPreps: sessionPreps.map((p) => ({
        id: p.id,
        sessionDate: p.sessionDate,
        createdAt: p.createdAt,
      })),
      aiInsights: { count: aiInsightsCount },
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
