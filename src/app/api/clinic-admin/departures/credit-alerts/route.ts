import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

// GET — רשימת מטופלים בעזיבה פעילה (PENDING) שבחרו ללכת עם המטפל/ת
// (FOLLOW_THERAPIST) ושיש להם יתרת קרדיט חיובית. נדרש על-מנת שבעלות
// הקליניקה תוכל להסדיר ידנית את העברת הקרדיט עם המטפל/ת היוצא/ת
// לפני שהמועד הסופי (decisionDeadline) פוקע ותהליך העזיבה מסתיים.
//
// מקור: PLAN-CLINIC-מטופלים-רב-מטפלים.md, סעיף 5 ("חישוב יתרת קרדיט").
//
// גישה: רק לבעלות קליניקה / אדמין. מזכירה לא רואה את האזהרה הזאת
// (יתרת קרדיט נחשבת מידע מזהה-פיננסי הדורש אישור canViewPayments
// + ההחלטה על "להסדיר עם המטפל/ת" היא החלטה ניהולית של הבעלים).
export async function GET() {
  try {
    const auth = await requireAuth();
    if ("error" in auth) return auth.error;
    const { userId } = auth;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { role: true, clinicRole: true, organizationId: true },
    });

    if (!user) {
      return NextResponse.json({ message: "המשתמש לא נמצא" }, { status: 404 });
    }

    const isOwner = user.role === "CLINIC_OWNER" || user.clinicRole === "OWNER";
    const isAdmin = user.role === "ADMIN";

    if (!isOwner && !isAdmin) {
      return NextResponse.json({ message: "אין הרשאה" }, { status: 403 });
    }
    if (!user.organizationId) {
      return NextResponse.json(
        { message: "אינך משויך/ת לקליניקה" },
        { status: 404 }
      );
    }

    const orgId = user.organizationId;

    // שולפים את כל בחירות העזיבה הפעילות מהארגון שבהן הלקוח בחר
    // ללכת עם המטפל/ת (FOLLOW_THERAPIST) ויש לו יתרת קרדיט > 0.
    // הסינון על creditBalance מתבצע ב-DB עם Prisma Decimal-aware gt.
    // take=200 — תקרת בטיחות; ארגון אמור לראות פחות מזה תמיד בפועל.
    const choices = await prisma.clientDepartureChoice.findMany({
      where: {
        choice: "FOLLOW_THERAPIST",
        departure: {
          organizationId: orgId,
          status: "PENDING",
        },
        client: {
          creditBalance: { gt: 0 },
        },
      },
      select: {
        id: true,
        decidedAt: true,
        client: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            name: true,
            creditBalance: true,
          },
        },
        departure: {
          select: {
            id: true,
            decisionDeadline: true,
            departingTherapist: {
              select: { id: true, name: true },
            },
          },
        },
      },
      take: 200,
    });

    const items = choices
      .map((c) => ({
        choiceId: c.id,
        decidedAt: c.decidedAt ? c.decidedAt.toISOString() : null,
        client: {
          id: c.client.id,
          name:
            c.client.name ||
            `${c.client.firstName ?? ""} ${c.client.lastName ?? ""}`.trim() ||
            "—",
          creditBalance: Number(c.client.creditBalance) || 0,
        },
        departure: {
          id: c.departure.id,
          decisionDeadline: c.departure.decisionDeadline.toISOString(),
        },
        departingTherapist: {
          id: c.departure.departingTherapist.id,
          name: c.departure.departingTherapist.name || "—",
        },
      }))
      .sort(
        (a, b) =>
          new Date(a.departure.decisionDeadline).getTime() -
          new Date(b.departure.decisionDeadline).getTime()
      );

    const totalCredit = items.reduce(
      (sum, it) => sum + it.client.creditBalance,
      0
    );

    return NextResponse.json({
      count: items.length,
      totalCreditIls: totalCredit,
      items,
    });
  } catch (error) {
    logger.error("[clinic-admin/departures/credit-alerts] GET error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה בטעינת התראות הקרדיט" },
      { status: 500 }
    );
  }
}
