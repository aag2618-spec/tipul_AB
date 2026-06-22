import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/resend";
import { sendSMS } from "@/lib/sms";
import { escapeHtml, sanitizeEmailSubject } from "@/lib/email-utils";
import { logger } from "@/lib/logger";
import { generateSecureToken } from "@/lib/clinic-invitations";
import { computeBookingLinkExpiresAt } from "@/lib/booking-links";

import { requireAuth } from "@/lib/api-auth";
import {
  loadScopeUser,
  buildClientWhere,
  isSecretary,
  secretaryCan,
} from "@/lib/scope";
import { checkRateLimit, EMAIL_SEND_USER_RATE_LIMIT } from "@/lib/rate-limit";
import { parseBody } from "@/lib/validations/helpers";
import { sendBookingLinkSchema } from "@/lib/validations/user-settings";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { userId } = auth;

  // Stage 2.0 — rate limit לפי userId: 30 קריאות/שעה.
  // עם cap של 50 נמענים בקריאה, מקסימום 1500 מיילים/שעה — סביר לשימוש לגיטימי
  // בקליניקה, ועוצר spam של חשבון נפרץ.
  const rateLimitResult = checkRateLimit(
    `booking-send-link:${userId}`,
    EMAIL_SEND_USER_RATE_LIMIT
  );
  if (!rateLimitResult.allowed) {
    return NextResponse.json(
      { message: "הגעת למכסת השליחה השעתית. נסה שוב בעוד שעה." },
      {
        status: 429,
        headers: {
          "Retry-After": String(
            Math.max(1, Math.ceil((rateLimitResult.resetAt - Date.now()) / 1000))
          ),
        },
      }
    );
  }

  const scopeUser = await loadScopeUser(userId);
  if (isSecretary(scopeUser) && !secretaryCan(scopeUser, "canSendReminders")) {
    return NextResponse.json(
      { message: "אין הרשאה לשליחת תזכורות" },
      { status: 403 }
    );
  }
  const clientWhere = buildClientWhere(scopeUser);

  const parsed = await parseBody(request, sendBookingLinkSchema);
  if ("error" in parsed) return parsed.error;
  const { clientIds, customMessage } = parsed.data;

  const clients = await prisma.client.findMany({
    where: {
      AND: [
        { id: { in: clientIds } },
        clientWhere,
      ],
    },
    select: { id: true, name: true, email: true, phone: true, therapistId: true },
  });

  // מי "הבעלים" של הקישור: מטפל/בעלים שולח/ת בשם עצמו/ה (התנהגות קיימת);
  // מזכיר/ה שולחת בשם המטפל של כל מטופל — BookingLink.therapistId == client.therapistId,
  // וההגדרות + מכסת ה-SMS נלקחות מאותו מטפל (ולא מהמזכירה, שאין לה כאלה).
  const sendsOnBehalf = isSecretary(scopeUser);

  // מיפוי therapistId → { name, enabled } לכל המטפלים הרלוונטיים.
  const therapistInfo = new Map<string, { name: string; enabled: boolean }>();
  if (sendsOnBehalf) {
    const therapistIds = [...new Set(clients.map((c) => c.therapistId))];
    const therapists = await prisma.user.findMany({
      // הגנת-עומק: גם תיחום לארגון (ה-therapistIds כבר נגזרים ממטופלים מתוחמים).
      where: {
        id: { in: therapistIds },
        ...(scopeUser.organizationId
          ? { organizationId: scopeUser.organizationId }
          : {}),
      },
      select: {
        id: true,
        name: true,
        bookingSettings: { select: { enabled: true } },
      },
    });
    for (const t of therapists) {
      therapistInfo.set(t.id, {
        name: t.name || "המטפל/ת",
        enabled: !!t.bookingSettings?.enabled,
      });
    }
  } else {
    // מטפל/בעלים — שולח/ת בשם עצמו/ה. הזימון העצמי חייב להיות מופעל אצלו/ה.
    const settings = await prisma.bookingSettings.findUnique({
      where: { therapistId: userId },
    });
    if (!settings || !settings.enabled) {
      return NextResponse.json(
        { message: "יש להפעיל את הזימון העצמי לפני שליחת קישורים" },
        { status: 400 }
      );
    }
    const me = await prisma.user.findUnique({
      where: { id: userId },
      select: { name: true },
    });
    therapistInfo.set(userId, { name: me?.name || "המטפל/ת", enabled: true });
  }

  const appUrl = process.env.NEXTAUTH_URL || "";

  let sent = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const client of clients) {
    // בעל/ת הקישור לכל מטופל + ההגדרות הרלוונטיות.
    const linkTherapistId = sendsOnBehalf ? client.therapistId : userId;
    const info = therapistInfo.get(linkTherapistId);

    // מזכיר/ה: אם הזימון העצמי כבוי אצל המטפל של המטופל — אי אפשר לשלוח בשמו.
    if (sendsOnBehalf && (!info || !info.enabled)) {
      skipped++;
      continue;
    }

    // מטופל בלי מייל וגם בלי טלפון — אין דרך לשלוח קישור.
    if (!client.email && !client.phone) {
      skipped++;
      continue;
    }

    const therapistName = info?.name || "המטפל/ת";
    // שורת נושא מנוקה מתווי שורה — מונע Email Header Injection דרך שם המטפל.
    const emailSubject = sanitizeEmailSubject(`${therapistName} - קביעת תור`);

    try {
      // קישור אישי לכל מטופל — נוצר/מתעדכן (reuse אם קיים פעיל ולא-פג).
      const now = new Date();
      const newExpiry = computeBookingLinkExpiresAt(now);
      const existing = await prisma.bookingLink.findFirst({
        where: { clientId: client.id, status: "ACTIVE", expiresAt: { gt: now } },
        orderBy: { createdAt: "desc" },
        select: { id: true, token: true },
      });

      let token: string;
      if (existing) {
        token = existing.token;
        await prisma.bookingLink.update({
          where: { id: existing.id },
          data: {
            expiresAt: newExpiry,
            destinationEmail: client.email ?? null,
            destinationPhone: client.phone ?? null,
            lastSentAt: now,
          },
        });
      } else {
        const created = await prisma.bookingLink.create({
          data: {
            token: generateSecureToken(),
            clientId: client.id,
            therapistId: linkTherapistId,
            organizationId: scopeUser.organizationId,
            destinationEmail: client.email ?? null,
            destinationPhone: client.phone ?? null,
            expiresAt: newExpiry,
            lastSentAt: now,
          },
          select: { token: true },
        });
        token = created.token;
      }

      const bookingUrl = `${appUrl}/booking/t/${token}`;

      // שליחה — מייל מועדף; אם אין מייל, SMS.
      if (client.email) {
        const html = `
          <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; line-height: 1.6;">
            <h2 style="color: #0f766e;">שלום ${escapeHtml(client.name)},</h2>
            ${customMessage ? `<p>${escapeHtml(customMessage).replace(/\n/g, "<br/>")}</p>` : `<p>${escapeHtml(therapistName)} מזמין/ה אותך לקבוע תור דרך דף הזימון האישי שלך:</p>`}
            <div style="text-align: center; margin: 30px 0;">
              <a href="${bookingUrl}" style="display: inline-block; background: #0f766e; color: white; padding: 14px 32px; border-radius: 8px; text-decoration: none; font-size: 16px; font-weight: bold;">
                קביעת תור
              </a>
            </div>
            <p style="color: #666; font-size: 13px;">הקישור אישי ומאובטח, ותקף ל-60 יום. בקביעת תור יישלח אליך קוד אימות.</p>
            <p style="color: #666; font-size: 14px; margin-top: 20px;">בברכה,<br/>${escapeHtml(therapistName)}</p>
            <p style="color: #999; font-size: 12px; margin-top: 20px;">מופעל על ידי MyTipul</p>
          </div>`;

        const result = await sendEmail({
          to: client.email,
          subject: emailSubject,
          html,
        });

        await prisma.communicationLog.create({
          data: {
            type: "CUSTOM",
            channel: "EMAIL",
            recipient: client.email,
            subject: emailSubject,
            content: html,
            status: result.success ? "SENT" : "FAILED",
            errorMessage: result.success ? null : String(result.error),
            sentAt: result.success ? new Date() : null,
            clientId: client.id,
            userId: linkTherapistId,
            organizationId: scopeUser.organizationId,
          },
        });

        if (result.success) sent++;
        else errors.push(`${client.name}: שגיאה בשליחה`);
      } else if (client.phone) {
        const smsText = `${customMessage ? customMessage + " " : `${therapistName} מזמין/ה אותך לקבוע תור. `}קישור אישי לקביעת תור (תקף 60 יום): ${bookingUrl}`;
        const result = await sendSMS(client.phone, smsText, linkTherapistId, {
          clientId: client.id,
          type: "BOOKING_LINK",
        });

        await prisma.communicationLog.create({
          data: {
            type: "CUSTOM",
            channel: "SMS",
            recipient: client.phone,
            subject: "קישור לקביעת תור",
            content: smsText,
            status: result.success ? "SENT" : "FAILED",
            errorMessage: result.success ? null : String(result.error),
            sentAt: result.success ? new Date() : null,
            clientId: client.id,
            userId: linkTherapistId,
            organizationId: scopeUser.organizationId,
          },
        });

        if (result.success) sent++;
        else errors.push(`${client.name}: ${result.shabbatBlocked ? "חסום בשבת/חג" : "שגיאה בשליחת SMS"}`);
      }
    } catch (e) {
      logger.error(`Failed to send booking link to client ${client.id}:`, { error: e instanceof Error ? e.message : String(e) });
      errors.push(`${client.name}: שגיאה בשליחה`);
    }
  }

  return NextResponse.json({
    sent,
    skipped,
    errors,
    message: `נשלחו ${sent} קישורים${skipped > 0 ? `, ${skipped} דולגו` : ""}`,
  });
}
