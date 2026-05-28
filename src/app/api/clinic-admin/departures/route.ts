import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/api-auth";

export const dynamic = "force-dynamic";

// C2: GET — דשבורד עזיבת מטפלים לבעל/ת הקליניקה. מציג את כל ה-
// TherapistDepartures בארגון (PENDING/COMPLETED/CANCELLED) עם
// אגרגציה של בחירות המטופלים לכל תהליך: כמה בחרו להישאר, כמה ללכת
// עם המטפלת, כמה לא החליטו (UNDECIDED ייהפך STAY_WITH_CLINIC בdeadline).
//
// גישה: רק לבעלות קליניקה. מזכירה לא רואה — תהליך עזיבה הוא ניהולי
// (מערב חוזים, חיוב ויתרות קרדיט) ולא יומיומי. ADMIN גלובלי משתמש
// ב-/api/admin/* בלבד (M10.5).
//
// take=200 — תקרת בטיחות; לארגון רגיל יהיו פחות מ-20 בפועל.

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
    if (!isOwner) {
      return NextResponse.json({ message: "אין הרשאה" }, { status: 403 });
    }
    if (!user.organizationId) {
      return NextResponse.json(
        { message: "אינך משויך/ת לקליניקה" },
        { status: 404 }
      );
    }

    const orgId = user.organizationId;

    const departures = await prisma.therapistDeparture.findMany({
      where: { organizationId: orgId },
      orderBy: [
        // PENDING first (urgency), then by deadline
        { status: "asc" },
        { decisionDeadline: "asc" },
      ],
      take: 200,
      select: {
        id: true,
        status: true,
        decisionDeadline: true,
        reason: true,
        initiatedAt: true,
        completedAt: true,
        departingTherapist: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        choices: {
          select: {
            id: true,
            choice: true,
            decidedAt: true,
            client: {
              select: {
                id: true,
                name: true,
                firstName: true,
                lastName: true,
                creditBalance: true,
              },
            },
          },
        },
      },
    });

    const items = departures.map((d) => {
      const total = d.choices.length;
      let stayed = 0;
      let followed = 0;
      let undecided = 0;
      let creditAtRiskIls = 0;

      for (const c of d.choices) {
        if (c.choice === "STAY_WITH_CLINIC") stayed += 1;
        else if (c.choice === "FOLLOW_THERAPIST") {
          followed += 1;
          // Decimal → Number; defensive null guard.
          creditAtRiskIls += Number(c.client.creditBalance) || 0;
        } else {
          undecided += 1;
        }
      }

      // Days remaining ל-PENDING. ל-COMPLETED/CANCELLED לא רלוונטי.
      const msLeft = d.decisionDeadline.getTime() - Date.now();
      const daysLeft = Math.max(0, Math.ceil(msLeft / (1000 * 60 * 60 * 24)));

      return {
        id: d.id,
        status: d.status,
        decisionDeadline: d.decisionDeadline.toISOString(),
        daysLeft: d.status === "PENDING" ? daysLeft : null,
        isOverdue: d.status === "PENDING" && msLeft <= 0,
        reason: d.reason,
        initiatedAt: d.initiatedAt.toISOString(),
        completedAt: d.completedAt ? d.completedAt.toISOString() : null,
        departingTherapist: {
          id: d.departingTherapist.id,
          name: d.departingTherapist.name || "—",
          email: d.departingTherapist.email,
        },
        counts: { total, stayed, followed, undecided },
        creditAtRiskIls,
      };
    });

    // Aggregate org-level summary stats.
    const summary = {
      pending: items.filter((i) => i.status === "PENDING").length,
      completed: items.filter((i) => i.status === "COMPLETED").length,
      cancelled: items.filter((i) => i.status === "CANCELLED").length,
      totalCreditAtRiskIls: items
        .filter((i) => i.status === "PENDING")
        .reduce((s, i) => s + i.creditAtRiskIls, 0),
    };

    return NextResponse.json({
      count: items.length,
      summary,
      items,
    });
  } catch (error) {
    logger.error("[clinic-admin/departures] GET error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה בטעינת תהליכי העזיבה" },
      { status: 500 }
    );
  }
}
