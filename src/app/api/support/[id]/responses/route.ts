// API: תגובות לפנייה
import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import {
  parseAttachmentsFromFormData,
  saveAttachments,
  validateAttachments,
} from "@/lib/support-attachments";
import { ticketResponseSchema } from "@/lib/validations/support";

export const dynamic = "force-dynamic";

// POST — תגובה חדשה (תומך גם ב-JSON וגם ב-multipart/form-data עם קבצים)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;
    const { id } = await params;

    const contentType = req.headers.get("content-type") || "";
    const isMultipart = contentType.includes("multipart/form-data");

    let rawFields: unknown;
    let files: File[] = [];

    if (isMultipart) {
      const formData = await req.formData();
      rawFields = { message: formData.get("message") ?? undefined };
      files = parseAttachmentsFromFormData(formData);
    } else {
      rawFields = await req.json().catch(() => ({}));
    }

    // H12: validate message length + cap דרך zod.
    const fieldsParsed = ticketResponseSchema.safeParse(rawFields);
    if (!fieldsParsed.success) {
      const fieldErrors = fieldsParsed.error.flatten().fieldErrors;
      const firstMessage =
        Object.values(fieldErrors).flat().filter(Boolean)[0] || "נתונים לא תקינים";
      return NextResponse.json(
        { message: firstMessage, errors: fieldErrors },
        { status: 400 }
      );
    }
    const { message } = fieldsParsed.data;

    // ולידציית קבצים לפני יצירת התגובה
    if (files.length > 0) {
      const validation = validateAttachments(files);
      if (!validation.ok) {
        return NextResponse.json({ message: validation.error }, { status: 400 });
      }
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

    // שמירת קבצים (לפני יצירת התגובה — אם נכשל, לא מאבדים שום דבר)
    let savedAttachments: Awaited<ReturnType<typeof saveAttachments>> = [];
    if (files.length > 0) {
      try {
        savedAttachments = await saveAttachments(files, id);
      } catch (error) {
        logger.error("[Support] Failed to save response attachments:", {
          ticketId: id,
          userId,
          error: error instanceof Error ? error.message : String(error),
        });
        return NextResponse.json(
          { message: "שגיאה בשמירת הקבצים המצורפים" },
          { status: 500 }
        );
      }
    }

    const response = await prisma.supportResponse.create({
      data: {
        ticketId: id,
        authorId: userId,
        message,
        isAdmin: false,
        attachments:
          savedAttachments.length > 0
            ? JSON.parse(JSON.stringify(savedAttachments))
            : undefined,
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
    logger.error("[Support] Error adding user response:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ message: "שגיאה" }, { status: 500 });
  }
}
