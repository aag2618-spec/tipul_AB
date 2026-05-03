import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requirePermission } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

// GET — לוג העברות מטופלים בתוך קליניקות. תומך בסינון לפי קליניקה/טווח תאריכים.
export async function GET(request: NextRequest) {
  try {
    const auth = await requirePermission("settings.pricing");
    if ("error" in auth) return auth.error;

    const { searchParams } = new URL(request.url);
    const orgId = searchParams.get("orgId") || undefined;
    const fromDate = searchParams.get("from") || undefined;
    const toDate = searchParams.get("to") || undefined;
    const limit = Math.min(Number(searchParams.get("limit") || "200"), 1000);

    const where: Prisma.ClientTransferLogWhereInput = {};
    if (orgId) where.organizationId = orgId;
    if (fromDate || toDate) {
      where.transferredAt = {};
      if (fromDate) where.transferredAt.gte = new Date(fromDate);
      if (toDate) {
        const to = new Date(toDate);
        to.setHours(23, 59, 59, 999);
        where.transferredAt.lte = to;
      }
    }

    const transfers = await prisma.clientTransferLog.findMany({
      where,
      include: {
        organization: { select: { id: true, name: true } },
      },
      orderBy: [{ transferredAt: "desc" }],
      take: limit,
    });

    return NextResponse.json(JSON.parse(JSON.stringify(transfers)));
  } catch (error) {
    logger.error("[admin/clinics/transfers] GET error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "אירעה שגיאה בטעינת לוג ההעברות" },
      { status: 500 }
    );
  }
}
