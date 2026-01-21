import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { addDays, addWeeks, startOfWeek, setHours, setMinutes } from "date-fns";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "לא מורשה" }, { status: 401 });
    }

    const body = await request.json();
    const weeksAhead = body.weeksAhead || 4;

    // Get active recurring patterns
    const patterns = await prisma.recurringPattern.findMany({
      where: {
        userId: session.user.id,
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
      where: { therapistId: session.user.id },
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

        // Parse time
        const [hours, minutes] = pattern.time.split(":").map(Number);
        let sessionStart = setHours(sessionDate, hours);
        sessionStart = setMinutes(sessionStart, minutes);

        // Calculate end time
        const sessionEnd = new Date(sessionStart.getTime() + pattern.duration * 60000);

        // Check if session already exists at this time
        const existing = await prisma.therapySession.findFirst({
          where: {
            therapistId: session.user.id,
            startTime: sessionStart,
          },
        });

        if (existing) continue;

        // Skip patterns without a client
        if (!pattern.clientId) continue;

        // Create the session
        await prisma.therapySession.create({
          data: {
            therapistId: session.user.id,
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
    console.error("Apply recurring patterns error:", error);
    return NextResponse.json(
      { message: "אירעה שגיאה בהחלת התבניות" },
      { status: 500 }
    );
  }
}


