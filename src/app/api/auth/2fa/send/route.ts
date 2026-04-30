import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { sendCode } from "@/lib/two-factor";
import { checkRateLimit, AUTH_RATE_LIMIT } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = typeof body?.email === "string" ? body.email.trim() : "";

    if (!email) {
      return NextResponse.json({ error: "מייל לא תקף" }, { status: 400 });
    }

    // Rate limit כפול: לפי IP (מונע ספאם רחב) ולפי email (מונע ספאם ממוקד).
    // הגבלת email נוקשה יותר — 3 בקשות לכל 15 דקות — מונע flooding של inbox/SMS
    // של משתמש לגיטימי + מונע burning של credit ל-SMS.
    const ipHeader = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "";
    const ip = ipHeader.split(",")[0]?.trim() || "unknown";
    const emailLower = email.toLowerCase();
    const ipResult = checkRateLimit(`2fa:send:ip:${ip}`, AUTH_RATE_LIMIT);
    const emailResult = checkRateLimit(`2fa:send:email:${emailLower}`, {
      maxRequests: 3,
      windowMs: 15 * 60 * 1000,
    });
    if (!ipResult.allowed || !emailResult.allowed) {
      return NextResponse.json(
        { error: "יותר מדי בקשות. אנא נסה שוב בעוד 15 דקות." },
        { status: 429 }
      );
    }

    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      select: { id: true, email: true, phone: true, name: true },
    });

    // לא לחשוף enumeration — תמיד "הצלחה" כלפי הלקוח, גם אם המשתמש לא קיים.
    if (!user) {
      return NextResponse.json({ success: true });
    }

    const result = await sendCode(user);
    if (!result.success) {
      // שבת/חג — מחזירים את ההודעה הספציפית. שאר השגיאות — הודעה כללית.
      return NextResponse.json(
        { error: result.error, shabbatBlocked: result.shabbatBlocked === true },
        { status: result.shabbatBlocked ? 503 : 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error("2FA send route error", { err: String(err) });
    return NextResponse.json({ error: "שגיאה כללית" }, { status: 500 });
  }
}
