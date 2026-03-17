import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

import { requireAdmin } from "@/lib/api-auth";

// GET - קבלת כל ההתראות
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdmin();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const type = searchParams.get("type");
    const priority = searchParams.get("priority");
    const limit = parseInt(searchParams.get("limit") || "50");

    const where: Record<string, unknown> = {};
    
    if (status && status !== "all") {
      where.status = status;
    }
    if (type && type !== "all") {
      where.type = type;
    }
    if (priority && priority !== "all") {
      where.priority = priority;
    }

    const alerts = await prisma.adminAlert.findMany({
      where,
      orderBy: [
        { priority: "desc" },
        { createdAt: "desc" },
      ],
      take: limit,
    });

    // Get counts by status
    const counts = await prisma.adminAlert.groupBy({
      by: ["status"],
      _count: { id: true },
    });

    const statusCounts = {
      PENDING: 0,
      IN_PROGRESS: 0,
      RESOLVED: 0,
      DISMISSED: 0,
      SNOOZED: 0,
    };

    counts.forEach((c) => {
      statusCounts[c.status as keyof typeof statusCounts] = c._count.id;
    });

    // Get counts by priority for pending
    const priorityCounts = await prisma.adminAlert.groupBy({
      by: ["priority"],
      where: { status: "PENDING" },
      _count: { id: true },
    });

    const pendingByPriority = {
      URGENT: 0,
      HIGH: 0,
      MEDIUM: 0,
      LOW: 0,
    };

    priorityCounts.forEach((c) => {
      pendingByPriority[c.priority as keyof typeof pendingByPriority] = c._count.id;
    });

    return NextResponse.json({
      alerts,
      counts: statusCounts,
      pendingByPriority,
    });
  } catch (error) {
    logger.error("Admin alerts GET error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "שגיאה בטעינת ההתראות" },
      { status: 500 }
    );
  }
}

// POST - יצירת התראה חדשה
export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdmin();
    if ("error" in auth) return auth.error;

    const body = await req.json();
    const {
      type,
      priority = "MEDIUM",
      title,
      message,
      userId,
      actionRequired,
      scheduledFor,
      metadata,
    } = body;

    if (!type || !title || !message) {
      return NextResponse.json(
        { message: "חסרים שדות חובה: סוג, כותרת, הודעה" },
        { status: 400 }
      );
    }

    const alert = await prisma.adminAlert.create({
      data: {
        type,
        priority,
        title,
        message,
        userId,
        actionRequired,
        scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
        metadata,
      },
    });

    return NextResponse.json({
      success: true,
      alert,
      message: "התראה נוצרה בהצלחה",
    });
  } catch (error) {
    logger.error("Admin alerts POST error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "שגיאה ביצירת ההתראה" },
      { status: 500 }
    );
  }
}
