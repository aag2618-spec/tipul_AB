import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

import { requireAuth } from "@/lib/api-auth";
import { loadScopeUser, isSecretary, secretaryCan } from "@/lib/scope";
import { checkRateLimit, SMS_SEND_USER_RATE_LIMIT } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

// Stage 2.0 — Zod ל-SMS settings PUT.
// כל ה-input חייב להיות סוגים מדויקים — boolean/number/string. הגנה
// מ-NoSQL-style operator injection ומ-DoS דרך customMessage ארוך מאוד
// (שיכול לתקוע את שליחת ה-SMS עצמה — Twilio/SMS provider מגבילים אורך).
const SmsSettingsSchema = z.object({
  enabled: z.boolean(),
  hoursBeforeReminder: z.number().int().min(1).max(72),
  customMessage: z.string().max(500).optional().nullable(),
  sendOnWeekends: z.boolean(),
});

export async function GET() {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const settings = await prisma.sMSSettings.findUnique({
      where: { therapistId: userId },
    });

    // Return default settings if none exist
    if (!settings) {
      return NextResponse.json({
        enabled: false,
        hoursBeforeReminder: 24,
        customMessage: null,
        sendOnWeekends: true,
      });
    }

    return NextResponse.json(settings);
  } catch (error) {
    logger.error("Get SMS settings error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "שגיאה בטעינת ההגדרות" },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    // Stage 2.0 — rate limit לפי userId על כתיבת SMS settings.
    // 10/שעה למשתמש: שינוי הגדרות SMS לעיתים נדירות (אולי פעם בחודש);
    // מעבר לכך מצביע על UI bug או חשבון נפרץ שמנסה להפעיל/להשבית את
    // הגדרת התזכורות באופן חוזר (שינוי enabled→false במהרה יבטל תזכורות
    // לכל הלקוחות).
    const rateLimitResult = checkRateLimit(
      `sms-settings:${userId}`,
      SMS_SEND_USER_RATE_LIMIT
    );
    if (!rateLimitResult.allowed) {
      return NextResponse.json(
        { message: "ביצעת יותר מדי שינויים בהגדרות. אפשר לנסות שוב בעוד שעה." },
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

    // הגדרות תזכורות SMS — חסומות למזכירה ללא canSendReminders.
    const scopeUser = await loadScopeUser(userId);
    if (isSecretary(scopeUser) && !secretaryCan(scopeUser, "canSendReminders")) {
      return NextResponse.json(
        { message: "אין הרשאה לשליחת תזכורות" },
        { status: 403 }
      );
    }

    let rawBody: unknown;
    try {
      rawBody = await request.json();
    } catch {
      return NextResponse.json({ message: "גוף הבקשה לא תקין" }, { status: 400 });
    }

    const parsed = SmsSettingsSchema.safeParse(rawBody);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0];
      return NextResponse.json(
        {
          message: firstIssue?.message ?? "נתונים לא תקינים",
          field: firstIssue?.path.join(".") ?? null,
        },
        { status: 400 }
      );
    }
    const { enabled, hoursBeforeReminder, customMessage, sendOnWeekends } = parsed.data;

    const settings = await prisma.sMSSettings.upsert({
      where: { therapistId: userId },
      update: {
        enabled,
        hoursBeforeReminder,
        customMessage: customMessage ?? null,
        sendOnWeekends,
      },
      create: {
        therapistId: userId,
        enabled,
        hoursBeforeReminder,
        customMessage: customMessage ?? null,
        sendOnWeekends,
      },
    });

    return NextResponse.json(settings);
  } catch (error) {
    logger.error("Update SMS settings error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "שגיאה בשמירת ההגדרות" },
      { status: 500 }
    );
  }
}
