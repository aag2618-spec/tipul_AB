import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { addDays, addWeeks, startOfWeek } from "date-fns";
import { logger } from "@/lib/logger";
import { parseIsraelTime } from "@/lib/date-utils";
import { syncSessionToGoogleCalendar } from "@/lib/google-calendar-sync";

import { requireAuth } from "@/lib/api-auth";
import { loadScopeUser } from "@/lib/scope";

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

    // scope — recurring patterns מיועדים ליומן האישי של המטפל/ת. מזכירה/בעלים
    // לא מפעילים תבניות של מטפלים אחרים מכאן (הראוט מסנן לפי userId בדיוק).
    // הסיבה היחידה לטעון ScopeUser כאן: לגזור organizationId לרשומות פגישה
    // חדשות (preserves clinic FK).
    const scopeUser = await loadScopeUser(userId);

    const body = await request.json();
    const weeksAhead = body.weeksAhead || 4;
    const dryRun = body.dryRun === true;
    const resolutions: ConflictResolution[] = body.resolutions || [];
    const noStore = { "Cache-Control": "no-store, must-revalidate" };

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
        { status: 200, headers: noStore }
      );
    }

    // Get user's default session price from latest session
    const latestSession = await prisma.therapySession.findFirst({
      where: { therapistId: userId },
      orderBy: { createdAt: "desc" },
    });
    const defaultPrice = latestSession?.price || 300;

    let skipped = 0;
    const now = new Date();
    const weekStart = startOfWeek(now, { weekStartsOn: 0 }); // Sunday
    const preview: PreviewItem[] = [];
    const resolutionMap = new Map(resolutions.map(r => [r.key, r.action]));

    // Collect all DB operations before executing them in a transaction
    const cancelOps: { id: string }[] = [];
    const createOps: Parameters<typeof prisma.therapySession.create>[0]["data"][] = [];

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
            // Mark for cancellation (will execute in transaction)
            cancelOps.push({ id: conflict.id });
          } else if (resolution === "create") {
            // Create anyway (allow overlap) - fall through to creation
          } else {
            // Skip (default behavior)
            skipped++;
            continue;
          }
        }

        // Collect session for creation (will execute in transaction)
        createOps.push({
          therapistId: userId,
          clientId: pattern.clientId,
          startTime: sessionStart,
          endTime: sessionEnd,
          status: "SCHEDULED",
          type: "IN_PERSON",
          price: defaultPrice,
          isRecurring: true,
          organizationId: scopeUser.organizationId,
        });
      }
    }

    if (dryRun) {
      return NextResponse.json(
        {
          preview,
          conflicts: preview.filter(p => p.status === "conflict").length,
        },
        { headers: noStore }
      );
    }

    // Execute all operations in a single transaction (all-or-nothing)
    const results = await prisma.$transaction([
      ...cancelOps.map(op =>
        prisma.therapySession.update({
          where: { id: op.id },
          data: { status: "CANCELLED", cancelledAt: now, cancelledBy: "THERAPIST" },
        })
      ),
      ...createOps.map(op =>
        prisma.therapySession.create({ data: op, include: { client: { select: { name: true } } } })
      ),
    ]);

    // Google Calendar sync for created sessions (non-blocking)
    const createdSessions = results.slice(cancelOps.length);
    for (const session of createdSessions) {
      if (session.status === "SCHEDULED" && session.type !== "BREAK") {
        syncSessionToGoogleCalendar(userId, {
          id: session.id,
          clientName: (session as { client?: { name: string } }).client?.name || null,
          type: session.type,
          startTime: session.startTime,
          endTime: session.endTime,
          location: session.location,
          topic: null,
        }).catch((err) => logger.error("[GoogleCalendarSync] Recurring sync error:", { error: err instanceof Error ? err.message : String(err) }));
      }
    }

    const created = createOps.length;

    return NextResponse.json(
      {
        message: `${created} פגישות נוצרו`,
        created,
        skipped,
      },
      { headers: noStore }
    );
  } catch (error) {
    logger.error("Apply recurring patterns error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "אירעה שגיאה בהחלת התבניות" },
      { status: 500 }
    );
  }
}
