import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { withAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// public endpoint — אין auth. הטוקן עצמו הוא ה-secret (~190 ביטים אנטרופיה).
// rate-limit נשען על Render-edge (במידת הצורך נוסיף בעתיד).

type ClientChoice = "STAY_WITH_CLINIC" | "FOLLOW_THERAPIST";

// GET — טוען מצב הבחירה לפי token
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    if (!token || typeof token !== "string" || token.length < 16) {
      return NextResponse.json({ message: "קישור לא תקין" }, { status: 400 });
    }

    const choice = await prisma.clientDepartureChoice.findUnique({
      where: { decisionToken: token },
      select: {
        id: true,
        choice: true,
        decidedAt: true,
        client: {
          select: { id: true, firstName: true, lastName: true },
        },
        departure: {
          select: {
            id: true,
            status: true,
            decisionDeadline: true,
            organization: { select: { name: true } },
            departingTherapist: { select: { name: true } },
          },
        },
      },
    });

    if (!choice) {
      return NextResponse.json(
        { message: "הקישור אינו תקין או שפג תוקפו" },
        { status: 404 }
      );
    }

    const isExpired =
      new Date(choice.departure.decisionDeadline).getTime() < Date.now();
    const isClosed = choice.departure.status !== "PENDING";

    return NextResponse.json({
      clientFirstName: choice.client.firstName,
      organizationName: choice.departure.organization.name,
      therapistName: choice.departure.departingTherapist.name,
      decisionDeadline: choice.departure.decisionDeadline.toISOString(),
      currentChoice: choice.choice,
      decidedAt: choice.decidedAt ? choice.decidedAt.toISOString() : null,
      isExpired,
      isClosed,
      // לא חושפים: id של הבחירה, id של המטופל, id של ה-departure.
    });
  } catch (error) {
    logger.error("[p/departure-choice GET] error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ message: "שגיאה בטעינה" }, { status: 500 });
  }
}

// POST — שמירת בחירה (atomic: מנצח רק העדכון הראשון)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    if (!token || typeof token !== "string" || token.length < 16) {
      return NextResponse.json({ message: "קישור לא תקין" }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const choice = body?.choice as ClientChoice | undefined;

    if (choice !== "STAY_WITH_CLINIC" && choice !== "FOLLOW_THERAPIST") {
      return NextResponse.json(
        { message: "יש לבחור באחת האפשרויות" },
        { status: 400 }
      );
    }

    const existing = await prisma.clientDepartureChoice.findUnique({
      where: { decisionToken: token },
      select: {
        id: true,
        decidedAt: true,
        choice: true,
        departure: {
          select: { status: true, decisionDeadline: true },
        },
      },
    });

    if (!existing) {
      return NextResponse.json(
        { message: "הקישור אינו תקין או שפג תוקפו" },
        { status: 404 }
      );
    }

    if (existing.departure.status !== "PENDING") {
      return NextResponse.json(
        { message: "תהליך העזיבה הסתיים. לא ניתן לעדכן בחירה." },
        { status: 400 }
      );
    }

    if (new Date(existing.departure.decisionDeadline).getTime() < Date.now()) {
      return NextResponse.json(
        { message: "המועד לבחירה הסתיים. הבחירה תהיה ברירת המחדל (להישאר בקליניקה)." },
        { status: 400 }
      );
    }

    if (existing.decidedAt) {
      return NextResponse.json(
        {
          message: `כבר ביצעת בחירה (${existing.choice === "FOLLOW_THERAPIST" ? "מעבר עם המטפל/ת" : "להישאר בקליניקה"}). לשינוי, נא לפנות לקליניקה.`,
        },
        { status: 400 }
      );
    }

    // נסה לקבל IP מה-headers (Render/Vercel/Nginx)
    const xff = request.headers.get("x-forwarded-for");
    const realIp = request.headers.get("x-real-ip");
    const ip = xff?.split(",")[0]?.trim() || realIp || null;

    // עדכון אטומי: רק אם decidedAt עדיין null. שתי בקשות מקבילות
    // ייכשלו השנייה עם updateMany count=0 ולא ידרסו.
    const result = await withAudit(
      {
        kind: "system",
        source: "SCRIPT",
        externalRef: `public-departure-choice:${token.slice(0, 8)}`,
      },
      {
        action: "client_departure_choice_recorded",
        targetType: "ClientDepartureChoice",
        targetId: existing.id,
        details: { choice, ip, tokenPrefix: token.slice(0, 8) },
      },
      async (tx) => {
        const updated = await tx.clientDepartureChoice.updateMany({
          where: { id: existing.id, decidedAt: null },
          data: {
            choice,
            decidedAt: new Date(),
            ipAddress: ip,
          },
        });
        return { updatedCount: updated.count };
      }
    );

    if (result.updatedCount === 0) {
      return NextResponse.json(
        { message: "הבחירה כבר נרשמה. לשינוי, יש לפנות לקליניקה." },
        { status: 409 }
      );
    }

    logger.info("[p/departure-choice POST] choice recorded", {
      tokenPrefix: token.slice(0, 6),
      choice,
    });

    return NextResponse.json({ success: true, choice });
  } catch (error) {
    logger.error("[p/departure-choice POST] error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ message: "שגיאה בשמירה" }, { status: 500 });
  }
}
