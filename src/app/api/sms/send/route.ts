import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { sendSMS } from "@/lib/sms";
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

// שליחת SMS ידני למטופל מתוך הדלפק (מוקד/יומן/חיפוש מהיר וכו').
// המסר נשלח דרך הספק (Pulseem) ומנוכה מ*חבילת ה-SMS של המטפל שהמטופל שייך אליו*
// — בקליניקה זו המכסה הארגונית המשותפת. זו אותה מוסכמה כמו תזכורות אוטומטיות
// ושליחת אישורים (ה-log נרשם על שם therapistId). sendSMS כבר מטפל בחסימת שבת/חג,
// במכסה, וברישום ל-CommunicationLog — לכן אין כאן רישום נוסף (היה גורם כפילות).
//
// Pulseem חותך ל-201 תווים בעברית; לכן ה-cap כאן + ב-UI = 201 (בלי חיתוך שקט).
const sendSmsSchema = z.object({
  clientId: z.string().min(1).max(100),
  message: z
    .string()
    .min(1, "תוכן ההודעה חסר")
    .max(201, "ההודעה ארוכה מדי (עד 201 תווים)"),
});

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    // Rate limit לפי userId: 30 הודעות/שעה (אותה מכסה כמו /api/email/send).
    // מונע spam במקרה של חשבון נפרץ או באג ב-UI שלוחץ "שלח" שוב ושוב.
    const rateLimitResult = checkRateLimit(
      `sms-send:${userId}`,
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
    // אותו gate כמו שליחת מיילים/תזכורות — מזכירה בלי canSendReminders חסומה.
    if (isSecretary(scopeUser) && !secretaryCan(scopeUser, "canSendReminders")) {
      return NextResponse.json(
        { message: "אין הרשאה לשליחת הודעות" },
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

    const parsed = sendSmsSchema.safeParse(raw);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0]?.message ?? "נתונים לא תקינים";
      return NextResponse.json({ message: firstIssue }, { status: 400 });
    }
    const { clientId, message } = parsed.data;

    // scope — שולפים את המטופל רק אם הוא בתחום ההרשאה של המבצע (PHI).
    // therapistId = בעל הקשר; ממנו נוכה ה-SMS (חבילה אישית או מכסה ארגונית).
    const client = await prisma.client.findFirst({
      where: { AND: [{ id: clientId }, clientWhere] },
      select: { id: true, phone: true, therapistId: true },
    });

    if (!client) {
      return NextResponse.json({ message: "מטופל לא נמצא" }, { status: 404 });
    }
    if (!client.phone) {
      return NextResponse.json(
        { message: "למטופל אין מספר טלפון" },
        { status: 400 }
      );
    }

    const result = await sendSMS(client.phone, message, client.therapistId, {
      clientId: client.id,
      type: "CUSTOM",
    });

    // הצלחה/כשל "רך" (שבת, מכסה, ספק) — תמיד 200 עם דגל success, וה-UI מציג
    // את ההודעה. לא 500, כי מכסה/שבת אינם תקלת שרת אלא מצב עסקי צפוי.
    if (result.success) {
      return NextResponse.json({ success: true, message: "ה-SMS נשלח" });
    }
    if (result.shabbatBlocked) {
      return NextResponse.json({
        success: false,
        shabbatBlocked: true,
        message: "ההודעה לא נשלחה — שבת/חג. ניתן לשלוח שוב במוצאי שבת/חג.",
      });
    }
    return NextResponse.json({
      success: false,
      message: result.error || "שליחת ההודעה נכשלה",
    });
  } catch (error) {
    logger.error("Send SMS error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "אירעה שגיאה בשליחת ההודעה" },
      { status: 500 }
    );
  }
}
