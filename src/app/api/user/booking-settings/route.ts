import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { nanoid } from "nanoid";

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

  const existing = await prisma.bookingSettings.findUnique({
    where: { therapistId: session.user.id },
  });

  if (existing) {
    const updated = await prisma.bookingSettings.update({
      where: { therapistId: session.user.id },
      data: {
        enabled: enabled ?? existing.enabled,
        workingHours: workingHours ? sanitizeWorkingHours(workingHours) : existing.workingHours,
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
      workingHours: workingHours ? sanitizeWorkingHours(workingHours) : getDefaultWorkingHours(),
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

// Enforce Shabbat limits: Friday max 17:30, Saturday min 17:45
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
