import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/api-auth";
import { buildClientWhere, buildSessionWhere, isSecretary, loadScopeUser } from "@/lib/scope";
import { logDataAccess, type AuditRecordType } from "@/lib/audit-logger";
import { requireContentFilterEnabled } from "@/lib/content-unblock";
import { parseBody } from "@/lib/validations/helpers";

export const dynamic = "force-dynamic";

// כלי "שחרור תיק חסום": מחיקה לצמיתות של פריט תוכן קליני בודד של מטופל.
// כל הסוגים שייכים למטופל — מאמתים בעלות (buildClientWhere/buildSessionWhere),
// חוסמים מזכירות, מאמתים שמצב סינון התוכן פעיל, ורושמים אירוע ביקורת (בלי תוכן).
const deleteSchema = z.object({
  type: z.enum([
    "session", // SessionNote + SessionAnalysis יחד
    "comprehensive", // Client.comprehensiveAnalysis (איפוס שדה)
    "questionnaireAnalysis", // שורת QuestionnaireAnalysis
    "questionnaireResponseAi", // QuestionnaireResponse.aiAnalysis (איפוס שדה)
    "recordingAnalysis", // Analysis (ניתוח הקלטה)
    "aiInsights", // כל ה-AIInsight של המטופל
    "sessionPrep", // הכנת פגישה AI (SessionPrep)
    "clinicalProfile", // Client notes/initialDiagnosis/intakeNotes/approachNotes/culturalContext (איפוס)
  ]),
  clientId: z.string().min(1),
  itemId: z.string().min(1).optional(),
});

export async function POST(request: NextRequest) {
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

    const parsed = await parseBody(request, deleteSchema);
    if ("error" in parsed) return parsed.error;
    const { type, clientId, itemId } = parsed.data;

    const clientWhere = buildClientWhere(scopeUser);
    const sessionWhere = buildSessionWhere(scopeUser);

    // בעלות: כל סוג פריט שייך למטופל — המטופל חייב להיות ב-scope.
    const client = await prisma.client.findFirst({
      where: { AND: [{ id: clientId }, clientWhere] },
      select: { id: true },
    });
    if (!client) {
      return NextResponse.json({ message: "מטופל לא נמצא" }, { status: 404 });
    }

    const audit = (
      recordType: AuditRecordType,
      recordId: string,
      meta: Record<string, unknown>
    ) =>
      logDataAccess({
        userId,
        recordType,
        recordId,
        action: "DELETE",
        clientId,
        request,
        meta: { tool: "content-unblock", ...meta },
      });

    switch (type) {
      case "session": {
        if (!itemId) {
          return NextResponse.json({ message: "חסר מזהה פגישה" }, { status: 400 });
        }
        // הפגישה חייבת להיות של המטופל הזה וב-scope של המשתמש.
        const s = await prisma.therapySession.findFirst({
          where: { AND: [{ id: itemId }, { clientId }, sessionWhere] },
          select: { id: true },
        });
        if (!s) {
          return NextResponse.json({ message: "פגישה לא נמצאה" }, { status: 404 });
        }
        // סיכום ידני + ניתוח ה-AI שלו יחד, בטרנזקציה. deleteMany כדי לא לזרוק
        // אם אחד מהם חסר. מוחקים לפי ה-id שאומת (s.id).
        await prisma.$transaction([
          prisma.sessionAnalysis.deleteMany({ where: { sessionId: s.id } }),
          prisma.sessionNote.deleteMany({ where: { sessionId: s.id } }),
        ]);
        audit("SESSION_NOTE", s.id, { deleted: ["sessionNote", "sessionAnalysis"] });
        break;
      }

      case "comprehensive": {
        const r = await prisma.client.updateMany({
          where: { AND: [{ id: clientId }, clientWhere] },
          data: { comprehensiveAnalysis: null, comprehensiveAnalysisAt: null },
        });
        if (r.count === 0) {
          return NextResponse.json({ message: "אין ניתוח מקיף למחיקה" }, { status: 404 });
        }
        audit("CLIENT_PROFILE", clientId, { field: "comprehensiveAnalysis" });
        break;
      }

      case "questionnaireAnalysis": {
        if (!itemId) {
          return NextResponse.json({ message: "חסר מזהה" }, { status: 400 });
        }
        // deleteMany מוקשח-scope — אטומי, ולא זורק במצב מרוץ (sessions מקבילים).
        const r = await prisma.questionnaireAnalysis.deleteMany({
          where: { AND: [{ id: itemId }, { clientId }, { client: clientWhere }] },
        });
        if (r.count === 0) {
          return NextResponse.json({ message: "ניתוח שאלון לא נמצא" }, { status: 404 });
        }
        audit("ANALYSIS", itemId, { kind: "questionnaireAnalysis" });
        break;
      }

      case "questionnaireResponseAi": {
        if (!itemId) {
          return NextResponse.json({ message: "חסר מזהה" }, { status: 400 });
        }
        const r = await prisma.questionnaireResponse.updateMany({
          where: { AND: [{ id: itemId }, { clientId }, { client: clientWhere }] },
          data: { aiAnalysis: null },
        });
        if (r.count === 0) {
          return NextResponse.json({ message: "ניתוח לא נמצא" }, { status: 404 });
        }
        audit("ANALYSIS", itemId, { kind: "questionnaireResponseAi" });
        break;
      }

      case "recordingAnalysis": {
        if (!itemId) {
          return NextResponse.json({ message: "חסר מזהה" }, { status: 400 });
        }
        // מוחק רק את ה-Analysis (לא את ההקלטה/תמלול — FK הם onDelete: Cascade).
        // scoped deleteMany — אטומי ולא זורק במצב מרוץ (sessions מקבילים).
        const r = await prisma.analysis.deleteMany({
          where: {
            id: itemId,
            transcription: {
              recording: {
                OR: [
                  { clientId, client: clientWhere },
                  { session: { clientId, AND: [sessionWhere] } },
                ],
              },
            },
          },
        });
        if (r.count === 0) {
          return NextResponse.json({ message: "ניתוח הקלטה לא נמצא" }, { status: 404 });
        }
        audit("ANALYSIS", itemId, { kind: "recordingAnalysis" });
        break;
      }

      case "aiInsights": {
        // כל תובנות ה-AI השמורות של המטופל (cache קליני; ניתן להפקה מחדש).
        const r = await prisma.aIInsight.deleteMany({
          where: { clientId, client: clientWhere },
        });
        if (r.count === 0) {
          return NextResponse.json({ message: "אין תובנות AI למחיקה" }, { status: 404 });
        }
        audit("ANALYSIS", clientId, { kind: "aiInsights", count: r.count });
        break;
      }

      case "sessionPrep": {
        if (!itemId) {
          return NextResponse.json({ message: "חסר מזהה" }, { status: 400 });
        }
        // clientId אומת ב-scope למעלה; ה-prep חייב להשתייך לאותו מטופל (IDOR-safe).
        const r = await prisma.sessionPrep.deleteMany({
          where: { id: itemId, clientId },
        });
        if (r.count === 0) {
          return NextResponse.json({ message: "הכנת פגישה לא נמצאה" }, { status: 404 });
        }
        audit("ANALYSIS", itemId, { kind: "sessionPrep" });
        break;
      }

      case "clinicalProfile": {
        // מאפס שדות טקסט חופשי בפרופיל (לא נוגע ב-medicalHistory ה-JSON).
        const r = await prisma.client.updateMany({
          where: { AND: [{ id: clientId }, clientWhere] },
          data: {
            notes: null,
            initialDiagnosis: null,
            intakeNotes: null,
            approachNotes: null,
            culturalContext: null,
          },
        });
        if (r.count === 0) {
          return NextResponse.json({ message: "אין נתונים למחיקה" }, { status: 404 });
        }
        audit("CLIENT_NOTES", clientId, {
          fields: [
            "notes",
            "initialDiagnosis",
            "intakeNotes",
            "approachNotes",
            "culturalContext",
          ],
        });
        break;
      }
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error("content-unblock delete error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ message: "אירעה שגיאה במחיקה" }, { status: 500 });
  }
}
