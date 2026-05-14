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
import { createTicketSchema } from "@/lib/validations/support";

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

    let rawFields: unknown;
    let files: File[] = [];

    if (isMultipart) {
      const formData = await req.formData();
      rawFields = {
        subject: formData.get("subject") ?? undefined,
        message: formData.get("message") ?? undefined,
        category: formData.get("category") ?? undefined,
      };
      files = parseAttachmentsFromFormData(formData);
    } else {
      rawFields = await req.json().catch(() => ({}));
    }

    // H12: caps + category whitelist דרך zod.
    // subject נכנס ל-AdminAlert.title; ללא cap = רשומות ענקיות שמכבידות על UI אדמין.
    const fieldsParsed = createTicketSchema.safeParse(rawFields);
    if (!fieldsParsed.success) {
      const fieldErrors = fieldsParsed.error.flatten().fieldErrors;
      const firstMessage =
        Object.values(fieldErrors).flat().filter(Boolean)[0] || "נתונים לא תקינים";
      return NextResponse.json(
        { message: firstMessage, errors: fieldErrors },
        { status: 400 }
      );
    }
    const { subject, message, category } = fieldsParsed.data;

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
          subject,
          message,
          category,
        },
      });

      // יצירת התראה אוטומטית לאדמין
      await tx.adminAlert.create({
        data: {
          type: "SUPPORT_TICKET",
          priority: "MEDIUM",
          title: `פנייה חדשה #${nextNumber}: ${subject}`,
          message: message.substring(0, 200),
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
