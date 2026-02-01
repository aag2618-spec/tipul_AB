import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

// Helper function to parse datetime-local as Israel time
function parseIsraelTime(datetimeLocal: string): Date {
  // datetime-local format: "2024-01-15T08:00"
  // We need to interpret this as Israel time (Asia/Jerusalem)

  const tempDate = new Date(datetimeLocal + "Z"); // Parse as UTC first

  // Check if this date is in Israel DST (rough estimate)
  const month = tempDate.getUTCMonth();
  const isLikelyDST = month >= 2 && month <= 9; // March to October

  // Israel offset: +02:00 (winter) or +03:00 (summer)
  const offsetHours = isLikelyDST ? 3 : 2;

  // Subtract the offset to convert Israel local time to UTC
  const utcDate = new Date(tempDate.getTime() - (offsetHours * 60 * 60 * 1000));

  return utcDate;
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
    });

    if (!existingSession) {
      return NextResponse.json({ message: "פגישה לא נמצאה" }, { status: 404 });
    }

    await prisma.therapySession.delete({ where: { id } });

    return NextResponse.json({ message: "הפגישה נמחקה בהצלחה" });
  } catch (error) {
    console.error("Delete session error:", error);
    return NextResponse.json(
      { message: "אירעה שגיאה במחיקת הפגישה" },
      { status: 500 }
    );
  }
}













