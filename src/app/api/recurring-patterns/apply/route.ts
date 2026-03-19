import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { addDays, addWeeks, startOfWeek } from "date-fns";
import { logger } from "@/lib/logger";
import { parseIsraelTime } from "@/lib/date-utils";

import { requireAuth } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

interface ConflictResolution {
  key: string;
  action: "skip" | "replace" | "create";
}

interface PreviewItem {
  key: string;
  date: string;
  time: string;
  clientName: string;
  clientId: string;
  patternId: string;
  status: "ok" | "conflict";
  conflictWith?: {
    id: string;
    clientName: string;
    startTime: string;
    endTime: string;
  };
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const body = await request.json();
    const weeksAhead = body.weeksAhead || 4;
    const dryRun = body.dryRun === true;
    const resolutions: ConflictResolution[] = body.resolutions || [];

    // Get active recurring patterns with client names
    const patterns = await prisma.recurringPattern.findMany({
      where: {
        userId: userId,
        isActive: true,
      },
      include: {
        client: { select: { name: true } },
      },
    });

    if (patterns.length === 0) {
      return NextResponse.json(
        dryRun
          ? { preview: [], conflicts: 0 }
          : { message: "אין תבניות פעילות", created: 0 },
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
    let skipped = 0;
    const now = new Date();
    const weekStart = startOfWeek(now, { weekStartsOn: 0 }); // Sunday
    const preview: PreviewItem[] = [];
    const resolutionMap = new Map(resolutions.map(r => [r.key, r.action]));

    for (let week = 0; week < weeksAhead; week++) {
      const currentWeekStart = addWeeks(weekStart, week);

      for (const pattern of patterns) {
        // Calculate the date for this pattern in this week
        const sessionDate = addDays(currentWeekStart, pattern.dayOfWeek);

        // Skip if date is in the past
        if (sessionDate < now) continue;

        // Skip patterns without a client
        if (!pattern.clientId) continue;

        // Parse time using Israel timezone
        const dateStr = sessionDate.toISOString().split("T")[0];
        const sessionStart = parseIsraelTime(`${dateStr}T${pattern.time}`);

        // Calculate end time
        const sessionEnd = new Date(sessionStart.getTime() + pattern.duration * 60000);

        const itemKey = `${dateStr}_${pattern.time}_${pattern.id}`;

        // Check for any overlapping session
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
          include: {
            client: { select: { name: true } },
          },
        });

        // DRY RUN - just collect preview data
        if (dryRun) {
          preview.push({
            key: itemKey,
            date: dateStr,
            time: pattern.time,
            clientName: pattern.client?.name || "ללא מטופל",
            clientId: pattern.clientId,
            patternId: pattern.id,
            status: conflict ? "conflict" : "ok",
            conflictWith: conflict ? {
              id: conflict.id,
              clientName: conflict.client?.name || (conflict.type === "BREAK" ? "הפסקה" : "ללא מטופל"),
              startTime: conflict.startTime.toISOString(),
              endTime: conflict.endTime.toISOString(),
            } : undefined,
          });
          continue;
        }

        // ACTUAL RUN - check resolutions for conflicts
        if (conflict) {
          const resolution = resolutionMap.get(itemKey);

          if (resolution === "replace") {
            // Cancel existing session and create new one
            await prisma.therapySession.update({
              where: { id: conflict.id },
              data: { status: "CANCELLED", cancelledAt: now, cancelledBy: "THERAPIST" },
            });
          } else if (resolution === "create") {
            // Create anyway (allow overlap) - fall through to creation
          } else {
            // Skip (default behavior)
            skipped++;
            continue;
          }
        }

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

    if (dryRun) {
      return NextResponse.json({
        preview,
        conflicts: preview.filter(p => p.status === "conflict").length,
      });
    }

    return NextResponse.json({
      message: `${created} פגישות נוצרו`,
      created,
      skipped,
    });
  } catch (error) {
    logger.error("Apply recurring patterns error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה בהחלת התבניות" },
      { status: 500 }
    );
  }
}
