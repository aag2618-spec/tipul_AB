// ============================================================================
// M11.G3 (קומיט B) — Revenue snapshot: writer side
// ============================================================================
// `applyRevenueShareSnapshot(sessionId)` נקרא מתוך זרימת Payment כש-Payment
// המקושר ל-`session` עבר ל-PAID. הפונקציה:
//
//   1. קוראת את ה-session עם relations נדרשות (therapist, organization,
//      payment + childPayments).
//   2. אם `session.organizationId === null` — מטפל/ת עצמאי/ת: **skip לחלוטין**.
//      ההתנהגות לזרימת הסולו זהה לחלוטין לפני הפיצ'ר (כלל מ-HANDOFF).
//   3. אם אין Payment, או ה-Payment+childrne עדיין לא PAID בסכום כלשהו — skip.
//   4. אחרת — מחשבת `totalPaid` (parent.amount כש-PAID ללא children, או סך
//      ה-children שהם PAID), מחילה `resolveRevenueSharePct` כדי לקבל את
//      האחוז הנכון, ומעדכנת `session.therapistRevenueIls`.
//
// כל הפונקציה עטופה ב-try-catch ב-call-site: אסור לה לשבור את ה-Payment
// flow (logger.error בכשל, בלי לזרוק).
// ============================================================================

import "server-only";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { resolveRevenueSharePct } from "@/lib/clinic/revenue-share";

function toNullableNumber(input: unknown): number | null {
  if (input === null || input === undefined) return null;
  const n = Number(input);
  return Number.isFinite(n) ? n : null;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * מחשב + מעדכן `TherapySession.therapistRevenueIls`. נסיון כשל לא נזרק —
 * הפונקציה רושמת לוג ומחזירה void. מיועדת לקריאה אסינכרונית מתוך זרימת
 * Payment (אחרי `payment.status === "PAID"`).
 *
 * חוזה:
 *  • שום שינוי לתשלום עצמו או ל-client.
 *  • לא נקראת על מטפל/ת עצמאי/ת — בודקת `session.organizationId` ומדלגת.
 *  • לעולם לא מחזירה הבטחה שנכשלת.
 */
export async function applyRevenueShareSnapshot(args: {
  sessionId: string | null | undefined;
}): Promise<void> {
  const { sessionId } = args;
  if (!sessionId) return;

  try {
    const session = await prisma.therapySession.findUnique({
      where: { id: sessionId },
      select: {
        id: true,
        organizationId: true,
        therapist: {
          select: { revenueSharePct: true },
        },
        organization: {
          select: { defaultRevenueSharePct: true },
        },
        payment: {
          select: {
            status: true,
            amount: true,
            childPayments: {
              select: { status: true, amount: true },
            },
          },
        },
      },
    });

    if (!session) {
      // טעות זמן ריצה — שום סיבה לזרוק. הקורא יכול היה לשלוח sessionId
      // שכבר נמחק. רושמים ומסיימים בשקט.
      return;
    }

    if (!session.organizationId) {
      // מטפל/ת עצמאי/ת — אסור לגעת. דרישת HANDOFF.
      return;
    }

    if (!session.payment) return;

    const parent = session.payment;
    const children = parent.childPayments;

    let totalPaid = 0;
    if (children.length > 0) {
      for (const c of children) {
        if (c.status === "PAID") {
          totalPaid += Number(c.amount) || 0;
        }
      }
    } else if (parent.status === "PAID") {
      totalPaid = Number(parent.amount) || 0;
    }

    if (totalPaid <= 0) return;

    const userPct = toNullableNumber(session.therapist?.revenueSharePct);
    const orgDefaultPct = toNullableNumber(
      session.organization?.defaultRevenueSharePct
    );
    const sharePct = resolveRevenueSharePct({ userPct, orgDefaultPct });
    const snapshot = round2((totalPaid * sharePct) / 100);

    await prisma.therapySession.update({
      where: { id: sessionId },
      data: { therapistRevenueIls: snapshot },
    });
  } catch (error) {
    // לא לזרוק — חייב שלא לשבור את זרימת Payment.
    logger.error("[applyRevenueShareSnapshot] failed", {
      sessionId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
