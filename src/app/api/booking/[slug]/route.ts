import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/resend";

/**
 * Converts an Israel local date+time string pair to a UTC Date object.
 * Automatically handles IST (UTC+2) vs IDT (UTC+3) via the Intl API.
 */
function toIsraelDate(dateStr: string, timeStr: string = "00:00"): Date {
  const testDate = new Date(`${dateStr}T12:00:00Z`);
  const israelHour = parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Jerusalem",
      hour: "numeric",
      hour12: false,
    }).format(testDate)
  );
  const offsetHours = israelHour - 12;
  const offsetStr = `+${String(offsetHours).padStart(2, "0")}:00`;
  return new Date(`${dateStr}T${timeStr}:00${offsetStr}`);
}

function getIsraelDayOfWeek(dateStr: string): number {
  return new Date(`${dateStr}T12:00:00Z`).getUTCDay();
}

function formatIsraelDate(dateStr: string): string {
  const date = new Date(`${dateStr}T12:00:00Z`);
  return date.toLocaleDateString("he-IL", {
    timeZone: "Asia/Jerusalem",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const { searchParams } = new URL(request.url);
  const dateStr = searchParams.get("date");

  const settings = await prisma.bookingSettings.findUnique({
    where: { slug },
    include: {
      therapist: {
        select: {
          id: true,
          name: true,
          image: true,
          defaultSessionDuration: true,
        },
      },
    },
  });

  if (!settings || !settings.enabled) {
    return NextResponse.json(
      { error: "דף הזימון אינו פעיל" },
      { status: 404 }
    );
  }

  const therapistName = settings.therapist.name || "המטפל/ת";
  const baseResponse = {
    therapistName,
    therapistImage: settings.therapist.image,
    sessionDuration: settings.sessionDuration,
    welcomeMessage: settings.welcomeMessage,
    defaultSessionType: settings.defaultSessionType,
    maxAdvanceDays: settings.maxAdvanceDays,
  };

  if (!dateStr) {
    const workingHours = settings.workingHours as Record<string, { start: string; end: string; enabled: boolean }>;
    const enabledDays = Object.entries(workingHours)
      .filter(([, v]) => v.enabled)
      .map(([k]) => parseInt(k));

    return NextResponse.json({
      ...baseResponse,
      enabledDays,
      workingHours,
    });
  }

  const dayOfWeek = getIsraelDayOfWeek(dateStr);
  const workingHours = settings.workingHours as Record<string, { start: string; end: string; enabled: boolean }>;
  const dayConfig = workingHours[dayOfWeek.toString()];

  if (!dayConfig || !dayConfig.enabled) {
    return NextResponse.json({ ...baseResponse, slots: [] });
  }

  const shabbatLimits = applyShabbatLimits(dayOfWeek, dayConfig.start, dayConfig.end);
  const effectiveStart = shabbatLimits.start;
  const effectiveEnd = shabbatLimits.end;

  const startOfDay = toIsraelDate(dateStr, "00:00");
  const endOfDay = new Date(toIsraelDate(dateStr, "23:59").getTime() + 59999);

  const existingSessions = await prisma.therapySession.findMany({
    where: {
      therapistId: settings.therapistId,
      startTime: { gte: startOfDay },
      endTime: { lte: endOfDay },
      status: { notIn: ["CANCELLED"] },
    },
    select: { startTime: true, endTime: true },
  });

  const breaks = (settings.breaks as Array<{ start: string; end: string }>) || [];

  const slots = generateTimeSlots(
    dateStr,
    effectiveStart,
    effectiveEnd,
    settings.sessionDuration,
    settings.bufferBetween,
    settings.minAdvanceHours,
    existingSessions,
    breaks
  );

  return NextResponse.json({ ...baseResponse, slots });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const body = await request.json();
  const { date, time, clientName, clientPhone, clientEmail, notes } = body;

  if (!date || !time || !clientName) {
    return NextResponse.json(
      { error: "חסרים שדות חובה: תאריך, שעה ושם" },
      { status: 400 }
    );
  }

  const settings = await prisma.bookingSettings.findUnique({
    where: { slug },
    include: {
      therapist: { select: { id: true, name: true, email: true } },
    },
  });

  if (!settings || !settings.enabled) {
    return NextResponse.json(
      { error: "דף הזימון אינו פעיל" },
      { status: 404 }
    );
  }

  const startTime = toIsraelDate(date, time);
  const endTime = new Date(startTime.getTime() + settings.sessionDuration * 60 * 1000);
  const now = new Date();

  const bookingDay = getIsraelDayOfWeek(date);
  const [bookingH, bookingM] = time.split(":").map(Number);
  const bookingMinutes = bookingH * 60 + bookingM;

  if (bookingDay === 5 && bookingMinutes >= 17 * 60 + 30) {
    return NextResponse.json(
      { error: "לא ניתן לקבוע תורים ביום שישי אחרי 17:30" },
      { status: 400 }
    );
  }
  if (bookingDay === 6 && bookingMinutes < 17 * 60 + 45) {
    return NextResponse.json(
      { error: "ניתן לקבוע תורים במוצ״ש רק מ-17:45" },
      { status: 400 }
    );
  }

  if (startTime <= now) {
    return NextResponse.json(
      { error: "לא ניתן לקבוע תור בעבר" },
      { status: 400 }
    );
  }

  const hoursUntilSession = (startTime.getTime() - now.getTime()) / (1000 * 60 * 60);
  if (hoursUntilSession < settings.minAdvanceHours) {
    return NextResponse.json(
      { error: `יש לקבוע תור לפחות ${settings.minAdvanceHours} שעות מראש` },
      { status: 400 }
    );
  }

  const conflicting = await prisma.therapySession.findFirst({
    where: {
      therapistId: settings.therapistId,
      status: { notIn: ["CANCELLED"] },
      OR: [
        { startTime: { lt: endTime }, endTime: { gt: startTime } },
      ],
    },
  });

  if (conflicting) {
    return NextResponse.json(
      { error: "השעה המבוקשת אינה פנויה יותר" },
      { status: 409 }
    );
  }

  let client = null;
  if (clientEmail || clientPhone) {
    client = await prisma.client.findFirst({
      where: {
        therapistId: settings.therapistId,
        OR: [
          ...(clientEmail ? [{ email: clientEmail }] : []),
          ...(clientPhone ? [{ phone: clientPhone }] : []),
        ],
      },
    });
  }

  if (!client) {
    client = await prisma.client.create({
      data: {
        name: clientName,
        phone: clientPhone || null,
        email: clientEmail || null,
        therapistId: settings.therapistId,
        status: "WAITING",
        defaultSessionPrice: settings.defaultPrice,
      },
    });
  }

  const sessionStatus = settings.requireApproval ? "PENDING_APPROVAL" : "SCHEDULED";
  const price = settings.defaultPrice || client.defaultSessionPrice || 0;

  const therapySession = await prisma.therapySession.create({
    data: {
      therapistId: settings.therapistId,
      clientId: client.id,
      startTime,
      endTime,
      status: sessionStatus,
      type: settings.defaultSessionType,
      price,
      notes: notes || null,
    },
  });

  const formattedDate = formatIsraelDate(date);

  await prisma.notification.create({
    data: {
      userId: settings.therapistId,
      type: "BOOKING_REQUEST",
      title: "בקשת זימון חדשה",
      content: `${clientName} ביקש/ה לקבוע פגישה ב-${formattedDate} בשעה ${time}`,
      status: "PENDING",
    },
  });

  const appUrl = process.env.NEXTAUTH_URL || "https://tipul-mh2t.onrender.com";

  if (clientEmail) {
    const isPending = sessionStatus === "PENDING_APPROVAL";
    const clientEmailHtml = `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; line-height: 1.6;">
        <h2 style="color: #0f766e;">שלום ${clientName},</h2>
        <p>${isPending ? "בקשת הזימון שלך התקבלה וממתינה לאישור המטפל/ת." : "התור שלך אושר בהצלחה!"}</p>
        <div style="background: #f0fdfa; padding: 20px; border-radius: 8px; margin: 20px 0; border-right: 4px solid #0f766e;">
          <p style="margin: 8px 0;"><strong>📅 תאריך:</strong> ${formattedDate}</p>
          <p style="margin: 8px 0;"><strong>🕐 שעה:</strong> ${time}</p>
          <p style="margin: 8px 0;"><strong>👤 מטפל/ת:</strong> ${settings.therapist.name}</p>
          <p style="margin: 8px 0;"><strong>📋 סטטוס:</strong> ${isPending ? "ממתין לאישור" : "מאושר"}</p>
        </div>
        ${isPending ? "<p>תקבל/י עדכון ברגע שהמטפל/ת יאשר/ו את התור.</p>" : "<p>לביטול או שינוי תור, נא ליצור קשר לפחות 24 שעות מראש.</p>"}
        <p style="color: #666; font-size: 14px; margin-top: 30px;">בברכה,<br/>${settings.therapist.name}</p>
        <p style="color: #999; font-size: 12px; margin-top: 20px;">מופעל על ידי MyTipul</p>
      </div>`;
    try {
      await sendEmail({
        to: clientEmail,
        subject: isPending
          ? `בקשת זימון - ${settings.therapist.name}`
          : `אישור תור - ${settings.therapist.name}`,
        html: clientEmailHtml,
      });
    } catch (e) {
      console.error("Failed to send client confirmation email:", e);
    }
  }

  if (settings.therapist.email) {
    const therapistEmailHtml = `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; line-height: 1.6;">
        <h2 style="color: #0f766e;">בקשת זימון חדשה</h2>
        <p>${clientName} ביקש/ה לקבוע תור דרך דף הזימון העצמי:</p>
        <div style="background: #fffbeb; padding: 20px; border-radius: 8px; margin: 20px 0; border-right: 4px solid #f59e0b;">
          <p style="margin: 8px 0;"><strong>👤 שם:</strong> ${clientName}</p>
          <p style="margin: 8px 0;"><strong>📅 תאריך:</strong> ${formattedDate}</p>
          <p style="margin: 8px 0;"><strong>🕐 שעה:</strong> ${time}</p>
          ${clientPhone ? `<p style="margin: 8px 0;"><strong>📱 טלפון:</strong> ${clientPhone}</p>` : ""}
          ${clientEmail ? `<p style="margin: 8px 0;"><strong>📧 מייל:</strong> ${clientEmail}</p>` : ""}
          ${notes ? `<p style="margin: 8px 0;"><strong>📝 הערות:</strong> ${notes}</p>` : ""}
        </div>
        <a href="${appUrl}/dashboard/calendar" style="display: inline-block; background: #0f766e; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; margin-top: 10px;">
          ${settings.requireApproval ? "כנס לאשר את התור" : "צפה ביומן"}
        </a>
        <p style="color: #999; font-size: 12px; margin-top: 20px;">מופעל על ידי MyTipul</p>
      </div>`;
    try {
      await sendEmail({
        to: settings.therapist.email,
        subject: `בקשת זימון חדשה מ-${clientName}`,
        html: therapistEmailHtml,
      });
    } catch (e) {
      console.error("Failed to send therapist notification email:", e);
    }
  }

  return NextResponse.json(
    {
      success: true,
      sessionId: therapySession.id,
      status: sessionStatus,
      message: settings.requireApproval
        ? settings.confirmationMessage || "הבקשה התקבלה! המטפל/ת יאשר/ו את התור בהקדם."
        : settings.confirmationMessage || "התור נקבע בהצלחה!",
      date: formattedDate,
      time,
      therapistName: settings.therapist.name,
    },
    { status: 201 }
  );
}

function applyShabbatLimits(dayOfWeek: number, start: string, end: string): { start: string; end: string } {
  if (dayOfWeek === 5) {
    const maxEnd = "17:30";
    return { start, end: end > maxEnd ? maxEnd : end };
  }
  if (dayOfWeek === 6) {
    const minStart = "17:45";
    return { start: start < minStart ? minStart : start, end };
  }
  return { start, end };
}

function generateTimeSlots(
  dateStr: string,
  dayStart: string,
  dayEnd: string,
  duration: number,
  buffer: number,
  minAdvanceHours: number,
  existingSessions: Array<{ startTime: Date; endTime: Date }>,
  breaks: Array<{ start: string; end: string }>
): string[] {
  const slots: string[] = [];
  const now = new Date();
  const [startH, startM] = dayStart.split(":").map(Number);
  const [endH, endM] = dayEnd.split(":").map(Number);

  const slotStep = duration + buffer;
  let currentMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  while (currentMinutes + duration <= endMinutes) {
    const h = Math.floor(currentMinutes / 60).toString().padStart(2, "0");
    const m = (currentMinutes % 60).toString().padStart(2, "0");
    const slotStart = toIsraelDate(dateStr, `${h}:${m}`);
    const slotEnd = new Date(slotStart.getTime() + duration * 60 * 1000);

    const hoursUntil = (slotStart.getTime() - now.getTime()) / (1000 * 60 * 60);
    if (hoursUntil < minAdvanceHours) {
      currentMinutes += slotStep;
      continue;
    }

    const isInBreak = breaks.some((brk) => {
      const [bsH, bsM] = brk.start.split(":").map(Number);
      const [beH, beM] = brk.end.split(":").map(Number);
      const breakStart = bsH * 60 + bsM;
      const breakEnd = beH * 60 + beM;
      return currentMinutes < breakEnd && currentMinutes + duration > breakStart;
    });

    if (isInBreak) {
      currentMinutes += slotStep;
      continue;
    }

    const hasConflict = existingSessions.some((s) => slotStart < s.endTime && slotEnd > s.startTime);

    if (!hasConflict) {
      slots.push(`${h}:${m}`);
    }

    currentMinutes += slotStep;
  }

  return slots;
}
