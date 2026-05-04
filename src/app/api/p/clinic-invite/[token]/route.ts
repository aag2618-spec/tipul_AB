import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import prisma from "@/lib/prisma";
import { authOptions } from "@/lib/auth";
import { logger } from "@/lib/logger";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { effectiveStatus, maskEmail } from "@/lib/clinic-invitations";

export const dynamic = "force-dynamic";

// 60 בקשות לדקה לכל IP — מגן על endpoint ציבורי.
const PUBLIC_GET_RATE_LIMIT = { maxRequests: 60, windowMs: 60 * 1000 };

// Token format: 32-byte base64url = 43 chars exactly. הצרה לרגקס ספציפי
// מקטינה DB lookups על בקשות probing (~99% ייעצרו כאן).
const TOKEN_REGEX = /^[A-Za-z0-9_-]{43}$/;

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const ip =
      request.headers.get("x-forwarded-for") ||
      request.headers.get("x-real-ip") ||
      "unknown";
    const rl = checkRateLimit(`clinic-invite-get:${ip}`, PUBLIC_GET_RATE_LIMIT);
    if (!rl.allowed) return rateLimitResponse(rl);

    const { token } = await params;
    if (!TOKEN_REGEX.test(token ?? "")) {
      return NextResponse.json({ message: "טוקן לא תקין" }, { status: 400 });
    }

    const invitation = await prisma.clinicInvitation.findUnique({
      where: { token },
      select: {
        email: true,
        intendedName: true,
        clinicRole: true,
        billingPaidByClinic: true,
        status: true,
        expiresAt: true,
        smsOtpHash: true,
        organization: { select: { name: true } },
      },
    });
    if (!invitation) {
      return NextResponse.json({ message: "ההזמנה לא נמצאה" }, { status: 404 });
    }

    const status = effectiveStatus(invitation.status, invitation.expiresAt);
    const isExpired = status === "EXPIRED";

    // userExists חושף קיום חשבון לכל מי שמחזיק את הקישור — סיכון enumeration.
    // נחשף רק אם המבקש מחובר באותו email (כלומר המוזמן/ת עצמו/ה),
    // שיכול/ה ממילא להבין מהדף "אני יודע/ת שיש לי חשבון".
    const session = await getServerSession(authOptions);
    const sessionEmail = session?.user?.email?.toLowerCase() ?? null;
    const viewerIsInvitee =
      !!sessionEmail && sessionEmail === invitation.email;

    return NextResponse.json({
      organizationName: invitation.organization.name,
      clinicRole: invitation.clinicRole,
      intendedName: invitation.intendedName,
      emailMasked: maskEmail(invitation.email),
      billingPaidByClinic: invitation.billingPaidByClinic,
      expiresAt: invitation.expiresAt.toISOString(),
      isExpired,
      status,
      otpRequired: !!invitation.smsOtpHash,
      viewerIsInvitee,
    });
  } catch (error) {
    logger.error("[p/clinic-invite/[token]] GET error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה בטעינת ההזמנה" },
      { status: 500 }
    );
  }
}
