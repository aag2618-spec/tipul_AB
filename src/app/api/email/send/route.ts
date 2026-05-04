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

export const dynamic = "force-dynamic";

// Stage 1.19 — input validation hardening.
// Subject is hard-bounded + CRLF-stripped (header injection guard).
// Content is bounded (DoS guard); HTML escaping happens inside createGenericEmail.
const sendEmailSchema = z.object({
  clientId: z.string().min(1).max(100),
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
    const { userId } = auth;

    const scopeUser = await loadScopeUser(userId);
    if (isSecretary(scopeUser) && !secretaryCan(scopeUser, "canSendReminders")) {
      return NextResponse.json(
        { message: "אין הרשאה לשליחת תזכורות" },
        { status: 403 }
      );
    }
    const clientWhere = buildClientWhere(scopeUser);

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return NextResponse.json({ message: "גוף הבקשה לא תקין" }, { status: 400 });
    }

    const parsed = sendEmailSchema.safeParse(raw);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0]?.message ?? "נתונים לא תקינים";
      return NextResponse.json({ message: firstIssue }, { status: 400 });
    }
    const { clientId, subject, content } = parsed.data;

    // Get client and therapist info
    const client = await prisma.client.findFirst({
      where: { AND: [{ id: clientId }, clientWhere] },
    });

    if (!client) {
      return NextResponse.json({ message: "מטופל לא נמצא" }, { status: 404 });
    }

    if (!client.email) {
      return NextResponse.json(
        { message: "למטופל אין כתובת מייל" },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
    });

    const { subject: emailSubject, html } = createGenericEmail(
      client.name,
      subject,
      content,
      user?.name || "המטפל/ת שלך"
    );

    const result = await sendEmail({
      to: client.email.toLowerCase(), // המרה לאותיות קטנות
      subject: emailSubject,
      html,
    });

    // Log communication (both success and failure)
    const communicationLog = await prisma.communicationLog.create({
      data: {
        type: "CUSTOM",
        channel: "EMAIL",
        recipient: client.email.toLowerCase(),
        subject: emailSubject,
        content: html,
        status: result.success ? "SENT" : "FAILED",
        errorMessage: result.success ? null : String(result.error),
        sentAt: result.success ? new Date() : null,
        messageId: result.messageId, // Save Resend message ID for tracking replies
        clientId: client.id,
        userId: userId,
        organizationId: scopeUser.organizationId,
      },
    });

    if (!result.success) {
      logger.error("Email send failed:", { error: result.error });
      return NextResponse.json(
        { message: "שגיאה בשליחת המייל", error: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json({ 
      message: "המייל נשלח בהצלחה",
      logId: communicationLog.id
    });
  } catch (error) {
    logger.error("Send email error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה בשליחת המייל" },
      { status: 500 }
    );
  }
}

