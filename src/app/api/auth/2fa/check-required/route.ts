import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requires2FA } from "@/lib/two-factor";
import { checkRateLimit, AUTH_RATE_LIMIT } from "@/lib/rate-limit";
import { twoFactorCheckRequiredSchema } from "@/lib/validations/auth";
import { getClientIp } from "@/lib/get-client-ip";

export const dynamic = "force-dynamic";

// H12: לא משתמשים ב-parseBody כאן — endpoint זה צריך להשיב אחיד
// (`{ required: false }` תמיד) כדי למנוע enumeration. החזרת 400 על input
// לא תקין הייתה חושפת לתוקף "האימייל לא תקין" vs "האימייל קיים אבל אינו staff",
// מה שמאפשר ניחוש דרך timing/status. הולידציה כאן soft — אם schema נכשלת,
// פשוט מחזירים { required: false } עם ה-timing mask הרגיל.

// בודק אם email נתון דורש 2FA. תמיד מחזיר { required: boolean } —
// לא חושף enumeration (מחזיר false גם למשתמש שלא קיים, וגם מוסיף
// השהיה אקראית כדי למנוע timing-based enumeration).
//
// Rate-limited לפי IP כדי שלא יוכלו לסקור אילו משתמשים הם staff.
//
// timing: ההשהיה והתשובה זהות בכל הענפים (rate-limited / לא קיים / נדרש /
// לא נדרש), כדי שתוקף לא יוכל להבחין בין מצבים על פי זמן או גודל-תוכן.
export async function POST(req: NextRequest) {
  // השהיה אקראית קבועה לכל הבקשות — מטשטשת timing-based enumeration ומסכה
  // גם את ההבחנה בין rate-limited לבין not-found לבין user-found.
  // נמדדת לפני כל פעולה אחרת כדי להבטיח אחידות מינימלית.
  const timingMask = new Promise<void>((r) =>
    setTimeout(r, 100 + Math.random() * 150)
  );

  try {
    // H10 (סבב אבטחה 14): rightmost XFF.
    const ip = getClientIp(req);
    const rl = checkRateLimit(`2fa:check:${ip}`, AUTH_RATE_LIMIT);
    if (!rl.allowed) {
      await timingMask;
      return NextResponse.json({ required: false });
    }

    const body = await req.json().catch(() => ({}));
    // soft validation דרך zod — אם נכשל, אותו timing-mask + תשובה אחידה.
    const result = twoFactorCheckRequiredSchema.safeParse(body);
    if (!result.success) {
      await timingMask;
      return NextResponse.json({ required: false });
    }
    const { email } = result.data;

    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      select: { role: true, twoFactorEnabled: true, lastActivityAt: true },
    });

    await timingMask;

    if (!user) {
      return NextResponse.json({ required: false });
    }

    return NextResponse.json({ required: requires2FA(user) });
  } catch {
    await timingMask;
    return NextResponse.json({ required: false });
  }
}
