import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/api-auth";
import { buildClientWhere, buildSessionWhere, isSecretary, loadScopeUser } from "@/lib/scope";
import { loadScopeUserWithMode } from "@/lib/secretary-mode";
import { logDataAccess, type AuditRecordType } from "@/lib/audit-logger";
import { requireContentFilterEnabled } from "@/lib/content-unblock";
import { parseBody } from "@/lib/validations/helpers";

export const dynamic = "force-dynamic";

// כלי "שחרור תיק חסום": מחיקה לצמיתות של פריט תוכן קליני בודד של מטופל.
// כל הסוגים שייכים למטופל — מאמתים בעלות (buildClientWhere/buildSessionWhere),
// חוסמים מזכירות, מאמתים שמצב סינון התוכן פעיל, ורושמים אירוע ביקורת (בלי תוכן).
const deleteSchema = z.object({
  type: z.enum([
    "session", // SessionNote (סיכום הפגישה)
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

    const scopeUser = await loadScopeUserWithMode(userId);
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
        // מחיקת סיכום הפגישה. deleteMany כדי לא לזרוק אם הסיכום חסר.
        await prisma.sessionNote.deleteMany({ where: { sessionId: s.id } });
        audit("SESSION_NOTE", s.id, { deleted: ["sessionNote"] });
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
