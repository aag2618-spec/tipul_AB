// src/app/api/sessions/cleanup-bad-times/route.ts
// One-shot maintenance endpoint: finds sessions with malformed time inputs
// (endTime <= startTime, or duration > 12 hours) and cancels them.
//
// Cancelling — not deleting — preserves audit trail and lets the therapist
// recreate the session with correct times if needed. Cancelled sessions are
// excluded from the conflict check, which is the actual unblocker.
//
// GET  → preview: returns the affected sessions without modifying anything.
// POST → confirms cleanup: cancels them and returns the same list.

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireAuth } from "@/lib/api-auth";
import { logger } from "@/lib/logger";
import { serializePrisma } from "@/lib/serialize";

export const dynamic = "force-dynamic";

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

async function findBadSessions(userId: string) {
  // We can't express "endTime <= startTime" or arithmetic between two columns
  // in a Prisma where-clause, so we narrow at the DB level (only active
  // sessions of this therapist) and filter the rest in JS. The result set is
  // tiny — we only care about the bad ones, not the whole calendar.
  const candidates = await prisma.therapySession.findMany({
    where: {
      therapistId: userId,
      status: { notIn: ["CANCELLED", "COMPLETED", "NO_SHOW"] },
    },
    include: {
      client: { select: { id: true, name: true } },
    },
    orderBy: { startTime: "asc" },
  });

  return candidates.filter((s) => {
    const duration = s.endTime.getTime() - s.startTime.getTime();
    return duration <= 0 || duration > TWELVE_HOURS_MS;
  });
}

export async function GET() {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const bad = await findBadSessions(userId);
    return NextResponse.json({
      count: bad.length,
      sessions: serializePrisma(bad),
    });
  } catch (error) {
    logger.error("[sessions/cleanup-bad-times] GET error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה באיתור פגישות שגויות" },
      { status: 500 }
    );
  }
}

export async function POST() {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const bad = await findBadSessions(userId);
    if (bad.length === 0) {
      return NextResponse.json({ count: 0, cancelled: [] });
    }

    const ids = bad.map((s) => s.id);
    await prisma.therapySession.updateMany({
      where: { id: { in: ids }, therapistId: userId },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelledBy: "THERAPIST",
        cancellationReason: "תיקון אוטומטי — שעות פגישה שגויות",
      },
    });

    logger.info("[sessions/cleanup-bad-times] cancelled bad sessions", {
      userId,
      count: ids.length,
    });

    return NextResponse.json({
      count: ids.length,
      cancelled: serializePrisma(bad),
    });
  } catch (error) {
    logger.error("[sessions/cleanup-bad-times] POST error", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה בתיקון פגישות שגויות" },
      { status: 500 }
    );
  }
}
