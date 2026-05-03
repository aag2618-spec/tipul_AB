// GET /api/auth/block-info
// מחזיר ל-/blocked page את סיבת החסימה של המשתמש המחובר.
//
// הנקודה כאן: ה-session.user במידלוור שלנו נושא רק isBlocked, לא את הסיבה.
// כדי שה-/blocked page יציג טקסט מותאם (חוב/ToS/ידני) — נחוץ קריאה טריה ל-DB
// במקום להוסיף עוד שדה ל-JWT (יוסיף עומס ומורכבות לכל בקשה).
//
// אבטחה: רק המשתמש המחובר רואה את הסיבה שלו. אין כאן זליגת מידע על משתמשים
// אחרים. החזרת 404 אם session לא קיים — אין מה לחפש.

import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json(
        { isBlocked: false, blockReason: null },
        { status: 401 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: {
        isBlocked: true,
        blockReason: true,
        blockedAt: true,
      },
    });

    if (!user) {
      return NextResponse.json(
        { isBlocked: false, blockReason: null },
        { status: 404 }
      );
    }

    return NextResponse.json({
      isBlocked: user.isBlocked,
      blockReason: user.blockReason,
      blockedAt: user.blockedAt,
    });
  } catch (error) {
    logger.error("[block-info] failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { isBlocked: false, blockReason: null },
      { status: 500 }
    );
  }
}
