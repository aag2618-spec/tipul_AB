import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { nanoid } from "nanoid";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const settings = await prisma.bookingSettings.findUnique({
    where: { therapistId: session.user.id },
  });

  return NextResponse.json(settings);
}

export async function PUT(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const {
    enabled,
    workingHours,
    breaks,
    sessionDuration,
    bufferBetween,
    maxAdvanceDays,
    minAdvanceHours,
    requireApproval,
    welcomeMessage,
    confirmationMessage,
    defaultSessionType,
    defaultPrice,
  } = body;

  if (sessionDuration !== undefined && (typeof sessionDuration !== "number" || sessionDuration < 5 || sessionDuration > 300)) {
    return NextResponse.json({ error: "משך פגישה חייב להיות בין 5 ל-300 דקות" }, { status: 400 });
  }
  if (bufferBetween !== undefined && (typeof bufferBetween !== "number" || bufferBetween < 0 || bufferBetween > 120)) {
    return NextResponse.json({ error: "הפסקה בין פגישות חייבת להיות בין 0 ל-120 דקות" }, { status: 400 });
  }
  if (maxAdvanceDays !== undefined && (typeof maxAdvanceDays !== "number" || maxAdvanceDays < 1 || maxAdvanceDays > 365)) {
    return NextResponse.json({ error: "מספר ימי הזמנה מראש חייב להיות בין 1 ל-365" }, { status: 400 });
  }
  if (minAdvanceHours !== undefined && (typeof minAdvanceHours !== "number" || minAdvanceHours < 0 || minAdvanceHours > 168)) {
    return NextResponse.json({ error: "שעות מינימום מראש חייבות להיות בין 0 ל-168" }, { status: 400 });
  }
  if (defaultPrice !== undefined && (typeof defaultPrice !== "number" || defaultPrice < 0)) {
    return NextResponse.json({ error: "מחיר חייב להיות חיובי" }, { status: 400 });
  }
  if (breaks !== undefined) {
    if (!Array.isArray(breaks)) {
      return NextResponse.json({ error: "הפסקות חייבות להיות מערך" }, { status: 400 });
    }
    const timeRe = /^\d{2}:\d{2}$/;
    for (const brk of breaks) {
      if (!brk || typeof brk !== "object" || !timeRe.test(brk.start) || !timeRe.test(brk.end)) {
        return NextResponse.json({ error: "כל הפסקה חייבת לכלול שעת התחלה וסיום תקינות (HH:MM)" }, { status: 400 });
      }
      if (brk.start >= brk.end) {
        return NextResponse.json({ error: "שעת סיום ההפסקה חייבת להיות אחרי שעת ההתחלה" }, { status: 400 });
      }
    }
  }
  const validSessionTypes = ["IN_PERSON", "ONLINE", "PHONE"];
  if (defaultSessionType !== undefined && !validSessionTypes.includes(defaultSessionType)) {
    return NextResponse.json({ error: "סוג פגישה לא תקין" }, { status: 400 });
  }

  const existing = await prisma.bookingSettings.findUnique({
    where: { therapistId: session.user.id },
  });

  if (existing) {
    const updated = await prisma.bookingSettings.update({
      where: { therapistId: session.user.id },
      data: {
        enabled: enabled ?? existing.enabled,
        workingHours: workingHours ? (sanitizeWorkingHours(workingHours) as unknown as Prisma.InputJsonValue) : existing.workingHours as Prisma.InputJsonValue,
        breaks: breaks ?? existing.breaks,
        sessionDuration: sessionDuration ?? existing.sessionDuration,
        bufferBetween: bufferBetween ?? existing.bufferBetween,
        maxAdvanceDays: maxAdvanceDays ?? existing.maxAdvanceDays,
        minAdvanceHours: minAdvanceHours ?? existing.minAdvanceHours,
        requireApproval: requireApproval ?? existing.requireApproval,
        welcomeMessage: welcomeMessage !== undefined ? welcomeMessage : existing.welcomeMessage,
        confirmationMessage: confirmationMessage !== undefined ? confirmationMessage : existing.confirmationMessage,
        defaultSessionType: defaultSessionType ?? existing.defaultSessionType,
        defaultPrice: defaultPrice !== undefined ? defaultPrice : existing.defaultPrice,
      },
    });
    return NextResponse.json(updated);
  }

  const slug = nanoid(10);
  const created = await prisma.bookingSettings.create({
    data: {
      therapistId: session.user.id,
      slug,
      enabled: enabled ?? false,
      workingHours: (workingHours ? sanitizeWorkingHours(workingHours) : getDefaultWorkingHours()) as unknown as Prisma.InputJsonValue,
      breaks: breaks ?? [],
      sessionDuration: sessionDuration ?? 50,
      bufferBetween: bufferBetween ?? 10,
      maxAdvanceDays: maxAdvanceDays ?? 30,
      minAdvanceHours: minAdvanceHours ?? 24,
      requireApproval: requireApproval ?? true,
      welcomeMessage,
      confirmationMessage,
      defaultSessionType: defaultSessionType ?? "IN_PERSON",
      defaultPrice,
    },
  });
  return NextResponse.json(created, { status: 201 });
}

function getDefaultWorkingHours() {
  return {
    "0": { start: "09:00", end: "18:00", enabled: true },
    "1": { start: "09:00", end: "18:00", enabled: true },
    "2": { start: "09:00", end: "18:00", enabled: true },
    "3": { start: "09:00", end: "18:00", enabled: true },
    "4": { start: "09:00", end: "18:00", enabled: true },
    "5": { start: "09:00", end: "17:30", enabled: true },
    "6": { start: "17:45", end: "21:00", enabled: true },
  };
}

function sanitizeWorkingHours(hours: Record<string, Record<string, unknown>>) {
  const sanitized = { ...hours };
  if (sanitized["5"]) {
    const fri = sanitized["5"] as { start: string; end: string; enabled: boolean };
    if (fri.end > "17:30") fri.end = "17:30";
  }
  if (sanitized["6"]) {
    const sat = sanitized["6"] as { start: string; end: string; enabled: boolean };
    if (sat.start < "17:45") sat.start = "17:45";
  }
  return sanitized;
}
