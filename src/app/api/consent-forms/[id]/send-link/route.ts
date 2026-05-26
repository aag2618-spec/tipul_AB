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
  type ScopeUser,
} from "@/lib/scope";
import { parseBody } from "@/lib/validations/helpers";
import { sendConsentLinkSchema } from "@/lib/validations/consent-form";
import { sendSMS } from "@/lib/sms";
import { sendEmail } from "@/lib/resend";
import { isShabbatOrYomTov } from "@/lib/shabbat";
import { checkRateLimit, CONSENT_SEND_LINK_RATE_LIMIT, rateLimitResponse } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const TOKEN_EXPIRY_DAYS = 7;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const rl = checkRateLimit(`consent-send-link:${userId}`, CONSENT_SEND_LINK_RATE_LIMIT);
    if (!rl.allowed) return rateLimitResponse(rl);

    const parsed = await parseBody(request, sendConsentLinkSchema);
    if ("error" in parsed) return parsed.error;
    const { channel } = parsed.data;

    const { id } = await params;

    const scopeUser = await loadScopeUser(userId);
    if (isSecretary(scopeUser) && !secretaryCan(scopeUser, "canViewConsentForms")) {
      return NextResponse.json(
        { message: "אין הרשאה לשליחת טפסי הסכמה" },
        { status: 403 }
      );
    }

    const form = await findScopedForm(id, scopeUser);
    if (!form) {
      return NextResponse.json({ message: "לא נמצא" }, { status: 404 });
    }

    if (form.signedAt) {
      return NextResponse.json({ message: "הטופס כבר נחתם" }, { status: 400 });
    }

    if (!form.clientId || !form.client) {
      return NextResponse.json(
        { message: "לא ניתן לשלוח לינק לטופס ללא מטופל/ת" },
        { status: 400 }
      );
    }

    if (isShabbatOrYomTov()) {
      return NextResponse.json(
        { message: "לא ניתן לשלוח הודעות בשבת ובחגים" },
        { status: 403 }
      );
    }

    const signToken = crypto.randomBytes(16).toString("hex");
    const signTokenExpiresAt = new Date(Date.now() + TOKEN_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    await prisma.consentForm.update({
      where: { id },
      data: { signToken, signTokenExpiresAt },
    });

    const appUrl = process.env.NEXTAUTH_URL || "";
    const publicUrl = `${appUrl}/consent/${id}#t=${signToken}`;

    const clientName = form.client.name;
    const results: { sms?: boolean; email?: boolean } = {};

    if (channel === "sms" || channel === "both") {
      const phone = form.client.phone;
      if (phone) {
        const message = `שלום ${clientName}, נשלח אליך טופס הסכמה לחתימה: ${publicUrl}`;
        const smsResult = await sendSMS(phone, message, userId, {
          clientId: form.clientId!,
          type: "CONSENT_FORM_LINK",
        });
        results.sms = smsResult.success;
      }
    }

    if (channel === "email" || channel === "both") {
      const email = form.client.email;
      if (email) {
        const emailResult = await sendEmail({
          to: email,
          subject: "טופס הסכמה לחתימה",
          html: buildConsentEmailHtml(clientName, form.title, publicUrl),
        });
        results.email = emailResult.success;
      }
    }

    logger.info("Consent form link sent", {
      formId: id,
      channel,
      clientId: form.clientId,
      sms: results.sms,
      email: results.email,
    });

    return NextResponse.json({ success: true, results });
  } catch (error) {
    logger.error("Send consent link error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה בשליחת הלינק" },
      { status: 500 }
    );
  }
}

async function findScopedForm(formId: string, scopeUser: ScopeUser) {
  const clientWhere = buildClientWhere(scopeUser);
  const ownershipFilter = scopeUser.organizationId
    ? { organizationId: scopeUser.organizationId }
    : { therapistId: scopeUser.id };

  return prisma.consentForm.findFirst({
    where: {
      AND: [
        { id: formId },
        {
          OR: [
            { client: clientWhere },
            { AND: [{ clientId: null }, ownershipFilter] },
          ],
        },
      ],
    },
    include: {
      client: {
        select: {
          id: true,
          name: true,
          phone: true,
          email: true,
        },
      },
    },
  });
}

function buildConsentEmailHtml(
  clientName: string,
  formTitle: string,
  url: string
): string {
  const escapedName = escapeHtml(clientName);
  const escapedTitle = escapeHtml(formTitle);

  return `
    <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; line-height: 1.6;">
      <h2 style="color: #333;">שלום ${escapedName},</h2>
      <p>נשלח אליך טופס הסכמה לחתימה:</p>
      <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
        <p style="margin: 0 0 16px 0; font-weight: bold; font-size: 16px;">${escapedTitle}</p>
        <a href="${escapeHtml(url)}" style="display: inline-block; background: #0f766e; color: #ffffff; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: bold;">
          פתח וחתום
        </a>
      </div>
      <p style="color: #666; font-size: 13px;">הקישור תקף ל-7 ימים.</p>
      <p style="color: #666; font-size: 14px; margin-top: 30px;">בברכה,<br/>MyTipul</p>
    </div>
  `;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");
}
