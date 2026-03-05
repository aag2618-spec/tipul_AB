import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET: Fetch therapist info + available time slots for a date range
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

  const date = new Date(dateStr);
  if (isNaN(date.getTime())) {
    return NextResponse.json({ error: "תאריך לא תקין" }, { status: 400 });
  }

  const dayOfWeek = date.getDay();
  const workingHours = settings.workingHours as Record<string, { start: string; end: string; enabled: boolean }>;
  const dayConfig = workingHours[dayOfWeek.toString()];

  if (!dayConfig || !dayConfig.enabled) {
    return NextResponse.json({ ...baseResponse, slots: [] });
  }

  const shabbatLimits = applyShabbatLimits(dayOfWeek, dayConfig.start, dayConfig.end);
  const effectiveStart = shabbatLimits.start;
  const effectiveEnd = shabbatLimits.end;

  const startOfDay = new Date(date);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(date);
  endOfDay.setHours(23, 59, 59, 999);

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
    date,
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

// POST: Create a booking
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
      therapist: { select: { id: true, name: true } },
    },
  });

  if (!settings || !settings.enabled) {
    return NextResponse.json(
      { error: "דף הזימון אינו פעיל" },
      { status: 404 }
    );
  }

  const startTime = new Date(`${date}T${time}:00`);
  const endTime = new Date(startTime.getTime() + settings.sessionDuration * 60 * 1000);
  const now = new Date();

  const bookingDay = startTime.getDay();
  const bookingHour = startTime.getHours() * 60 + startTime.getMinutes();

  if (bookingDay === 5 && bookingHour >= 17 * 60 + 30) {
    return NextResponse.json(
      { error: "לא ניתן לקבוע תורים ביום שישי אחרי 17:30" },
      { status: 400 }
    );
  }
  if (bookingDay === 6 && bookingHour < 17 * 60 + 45) {
    return NextResponse.json(
      { error: "ניתן לקבוע תורים בשבת רק מ-17:45" },
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

  let client = await prisma.client.findFirst({
    where: {
      therapistId: settings.therapistId,
      OR: [
        ...(clientEmail ? [{ email: clientEmail }] : []),
        ...(clientPhone ? [{ phone: clientPhone }] : []),
      ],
    },
  });

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

  await prisma.notification.create({
    data: {
      userId: settings.therapistId,
      type: "BOOKING_REQUEST",
      title: "בקשת זימון חדשה",
      content: `${clientName} ביקש/ה לקבוע פגישה ב-${startTime.toLocaleDateString("he-IL")} בשעה ${time}`,
      status: "PENDING",
    },
  });

  return NextResponse.json(
    {
      success: true,
      sessionId: therapySession.id,
      status: sessionStatus,
      message: settings.requireApproval
        ? settings.confirmationMessage || "הבקשה התקבלה! המטפל/ת יאשר/ו את התור בהקדם."
        : settings.confirmationMessage || "התור נקבע בהצלחה!",
      date: startTime.toLocaleDateString("he-IL"),
      time,
      therapistName: settings.therapist.name,
    },
    { status: 201 }
  );
}

// יום שישי עד 17:30, מוצ"ש מ-17:45
function applyShabbatLimits(
  dayOfWeek: number,
  start: string,
  end: string
): { start: string; end: string } {
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
  date: Date,
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
    const slotStart = new Date(date);
    slotStart.setHours(Math.floor(currentMinutes / 60), currentMinutes % 60, 0, 0);

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

    const hasConflict = existingSessions.some((s) => {
      return slotStart < s.endTime && slotEnd > s.startTime;
    });

    if (!hasConflict) {
      const hours = Math.floor(currentMinutes / 60).toString().padStart(2, "0");
      const mins = (currentMinutes % 60).toString().padStart(2, "0");
      slots.push(`${hours}:${mins}`);
    }

    currentMinutes += slotStep;
  }

  return slots;
}
