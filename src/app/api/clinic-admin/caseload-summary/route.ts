// ============================================================================
// M11.G5 — GET /api/clinic-admin/caseload-summary
// ============================================================================
// מחזיר סיכום עומס עבור כל המטפלים בקליניקה של ה-OWNER המחובר:
// מטופלים פעילים, פגישות שבועיות, שעות-שבוע, ממוצע 4 שבועות וסיווג עומס.
//
// אבטחה / multi-tenancy:
// - אימות דרך requireClinicOwner (כולל ADMIN-bypass-removal של M10.5).
// - כל ה-queries מסוננים לפי `organizationId` של ה-OWNER. אין parameter
//   חיצוני ש"בוחר" ארגון — Tenant נקבע מ-DB של המשתמש המחובר בלבד.
// - הקריאה היא read-only ולא מבצעת שום שינוי במסד.
// ============================================================================

import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireClinicOwner } from "@/lib/clinic/require-clinic-owner";
import {
  computeCaseload,
  sortByOverload,
  HIGH_LOAD_WEEKLY_HOURS,
  LOW_LOAD_WEEKLY_HOURS,
  LOW_LOAD_MAX_ACTIVE_CLIENTS,
  type CaseloadSessionStatus,
} from "@/lib/clinic/caseload";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const auth = await requireClinicOwner();
    if ("error" in auth) return auth.error;
    const { organizationId } = auth;

    const now = new Date();
    // חלון query: עד 5 שבועות אחורה (שבוע נוסף לבטיחות גבולות שבוע IL),
    // ועד 8 ימים קדימה (השבוע הנוכחי לאחר תחילת השבוע הישראלי).
    const fiveWeeksAgo = new Date(
      now.getTime() - 5 * 7 * 24 * 60 * 60 * 1000
    );
    const eightDaysAhead = new Date(now.getTime() + 8 * 24 * 60 * 60 * 1000);

    const [therapists, sessions, clientCountsRaw] = await Promise.all([
      prisma.user.findMany({
        where: {
          organizationId,
          clinicRole: "THERAPIST",
          isBlocked: false,
        },
        select: { id: true, name: true, email: true },
        orderBy: [{ name: "asc" }],
      }),
      prisma.therapySession.findMany({
        where: {
          organizationId,
          startTime: { gte: fiveWeeksAgo, lt: eightDaysAhead },
        },
        select: {
          therapistId: true,
          startTime: true,
          endTime: true,
          status: true,
        },
      }),
      prisma.client.groupBy({
        by: ["therapistId"],
        where: { organizationId, status: "ACTIVE" },
        _count: { _all: true },
      }),
    ]);

    const clientCounts = clientCountsRaw.map((c) => ({
      therapistId: c.therapistId,
      activeClients: c._count._all,
    }));

    const safeTherapists = therapists.map((t) => ({
      id: t.id,
      name: t.name,
      email: t.email ?? "",
    }));

    const sessionInputs = sessions.map((s) => ({
      therapistId: s.therapistId,
      startTime: s.startTime,
      endTime: s.endTime,
      status: s.status as CaseloadSessionStatus,
    }));

    const caseload = computeCaseload({
      therapists: safeTherapists,
      sessions: sessionInputs,
      clientCounts,
      now,
    });

    const sorted = sortByOverload(caseload);

    return NextResponse.json(
      JSON.parse(
        JSON.stringify({
          items: sorted,
          generatedAt: now.toISOString(),
          thresholds: {
            highWeeklyHours: HIGH_LOAD_WEEKLY_HOURS,
            lowWeeklyHours: LOW_LOAD_WEEKLY_HOURS,
            lowMaxActiveClients: LOW_LOAD_MAX_ACTIVE_CLIENTS,
          },
        })
      )
    );
  } catch (error) {
    logger.error("[clinic-admin/caseload-summary] GET error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה בטעינת דוח העומס" },
      { status: 500 }
    );
  }
}
