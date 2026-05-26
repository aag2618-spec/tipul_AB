import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { parseIsraelTime } from "@/lib/date-utils";
import { requireAuth } from "@/lib/api-auth";
import { buildSessionWhere, isSecretary, loadScopeUser } from "@/lib/scope";
import { calculatePaidAmount } from "@/lib/payment-utils";
import { serializePrisma } from "@/lib/serialize";
import type { Prisma } from "@prisma/client";

export const dynamic = "force-dynamic";

// GET /api/sessions/calendar?startDate=...&endDate=...
//
// ⚠️ היסטוריה (regression — Tue May 26): commit a46a514b צמצם את ה-select
// כאן ל-8 שדות "לאופטימיזציה" — אבל בכך שבר את SessionDetailDialog שמסתמך
// ישירות על session.payment / sessionNote / topic / cancellation* /
// client.creditBalance + client.isQuickClient. בלי השדות האלה, ה-dialog
// נופל ל-fallback של "פטור מתשלום" עבור כל פגישה ששולמה — באג חמור
// בחוויית מטפל.
//
// הזרימה היא: useCalendarData fetches → setSessions → page.tsx →
// SessionDetailDialog משתמש ב-session ישירות בלי שום fetch נוסף בלחיצה.
// לכן מה שהיומן לא מחזיר — ה-dialog לא רואה.
//
// סוגיית performance — payment.childPayments היא relation מקובלת ב-Prisma
// (single JOIN). העלות זניחה לעומת DX רעוע ונפילה לערכי ברירת מחדל לא
// נכונים. אם בעתיד נרצה lazy-load ב-dialog open (למניעת 30+ relations
// בלא צורך), נצטרך לבנות endpoint חדש /api/sessions/[id]/full שייקרא
// onClick ולעדכן את ה-dialog לפעול עליו במקום על ה-prop ישירות.

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const { searchParams } = new URL(request.url);
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");

    const scopeUser = await loadScopeUser(userId);
    const scopeWhere = buildSessionWhere(scopeUser);

    const extraConditions: Prisma.TherapySessionWhereInput = {};
    if (startDate && endDate) {
      const rangeStart = parseIsraelTime(startDate);
      const rangeEnd = parseIsraelTime(endDate);
      extraConditions.AND = [
        { startTime: { lt: rangeEnd } },
        { endTime: { gt: rangeStart } },
      ];
    }

    // payment.childPayments נדרש ל-calculatePaidAmount — זה החישוב הקנוני
    // שמטפל בכל הזרמים (PAID / children PAID / PENDING+CC עם/בלי קבלה /
    // PENDING+CASH). הוא יושב ב-src/lib/payment-utils.ts ומשמש גם את
    // /api/sessions הרגיל.
    const paymentInclude = {
      childPayments: {
        where: { status: "PAID" as const },
        select: { id: true, amount: true, status: true },
      },
    };

    // מזכירה: חוק זכויות החולה — לא רואה תוכן קליני (sessionNote / topic).
    // ראה CLINICAL_FIELDS_BLOCKED_FOR_SECRETARY ב-scope.ts.
    const includeForRole = isSecretary(scopeUser)
      ? {
          client: {
            select: {
              id: true,
              name: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              creditBalance: true,
              isQuickClient: true,
            },
          },
          payment: { include: paymentInclude },
        }
      : {
          client: {
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              creditBalance: true,
              defaultSessionPrice: true,
              isQuickClient: true,
            },
          },
          sessionNote: true,
          payment: { include: paymentInclude },
        };

    const sessions = await prisma.therapySession.findMany({
      where: { AND: [scopeWhere, extraConditions] },
      orderBy: { startTime: "asc" },
      include: includeForRole,
    });

    // העשרה ב-paidAmount — מקור-אמת אחד; מונע חישוב חוזר בכל קומפוננטה.
    const enriched = sessions.map((s) => {
      if (!s.payment) return s;
      const p = s.payment;
      const paidAmount = calculatePaidAmount({
        amount: p.amount,
        status: p.status,
        method: p.method,
        hasReceipt: p.hasReceipt,
        childPayments: p.childPayments,
      });
      return { ...s, payment: { ...p, paidAmount } };
    });

    // serializePrisma חיוני בגלל Decimal של price/amount/creditBalance —
    // Prisma מחזיר Decimal objects שלא serialize-ים כ-JSON תקין. ראה
    // project-conventions.mdc / src/lib/serialize.ts.
    return NextResponse.json(serializePrisma(enriched));
  } catch (error) {
    logger.error("Calendar sessions error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה בטעינת הפגישות" },
      { status: 500 },
    );
  }
}
