import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

import { requirePermission } from "@/lib/api-auth";
import { withAudit } from "@/lib/audit";
import { parseBody, parseSearchParams } from "@/lib/validations/helpers";
import { alertsQuerySchema, createAlertSchema } from "@/lib/validations/admin";

// GET - קבלת כל ההתראות
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const auth = await requirePermission("alerts.view");
    if ("error" in auth) return auth.error;

    const parsedQuery = parseSearchParams(req.url, alertsQuerySchema);
    if ("error" in parsedQuery) return parsedQuery.error;
    const { status, type, priority, limit } = parsedQuery.data;

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
    const auth = await requirePermission("alerts.manage");
    if ("error" in auth) return auth.error;
    const { session } = auth;

    const parsed = await parseBody(req, createAlertSchema);
    if ("error" in parsed) return parsed.error;
    const {
      type,
      priority,
      title,
      message,
      userId,
      actionRequired,
      scheduledFor,
      metadata,
    } = parsed.data;

    const alert = await withAudit(
      { kind: "user", session },
      {
        action: "create_alert",
        targetType: "admin_alert",
        details: { type, priority, title, targetUserId: userId ?? null },
      },
      async (tx) =>
        tx.adminAlert.create({
          data: {
            type,
            priority,
            title,
            message,
            userId: userId ?? undefined,
            actionRequired: actionRequired ?? undefined,
            scheduledFor: scheduledFor ? new Date(scheduledFor) : null,
            metadata:
              metadata == null
                ? Prisma.DbNull
                : (metadata as Prisma.InputJsonValue),
          },
        })
    );

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
