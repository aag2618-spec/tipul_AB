// API: פניות תמיכה — צד משתמש
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import {
  parseAttachmentsFromFormData,
  saveAttachments,
  validateAttachments,
} from "@/lib/support-attachments";

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
            attachments: true,
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
    logger.error("[Support] Error fetching tickets:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ message: "שגיאה בטעינת פניות" }, { status: 500 });
  }
}

// POST — פנייה חדשה (תומך גם ב-JSON וגם ב-multipart/form-data עם קבצים)
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const contentType = req.headers.get("content-type") || "";
    const isMultipart = contentType.includes("multipart/form-data");

    let subject = "";
    let message = "";
    let category = "general";
    let files: File[] = [];

    if (isMultipart) {
      const formData = await req.formData();
      subject = String(formData.get("subject") || "");
      message = String(formData.get("message") || "");
      category = String(formData.get("category") || "general");
      files = parseAttachmentsFromFormData(formData);
    } else {
      const body = await req.json();
      subject = body.subject || "";
      message = body.message || "";
      category = body.category || "general";
    }

    if (!subject.trim() || !message.trim()) {
      return NextResponse.json({ message: "יש למלא נושא והודעה" }, { status: 400 });
    }

    // ולידציית קבצים לפני יצירת הפנייה
    if (files.length > 0) {
      const validation = validateAttachments(files);
      if (!validation.ok) {
        return NextResponse.json({ message: validation.error }, { status: 400 });
      }
    }

    // הקצאת מספר פנייה אוטומטי + יצירת הפנייה
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

    // שמירת הקבצים אחרי יצירת הפנייה (כדי לקבל ticketId) ועדכון השדה attachments
    let finalTicket: typeof ticket = ticket;
    if (files.length > 0) {
      try {
        const attachments = await saveAttachments(files, ticket.id);
        finalTicket = await prisma.supportTicket.update({
          where: { id: ticket.id },
          data: { attachments: JSON.parse(JSON.stringify(attachments)) },
        });
      } catch (error) {
        logger.error("[Support] Failed to save attachments:", {
          ticketId: ticket.id,
          userId,
          error: error instanceof Error ? error.message : String(error),
        });
        // לא כשלון קריטי — הפנייה כבר נוצרה, רק הקבצים נכשלו
      }
    }

    return NextResponse.json({ ticket: finalTicket }, { status: 201 });
  } catch (error) {
    logger.error("[Support] Error creating ticket:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ message: "שגיאה ביצירת פנייה" }, { status: 500 });
  }
}
