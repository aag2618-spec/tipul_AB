import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

import { requireAdmin } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("authorization");
    const cronAuth = authHeader === `Bearer ${process.env.CRON_SECRET}`;

    if (!cronAuth) {
      const auth = await requireAdmin();
      if ("error" in auth) return auth.error;
    }

    const result = await prisma.$transaction(async (tx) => {
      const maxResult = await tx.user.aggregate({ _max: { userNumber: true } });
      let nextNumber = (maxResult._max.userNumber ?? 1000) + 1;

      const usersWithout = await tx.user.findMany({
        where: { userNumber: null },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });

      for (const user of usersWithout) {
        await tx.user.update({
          where: { id: user.id },
          data: { userNumber: nextNumber },
        });
        nextNumber++;
      }

      return usersWithout.length;
    });

    return NextResponse.json({
      message: `הוקצו מספרים ל-${result} משתמשים`,
      count: result,
    });
  } catch (error) {
    logger.error("Backfill error:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "שגיאה במילוי מספרי משתמשים" },
      { status: 500 }
    );
  }
}
