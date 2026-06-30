import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { logDataAccess } from "@/lib/audit-logger";
import {
  checkRateLimit,
  INTAKE_PUBLIC_RATE_LIMIT,
  rateLimitResponse,
} from "@/lib/rate-limit";
import { getClientIp } from "@/lib/get-client-ip";
import { parseBody } from "@/lib/validations/helpers";
import { submitPublicQuestionnaireSchema } from "@/lib/validations/questionnaire-invite";
import {
  getTemplateQuestions,
  scoreFromSelections,
} from "@/lib/questionnaire-scoring";

// עמוד ציבורי-אנונימי: המטופל/ההורה טוען וממלא שאלון קליני (דיווח-עצמי) דרך
// קישור אישי עם טוקן. אבטחה: הגבלת קצב לפי IP, טוקן 32-hex עם השוואה בזמן-קבוע,
// תוקף, חד-פעמי. *הניקוד מחושב בשרת מתוך התבנית* — לא סומכים על הדפדפן.
export const dynamic = "force-dynamic";

const UNIFORM_DENY = NextResponse.json({ message: "אין הרשאה" }, { status: 403 });

// סנטינל לזיהוי "כבר מולא" בתוך הטרנזקציה (כדי להחזיר 400 ולא 500).
class AlreadyCompletedError extends Error {}

function verifyToken(dbToken: string | null, providedToken: string): boolean {
  if (!dbToken) return false;
  try {
    return crypto.timingSafeEqual(
      Buffer.from(dbToken, "utf8"),
      Buffer.from(providedToken, "utf8")
    );
  } catch {
    return false;
  }
}

// מחזירים לדפדפן רק value+text לכל אפשרות — לא חושפים את משקלי ה-score
// (השרת מחשב את הניקוד מהתבנית). מצמצמים גם את שדות השאלה לנדרש לתצוגה.
function toPublicQuestions(raw: unknown): unknown[] {
  return getTemplateQuestions(raw).map((q, i) => {
    const anyQ = q as Record<string, unknown>;
    return {
      index: i,
      title: anyQ.title ?? "",
      description: anyQ.description ?? "",
      section: anyQ.section ?? null,
      sectionName: anyQ.sectionName ?? null,
      instruction: anyQ.instruction ?? null,
      options: Array.isArray(q.options)
        ? q.options.map((o) => ({ value: o.value, text: o.text ?? "" }))
        : [],
    };
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ip = getClientIp(request);
    const rl = checkRateLimit(`quest-public:${ip}`, INTAKE_PUBLIC_RATE_LIMIT);
    if (!rl.allowed) return rateLimitResponse(rl);

    const { id } = await params;
    // הטוקן ב-header (x-quest-token) ולא ב-query — לא דולף ליומני-שרת/Referer.
    const token = request.headers.get("x-quest-token");

    if (!token || !/^[0-9a-f]{32}$/.test(token)) {
      return UNIFORM_DENY;
    }

    const response = await prisma.questionnaireResponse.findUnique({
      where: { id },
      select: {
        id: true,
        token: true,
        tokenExpiresAt: true,
        status: true,
        clientId: true,
        client: { select: { name: true } },
        template: {
          select: { name: true, description: true, questions: true },
        },
        therapist: { select: { name: true, businessName: true } },
      },
    });

    if (!response) return UNIFORM_DENY;
    if (!verifyToken(response.token, token)) return UNIFORM_DENY;
    if (response.tokenExpiresAt && response.tokenExpiresAt < new Date()) {
      return UNIFORM_DENY;
    }

    logDataAccess({
      userId: null,
      recordType: "QUESTIONNAIRE_RESPONSE",
      recordId: response.id,
      action: "READ",
      clientId: response.clientId,
      request,
      meta: { accessSource: "questionnaire_public_link" },
    });

    const firstName =
      (response.client?.name || "").trim().split(/\s+/)[0] || "";

    return NextResponse.json({
      templateName: response.template?.name || "",
      description: response.template?.description || "",
      questions: toPublicQuestions(response.template?.questions),
      clientFirstName: firstName,
      therapistName:
        response.therapist?.businessName || response.therapist?.name || "",
      // מולא כבר (ע"י המטופל דרך הקישור, או נותח/הושלם בתוך המערכת).
      alreadyCompleted: response.status !== "IN_PROGRESS",
    });
  } catch (error) {
    logger.error("Public questionnaire GET error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ message: "שגיאה" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ip = getClientIp(request);
    const rl = checkRateLimit(`quest-public:${ip}`, INTAKE_PUBLIC_RATE_LIMIT);
    if (!rl.allowed) return rateLimitResponse(rl);

    const { id } = await params;
    const token = request.headers.get("x-quest-token");

    if (!token || !/^[0-9a-f]{32}$/.test(token)) {
      return UNIFORM_DENY;
    }

    const parsed = await parseBody(request, submitPublicQuestionnaireSchema);
    if ("error" in parsed) return parsed.error;
    const { answers: selections } = parsed.data;

    const response = await prisma.questionnaireResponse.findUnique({
      where: { id },
      select: {
        id: true,
        token: true,
        tokenExpiresAt: true,
        status: true,
        clientId: true,
        therapistId: true,
        client: { select: { name: true } },
        template: { select: { name: true, questions: true } },
      },
    });

    if (!response) return UNIFORM_DENY;
    if (!verifyToken(response.token, token)) return UNIFORM_DENY;
    if (response.tokenExpiresAt && response.tokenExpiresAt < new Date()) {
      return UNIFORM_DENY;
    }

    // חישוב הניקוד בשרת מתוך התבנית — מקור אמת יחיד. בונה מערך answers
    // מיושר-אינדקס כדי שדף הפירוט/ההדפסה/מנוע הפרשנות יעבדו בלי שינוי.
    const questions = getTemplateQuestions(response.template?.questions);
    const { answers, totalScore, subscores } = scoreFromSelections(
      questions,
      selections
    );

    // תפיסה אטומית: updateMany WHERE status=IN_PROGRESS מונע מילוי כפול (race).
    try {
      const claimed = await prisma.questionnaireResponse.updateMany({
        where: { id: response.id, status: "IN_PROGRESS" },
        data: {
          answers: answers as Prisma.InputJsonValue,
          totalScore,
          subscores: subscores as Prisma.InputJsonValue,
          status: "COMPLETED",
          completedAt: new Date(),
          filledViaLink: true,
          token: null,
          tokenExpiresAt: null,
        },
      });
      if (claimed.count === 0) {
        throw new AlreadyCompletedError();
      }
    } catch (e) {
      if (e instanceof AlreadyCompletedError) {
        return NextResponse.json({ message: "השאלון כבר מולא" }, { status: 400 });
      }
      throw e;
    }

    // התראה למטפל האחראי (best-effort) — מופיעה בפעמון. הנמען הוא בעל התשובה
    // ובעל גישה קלינית למטופל, לכן מותר לכלול שם פרטי + שם השאלון.
    const firstName =
      (response.client?.name || "").trim().split(/\s+/)[0] || "מטופל";
    await prisma.notification
      .create({
        data: {
          userId: response.therapistId,
          type: "CUSTOM",
          title: "שאלון מולא",
          content: `${firstName} מילא/ה את השאלון "${response.template?.name || ""}". התוצאה מוכנה לצפייה.`,
          status: "SENT",
          sentAt: new Date(),
        },
      })
      .catch((err) =>
        logger.error("Failed to create questionnaire-filled notification:", {
          error: err instanceof Error ? err.message : String(err),
        })
      );

    logDataAccess({
      userId: null,
      recordType: "QUESTIONNAIRE_RESPONSE",
      recordId: response.id,
      action: "UPDATE",
      clientId: response.clientId,
      request,
      meta: { accessSource: "questionnaire_public_link" },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Public questionnaire POST error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה בשמירת התשובות" },
      { status: 500 }
    );
  }
}
