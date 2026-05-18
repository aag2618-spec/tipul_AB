import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import prisma from "@/lib/prisma";
import { checkRateLimit, AUTH_RATE_LIMIT, rateLimitResponse } from "@/lib/rate-limit";
import { logger } from "@/lib/logger";
import { parseBodyWithErrorField } from "@/lib/validations/helpers";
import { verifyEmailSchema } from "@/lib/validations/auth";

export const dynamic = "force-dynamic";

// M9.1: ה-token שמופיע בקישור-המייל לא נשמר plain ב-DB; שמור רק sha256(token).
// אימות נעשה על ידי hash על הקלט והשוואה מול ה-hash.
// M10.8: ה-fallback ל-plain (H14 backward-compat) הוסר — אין משתמשים פעילים.
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// M9.1: POST — אימות token מועבר ב-body (לא querystring) כדי שלא ידלוף ב-URL/Referer.
// מקבל token מה-Client Component של verify-email/page.tsx שקרא אותו מ-#token=...
export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "unknown";
    const rateLimitResult = checkRateLimit(`verify-email:${ip}`, AUTH_RATE_LIMIT);
    if (!rateLimitResult.allowed) {
      return rateLimitResponse(rateLimitResult);
    }

    // zod אוכף — token alphanumeric, 16-128 תווים.
    const parsed = await parseBodyWithErrorField(request, verifyEmailSchema);
    if ("error" in parsed) return parsed.error;
    const { token } = parsed.data;

    const tokenHash = hashToken(token);
    const user = await prisma.user.findFirst({
      where: { emailVerificationToken: tokenHash },
      select: {
        id: true,
        emailVerified: true,
        emailVerificationExpires: true,
      },
    });

    if (!user) {
      return NextResponse.json({ state: "invalid" });
    }

    if (user.emailVerified) {
      return NextResponse.json({ state: "success" });
    }

    if (!user.emailVerificationExpires || user.emailVerificationExpires < new Date()) {
      return NextResponse.json({ state: "expired" });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: new Date(),
        emailVerificationToken: null,
        emailVerificationExpires: null,
      },
    });

    return NextResponse.json({ state: "success" });
  } catch (error) {
    logger.error("Email verification error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ state: "error" }, { status: 500 });
  }
}

// תאימות לאחור — קישורים ישנים שנשלחו במייל לפני שהדף החדש נוצר
// מפנים לדף החדש שמטפל באימות בצורה מעוצבת.
// M9.1: ה-redirect מעביר את ה-token ל-fragment (#token=) כדי שלא ידלוף ב-Referer
// מהדף החדש לעמודים שמשתמש מנווט אליהם אחר כך.
export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const target = new URL("/verify-email", request.nextUrl.origin);
  if (token) {
    target.hash = `token=${encodeURIComponent(token)}`;
  }
  return NextResponse.redirect(target);
}
