import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

// Helper function to parse datetime-local as Israel time
function parseIsraelTime(datetimeLocal: string): Date {
  // datetime-local format: "2024-01-15T08:00"
  // We need to interpret this as Israel time (Asia/Jerusalem)
  // Israel is UTC+2 (winter) or UTC+3 (summer/DST)

  // Create a date object to check if DST is active
  const tempDate = new Date(datetimeLocal + "Z"); // Parse as UTC first

  // Check if this date is in Israel DST
  // Israel DST: Last Friday of March to last Sunday of October
  const month = tempDate.getUTCMonth();
  const isLikelyDST = month >= 2 && month <= 9; // March to October (rough estimate)

  // Israel offset: +02:00 (winter) or +03:00 (summer)
  const offsetHours = isLikelyDST ? 3 : 2;

  // Subtract the offset to convert Israel local time to UTC
  const utcDate = new Date(tempDate.getTime() - (offsetHours * 60 * 60 * 1000));

  return utcDate;
}

export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "לא מורשה" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const clientId = searchParams.get("clientId");
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const where: Record<string, unknown> = { therapistId: session.user.id };
    
    if (clientId) {
      where.clientId = clientId;
    }
    
    if (startDate && endDate) {
      where.startTime = {
        gte: new Date(startDate),
        lte: new Date(endDate),
      };
    }

    const sessions = await prisma.therapySession.findMany({
      where,
      orderBy: { startTime: "asc" },
      include: {
        client: {
          select: { id: true, name: true },
        },
        sessionNote: true,
        payment: true,
      },
    });

    return NextResponse.json(sessions);
  } catch (error) {
    console.error("Get sessions error:", error);
    return NextResponse.json(
      { message: "אירעה שגיאה בטעינת הפגישות" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "לא מורשה" }, { status: 401 });
    }

    const body = await request.json();
    const { clientId, startTime, endTime, type, price, location, notes, isRecurring } = body;

    if (!clientId || !startTime || !endTime) {
      return NextResponse.json(
        { message: "נא למלא את כל השדות הנדרשים" },
        { status: 400 }
      );
    }

    // Verify client belongs to therapist
    const client = await prisma.client.findFirst({
      where: { id: clientId, therapistId: session.user.id },
    });

    if (!client) {
      return NextResponse.json(
        { message: "מטופל לא נמצא" },
        { status: 404 }
      );
    }

    // Parse times using Israel timezone
    const parsedStartTime = parseIsraelTime(startTime);
    const parsedEndTime = parseIsraelTime(endTime);

    // Check for conflicts
    const conflict = await prisma.therapySession.findFirst({
      where: {
        therapistId: session.user.id,
        status: { not: "CANCELLED" },
        OR: [
          {
            AND: [
              { startTime: { lte: parsedStartTime } },
              { endTime: { gt: parsedStartTime } },
            ],
          },
          {
            AND: [
              { startTime: { lt: parsedEndTime } },
              { endTime: { gte: parsedEndTime } },
            ],
          },
          {
            AND: [
              { startTime: { gte: parsedStartTime } },
              { endTime: { lte: parsedEndTime } },
            ],
          },
        ],
      },
    });

    if (conflict) {
      return NextResponse.json(
        { message: "יש התנגשות עם פגישה קיימת" },
        { status: 400 }
      );
    }

    const therapySession = await prisma.therapySession.create({
      data: {
        therapistId: session.user.id,
        clientId,
        startTime: parsedStartTime,
        endTime: parsedEndTime,
        type: type || "IN_PERSON",
        price: price || 0,
        location: location || null,
        notes: notes || null,
        isRecurring: isRecurring || false,
      },
      include: {
        client: {
          select: { id: true, name: true },
        },
      },
    });

    // Create a task to write summary after session
    await prisma.task.create({
      data: {
        userId: session.user.id,
        type: "WRITE_SUMMARY",
        title: `כתוב סיכום לפגישה עם ${client.name}`,
        status: "PENDING",
        priority: "MEDIUM",
        dueDate: parsedEndTime,
        relatedEntityId: therapySession.id,
        relatedEntity: "TherapySession",
      },
    });

    return NextResponse.json(therapySession, { status: 201 });
  } catch (error) {
    console.error("Create session error:", error);
    return NextResponse.json(
      { message: "אירעה שגיאה ביצירת הפגישה" },
      { status: 500 }
    );
  }
}













