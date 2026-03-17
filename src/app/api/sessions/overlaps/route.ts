import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

import { requireAuth } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const sessions = await prisma.therapySession.findMany({
      where: {
        therapistId: userId,
        status: { not: "CANCELLED" },
      },
      orderBy: { startTime: "asc" },
      include: {
        client: {
          select: { id: true, name: true },
        },
      },
    });

    const overlaps: {
      session1: { id: string; clientName: string | null; startTime: Date; endTime: Date };
      session2: { id: string; clientName: string | null; startTime: Date; endTime: Date };
    }[] = [];

    for (let i = 0; i < sessions.length; i++) {
      for (let j = i + 1; j < sessions.length; j++) {
        const a = sessions[i];
        const b = sessions[j];

        const aStart = new Date(a.startTime).getTime();
        const aEnd = new Date(a.endTime).getTime();
        const bStart = new Date(b.startTime).getTime();
        const bEnd = new Date(b.endTime).getTime();

        if (aStart < bEnd && bStart < aEnd) {
          overlaps.push({
            session1: {
              id: a.id,
              clientName: a.client?.name || (a.type === "BREAK" ? "הפסקה" : "ללא מטופל"),
              startTime: a.startTime,
              endTime: a.endTime,
            },
            session2: {
              id: b.id,
              clientName: b.client?.name || (b.type === "BREAK" ? "הפסקה" : "ללא מטופל"),
              startTime: b.startTime,
              endTime: b.endTime,
            },
          });
        }
      }
    }

    return NextResponse.json({ overlaps, count: overlaps.length });
  } catch (error) {
    logger.error("Find overlaps error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה בחיפוש חפיפות" },
      { status: 500 }
    );
  }
}
