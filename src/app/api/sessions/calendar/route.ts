import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { parseIsraelTime } from "@/lib/date-utils";
import { requireAuth } from "@/lib/api-auth";
import { buildSessionWhere, isSecretary, secretaryCan } from "@/lib/scope";
import { loadScopeUserWithMode } from "@/lib/secretary-mode";
import { shouldScopePersonal } from "@/lib/view-scope";
import { calculatePaidAmount } from "@/lib/payment-utils";
import { serializePrisma } from "@/lib/serialize";
import { CALENDAR_SESSION_INCLUDE } from "@/types/calendar-session";
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

    const scopeUser = await loadScopeUserWithMode(userId);
    // היקף לפי המתג הגלובלי "שלי / כל הקליניקה" (cookie). הבקשה מהדפדפן שולחת
    // את ה-cookie אוטומטית (same-origin). לבעל/ת קליניקה ב"שלי" → רק הפגישות
    // שלו/ה; לשאר התפקידים — ללא שינוי.
    const personalOnly = await shouldScopePersonal(scopeUser);
    const scopeWhere = buildSessionWhere(scopeUser, { personalOnly });

    const extraConditions: Prisma.TherapySessionWhereInput = {};
    if (startDate && endDate) {
      const rangeStart = parseIsraelTime(startDate);
      const rangeEnd = parseIsraelTime(endDate);
      extraConditions.AND = [
        { startTime: { lt: rangeEnd } },
        { endTime: { gt: rangeStart } },
      ];
    }

    // CALENDAR_SESSION_INCLUDE — source-of-truth שמיובא גם ע"י הצרכן.
    // אם מישהו מצמצם אותו, ה-build נשבר במקום שהמסך יציג "פטור מתשלום"
    // בשקט (ראה הערת ההיסטוריה ב-/types/calendar-session.ts).
    //
    // מזכירה: חוק זכויות החולה — לא רואה תוכן קליני (sessionNote / topic).
    // ראה CLINICAL_FIELDS_BLOCKED_FOR_SECRETARY ב-scope.ts.
    //
    const includeForRole = isSecretary(scopeUser)
      ? ({
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
          // יומן רב-מטפלים — שם המטפל (אדמיניסטרטיבי, לא תוכן קליני).
          therapist: { select: { id: true, name: true } },
          payment: CALENDAR_SESSION_INCLUDE.payment,
        } as const satisfies Prisma.TherapySessionInclude)
      : CALENDAR_SESSION_INCLUDE;

    const sessions = await prisma.therapySession.findMany({
      where: { AND: [scopeWhere, extraConditions] },
      orderBy: { startTime: "asc" },
      include: includeForRole,
    });

    // חיווי "תזכורת נשלחה" ביומן — שאילתה אחת מקובצת (לא N+1) שמסמנת אילו
    // פגישות כבר קיבלו תזכורת 24ש'/שעתיים שנשלחה בהצלחה (EMAIL או SMS).
    // מידע אדמיניסטרטיבי (לא קליני) — מותר גם למזכירה.
    const sessionIds = sessions.map((s) => s.id);
    const remindedRows = sessionIds.length
      ? await prisma.communicationLog.findMany({
          where: {
            sessionId: { in: sessionIds },
            type: { in: ["REMINDER_24H", "REMINDER_2H"] },
            status: "SENT",
          },
          select: { sessionId: true },
          distinct: ["sessionId"],
        })
      : [];
    const remindedSet = new Set(
      remindedRows
        .map((r) => r.sessionId)
        .filter((id): id is string => !!id),
    );

    // מדיניות ביטול per-therapist (minCancellationHours) — שאילתה אחת מקובצת
    // (לא N+1, אותו דפוס כמו remindedRows). משמשת את כפתור הביטול ב-
    // SessionDetailDialog כדי להחליט אם *להציע* חיוב דמי ביטול לפי הסף האמיתי
    // של המטפל (ברירת מחדל 24), במקום מספר קבוע. אדמיניסטרטיבי — לא תוכן קליני,
    // ולכן נכלל גם עבור מזכירה. אין אכיפה בשרת — ההחלטה היא ב-UI בלבד.
    const therapistIds = [
      ...new Set(
        sessions
          .map((s) => s.therapistId)
          .filter((id): id is string => !!id),
      ),
    ];
    const policyRows = therapistIds.length
      ? await prisma.communicationSetting.findMany({
          where: { userId: { in: therapistIds } },
          select: { userId: true, minCancellationHours: true },
        })
      : [];
    const minHoursByTherapist = new Map(
      policyRows.map((r) => [r.userId, r.minCancellationHours]),
    );

    // העשרה ב-paidAmount + reminderSent + minCancellationHours — מקור-אמת אחד;
    // מונע חישוב חוזר בכל קומפוננטה.
    const enriched = sessions.map((s) => {
      const reminderSent = remindedSet.has(s.id);
      const minCancellationHours = s.therapistId
        ? minHoursByTherapist.get(s.therapistId) ?? 24
        : 24;
      if (!s.payment) return { ...s, reminderSent, minCancellationHours };
      const p = s.payment;
      const paidAmount = calculatePaidAmount({
        amount: p.amount,
        status: p.status,
        method: p.method,
        hasReceipt: p.hasReceipt,
        childPayments: p.childPayments,
      });
      return { ...s, reminderSent, minCancellationHours, payment: { ...p, paidAmount } };
    });

    // Phase 3 (M1): סינון `payment` מהתגובה למזכירה ללא canViewPayments.
    // ה-relation עדיין נטען מה-DB (זניח — 1:1 ועוד child JOIN), אבל לא
    // נשלח ללקוח. זה סוגר את שרשרת התקיפה של H1 (קריאת paymentId מתוך
    // /api/sessions/calendar והעברתו ל-/api/payments/pay-client-debts).
    // בחירה זאת על פני conditional include כדי לשמור על type inference
    // אחיד של Prisma ובלי לסבך את ה-enrichment מעלה.
    // מזכירה: השמטת תוכן קליני + payment לפי הרשאה.
    // topic/notes הם scalars קליניים (CLINICAL_FIELDS_BLOCKED_FOR_SECRETARY)
    // ש-include מחזיר אוטומטית — חוסמים אותם כאן בכל מקרה (חוק זכויות החולה).
    // payment מוסר רק למזכירה ללא canViewPayments (כמו קודם).
    const finalSessions = isSecretary(scopeUser)
      ? enriched.map((s) => {
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { topic, notes, ...rest } = s;
          if (!secretaryCan(scopeUser, "canViewPayments")) {
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
            const { payment, ...noPayment } = rest;
            return noPayment;
          }
          return rest;
        })
      : enriched;

    // serializePrisma חיוני בגלל Decimal של price/amount/creditBalance —
    // Prisma מחזיר Decimal objects שלא serialize-ים כ-JSON תקין. ראה
    // project-conventions.mdc / src/lib/serialize.ts.
    return NextResponse.json(serializePrisma(finalSessions));
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
