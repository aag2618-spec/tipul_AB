import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/api-auth";
import {
  loadScopeUser,
  buildClientWhere,
  isSecretary,
  secretaryCan,
} from "@/lib/scope";
import { parseBody } from "@/lib/validations/helpers";
import { createIntakeInviteSchema } from "@/lib/validations/intake-invite";
import { sendSMS } from "@/lib/sms";
import { sendEmail } from "@/lib/resend";
import { escapeHtml } from "@/lib/email-utils";
import { isShabbatOrYomTov } from "@/lib/shabbat";
import {
  checkRateLimit,
  INTAKE_SEND_LINK_RATE_LIMIT,
  rateLimitResponse,
} from "@/lib/rate-limit";

// POST /api/intake-invites — המטפל יוצר קישור אישי לשאלון פנייה עבור מטופל/פונה.
// channel="link" → רק יוצר ומחזיר URL להעתקה; sms/email/both → שולח גם.
export const dynamic = "force-dynamic";

const TOKEN_EXPIRY_DAYS = 14;

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const rl = checkRateLimit(
      `intake-send-link:${userId}`,
      INTAKE_SEND_LINK_RATE_LIMIT
    );
    if (!rl.allowed) return rateLimitResponse(rl);

    const scopeUser = await loadScopeUser(userId);
    // שליחת קישור תשאול = פעולה מנהלתית (כמו שליחת קישור זימון): מזכירה מורשית
    // אם יש לה canSendReminders. *צפייה בתשובות* נשארת חסומה ב-endpoint נפרד.
    if (isSecretary(scopeUser) && !secretaryCan(scopeUser, "canSendReminders")) {
      return NextResponse.json(
        { message: "אין הרשאה לשליחת קישורי תשאול" },
        { status: 403 }
      );
    }

    const parsed = await parseBody(request, createIntakeInviteSchema);
    if ("error" in parsed) return parsed.error;
    const { clientId, templateId, channel } = parsed.data;

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

    // תבנית של המטפל עצמו, או של מטפל אחר באותו ארגון (קליניקה).
    const template = scopeUser.organizationId
      ? await prisma.intakeQuestionnaire.findFirst({
          where: {
            id: templateId,
            isActive: true,
            user: { organizationId: scopeUser.organizationId },
          },
          select: { id: true, name: true },
        })
      : await prisma.intakeQuestionnaire.findFirst({
          where: { id: templateId, userId, isActive: true },
          select: { id: true, name: true },
        });
    if (!template) {
      return NextResponse.json({ message: "שאלון לא נמצא" }, { status: 404 });
    }

    const willSend =
      channel === "sms" || channel === "email" || channel === "both";
    if (willSend && isShabbatOrYomTov()) {
      return NextResponse.json(
        {
          message:
            "לא ניתן לשלוח הודעות בשבת ובחגים. אפשר ליצור קישור ולהעתיק.",
        },
        { status: 403 }
      );
    }

    const token = crypto.randomBytes(16).toString("hex");
    const tokenExpiresAt = new Date(
      Date.now() + TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000
    );

    // בעל הקישור = המטפל האחראי של המטופל (כמו BookingLink). מזכירה רק משדרת.
    const inviteOwnerId = isSecretary(scopeUser) ? client.therapistId : userId;

    const invite = await prisma.intakeInvite.create({
      data: {
        userId: inviteOwnerId,
        clientId: client.id,
        templateId: template.id,
        token,
        tokenExpiresAt,
        status: "PENDING",
        // organizationId נגזר מהמטופל (לא מהמשתמש) — תיוג הדייר מוכח-נכון.
        organizationId: client.organizationId ?? null,
      },
      select: { id: true },
    });

    const appUrl = process.env.NEXTAUTH_URL || "";
    const publicUrl = `${appUrl}/p/intake/${invite.id}#t=${token}`;

    const firstName = (client.name || "").trim().split(/\s+/)[0] || "";
    const results: { sms?: boolean; email?: boolean } = {};

    if (channel === "sms" || channel === "both") {
      if (client.phone) {
        const message = `שלום ${firstName}, לפני הפגישה נשמח שתמלא/י שאלון קצר: ${publicUrl}`;
        const smsResult = await sendSMS(client.phone, message, inviteOwnerId, {
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
          subject: "שאלון לפני הפגישה",
          html: buildIntakeEmailHtml(firstName, template.name, publicUrl),
        });
        results.email = emailResult.success;
      }
    }

    // sentAt מסומן רק אם שליחה בפועל הצליחה (לא רק "ניסינו").
    if (results.sms || results.email) {
      await prisma.intakeInvite.update({
        where: { id: invite.id },
        data: { sentAt: new Date() },
      });
    }

    logger.info("Intake invite created", {
      inviteId: invite.id,
      channel,
      clientId: client.id,
      sms: results.sms,
      email: results.email,
    });

    return NextResponse.json({ success: true, url: publicUrl, results });
  } catch (error) {
    logger.error("Create intake invite error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה ביצירת הקישור" },
      { status: 500 }
    );
  }
}

function buildIntakeEmailHtml(
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
      <p>כדי שנגיע מוכנים לפגישה, נשמח שתמלא/י שאלון קצר:</p>
      <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
        <p style="margin: 0 0 16px 0; font-weight: bold; font-size: 16px;">${t}</p>
        <a href="${u}" style="display: inline-block; background: #0f766e; color: #ffffff; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: bold;">
          מילוי השאלון
        </a>
      </div>
      <p style="color: #666; font-size: 13px;">הקישור תקף ל-14 ימים.</p>
      <p style="color: #666; font-size: 14px; margin-top: 30px;">בברכה,<br/>MyTipul</p>
    </div>
  `;
}
