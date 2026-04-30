import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requires2FA } from "@/lib/two-factor";
import { checkRateLimit, AUTH_RATE_LIMIT } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

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
    const ipHeader = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "";
    const ip = ipHeader.split(",")[0]?.trim() || "unknown";
    const rl = checkRateLimit(`2fa:check:${ip}`, AUTH_RATE_LIMIT);
    if (!rl.allowed) {
      await timingMask;
      return NextResponse.json({ required: false });
    }

    const body = await req.json().catch(() => ({}));
    const email = typeof body?.email === "string" ? body.email.trim() : "";

    if (!email) {
      await timingMask;
      return NextResponse.json({ required: false });
    }

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
