// src/app/api/payments/[id]/send-cardcom-link/route.ts
// שליחת לינק תשלום Cardcom ללקוח דרך SMS / אימייל / שניהם.
// המטפל חייב להיות בעל ה-Payment (דרך Client.therapistId).
// הלינק עצמו (paymentPageUrl) מגיע מ-/api/payments/[id]/charge-cardcom.

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { sendSMS } from "@/lib/sms";
import { sendEmail } from "@/lib/resend";
import { escapeHtml } from "@/lib/email-utils";
import { checkRateLimit, SMS_SEND_USER_RATE_LIMIT } from "@/lib/rate-limit";
import { isShabbatOrYomTov } from "@/lib/shabbat";
import { loadScopeUser, buildPaymentWhere } from "@/lib/scope";
import { loadScopeUserWithMode } from "@/lib/secretary-mode";
import { sendCardcomLinkSchema } from "@/lib/validations/payment";

export const dynamic = "force-dynamic";

type SendLinkBody = import("zod").infer<typeof sendCardcomLinkSchema>;

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { userId } = auth;

  // חסימה הלכתית — אסור לשלוח קישור תשלום בשבת/יו״ט (גם sendSMS/sendEmail
  // חוסמים, אבל נחסום פה מוקדם כדי להחזיר הודעה ברורה למטפל ולא רישום
  // CommunicationLog ריק).
  if (isShabbatOrYomTov()) {
    return NextResponse.json(
      { message: "לא ניתן לשלוח קישור תשלום בשבת ויום טוב" },
      { status: 403 }
    );
  }

  // Rate-limit per-user: 30 שליחות לשעה (מספיק לצורכי גבייה רגילה,
  // חוסם spam במקרה של חשבון מטפל שנפרץ).
  const rl = checkRateLimit(`send-cardcom-link:${userId}`, {
    maxRequests: 30,
    windowMs: 60 * 60 * 1000,
  });
  if (!rl.allowed) {
    return NextResponse.json(
      { message: "נשלחו יותר מדי לינקי תשלום. נסה שוב בעוד שעה." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  const { id: paymentId } = await context.params;

  // H2: zod strict — אוכף paymentPageUrl כ-URL וקאנלים כ-enum, וחוסם שדות זרים.
  let body: SendLinkBody;
  try {
    const raw = await request.json();
    const parsed = sendCardcomLinkSchema.safeParse(raw);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      return NextResponse.json(
        { message: first?.message ?? "נתונים לא תקינים", field: first?.path.join(".") ?? null },
        { status: 400 }
      );
    }
    body = parsed.data;
  } catch {
    return NextResponse.json({ message: "גוף הבקשה אינו JSON תקין" }, { status: 400 });
  }

  // ולידציית domain — חייב להיות HTTPS על Cardcom (zod מאמת רק URL כללי).
  // CRITICAL: require dot-boundary or exact equality so attacker-registered hosts
  // like `evilcardcom.co.il` won't pass `endsWith("cardcom.co.il")`.
  const isCardcomHost = (hostname: string): boolean => {
    const allowed = ["cardcom.solutions", "cardcom.co.il"];
    return allowed.some((d) => hostname === d || hostname.endsWith(`.${d}`));
  };
  try {
    const u = new URL(body.paymentPageUrl);
    if (u.protocol !== "https:") {
      return NextResponse.json({ message: "URL חייב להיות HTTPS" }, { status: 400 });
    }
    if (!isCardcomHost(u.hostname)) {
      return NextResponse.json(
        { message: "URL חייב להיות של Cardcom" },
        { status: 400 }
      );
    }
  } catch {
    return NextResponse.json({ message: "paymentPageUrl אינו URL תקין" }, { status: 400 });
  }

  const channels = body.channels;

  // Stage 2.0 — שכבה נוספת ל-SMS: 10/שעה למשתמש כי SMS יקר משמעותית מ-email
  // (מעלות ל-SMS, חיוב לפי הודעה). מופעל רק כששליחת SMS מבוקשת.
  // הגבלה זו עומדת מעל ה-rate-limit הכללי (30/שעה לכל ה-channels) — אם
  // המשתמש שולח רק email, לא נופל בשכבה הזו.
  if (channels.includes("sms")) {
    const smsResult = checkRateLimit(`send-sms:${userId}`, SMS_SEND_USER_RATE_LIMIT);
    if (!smsResult.allowed) {
      return NextResponse.json(
        { message: "נשלחו יותר מדי SMS. נסה שוב בעוד שעה (או שלח רק במייל)." },
        {
          status: 429,
          headers: {
            "Retry-After": String(
              Math.max(1, Math.ceil((smsResult.resetAt - Date.now()) / 1000))
            ),
          },
        }
      );
    }
  }

  // H1: scope-based ownership. החלפת therapistId === userId שעבד למטפל
  // יחיד אבל שבר CLINIC_OWNER. buildPaymentWhere מטפל בכל התפקידים נכון.
  const scopeUser = await loadScopeUserWithMode(userId);
  const paymentScope = buildPaymentWhere(scopeUser);
  if ("id" in paymentScope && paymentScope.id === "__deny__") {
    return NextResponse.json({ message: "אין הרשאה" }, { status: 403 });
  }

  // Load payment + ownership
  let payment;
  try {
    payment = await prisma.payment.findFirst({
      where: { AND: [{ id: paymentId }, paymentScope] },
      include: { client: true },
    });
  } catch (err) {
    logger.error("[send-cardcom-link] payment lookup failed", {
      paymentId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json({ message: "שגיאה בחיפוש התשלום" }, { status: 500 });
  }
  if (!payment) {
    return NextResponse.json({ message: "תשלום לא נמצא" }, { status: 404 });
  }

  const therapist = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true },
  });

  // ה-URL שיישלח ללקוח הוא URL שלנו (gateway), לא URL ישיר של Cardcom.
  // ה-gateway חוסם בשבת/יו״ט ומפנה ל-Cardcom רק כשמותר. ל-LowProfileId
  // מאתרים את ה-CardcomTransaction לפי paymentPageUrl שנשמר ב-DB.
  // אם לא נמצא (legacy / data race) — נופלים חזרה ל-URL הישיר.
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://mytipul.com";
  const tx = await prisma.cardcomTransaction.findFirst({
    where: { paymentId, paymentPageUrl: body.paymentPageUrl },
    select: { lowProfileId: true },
    orderBy: { createdAt: "desc" },
  });
  const linkToSend = tx?.lowProfileId
    ? `${baseUrl}/p/pay/${tx.lowProfileId}`
    : body.paymentPageUrl;

  const amountStr = String(Number(payment.amount));
  const description = payment.notes ?? `פגישה`;
  const therapistName = therapist?.name ?? "המטפל שלך";
  const clientName = payment.client.name;

  const results: { channel: "sms" | "email"; success: boolean; error?: string }[] = [];

  if (channels.includes("sms")) {
    if (!payment.client.phone) {
      results.push({ channel: "sms", success: false, error: "אין מספר טלפון ללקוח" });
    } else {
      const smsMessage =
        `שלום ${clientName},\n` +
        `${therapistName} שולח/ת לך לינק לתשלום ₪${amountStr} עבור ${description}.\n` +
        `${linkToSend}`;

      try {
        const r = await sendSMS(payment.client.phone, smsMessage, userId, {
          clientId: payment.client.id,
          type: "CARDCOM_PAYMENT_LINK",
        });
        results.push({
          channel: "sms",
          success: r.success,
          error: r.success ? undefined : r.error,
        });
      } catch (err) {
        results.push({
          channel: "sms",
          success: false,
          error: err instanceof Error ? err.message : "שגיאה ב-SMS",
        });
      }
    }
  }

  if (channels.includes("email")) {
    if (!payment.client.email) {
      results.push({ channel: "email", success: false, error: "אין כתובת מייל ללקוח" });
    } else {
      const safeName = escapeHtml(clientName);
      const safeTherapist = escapeHtml(therapistName);
      const safeDesc = escapeHtml(description);
      const safeUrl = escapeHtml(linkToSend);
      // Strip CR/LF + other control chars from subject to prevent email header injection
      // (display names from User.name are user-controlled).
      const safeSubjectName = therapistName.replace(/[\r\n\u0000-\u001f]/g, " ").trim();
      const subject = `לינק לתשלום ₪${amountStr} מ-${safeSubjectName}`;
      const html = `
        <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h2 style="color: #333;">שלום ${safeName},</h2>
          <p>${safeTherapist} שולח/ת לך לינק לתשלום מאובטח דרך Cardcom.</p>
          <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p><strong>סכום:</strong> ₪${amountStr}</p>
            <p><strong>עבור:</strong> ${safeDesc}</p>
          </div>
          <p style="text-align: center; margin: 30px 0;">
            <a href="${safeUrl}" style="background: #0070f3; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">לחצ/י כאן לתשלום</a>
          </p>
          <p style="color: #666; font-size: 12px; line-height: 1.6;">
            התשלום יתבצע בדף מאובטח של Cardcom (PCI-DSS Level 1).<br/>
            אנו לא רואים ולא שומרים את פרטי כרטיס האשראי שלך.<br/>
            אם הכפתור לא עובד, העתיקי את הקישור הבא: <br/>
            <span style="word-break: break-all; direction: ltr; display: inline-block;">${safeUrl}</span>
          </p>
        </div>
      `;

      try {
        const r = await sendEmail({ to: payment.client.email, subject, html });
        results.push({
          channel: "email",
          success: r.success,
          error: r.success ? undefined : String(r.error ?? "שגיאה לא ידועה"),
        });

        // Log a CommunicationLog entry — mirrors the receipt-service pattern.
        // We do this best-effort; failure to log doesn't fail the send.
        try {
          await prisma.communicationLog.create({
            data: {
              type: "CUSTOM",
              channel: "EMAIL",
              recipient: payment.client.email.toLowerCase(),
              subject,
              content: html,
              status: r.success ? "SENT" : "FAILED",
              errorMessage: r.success ? null : String(r.error ?? "send failed"),
              sentAt: r.success ? new Date() : null,
              messageId: r.messageId || null,
              clientId: payment.client.id,
              userId,
            },
          });
        } catch (logErr) {
          logger.warn("[send-cardcom-link] communicationLog.create failed (non-fatal)", {
            paymentId,
            error: logErr instanceof Error ? logErr.message : String(logErr),
          });
        }
      } catch (err) {
        results.push({
          channel: "email",
          success: false,
          error: err instanceof Error ? err.message : "שגיאה במייל",
        });
      }
    }
  }

  const anySuccess = results.some((r) => r.success);
  const allFailed = results.length > 0 && !anySuccess;

  logger.info("[send-cardcom-link] dispatched", {
    userId,
    paymentId,
    channels,
    results: results.map((r) => ({ channel: r.channel, success: r.success })),
  });

  return NextResponse.json(
    {
      success: anySuccess,
      results,
    },
    { status: allFailed ? 502 : 200 }
  );
}
