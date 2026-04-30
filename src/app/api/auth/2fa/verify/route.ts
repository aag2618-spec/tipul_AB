import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyCode } from "@/lib/two-factor";
import { checkRateLimit, LOGIN_EMAIL_RATE_LIMIT, AUTH_RATE_LIMIT } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const email = typeof body?.email === "string" ? body.email.trim() : "";
    const code = typeof body?.code === "string" ? body.code.trim() : "";

    if (!email || !code) {
      return NextResponse.json({ error: "פרמטרים לא תקפים" }, { status: 400 });
    }

    // Rate limit כפול: email + IP. מונע גם brute-force ממוקד (לפי email),
    // וגם distributed brute-force (לפי IP).
    const emailLower = email.toLowerCase();
    const ipHeader = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "";
    const ip = ipHeader.split(",")[0]?.trim() || "unknown";
    const emailRl = checkRateLimit(`2fa:verify:email:${emailLower}`, LOGIN_EMAIL_RATE_LIMIT);
    const ipRl = checkRateLimit(`2fa:verify:ip:${ip}`, AUTH_RATE_LIMIT);
    if (!emailRl.allowed || !ipRl.allowed) {
      return NextResponse.json(
        { error: "יותר מדי ניסיונות. אנא נסה שוב בעוד מספר דקות." },
        { status: 429 }
      );
    }

    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      select: { id: true },
    });

    if (!user) {
      // השהיה מלאכותית כדי לדמות בדיקת קוד — מונע timing-based enumeration.
      await new Promise((r) => setTimeout(r, 200 + Math.random() * 300));
      return NextResponse.json({ error: "קוד שגוי" }, { status: 400 });
    }

    const result = await verifyCode(user.id, code);
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    logger.error("2FA verify route error", { err: String(err) });
    return NextResponse.json({ error: "שגיאה כללית" }, { status: 500 });
  }
}
