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
        status: { notIn: ["CANCELLED", "COMPLETED", "NO_SHOW"] },
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

    // Sessions are sorted by startTime ASC, so we only need to check
    // each session against the ones that follow while they still overlap
    for (let i = 0; i < sessions.length; i++) {
      const a = sessions[i];
      const aEnd = new Date(a.endTime).getTime();

      for (let j = i + 1; j < sessions.length; j++) {
        const b = sessions[j];
        const bStart = new Date(b.startTime).getTime();

        // Since sorted by startTime, if b starts after a ends, no more overlaps for a
        if (bStart >= aEnd) break;

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

    return NextResponse.json({ overlaps, count: overlaps.length });
  } catch (error) {
    logger.error("Find overlaps error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה בחיפוש חפיפות" },
      { status: 500 }
    );
  }
}
