import { getServerSession } from "next-auth";
import { NextRequest, NextResponse } from "next/server";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { sendEmail } from "@/lib/resend";

const VALID_TRANSITIONS: Record<string, string[]> = {
  PENDING_APPROVAL: ["SCHEDULED", "CANCELLED"],
  SCHEDULED: ["COMPLETED", "CANCELLED", "NO_SHOW"],
  COMPLETED: [],
  CANCELLED: [],
  NO_SHOW: [],
  PENDING_CANCELLATION: ["CANCELLED", "SCHEDULED"],
};

function formatDateHebrew(date: Date): string {
  return date.toLocaleDateString("he-IL", {
    timeZone: "Asia/Jerusalem",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function formatTimeHebrew(date: Date): string {
  return date.toLocaleTimeString("he-IL", {
    timeZone: "Asia/Jerusalem",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id: sessionId } = await params;
    const { status, cancellationReason } = await req.json();

    const validStatuses = Object.keys(VALID_TRANSITIONS);
    if (!validStatuses.includes(status)) {
      return NextResponse.json({ error: "Invalid status" }, { status: 400 });
    }

    const therapySession = await prisma.therapySession.findFirst({
      where: {
        id: sessionId,
        OR: [
          { therapistId: session.user.id },
          { client: { therapistId: session.user.id } },
        ],
      },
      include: {
        client: { select: { name: true, email: true, phone: true } },
        therapist: { select: { name: true, email: true } },
      },
    });

    if (!therapySession) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const currentStatus = therapySession.status;
    const allowedNext = VALID_TRANSITIONS[currentStatus] || [];
    if (!allowedNext.includes(status)) {
      return NextResponse.json(
        { error: `לא ניתן לשנות סטטוס מ-${currentStatus} ל-${status}` },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = { status };
    if (status === "CANCELLED") {
      updateData.cancelledAt = new Date();
      updateData.cancelledBy = session.user.id;
      if (cancellationReason) updateData.cancellationReason = cancellationReason;
    }

    const updatedSession = await prisma.therapySession.update({
      where: { id: sessionId },
      data: updateData,
    });

    // Send email to client when approving/rejecting a booking request
    if (currentStatus === "PENDING_APPROVAL" && therapySession.client?.email) {
      const clientName = therapySession.client.name;
      const therapistName = therapySession.therapist?.name || "המטפל/ת";
      const dateStr = formatDateHebrew(therapySession.startTime);
      const timeStr = formatTimeHebrew(therapySession.startTime);

      if (status === "SCHEDULED") {
        const html = `
          <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; line-height: 1.6;">
            <h2 style="color: #059669;">התור שלך אושר!</h2>
            <p>שלום ${clientName},</p>
            <p>שמחים לעדכן אותך שהתור שלך אושר על ידי ${therapistName}.</p>
            <div style="background: #ecfdf5; padding: 20px; border-radius: 8px; margin: 20px 0; border-right: 4px solid #059669;">
              <p style="margin: 8px 0;"><strong>תאריך:</strong> ${dateStr}</p>
              <p style="margin: 8px 0;"><strong>שעה:</strong> ${timeStr}</p>
              <p style="margin: 8px 0;"><strong>מטפל/ת:</strong> ${therapistName}</p>
            </div>
            <p>לביטול או שינוי תור, נא ליצור קשר לפחות 24 שעות מראש.</p>
            <p style="color: #666; font-size: 14px; margin-top: 30px;">בברכה,<br/>${therapistName}</p>
            <p style="color: #999; font-size: 12px; margin-top: 20px;">מופעל על ידי MyTipul</p>
          </div>`;
        try {
          await sendEmail({
            to: therapySession.client.email,
            subject: `התור שלך אושר - ${therapistName}`,
            html,
          });
        } catch (e) {
          console.error("Failed to send approval email:", e);
        }
      } else if (status === "CANCELLED") {
        const html = `
          <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; line-height: 1.6;">
            <h2 style="color: #dc2626;">הבקשה לא אושרה</h2>
            <p>שלום ${clientName},</p>
            <p>לצערנו, בקשת הזימון שלך לא אושרה על ידי ${therapistName}.</p>
            <div style="background: #fef2f2; padding: 20px; border-radius: 8px; margin: 20px 0; border-right: 4px solid #dc2626;">
              <p style="margin: 8px 0;"><strong>תאריך:</strong> ${dateStr}</p>
              <p style="margin: 8px 0;"><strong>שעה:</strong> ${timeStr}</p>
              ${cancellationReason ? `<p style="margin: 8px 0;"><strong>סיבה:</strong> ${cancellationReason}</p>` : ""}
            </div>
            <p>ניתן לנסות לקבוע מועד אחר דרך דף הזימון.</p>
            <p style="color: #666; font-size: 14px; margin-top: 30px;">בברכה,<br/>${therapistName}</p>
            <p style="color: #999; font-size: 12px; margin-top: 20px;">מופעל על ידי MyTipul</p>
          </div>`;
        try {
          await sendEmail({
            to: therapySession.client.email,
            subject: `עדכון לגבי בקשת הזימון - ${therapistName}`,
            html,
          });
        } catch (e) {
          console.error("Failed to send rejection email:", e);
        }
      }
    }

    return NextResponse.json(updatedSession);
  } catch (error) {
    console.error("Error updating session status:", error);
    return NextResponse.json(
      { error: "Failed to update session status" },
      { status: 500 }
    );
  }
}
