import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { addDays, addWeeks, startOfWeek } from "date-fns";
import { logger } from "@/lib/logger";
import { parseIsraelTime } from "@/lib/date-utils";

import { requireAuth } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const body = await request.json();
    const weeksAhead = body.weeksAhead || 4;

    // Get active recurring patterns
    const patterns = await prisma.recurringPattern.findMany({
      where: {
        userId: userId,
        isActive: true,
      },
    });

    if (patterns.length === 0) {
      return NextResponse.json(
        { message: "אין תבניות פעילות", created: 0 },
        { status: 200 }
      );
    }

    // Get user's default session price from latest session
    const latestSession = await prisma.therapySession.findFirst({
      where: { therapistId: userId },
      orderBy: { createdAt: "desc" },
    });
    const defaultPrice = latestSession?.price || 300;

    let created = 0;
    const now = new Date();
    const weekStart = startOfWeek(now, { weekStartsOn: 0 }); // Sunday

    for (let week = 0; week < weeksAhead; week++) {
      const currentWeekStart = addWeeks(weekStart, week);

      for (const pattern of patterns) {
        // Calculate the date for this pattern in this week
        const sessionDate = addDays(currentWeekStart, pattern.dayOfWeek);
        
        // Skip if date is in the past
        if (sessionDate < now) continue;

        // Parse time using Israel timezone
        const dateStr = sessionDate.toISOString().split("T")[0];
        const sessionStart = parseIsraelTime(`${dateStr}T${pattern.time}`);

        // Calculate end time
        const sessionEnd = new Date(sessionStart.getTime() + pattern.duration * 60000);

        // Check for any overlapping session (not just exact start time match)
        const conflict = await prisma.therapySession.findFirst({
          where: {
            therapistId: userId,
            status: { not: "CANCELLED" },
            OR: [
              {
                AND: [
                  { startTime: { lte: sessionStart } },
                  { endTime: { gt: sessionStart } },
                ],
              },
              {
                AND: [
                  { startTime: { lt: sessionEnd } },
                  { endTime: { gte: sessionEnd } },
                ],
              },
              {
                AND: [
                  { startTime: { gte: sessionStart } },
                  { endTime: { lte: sessionEnd } },
                ],
              },
            ],
          },
        });

        if (conflict) continue;

        // Skip patterns without a client
        if (!pattern.clientId) continue;

        // Create the session
        await prisma.therapySession.create({
          data: {
            therapistId: userId,
            clientId: pattern.clientId,
            startTime: sessionStart,
            endTime: sessionEnd,
            status: "SCHEDULED",
            type: "IN_PERSON",
            price: defaultPrice,
            isRecurring: true,
          },
        });

        created++;
      }
    }

    return NextResponse.json({
      message: `${created} פגישות נוצרו`,
      created,
    });
  } catch (error) {
    logger.error("Apply recurring patterns error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה בהחלת התבניות" },
      { status: 500 }
    );
  }
}


