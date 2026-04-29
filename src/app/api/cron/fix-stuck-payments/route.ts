import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { checkCronAuth } from "@/lib/cron-auth";

/**
 * תיקון אוטומטי של תשלומים תקועים — תרחיש המקור:
 *   • מטפל קיבל תשלום במזומן/בנק/צ׳ק
 *   • child Payments נוצרו ב-status=PAID עם amount מצטבר על ה-parent
 *   • parent.amount הגיע ל-expectedAmount אבל markFullyPaid לא רץ (caller שכח)
 *
 * כדי לזהות את המצב בלי לפגוע בזרימות אחרות אנחנו דורשים:
 *   1. status=PENDING + amount>=expectedAmount (התנאי המקורי)
 *   2. method != CREDIT_CARD — אחרת זה Payment שהוכן לסליקת Cardcom
 *      (`prepareCardcom` מציב amount=expectedAmount עוד לפני שהלקוח שילם).
 *      ה-webhook של Cardcom יסמן PAID אחרי חיוב אמיתי, לא כאן.
 *   3. אין CardcomTransaction פתוח (PENDING/APPROVED) על אותו Payment —
 *      נטל הוכחה כפול שאי-אפשר לטעות. אם יש סליקה פעילה, הפעולה היחידה
 *      שמותרת לסמן PAID היא ה-webhook (או cancel-link אם הסליקה בוטלה).
 *
 * רץ יומי מה-scheduler (08:00-10:00).
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
        // CRITICAL: never auto-promote a Cardcom-prepared Payment. prepareCardcom
        // sets amount=expectedAmount on a still-PENDING row before any actual
        // charge — this cron used to flip those to PAID on the next run.
        method: { not: "CREDIT_CARD" },
      },
      select: { id: true, amount: true, expectedAmount: true },
    });

    const candidateIds = stuckPayments
      .filter(p => Number(p.amount) >= Number(p.expectedAmount))
      .map(p => p.id);

    if (candidateIds.length === 0) {
      return NextResponse.json({ message: "בוצע בדיקת תשלומים תקועים", fixed: 0 });
    }

    // Defense in depth: even if a non-credit-card row somehow has an in-flight
    // Cardcom transaction (e.g. method changed mid-flow), refuse to promote.
    const blocking = await prisma.cardcomTransaction.findMany({
      where: {
        paymentId: { in: candidateIds },
        status: { in: ["PENDING", "APPROVED"] },
      },
      select: { paymentId: true },
    });
    const blockedSet = new Set(blocking.map(t => t.paymentId).filter(Boolean) as string[]);
    const stuckIds = candidateIds.filter(id => !blockedSet.has(id));

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

      logger.info(`[Fix Stuck Payments] תוקנו ${stuckIds.length} תשלומים תקועים`, {
        ids: stuckIds,
        skippedDueToCardcomInFlight: candidateIds.length - stuckIds.length,
      });
    }

    return NextResponse.json({
      message: "בוצע בדיקת תשלומים תקועים",
      fixed: stuckIds.length,
      skippedDueToCardcomInFlight: candidateIds.length - stuckIds.length,
    });
  } catch (error) {
    logger.error("[Fix Stuck Payments] שגיאה:", { error: error instanceof Error ? error.message : String(error) });
    return NextResponse.json(
      { message: "שגיאה בתיקון תשלומים תקועים" },
      { status: 500 }
    );
  }
}
