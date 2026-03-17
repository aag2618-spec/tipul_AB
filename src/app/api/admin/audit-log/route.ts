import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { logger } from "@/lib/logger";

import { requireAdmin } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAdmin();
    if ("error" in auth) return auth.error;
    const { userId, session } = auth;

    const searchParams = request.nextUrl.searchParams;
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = 20;
    const action = searchParams.get("action") || "";
    const from = searchParams.get("from") || "";
    const to = searchParams.get("to") || "";

    const where: Record<string, unknown> = {};

    if (action) {
      where.action = action;
    }

    if (from || to) {
      const createdAt: Record<string, Date> = {};
      if (from) createdAt.gte = new Date(from);
      if (to) {
        const toDate = new Date(to);
        toDate.setHours(23, 59, 59, 999);
        createdAt.lte = toDate;
      }
      where.createdAt = createdAt;
    }

    const [logs, total] = await Promise.all([
      prisma.adminAuditLog.findMany({
        where,
        include: {
          admin: {
            select: { id: true, name: true, email: true },
          },
        },
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
      prisma.adminAuditLog.count({ where }),
    ]);

    const distinctActions = await prisma.adminAuditLog.findMany({
      select: { action: true },
      distinct: ["action"],
      orderBy: { action: "asc" },
    });

    return NextResponse.json({
      logs,
      total,
      page,
      totalPages: Math.ceil(total / limit),
      actions: distinctActions.map((a) => a.action),
    });
  } catch (error) {
    logger.error("Error fetching audit logs:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "Internal server error" },
      { status: 500 }
    );
  }
}
