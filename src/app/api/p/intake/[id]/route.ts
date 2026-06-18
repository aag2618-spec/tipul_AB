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
import { submitPublicIntakeSchema } from "@/lib/validations/intake-invite";

// עמוד ציבורי-אנונימי: הפונה טוען וממלא שאלון פנייה דרך קישור אישי עם טוקן.
// אבטחה: הגבלת קצב לפי IP, טוקן 32-hex עם השוואה בזמן-קבוע, תוקף, חד-פעמי.
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

// template.questions עשוי להיות [...] (חדש) או {questions:[...]} (פורמט ישן).
function getQuestions(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (
    raw &&
    typeof raw === "object" &&
    Array.isArray((raw as { questions?: unknown[] }).questions)
  ) {
    return (raw as { questions: unknown[] }).questions;
  }
  return [];
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ip = getClientIp(request);
    const rl = checkRateLimit(`intake-public:${ip}`, INTAKE_PUBLIC_RATE_LIMIT);
    if (!rl.allowed) return rateLimitResponse(rl);

    const { id } = await params;
    const token = request.nextUrl.searchParams.get("t");

    if (!token || !/^[0-9a-f]{32}$/.test(token)) {
      return UNIFORM_DENY;
    }

    const invite = await prisma.intakeInvite.findUnique({
      where: { id },
      select: {
        id: true,
        token: true,
        tokenExpiresAt: true,
        status: true,
        clientId: true,
        client: { select: { name: true } },
        template: { select: { name: true, description: true, questions: true } },
        user: { select: { name: true, businessName: true } },
      },
    });

    if (!invite) return UNIFORM_DENY;
    if (!verifyToken(invite.token, token)) return UNIFORM_DENY;
    if (invite.tokenExpiresAt && invite.tokenExpiresAt < new Date()) {
      return UNIFORM_DENY;
    }

    logDataAccess({
      userId: null,
      recordType: "INTAKE_RESPONSE",
      recordId: invite.id,
      action: "READ",
      clientId: invite.clientId,
      request,
      meta: { accessSource: "intake_public_link" },
    });

    const firstName = (invite.client?.name || "").trim().split(/\s+/)[0] || "";

    return NextResponse.json({
      templateName: invite.template?.name || "",
      description: invite.template?.description || "",
      questions: getQuestions(invite.template?.questions),
      clientFirstName: firstName,
      therapistName: invite.user?.businessName || invite.user?.name || "",
      alreadyCompleted: invite.status === "COMPLETED",
    });
  } catch (error) {
    logger.error("Public intake GET error:", {
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
    const rl = checkRateLimit(`intake-public:${ip}`, INTAKE_PUBLIC_RATE_LIMIT);
    if (!rl.allowed) return rateLimitResponse(rl);

    const { id } = await params;
    const token = request.nextUrl.searchParams.get("t");

    if (!token || !/^[0-9a-f]{32}$/.test(token)) {
      return UNIFORM_DENY;
    }

    const parsed = await parseBody(request, submitPublicIntakeSchema);
    if ("error" in parsed) return parsed.error;
    const { responses } = parsed.data;

    const invite = await prisma.intakeInvite.findUnique({
      where: { id },
      select: {
        id: true,
        token: true,
        tokenExpiresAt: true,
        status: true,
        clientId: true,
        templateId: true,
        organizationId: true,
      },
    });

    if (!invite) return UNIFORM_DENY;
    if (!verifyToken(invite.token, token)) return UNIFORM_DENY;
    if (invite.tokenExpiresAt && invite.tokenExpiresAt < new Date()) {
      return UNIFORM_DENY;
    }

    // תפיסה אטומית + יצירת התשובה בטרנזקציה אחת:
    //  - updateMany WHERE status=PENDING מונע מילוי כפול (race).
    //  - הטרנזקציה מבטיחה שאם יצירת התשובה נכשלת, ה-claim מתבטל (rollback)
    //    והפונה יכול/ה לנסות שוב — אין "קישור שרוף בלי תשובה".
    let response: { id: string };
    try {
      response = await prisma.$transaction(async (tx) => {
        const claimed = await tx.intakeInvite.updateMany({
          where: { id: invite.id, status: "PENDING" },
          data: {
            status: "COMPLETED",
            completedAt: new Date(),
            token: null,
            tokenExpiresAt: null,
          },
        });
        if (claimed.count === 0) {
          throw new AlreadyCompletedError();
        }
        const created = await tx.intakeResponse.create({
          data: {
            clientId: invite.clientId,
            templateId: invite.templateId,
            responses: responses as Prisma.InputJsonValue,
            organizationId: invite.organizationId,
          },
          select: { id: true },
        });
        await tx.intakeInvite.update({
          where: { id: invite.id },
          data: { responseId: created.id },
        });
        return created;
      });
    } catch (e) {
      if (e instanceof AlreadyCompletedError) {
        return NextResponse.json({ message: "השאלון כבר מולא" }, { status: 400 });
      }
      throw e;
    }

    logDataAccess({
      userId: null,
      recordType: "INTAKE_RESPONSE",
      recordId: response.id,
      action: "UPDATE",
      clientId: invite.clientId,
      request,
      meta: { accessSource: "intake_public_link" },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Public intake POST error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה בשמירת התשובות" },
      { status: 500 }
    );
  }
}
