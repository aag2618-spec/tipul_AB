import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { sendEmail, createGenericEmail } from "@/lib/resend";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/api-auth";
import {
  loadScopeUser,
  buildClientWhere,
  isSecretary,
  secretaryCan,
} from "@/lib/scope";
import { checkRateLimit, EMAIL_SEND_USER_RATE_LIMIT } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// Stage 2.0 — cap על המספר המקסימלי של נמענים בקריאה אחת.
// מונע ניצול של endpoint זה כ-spam-cannon (חשבון נפרץ ששולח 1000 מיילים בקריאה).
// 50 הוא חציון בין שימוש לגיטימי (קליניקה עם רשימת שמות) ל-DoS protection.
const MAX_BULK_RECIPIENTS = 50;

// Subject מוגבל ל-200 תווים, ללא CRLF (header injection guard) — אותה שיטה
// כמו /api/email/send. content מוגבל ל-50KB (DoS guard).
const BulkSendSchema = z.object({
  clientIds: z
    .array(z.string().min(1).max(100))
    .min(1, "נא לבחור לפחות מטופל אחד")
    .max(MAX_BULK_RECIPIENTS, `מקסימום ${MAX_BULK_RECIPIENTS} מטופלים בקריאה אחת`),
  subject: z
    .string()
    .min(1, "נושא חסר")
    .max(200, "נושא ארוך מדי")
    .refine((s) => !/[\r\n]/.test(s), "הנושא מכיל תווי שורה אסורים"),
  content: z.string().min(1, "תוכן חסר").max(50_000, "תוכן ארוך מדי"),
});

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    // Stage 2.0 — rate limit לפי userId: 30 קריאות/שעה.
    // מונע spam של endpoint זה. עם MAX_BULK_RECIPIENTS=50, max effective rate
    // הוא 30*50=1500 מיילים/שעה — חריג אבל סביר לקליניקה גדולה. לא יעבור 1500
    // משום שגם sendEmail עצמו יחסם ע"י Resend bandwidth.
    const rateLimitResult = checkRateLimit(
      `email-bulk-send:${userId}`,
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

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return NextResponse.json({ message: "גוף הבקשה לא תקין" }, { status: 400 });
    }

    const parsed = BulkSendSchema.safeParse(rawBody);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      return NextResponse.json(
        { message: firstIssue?.message ?? "נתונים לא תקינים" },
        { status: 400 }
      );
    }
    const { clientIds, subject, content } = parsed.data;

    // Get user info
    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    // Get all selected clients (scoped: independent therapist sees own; clinic
    // owner sees all in org; clinic therapist sees own; secretary sees all in org).
    const clients = await prisma.client.findMany({
      where: {
        AND: [
          { id: { in: clientIds } },
          clientWhere,
        ],
      },
    });

    // Filter clients with email
    const clientsWithEmail = clients.filter(c => c.email);

    if (clientsWithEmail.length === 0) {
      return NextResponse.json(
        { message: "אף אחד מהמטופלים שנבחרו אין מייל" },
        { status: 400 }
      );
    }

    let successCount = 0;
    let failureCount = 0;
    const errors: string[] = [];

    // Send emails in parallel (but with rate limiting)
    const sendPromises = clientsWithEmail.map(async (client) => {
      try {
        const personalizedSubject = subject.replace(/{שם}/g, client.firstName || client.name).replace(/{name}/g, client.firstName || client.name);
        const personalizedContent = content.replace(/{שם}/g, client.firstName || client.name).replace(/{name}/g, client.firstName || client.name);

        const { subject: emailSubject, html } = createGenericEmail(
          client.name,
          personalizedSubject,
          personalizedContent,
          user?.name || "המטפל/ת שלך"
        );

        const result = await sendEmail({
          to: client.email!.toLowerCase(),
          subject: emailSubject,
          html,
        });

        // Log communication (include messageId for reply threading)
        await prisma.communicationLog.create({
          data: {
            type: "CUSTOM",
            channel: "EMAIL",
            recipient: client.email!.toLowerCase(),
            subject: emailSubject,
            content: html,
            status: result.success ? "SENT" : "FAILED",
            errorMessage: result.success ? null : String(result.error),
            sentAt: result.success ? new Date() : null,
            messageId: result.messageId || null,
            clientId: client.id,
            userId: userId,
            organizationId: scopeUser.organizationId,
          },
        });

        if (result.success) {
          successCount++;
          return { success: true, clientName: client.name };
        } else {
          failureCount++;
          errors.push(`${client.name}: ${result.error}`);
          return { success: false, clientName: client.name, error: result.error };
        }
      } catch (error) {
        failureCount++;
        const errorMsg = error instanceof Error ? error.message : "Unknown error";
        errors.push(`${client.name}: ${errorMsg}`);
        return { success: false, clientName: client.name, error: errorMsg };
      }
    });

    // Wait for all emails to be sent
    await Promise.all(sendPromises);

    return NextResponse.json({
      message: `${successCount} מיילים נשלחו בהצלחה`,
      sent: successCount,
      failed: failureCount,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    logger.error("Bulk send email error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה בשליחת המיילים" },
      { status: 500 }
    );
  }
}
