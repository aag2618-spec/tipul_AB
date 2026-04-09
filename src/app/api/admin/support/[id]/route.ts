// API: פנייה בודדת — צד אדמין
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAdmin } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

// GET — פנייה בודדת עם כל התגובות
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin();
    if ("error" in auth) return auth.error;
    const { id } = await params;

    const ticket = await prisma.supportTicket.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
            userNumber: true,
            aiTier: true,
            subscriptionStatus: true,
          },
        },
        responses: {
          orderBy: { createdAt: "asc" },
          include: {
            author: {
              select: { name: true, role: true },
            },
          },
        },
      },
    });

    if (!ticket) {
      return NextResponse.json({ message: "פנייה לא נמצאה" }, { status: 404 });
    }

    return NextResponse.json({ ticket });
  } catch (error) {
    console.error("שגיאה בטעינת פנייה:", error);
    return NextResponse.json({ message: "שגיאה" }, { status: 500 });
  }
}

// PATCH — עדכון סטטוס / הערות / עדיפות
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin();
    if ("error" in auth) return auth.error;
    const { userId } = auth;
    const { id } = await params;

    const body = await req.json();
    const { status, adminNotes, priority } = body;

    const updateData: Record<string, unknown> = {};

    if (status) {
      updateData.status = status;
      if (status === "RESOLVED" || status === "CLOSED") {
        updateData.resolvedAt = new Date();
        updateData.resolvedBy = userId;
      }
    }
    if (adminNotes !== undefined) updateData.adminNotes = adminNotes;
    if (priority) updateData.priority = priority;

    const ticket = await prisma.supportTicket.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ ticket });
  } catch (error) {
    console.error("שגיאה בעדכון פנייה:", error);
    return NextResponse.json({ message: "שגיאה" }, { status: 500 });
  }
}

// POST — תגובת אדמין
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAdmin();
    if ("error" in auth) return auth.error;
    const { userId } = auth;
    const { id } = await params;

    const body = await req.json();
    const { message } = body;

    if (!message?.trim()) {
      return NextResponse.json({ message: "יש לכתוב הודעה" }, { status: 400 });
    }

    const response = await prisma.supportResponse.create({
      data: {
        ticketId: id,
        authorId: userId,
        message: message.trim(),
        isAdmin: true,
      },
    });

    // עדכון סטטוס ל"ממתין לתגובת משתמש" אם היה פתוח
    await prisma.supportTicket.update({
      where: { id },
      data: {
        status: "WAITING",
      },
    });

    return NextResponse.json({ response }, { status: 201 });
  } catch (error) {
    console.error("שגיאה בהוספת תגובת אדמין:", error);
    return NextResponse.json({ message: "שגיאה" }, { status: 500 });
  }
}
