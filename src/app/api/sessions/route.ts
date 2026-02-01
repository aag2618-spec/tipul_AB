import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

// Helper function to parse datetime-local as Israel time
function parseIsraelTime(datetimeLocal: string): Date {
  // datetime-local format: "2024-01-15T08:00"
  // The input represents Israel time (UTC+2 or UTC+3)
  // We need to convert it to UTC for storage
  
  // Parse the datetime string and treat it as Israel time
  const [datePart, timePart] = datetimeLocal.split('T');
  const [year, month, day] = datePart.split('-').map(Number);
  const [hours, minutes] = timePart.split(':').map(Number);
  
  // Create a date string with explicit Israel timezone
  // Israel is UTC+2 in winter, UTC+3 in summer (DST)
  // Using a more reliable approach - create date and adjust
  const date = new Date(Date.UTC(year, month - 1, day, hours, minutes));
  
  // Israel Standard Time is UTC+2, Israel Daylight Time is UTC+3
  // Check if date is in DST (roughly March-October)
  const isDST = month >= 3 && month <= 10;
  const offsetHours = isDST ? 3 : 2;
  
  // Subtract the Israel offset to get UTC time
  date.setUTCHours(date.getUTCHours() - offsetHours);
  
  return date;
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

    // For BREAK type, we don't require a client
    if (type !== "BREAK" && (!clientId || !startTime || !endTime)) {
      return NextResponse.json(
        { message: "נא למלא את כל השדות הנדרשים" },
        { status: 400 }
      );
    }
    
    if (type === "BREAK" && (!startTime || !endTime)) {
      return NextResponse.json(
        { message: "נא למלא את שעות ההפסקה" },
        { status: 400 }
      );
    }

    // Verify client belongs to therapist (skip for BREAK)
    let clientDefaultPrice = 0;
    if (type !== "BREAK") {
      const client = await prisma.client.findFirst({
        where: { id: clientId, therapistId: session.user.id },
      });

      if (!client) {
        return NextResponse.json(
          { message: "מטופל לא נמצא" },
          { status: 404 }
        );
      }
      
      // Use client's default session price if no price provided
      clientDefaultPrice = Number(client.defaultSessionPrice || 0);
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
        clientId: type === "BREAK" ? null : clientId,
        startTime: parsedStartTime,
        endTime: parsedEndTime,
        type: type || "IN_PERSON",
        price: type === "BREAK" ? 0 : (price || clientDefaultPrice),
        location: location || null,
        notes: notes || null,
        isRecurring: isRecurring || false,
      },
      include: {
        client: {
          select: { id: true, name: true, email: true },
        },
      },
    });

    // Send confirmation email (skip for BREAK and if client has no email)
    if (type !== "BREAK" && therapySession.client?.email) {
      // Fire and forget - don't wait for email to send
      fetch(`${request.nextUrl.origin}/api/sessions/send-confirmation`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          cookie: request.headers.get("cookie") || "",
        },
        body: JSON.stringify({ sessionId: therapySession.id }),
      }).catch((err) => console.error("Failed to send confirmation:", err));
    }

    // Create a task to write summary after session (skip for BREAK)
    if (type !== "BREAK") {
      const client = await prisma.client.findUnique({
        where: { id: clientId },
      });
      
      if (client) {
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
      }
    }

    return NextResponse.json(therapySession, { status: 201 });
  } catch (error) {
    console.error("Create session error:", error);
    return NextResponse.json(
      { message: "אירעה שגיאה ביצירת הפגישה" },
      { status: 500 }
    );
  }
}













