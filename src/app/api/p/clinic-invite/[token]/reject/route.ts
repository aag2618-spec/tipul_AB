import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { withAudit } from "@/lib/audit";
import { isExpired } from "@/lib/clinic-invitations";
import { getClientIp } from "@/lib/get-client-ip";

export const dynamic = "force-dynamic";

const REJECT_RATE_LIMIT = { maxRequests: 10, windowMs: 60 * 1000 };

// Token format: 32-byte base64url = 43 chars exactly. עקבי עם GET ו-accept.
const TOKEN_REGEX = /^[A-Za-z0-9_-]{43}$/;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    // B4: getClientIp — לוקח את ה-IP הימני (proxy מהימן) ולא את השמאלי
    // שניתן לזיוף ע"י כותרת XFF מותאמת מצד תוקף.
    const ip = getClientIp(request);
    const rl = checkRateLimit(`clinic-invite-reject:${ip}`, REJECT_RATE_LIMIT);
    if (!rl.allowed) return rateLimitResponse(rl);

    const { token } = await params;
    if (!TOKEN_REGEX.test(token ?? "")) {
      return NextResponse.json({ message: "טוקן לא תקין" }, { status: 400 });
    }

    const invitation = await prisma.clinicInvitation.findUnique({
      where: { token },
      select: {
        id: true,
        status: true,
        expiresAt: true,
        organizationId: true,
        email: true,
        createdById: true,
      },
    });
    if (!invitation) {
      return NextResponse.json({ message: "ההזמנה לא נמצאה" }, { status: 404 });
    }

    // B3: אם קיים user עם ה-email של ההזמנה, דרוש session תואמ/ת לפני reject.
    // המטרה: למנוע מתוקף שהשיג את ה-token (דליפת מייל/SMS) לדחות הזמנה לגיטימית
    // ולגרום לאיבוד גישה. למשתמש חדש אין למה לדרוש session — הוא לא קיים בDB.
    const existingUser = await prisma.user.findUnique({
      where: { email: invitation.email },
      select: { id: true },
    });
    if (existingUser) {
      const session = await getServerSession(authOptions);
      if (
        !session?.user?.email ||
        session.user.email.toLowerCase() !==
          invitation.email.toLowerCase()
      ) {
        return NextResponse.json(
          {
            message: "כדי לדחות, יש להתחבר תחילה לחשבון של הכתובת המוזמנת",
            requiresLogin: true,
          },
          { status: 401 }
        );
      }
    }
    if (invitation.status !== "PENDING") {
      return NextResponse.json(
        { message: "ההזמנה כבר טופלה" },
        { status: 409 }
      );
    }
    if (isExpired(invitation.expiresAt)) {
      return NextResponse.json(
        { message: "ההזמנה פגה" },
        { status: 410 }
      );
    }

    // updateMany עם guard `status='PENDING'` — race-safe על קבלה/ביטול במקביל.
    let rejected = false;
    await withAudit(
      {
        kind: "system",
        source: "SCRIPT",
        externalRef: `clinic-invite:${invitation.id}`,
      },
      {
        action: "invitation_rejected",
        targetType: "ClinicInvitation",
        targetId: invitation.id,
        details: {
          organizationId: invitation.organizationId,
          email: invitation.email,
        },
      },
      async (tx) => {
        const result = await tx.clinicInvitation.updateMany({
          where: { id: invitation.id, status: "PENDING" },
          data: { status: "REJECTED" },
        });
        rejected = result.count > 0;
        return result;
      }
    );

    if (!rejected) {
      // ההזמנה השתנתה ביניים (התקבלה/בוטלה/פגה במקביל).
      return NextResponse.json(
        { message: "ההזמנה כבר טופלה" },
        { status: 409 }
      );
    }

    // התראה לבעל/ת הקליניקה — fire-and-forget.
    void prisma.notification
      .create({
        data: {
          type: "CUSTOM",
          title: "הזמנה נדחתה",
          content: `המוזמן/ת (${invitation.email}) דחה/תה את ההזמנה לקליניקה.`,
          status: "PENDING",
          userId: invitation.createdById,
        },
      })
      .catch(() => {});

    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error("[p/clinic-invite/[token]/reject] error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה בדחיית ההזמנה" },
      { status: 500 }
    );
  }
}
