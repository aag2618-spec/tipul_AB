import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { sendEmail } from "@/lib/resend";
import {
  createManualSessionReminderEmail,
  formatSessionDateTime,
} from "@/lib/email-templates";
import { sendSMSIfEnabled } from "@/lib/sms";
import { logger } from "@/lib/logger";
import { isShabbatOrYomTov } from "@/lib/shabbat";
import { requireAuth } from "@/lib/api-auth";
import {
  loadScopeUser,
  buildSessionWhere,
  isSecretary,
  secretaryCan,
} from "@/lib/scope";
import { checkRateLimit, EMAIL_SEND_USER_RATE_LIMIT } from "@/lib/rate-limit";
import { parseBody } from "@/lib/validations/helpers";
import { sendRemindersSchema } from "@/lib/validations/session";

export const dynamic = "force-dynamic";

// שליחת תזכורת ידנית לפגישות נבחרות — "פעולה מהירה" בדשבורד המזכירה.
// מקבילה ללוגיקת ה-cron (src/app/api/cron/reminders/route.ts) אך:
//   • מופעלת ביוזמת משתמש (מזכירה/מטפל) ולא לפי חלון זמן — לכן מקבלת sessionIds.
//   • מסוננת ל-scope של המשתמש (buildSessionWhere) → אין IDOR.
//   • משתמשת בתבנית גמישה (createManualSessionReminderEmail) שלא אומרת "מחר",
//     כדי לתמוך גם בשליחה יומיים מראש.
// dedup, הגנת שבת, וכיבוד הגדרת המטפל (send24hReminder / SMS toggle) — נשמרים.
export async function POST(request: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { userId } = auth;

  // שבת/חג — חסימה מוקדמת והודעה ברורה (sendEmail/sendSMS חוסמים גם הם, אבל
  // עדיף לעצור לפני כל שליחה כדי לא לרשום FAILED מיותרים).
  if (isShabbatOrYomTov()) {
    return NextResponse.json(
      { message: "לא ניתן לשלוח תזכורות בשבת/חג" },
      { status: 400 }
    );
  }

  const scopeUser = await loadScopeUser(userId);
  if (isSecretary(scopeUser) && !secretaryCan(scopeUser, "canSendReminders")) {
    return NextResponse.json(
      { message: "אין הרשאה לשליחת תזכורות" },
      { status: 403 }
    );
  }

  const parsed = await parseBody(request, sendRemindersSchema);
  if ("error" in parsed) return parsed.error;
  const { sessionIds } = parsed.data;

  // rate limit לפי userId — 30/שעה. אחרי בדיקות שבת/הרשאה/validation כדי לא
  // "לאכול" מהמכסה על בקשות חסומות. עלות ה-SMS עצמה מוגנת במכסת ה-SMS הייעודית
  // (consumeSms / checkSmsQuota ברמת המטפל והארגון) — לכן אין צורך ב-SMS
  // rate-limit נפרד שהיה שובר שליחה מרוכזת לגיטימית.
  const rl = checkRateLimit(`send-reminders:${userId}`, EMAIL_SEND_USER_RATE_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { message: "הגעת למכסת השליחה השעתית. נסה שוב בעוד שעה." },
      {
        status: 429,
        headers: {
          "Retry-After": String(
            Math.max(1, Math.ceil((rl.resetAt - Date.now()) / 1000))
          ),
        },
      }
    );
  }

  // טעינת הפגישות — מסונן ל-scope (IDOR-safe) + מתוכננות בלבד + ללא הפסקות.
  // therapist.communicationSetting נדרש לכיבוד הגדרות התזכורת + התאמה אישית.
  const sessionWhere = buildSessionWhere(scopeUser);
  const sessions = await prisma.therapySession.findMany({
    where: {
      AND: [
        sessionWhere,
        {
          id: { in: sessionIds },
          status: "SCHEDULED",
          type: { not: "BREAK" },
        },
      ],
    },
    select: {
      id: true,
      startTime: true,
      location: true,
      client: {
        select: { id: true, name: true, firstName: true, email: true, phone: true },
      },
      therapist: {
        select: {
          id: true,
          name: true,
          communicationSetting: {
            select: {
              send24hReminder: true,
              templateReminder24hSMS: true,
              customGreeting: true,
              customClosing: true,
              emailSignature: true,
              businessHours: true,
            },
          },
        },
      },
    },
  });

  let sent = 0; // נשלחה תזכורת (מייל ו/או SMS) בפועל
  let alreadySent = 0; // dedup — כבר נשלחה קודם בכל הערוצים הזמינים
  let noContact = 0; // אין מייל וגם אין טלפון
  let disabled = 0; // המטפל כיבה תזכורות 24ש
  let failed = 0; // ניסיון שליחה נכשל

  for (const s of sessions) {
    if (!s.client) {
      noContact++;
      continue;
    }

    const settings = s.therapist.communicationSetting;
    // כיבוד הגדרת המטפל — אם כיבה תזכורות 24ש, לא שולחים בשמו. (null = ברירת
    // מחדל מופעלת, כמו ב-cron.)
    if (settings && !settings.send24hReminder) {
      disabled++;
      continue;
    }

    const hasEmail = !!s.client.email;
    const hasPhone = !!s.client.phone;
    if (!hasEmail && !hasPhone) {
      noContact++;
      continue;
    }

    const { date, time } = formatSessionDateTime(s.startTime);
    const therapistId = s.therapist.id;

    // תוצאה אחת לכל פגישה, בעדיפות: נשלח > נכשל > כבר-נשלח > אין-מה-לשלוח.
    // (מקרה מעורב נפוץ: מייל כבר נשלח ב-dedup + SMS כבוי → "כבר נשלח", לא "ללא קשר".)
    let outcome: "sent" | "failed" | "already" | "none" = "none";

    // ── מייל ──
    if (hasEmail && s.client.email) {
      const existing = await prisma.communicationLog.findFirst({
        where: {
          sessionId: s.id,
          type: "REMINDER_24H",
          channel: "EMAIL",
          status: "SENT",
        },
        select: { id: true },
      });
      if (existing) {
        if (outcome === "none") outcome = "already";
      } else {
        const { subject, html } = createManualSessionReminderEmail({
          clientName: s.client.name ?? "",
          therapistName: s.therapist.name || "המטפל/ת שלך",
          date,
          time,
          address: s.location || undefined,
          customization: settings
            ? {
                customGreeting: settings.customGreeting,
                customClosing: settings.customClosing,
                emailSignature: settings.emailSignature,
                businessHours: settings.businessHours,
              }
            : null,
        });
        const result = await sendEmail({ to: s.client.email, subject, html });
        await prisma.communicationLog.create({
          data: {
            type: "REMINDER_24H",
            channel: "EMAIL",
            recipient: s.client.email,
            subject,
            content: html,
            status: result.success ? "SENT" : "FAILED",
            errorMessage: result.success ? null : String(result.error),
            sentAt: result.success ? new Date() : null,
            messageId: result.messageId || null,
            sessionId: s.id,
            clientId: s.client.id,
            userId: therapistId,
          },
        });
        if (result.success) outcome = "sent";
        else outcome = "failed";
      }
    }

    // ── SMS (עצמאי מהמייל; מכבד את ה-SMS toggle של המטפל דרך sendSMSIfEnabled) ──
    if (hasPhone && s.client.phone) {
      const existingSms = await prisma.communicationLog.findFirst({
        where: {
          sessionId: s.id,
          type: "REMINDER_24H",
          channel: "SMS",
          status: "SENT",
        },
        select: { id: true },
      });
      if (existingSms) {
        if (outcome === "none") outcome = "already";
      } else {
        const smsResult = await sendSMSIfEnabled({
          userId: therapistId,
          phone: s.client.phone,
          template: settings?.templateReminder24hSMS,
          defaultTemplate: "שלום {שם}, תזכורת לתור ב{תאריך} בשעה {שעה}",
          placeholders: {
            שם: s.client.firstName || s.client.name || "",
            תאריך: date,
            שעה: time,
          },
          settingKey: "sendReminder24hSMS",
          sessionId: s.id,
          clientId: s.client.id,
          type: "REMINDER_24H",
        });
        // SMS כבוי / מכסה / שבת אינם נספרים ככשל — המייל הוא ערוץ הליבה.
        if (smsResult.success) outcome = "sent";
      }
    }

    if (outcome === "sent") sent++;
    else if (outcome === "failed") failed++;
    else if (outcome === "already") alreadySent++;
    // outcome === "none" כאן רק כשיש טלפון בלבד (אין מייל) וה-SMS לא יצא
    // (כבוי/מכסה) — לא נשלח כלום בפועל, לכן "נכשל" ולא "ללא פרטי קשר" (יש טלפון).
    else failed++;
  }

  logger.info("[send-reminders] manual reminders processed", {
    userId,
    requested: sessionIds.length,
    matched: sessions.length,
    sent,
    alreadySent,
    disabled,
    noContact,
    failed,
  });

  return NextResponse.json({
    sent,
    alreadySent,
    noContact,
    disabled,
    failed,
    total: sessions.length,
  });
}
