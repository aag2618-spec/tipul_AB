import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { sendCode } from "@/lib/two-factor";
import { checkRateLimit, AUTH_RATE_LIMIT } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { parseBodyWithErrorField } from "@/lib/validations/helpers";
import { twoFactorSendSchema } from "@/lib/validations/auth";
import { getClientIp } from "@/lib/get-client-ip";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    // H12: zod מוודא email תקין + cap. email מנורמל (trim+lowercase) במוצא.
    const parsed = await parseBodyWithErrorField(req, twoFactorSendSchema);
    if ("error" in parsed) return parsed.error;
    const { email } = parsed.data;

    // Rate limit כפול: לפי IP (מונע ספאם רחב) ולפי email (מונע ספאם ממוקד).
    // הגבלת email נוקשה יותר — 3 בקשות לכל 15 דקות — מונע flooding של inbox/SMS
    // של משתמש לגיטימי + מונע burning של credit ל-SMS.
    // H10 (סבב אבטחה 14): rightmost XFF — לא leftmost שניתן לזייף.
    const ip = getClientIp(req);
    const emailLower = email; // כבר trim+lowercase מ-zod
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
      select: {
        id: true, email: true, phone: true, name: true,
        twoFactorMethod: true,
      },
    });

    // לא לחשוף enumeration — תמיד "הצלחה" כלפי הלקוח, גם אם המשתמש לא קיים.
    if (!user) {
      return NextResponse.json({ success: true });
    }

    // H4: משתמש עם TOTP לא צריך קוד שנשלח — האפליקציה (Authenticator) מייצרת
    // את הקוד מקומית. הflow ב-frontend מוביל ל-/auth/2fa-verify עם input של 6
    // ספרות, ולא צריך להזמין send.
    if (user.twoFactorMethod === "TOTP") {
      return NextResponse.json({ success: true, method: "TOTP" });
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
