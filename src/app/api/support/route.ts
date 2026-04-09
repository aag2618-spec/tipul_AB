// API: פניות תמיכה — צד משתמש
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

// GET — הפניות שלי
export async function GET() {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const tickets = await prisma.supportTicket.findMany({
      where: { userId },
      include: {
        responses: {
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            message: true,
            isAdmin: true,
            createdAt: true,
            author: {
              select: { name: true },
            },
          },
        },
        _count: {
          select: { responses: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ tickets });
  } catch (error) {
    console.error("שגיאה בטעינת פניות:", error);
    return NextResponse.json({ message: "שגיאה בטעינת פניות" }, { status: 500 });
  }
}

// POST — פנייה חדשה
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const body = await req.json();
    const { subject, message, category } = body;

    if (!subject?.trim() || !message?.trim()) {
      return NextResponse.json({ message: "יש למלא נושא והודעה" }, { status: 400 });
    }

    // הקצאת מספר פנייה אוטומטי
    const ticket = await prisma.$transaction(async (tx) => {
      const maxResult = await tx.supportTicket.aggregate({ _max: { ticketNumber: true } });
      const nextNumber = (maxResult._max.ticketNumber ?? 5000) + 1;

      const newTicket = await tx.supportTicket.create({
        data: {
          ticketNumber: nextNumber,
          userId,
          subject: subject.trim(),
          message: message.trim(),
          category: category || "general",
        },
      });

      // יצירת התראה אוטומטית לאדמין
      await tx.adminAlert.create({
        data: {
          type: "SUPPORT_TICKET",
          priority: "MEDIUM",
          title: `פנייה חדשה #${nextNumber}: ${subject.trim()}`,
          message: message.trim().substring(0, 200),
          userId,
        },
      });

      return newTicket;
    });

    return NextResponse.json({ ticket }, { status: 201 });
  } catch (error) {
    console.error("שגיאה ביצירת פנייה:", error);
    return NextResponse.json({ message: "שגיאה ביצירת פנייה" }, { status: 500 });
  }
}
