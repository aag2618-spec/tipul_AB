import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/api-auth";
import { buildClientWhere, isSecretary, secretaryCan } from "@/lib/scope";
import { loadScopeUserWithMode } from "@/lib/secretary-mode";
import { parseBody } from "@/lib/validations/helpers";
import { createQuestionnaireInviteSchema } from "@/lib/validations/questionnaire-invite";
import { sendSMS } from "@/lib/sms";
import { sendEmail } from "@/lib/resend";
import { escapeHtml } from "@/lib/email-utils";
import { isShabbatOrYomTov } from "@/lib/shabbat";
import {
  checkRateLimit,
  INTAKE_SEND_LINK_RATE_LIMIT,
  rateLimitResponse,
} from "@/lib/rate-limit";

// POST /api/questionnaire-invites — המטפל יוצר קישור מילוי אישי לשאלון קליני
// מתוקנן (BDI2, GAD-7, AQ וכו') עבור מטופל/הורה. channel="link" → רק יוצר
// ומחזיר URL להעתקה; sms/email/both → שולח גם.
//
// השרת *אוכף* שניתן לשלוח רק שאלוני testType=SELF_REPORT — אין משמעות קלינית
// לשלוח מבחן הערכה-קלינית/אינטליגנציה/השלכתי למילוי-עצמי.
export const dynamic = "force-dynamic";

const TOKEN_EXPIRY_DAYS = 14;

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const rl = checkRateLimit(
      `quest-send-link:${userId}`,
      INTAKE_SEND_LINK_RATE_LIMIT
    );
    if (!rl.allowed) return rateLimitResponse(rl);

    const scopeUser = await loadScopeUserWithMode(userId);
    // שליחת קישור שאלון = פעולה מנהלתית (כמו שליחת קישור זימון/תשאול): מזכירה
    // מורשית אם יש לה canSendReminders. *צפייה בתשובות/בניקוד* נשארת חסומה
    // למזכירה ב-endpoint הקליני (canSecretaryAccessModel).
    if (isSecretary(scopeUser) && !secretaryCan(scopeUser, "canSendReminders")) {
      return NextResponse.json(
        { message: "אין הרשאה לשליחת קישורי שאלון" },
        { status: 403 }
      );
    }

    const parsed = await parseBody(request, createQuestionnaireInviteSchema);
    if ("error" in parsed) return parsed.error;
    const { clientId, code, channel } = parsed.data;

    // מטופל בתחום ההרשאה (solo: שלי; clinic: לפי scope)
    const clientWhere = buildClientWhere(scopeUser);
    const client = await prisma.client.findFirst({
      where: { AND: [{ id: clientId }, clientWhere] },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        organizationId: true,
        therapistId: true,
      },
    });
    if (!client) {
      return NextResponse.json({ message: "מטופל לא נמצא" }, { status: 404 });
    }

    // תבנית גלובלית (משותפת לכל המערכת). אכיפת מילוי-עצמי בלבד.
    const template = await prisma.questionnaireTemplate.findFirst({
      where: { code, isActive: true },
      select: { id: true, name: true, testType: true },
    });
    if (!template) {
      return NextResponse.json({ message: "שאלון לא נמצא" }, { status: 404 });
    }
    if (template.testType !== "SELF_REPORT") {
      return NextResponse.json(
        {
          message:
            "ניתן לשלוח למילוי-עצמי רק שאלוני דיווח-עצמי. שאלון זה ממולא ע\"י המטפל.",
        },
        { status: 400 }
      );
    }

    const willSend =
      channel === "sms" || channel === "email" || channel === "both";
    if (willSend && isShabbatOrYomTov()) {
      return NextResponse.json(
        {
          message: "לא ניתן לשלוח הודעות בשבת ובחגים. אפשר ליצור קישור ולהעתיק.",
        },
        { status: 403 }
      );
    }

    const token = crypto.randomBytes(16).toString("hex");
    const tokenExpiresAt = new Date(
      Date.now() + TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000
    );

    // בעל התשובה = המטפל האחראי של המטופל (כמו BookingLink/IntakeInvite).
    // מזכירה רק משדרת — התשובה שייכת למטפל, לא למזכירה.
    const ownerId = isSecretary(scopeUser) ? client.therapistId : userId;

    const response = await prisma.questionnaireResponse.create({
      data: {
        templateId: template.id,
        clientId: client.id,
        therapistId: ownerId,
        // organizationId נגזר מהמטופל (לא מהמשתמש) — תיוג הדייר מוכח-נכון.
        organizationId: client.organizationId ?? null,
        answers: [] as Prisma.InputJsonValue,
        status: "IN_PROGRESS",
        token,
        tokenExpiresAt,
      },
      select: { id: true },
    });

    const appUrl = process.env.NEXTAUTH_URL || "";
    const publicUrl = `${appUrl}/p/questionnaire/${response.id}#t=${token}`;

    const firstName = (client.name || "").trim().split(/\s+/)[0] || "";
    const results: { sms?: boolean; email?: boolean } = {};

    if (channel === "sms" || channel === "both") {
      if (client.phone) {
        const message = `שלום ${firstName}, נשמח שתמלא/י שאלון קצר עבור המטפל/ת: ${publicUrl}`;
        const smsResult = await sendSMS(client.phone, message, ownerId, {
          clientId: client.id,
          type: "INTAKE_FORM_LINK",
        });
        results.sms = smsResult.success;
      }
    }

    if (channel === "email" || channel === "both") {
      if (client.email) {
        const emailResult = await sendEmail({
          to: client.email,
          subject: "שאלון למילוי",
          html: buildQuestionnaireEmailHtml(firstName, template.name, publicUrl),
        });
        results.email = emailResult.success;
      }
    }

    // sentAt מסומן רק אם שליחה בפועל הצליחה (לא רק "ניסינו").
    if (results.sms || results.email) {
      await prisma.questionnaireResponse.update({
        where: { id: response.id },
        data: { sentAt: new Date() },
      });
    }

    logger.info("Questionnaire invite created", {
      responseId: response.id,
      code,
      channel,
      clientId: client.id,
      sms: results.sms,
      email: results.email,
    });

    return NextResponse.json({ success: true, url: publicUrl, results });
  } catch (error) {
    logger.error("Create questionnaire invite error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה ביצירת הקישור" },
      { status: 500 }
    );
  }
}

function buildQuestionnaireEmailHtml(
  firstName: string,
  title: string,
  url: string
): string {
  const name = escapeHtml(firstName);
  const t = escapeHtml(title);
  const u = escapeHtml(url);
  return `
    <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; line-height: 1.6;">
      <h2 style="color: #333;">שלום ${name},</h2>
      <p>המטפל/ת מבקש/ת שתמלא/י שאלון קצר. זה לוקח כמה דקות ועוזר להיערך טוב יותר:</p>
      <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
        <p style="margin: 0 0 16px 0; font-weight: bold; font-size: 16px;">${t}</p>
        <a href="${u}" style="display: inline-block; background: #0f766e; color: #ffffff; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: bold;">
          מילוי השאלון
        </a>
      </div>
      <p style="color: #666; font-size: 13px;">הקישור אישי ומאובטח, תקף ל-14 ימים וניתן למילוי פעם אחת.</p>
      <p style="color: #666; font-size: 14px; margin-top: 30px;">בברכה,<br/>MyTipul</p>
    </div>
  `;
}
