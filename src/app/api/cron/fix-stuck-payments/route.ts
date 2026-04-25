import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { checkCronAuth } from "@/lib/cron-auth";

/**
 * תיקון אוטומטי של תשלומים תקועים
 * תשלומים שהסכום ששולם >= הסכום הצפוי אבל הסטטוס עדיין PENDING
 * רץ יומי מה-scheduler (08:00-10:00)
 */

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const guard = await checkCronAuth(request);
  if (guard) return guard;

  try {
    const stuckPayments = await prisma.payment.findMany({
      where: {
        status: "PENDING",
        parentPaymentId: null,
        expectedAmount: { gt: 0 },
      },
      select: { id: true, amount: true, expectedAmount: true },
    });

    const stuckIds = stuckPayments
      .filter(p => Number(p.amount) >= Number(p.expectedAmount))
      .map(p => p.id);

    if (stuckIds.length > 0) {
      await prisma.payment.updateMany({
        where: { id: { in: stuckIds } },
        data: { status: "PAID", paidAt: new Date() },
      });

      // ניקוי משימות גבייה של תשלומים שתוקנו
      await prisma.task.updateMany({
        where: {
          relatedEntityId: { in: stuckIds },
          type: "COLLECT_PAYMENT",
          status: { in: ["PENDING", "IN_PROGRESS"] },
        },
        data: { status: "COMPLETED" },
      });

      logger.info(`[Fix Stuck Payments] תוקנו ${stuckIds.length} תשלומים תקועים`, { ids: stuckIds });
    }

    return NextResponse.json({
      message: "בוצע בדיקת תשלומים תקועים",
      fixed: stuckIds.length,
    });
  } catch (error) {
    logger.error("[Fix Stuck Payments] שגיאה:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "שגיאה בתיקון תשלומים תקועים" },
      { status: 500 }
    );
  }
}
