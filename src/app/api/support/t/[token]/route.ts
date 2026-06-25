// API ציבורי-אנונימי: שיחת מתעניין מדף הנחיתה דרך קישור אישי /support/t/[token].
// מאפשר למתעניין (שאין לו חשבון) לראות את השרשור ולהשיב — התגובה נכנסת לפנייה
// במערכת (SupportResponse) ואדמין רואה אותה ב-/admin/support. אבטחה: הטוקן (256 ביט)
// הוא ההרשאה היחידה (כמו קישורי הזימון), הגישה מסוננת ל-category=landing_lead בלבד,
// וה-GET חושף רק את שרשור התגובות והשם — לא את פרטי הפנייה המקוריים (מייל/טלפון).
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import {
  checkRateLimit,
  rateLimitResponse,
  BOOKING_GET_RATE_LIMIT,
  BOOKING_TOKEN_POST_RATE_LIMIT,
} from "@/lib/rate-limit";
import { getClientIp } from "@/lib/get-client-ip";
import { parseBody } from "@/lib/validations/helpers";
import { ticketResponseSchema } from "@/lib/validations/support";
import { getSiteSetting } from "@/lib/site-settings";
import { sendEmail } from "@/lib/resend";
import { escapeHtml, safeEmailSubject } from "@/lib/email-utils";

export const dynamic = "force-dynamic";

// פורמט הטוקן: 32 בייט base64url = 43 תווים (זהה ל-generateSecureToken / קישורי זימון).
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

// GET — טעינת השיחה לפי הטוקן (ללא התחברות). מחזיר רק שדות בטוחים:
// לא adminNotes, לא פרטי המשתמש/אדמין המשויך, לא טיקטים אחרים.
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const ip = getClientIp(req);
    const rl = checkRateLimit(`support-token-get:${ip}`, BOOKING_GET_RATE_LIMIT);
    if (!rl.allowed) return rateLimitResponse(rl);

    const { token } = await params;
    if (!TOKEN_RE.test(token)) {
      return NextResponse.json({ message: "הקישור אינו תקין" }, { status: 404 });
    }

    // findFirst (לא findUnique) כדי לסנן גם category — הגנת עומק: רק פניות
    // landing_lead נגישות דרך הקישור הציבורי, גם אם בטעות יוצמד טוקן לטיקט אחר.
    const ticket = await prisma.supportTicket.findFirst({
      where: { externalToken: token, category: "landing_lead" },
      select: {
        ticketNumber: true,
        externalName: true,
        status: true,
        responses: {
          orderBy: { createdAt: "asc" },
          select: { id: true, message: true, isAdmin: true, createdAt: true },
        },
      },
    });

    if (!ticket) {
      return NextResponse.json({ message: "השיחה לא נמצאה" }, { status: 404 });
    }

    // לא מחזירים את message המקורי — הוא מכיל בלוק פרטים (שם/מייל/טלפון/ארגון)
    // ואולי טקסט חופשי רגיש. למחזיק הטוקן חושפים רק את שרשור התגובות ואת השם.
    return NextResponse.json({
      conversation: {
        ticketNumber: ticket.ticketNumber,
        name: ticket.externalName,
        status: ticket.status,
        closed: ticket.status === "CLOSED",
        responses: ticket.responses.map((r) => ({
          id: r.id,
          message: r.message,
          isAdmin: r.isAdmin,
          createdAt: r.createdAt,
        })),
      },
    });
  } catch (error) {
    logger.error("[support-token] GET error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ message: "שגיאה בטעינת השיחה" }, { status: 500 });
  }
}

// POST — תגובת המתעניין. נכנסת כ-SupportResponse (authorId=null, isAdmin=false),
// מחזירה את הסטטוס ל-OPEN, ויוצרת התראה לאדמין (+ מייל best-effort).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const ip = getClientIp(req);
    const rl = checkRateLimit(`support-token-post:${ip}`, BOOKING_TOKEN_POST_RATE_LIMIT);
    if (!rl.allowed) return rateLimitResponse(rl);

    const { token } = await params;
    if (!TOKEN_RE.test(token)) {
      return NextResponse.json({ message: "הקישור אינו תקין" }, { status: 404 });
    }

    const parsed = await parseBody(req, ticketResponseSchema);
    if ("error" in parsed) return parsed.error;
    const { message } = parsed.data;

    const ticket = await prisma.supportTicket.findFirst({
      where: { externalToken: token, category: "landing_lead" },
      select: {
        id: true,
        ticketNumber: true,
        status: true,
        userId: true,
      },
    });

    if (!ticket) {
      return NextResponse.json({ message: "השיחה לא נמצאה" }, { status: 404 });
    }
    if (ticket.status === "CLOSED") {
      return NextResponse.json(
        { message: "השיחה נסגרה. ניתן לפתוח פנייה חדשה דרך טופס יצירת הקשר." },
        { status: 400 }
      );
    }

    // יצירת התגובה + החזרת הסטטוס ל-OPEN + התראת אדמין — אטומי.
    await prisma.$transaction(async (tx) => {
      await tx.supportResponse.create({
        data: {
          ticketId: ticket.id,
          authorId: null, // מתעניין אנונימי — אין משתמש רשום
          message,
          isAdmin: false,
        },
      });
      await tx.supportTicket.update({
        where: { id: ticket.id },
        data: { status: "OPEN", lastReplyAt: new Date() },
      });
      await tx.adminAlert.create({
        data: {
          type: "SUPPORT_TICKET",
          priority: "MEDIUM",
          title: `המתעניין הגיב לפנייה #${ticket.ticketNumber}`,
          message: message.substring(0, 200),
          userId: ticket.userId, // ה-ADMIN המשויך לפנייה
        },
      });
    });

    // מייל התראה לאדמין — best-effort (כשל/שבת לא מכשילים; התגובה כבר נשמרה).
    try {
      const adminEmail =
        (await getSiteSetting<string>("admin_business_email")) ||
        process.env.ADMIN_EMAIL ||
        "";
      if (adminEmail) {
        await sendEmail({
          to: adminEmail,
          subject: safeEmailSubject(`תגובה חדשה מהמתעניין — פנייה #${ticket.ticketNumber}`),
          html: `
            <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <h2 style="color: #333;">המתעניין הגיב לפנייה #${ticket.ticketNumber}</h2>
              <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 16px 0;">
                <p style="white-space: pre-wrap; margin: 0;">${escapeHtml(message)}</p>
              </div>
              <p style="color: #666; font-size: 13px;">לצפייה ולמענה: מסך "פניות ותמיכה" בניהול.</p>
            </div>
          `,
        });
      }
    } catch (mailErr) {
      logger.warn("[support-token] admin notify email failed (reply saved)", {
        ticketNumber: ticket.ticketNumber,
        error: mailErr instanceof Error ? mailErr.message : String(mailErr),
      });
    }

    return NextResponse.json({ success: true }, { status: 201 });
  } catch (error) {
    logger.error("[support-token] POST error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ message: "שגיאה בשליחת התגובה" }, { status: 500 });
  }
}
