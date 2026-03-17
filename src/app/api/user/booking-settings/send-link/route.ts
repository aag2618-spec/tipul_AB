import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/resend";
import { escapeHtml } from "@/lib/email-utils";
import { logger } from "@/lib/logger";

import { requireAuth } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { userId, session } = auth;

  const body = await request.json();
  const { clientIds, customMessage } = body as {
    clientIds: string[];
    customMessage?: string;
  };

  if (!Array.isArray(clientIds) || clientIds.length === 0) {
    return NextResponse.json({ message: "חובה לבחור לפחות מטופל אחד" }, { status: 400 });
  }

  if (clientIds.length > 50) {
    return NextResponse.json({ message: "ניתן לשלוח עד 50 מטופלים בפעם אחת" }, { status: 400 });
  }

  const settings = await prisma.bookingSettings.findUnique({
    where: { therapistId: userId },
  });

  if (!settings || !settings.slug || !settings.enabled) {
    return NextResponse.json(
      { message: "יש להפעיל את הזימון העצמי לפני שליחת קישורים" },
      { status: 400 }
    );
  }

  const therapist = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true },
  });

  const clients = await prisma.client.findMany({
    where: {
      id: { in: clientIds },
      therapistId: userId,
    },
    select: { id: true, name: true, email: true },
  });

  const appUrl = process.env.NEXTAUTH_URL || "";
  const bookingUrl = `${appUrl}/booking/${settings.slug}`;
  const therapistName = therapist?.name || "המטפל/ת";

  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const client of clients) {
    if (!client.email) {
      skipped++;
      continue;
    }

    const html = `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; line-height: 1.6;">
        <h2 style="color: #0f766e;">שלום ${escapeHtml(client.name)},</h2>
        ${customMessage ? `<p>${escapeHtml(customMessage).replace(/\n/g, "<br/>")}</p>` : `<p>${escapeHtml(therapistName)} מזמין/ה אותך לקבוע תור דרך דף הזימון:</p>`}
        <div style="text-align: center; margin: 30px 0;">
          <a href="${bookingUrl}" style="display: inline-block; background: #0f766e; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-size: 16px; font-weight: bold;">
            קביעת תור
          </a>
        </div>
        <p style="color: #666; font-size: 14px; margin-top: 30px;">בברכה,<br/>${escapeHtml(therapistName)}</p>
        <p style="color: #999; font-size: 12px; margin-top: 20px;">מופעל על ידי MyTipul</p>
      </div>`;

    try {
      const result = await sendEmail({
        to: client.email,
        subject: `${therapistName} - קביעת תור`,
        html,
      });

      await prisma.communicationLog.create({
        data: {
          type: "CUSTOM",
          channel: "EMAIL",
          recipient: client.email,
          subject: `${therapistName} - קביעת תור`,
          content: html,
          status: result.success ? "SENT" : "FAILED",
          errorMessage: result.success ? null : String(result.error),
          sentAt: result.success ? new Date() : null,
          clientId: client.id,
          userId: userId,
        },
      });

      if (result.success) sent++;
      else errors.push(`${client.name}: שגיאה בשליחה`);
    } catch (e) {
      logger.error(`Failed to send booking link to ${client.email}:`, { error: e instanceof Error ? e.message : String(e) });
      errors.push(`${client.name}: שגיאה בשליחה`);
    }
  }

  return NextResponse.json({
    sent,
    skipped,
    errors,
    message: `נשלחו ${sent} מיילים${skipped > 0 ? `, ${skipped} מטופלים ללא מייל` : ""}`,
  });
}
