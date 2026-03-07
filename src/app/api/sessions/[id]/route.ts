import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

// Helper function to parse datetime-local as Israel time
function parseIsraelTime(datetimeLocal: string): Date {
  // If already an ISO string (with Z or offset), return as-is
  if (datetimeLocal.endsWith("Z") || /[+-]\d{2}:\d{2}$/.test(datetimeLocal)) {
    return new Date(datetimeLocal);
  }

  // datetime-local format: "2024-01-15T08:00" → interpret as Israel time
  const [datePart, timePart] = datetimeLocal.split("T");
  const testDate = new Date(`${datePart}T12:00:00Z`);
  const israelHour = parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Jerusalem",
      hour: "numeric",
      hour12: false,
    }).format(testDate)
  );
  const offsetHours = israelHour - 12;
  const offsetStr = `+${String(offsetHours).padStart(2, "0")}:00`;
  return new Date(`${datePart}T${timePart}:00${offsetStr}`);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "לא מורשה" }, { status: 401 });
    }

    const { id } = await params;

    const therapySession = await prisma.therapySession.findFirst({
      where: { id, therapistId: session.user.id },
      include: {
        client: true,
        sessionNote: true,
        sessionAnalysis: true,
        payment: true,
        recordings: {
          include: {
            transcription: {
              include: { analysis: true },
            },
          },
        },
      },
    });

    if (!therapySession) {
      return NextResponse.json({ message: "פגישה לא נמצאה" }, { status: 404 });
    }

    return NextResponse.json(therapySession);
  } catch (error) {
    console.error("Get session error:", error);
    return NextResponse.json(
      { message: "אירעה שגיאה בטעינת הפגישה" },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "לא מורשה" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { startTime, endTime, type, price, location, notes, status, createPayment, markAsPaid } = body;

    const existingSession = await prisma.therapySession.findFirst({
      where: { id, therapistId: session.user.id },
      include: {
        client: {
          select: {
            defaultSessionPrice: true,
          },
        },
      },
    });

    if (!existingSession) {
      return NextResponse.json({ message: "פגישה לא נמצאה" }, { status: 404 });
    }

    // If no price provided, use client's default price
    const finalPrice = price !== undefined 
      ? price 
      : (existingSession.client?.defaultSessionPrice 
          ? Number(existingSession.client.defaultSessionPrice) 
          : undefined);

    const therapySession = await prisma.therapySession.update({
      where: { id },
      data: {
        startTime: startTime ? parseIsraelTime(startTime) : undefined,
        endTime: endTime ? parseIsraelTime(endTime) : undefined,
        type: type || undefined,
        price: finalPrice,
        location: location !== undefined ? location : undefined,
        notes: notes !== undefined ? notes : undefined,
        status: status || undefined,
      },
      include: {
        client: true,
        sessionNote: true,
      },
    });

    // יצירת תשלום אם צריך (הושלם, או ביטול/אי הופעה עם בקשה לחיוב)
    const shouldCreatePayment = 
      (status === "COMPLETED" || therapySession.status === "COMPLETED") ||
      (createPayment && (status === "CANCELLED" || status === "NO_SHOW"));
    
    if (shouldCreatePayment && therapySession.price && therapySession.clientId) {
      // בדוק אם כבר קיים תשלום ממתין או שולם לפגישה זו
      const existingPayment = await prisma.payment.findFirst({
        where: {
          sessionId: therapySession.id,
          status: { in: ["PENDING", "PAID"] },
        },
      });
      if (!existingPayment) {
        await prisma.payment.create({
          data: {
            clientId: therapySession.clientId,
            sessionId: therapySession.id,
            amount: markAsPaid ? Number(therapySession.price) : 0,
            expectedAmount: Number(therapySession.price),
            method: "CASH",
            status: markAsPaid ? "PAID" : "PENDING",
            paymentType: markAsPaid ? "FULL" : "FULL",
            paidAt: markAsPaid ? new Date() : null,
            notes: null,
          },
        });
      }
    }
    
    // Fetch updated session with payment info
    const updatedSession = await prisma.therapySession.findUnique({
      where: { id: therapySession.id },
      include: {
        client: true,
        payment: true,
      },
    });
    
    return NextResponse.json(updatedSession);
  } catch (error) {
    console.error("Update session error:", error);
    return NextResponse.json(
      { message: "אירעה שגיאה בעדכון הפגישה" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "לא מורשה" }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();
    const { skipSummary } = body;

    const existingSession = await prisma.therapySession.findFirst({
      where: { id, therapistId: session.user.id },
    });

    if (!existingSession) {
      return NextResponse.json({ message: "פגישה לא נמצאה" }, { status: 404 });
    }

    const updatedSession = await prisma.therapySession.update({
      where: { id },
      data: {
        skipSummary: skipSummary !== undefined ? skipSummary : undefined,
      },
    });

    return NextResponse.json(updatedSession);
  } catch (error) {
    console.error("Patch session error:", error);
    return NextResponse.json(
      { message: "אירעה שגיאה בעדכון הפגישה" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ message: "לא מורשה" }, { status: 401 });
    }

    const { id } = await params;

    const existingSession = await prisma.therapySession.findFirst({
      where: { id, therapistId: session.user.id },
      include: { client: { select: { name: true } } },
    });

    if (!existingSession) {
      return NextResponse.json({ message: "פגישה לא נמצאה" }, { status: 404 });
    }

    const sessionDate = existingSession.startTime.toISOString().split("T")[0];
    const clientName = existingSession.client?.name || "";

    await prisma.therapySession.delete({ where: { id } });

    if (clientName) {
      try {
        await prisma.notification.updateMany({
          where: {
            userId: session.user.id,
            type: { in: ["BOOKING_REQUEST", "CANCELLATION_REQUEST", "SESSION_REMINDER"] },
            status: { in: ["PENDING", "SENT"] },
            AND: [
              { content: { contains: clientName } },
              { content: { contains: `[${sessionDate}]` } },
            ],
          },
          data: { status: "DISMISSED" },
        });
      } catch (e) {
        console.error("Failed to clean up notifications:", e);
      }
    }

    return NextResponse.json({ message: "הפגישה נמחקה בהצלחה" });
  } catch (error) {
    console.error("Delete session error:", error);
    return NextResponse.json(
      { message: "אירעה שגיאה במחיקת הפגישה" },
      { status: 500 }
    );
  }
}













