// API: פנייה בודדת — צד אדמין
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requirePermission } from "@/lib/api-auth";
import { withAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// GET — פנייה בודדת עם כל התגובות
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requirePermission("support.view_all");
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
    logger.error("Error fetching support ticket:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה בטעינת הפנייה" },
      { status: 500 }
    );
  }
}

// PATCH — עדכון סטטוס / הערות / עדיפות (עטוף ב-withAudit — שינוי סטטוס פנייה שווה רישום)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requirePermission("support.respond");
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;
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

    const ticket = await withAudit(
      { kind: "user", session },
      {
        action: status
          ? `support_status_${String(status).toLowerCase()}`
          : "support_update",
        targetType: "support_ticket",
        targetId: id,
        details: {
          statusChange: status || undefined,
          priorityChange: priority || undefined,
          notesChanged: adminNotes !== undefined,
        },
      },
      async (tx) =>
        tx.supportTicket.update({
          where: { id },
          data: updateData,
        })
    );

    return NextResponse.json({ ticket });
  } catch (error) {
    logger.error("Error updating support ticket:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה בעדכון הפנייה" },
      { status: 500 }
    );
  }
}

// POST — תגובת אדמין
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requirePermission("support.respond");
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;
    const { id } = await params;

    const body = await req.json();
    const { message } = body;

    if (!message?.trim()) {
      return NextResponse.json({ message: "יש לכתוב הודעה" }, { status: 400 });
    }

    const response = await withAudit(
      { kind: "user", session },
      {
        action: "support_admin_reply",
        targetType: "support_ticket",
        targetId: id,
        details: { messageLength: message.trim().length },
      },
      async (tx) => {
        const created = await tx.supportResponse.create({
          data: {
            ticketId: id,
            authorId: userId,
            message: message.trim(),
            isAdmin: true,
          },
        });
        // עדכון סטטוס ל"ממתין לתגובת משתמש" — אטומית עם יצירת התגובה
        await tx.supportTicket.update({
          where: { id },
          data: { status: "WAITING" },
        });
        return created;
      }
    );

    return NextResponse.json({ response }, { status: 201 });
  } catch (error) {
    logger.error("Error adding admin support reply:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה בהוספת התגובה" },
      { status: 500 }
    );
  }
}
