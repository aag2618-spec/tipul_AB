// API: תגובות לפנייה
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

// POST — תגובה חדשה
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;
    const { id } = await params;

    const body = await req.json();
    const { message } = body;

    if (!message?.trim()) {
      return NextResponse.json({ message: "יש לכתוב הודעה" }, { status: 400 });
    }

    // וידוא שהפנייה שייכת למשתמש
    const ticket = await prisma.supportTicket.findFirst({
      where: { id, userId },
    });

    if (!ticket) {
      return NextResponse.json({ message: "פנייה לא נמצאה" }, { status: 404 });
    }

    // אם הפנייה סגורה — לא ניתן להגיב
    if (ticket.status === "CLOSED") {
      return NextResponse.json({ message: "לא ניתן להגיב לפנייה סגורה" }, { status: 400 });
    }

    const response = await prisma.supportResponse.create({
      data: {
        ticketId: id,
        authorId: userId,
        message: message.trim(),
        isAdmin: false,
      },
    });

    // אם הסטטוס "ממתין" — להחזיר ל"פתוח" כי המשתמש הגיב
    if (ticket.status === "WAITING") {
      await prisma.supportTicket.update({
        where: { id },
        data: { status: "OPEN" },
      });
    }

    return NextResponse.json({ response }, { status: 201 });
  } catch (error) {
    console.error("שגיאה בהוספת תגובה:", error);
    return NextResponse.json({ message: "שגיאה" }, { status: 500 });
  }
}
