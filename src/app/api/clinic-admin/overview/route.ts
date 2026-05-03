import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requireAuth } from "@/lib/api-auth";
import { getEffectivePrice } from "@/lib/pricing/effective-price";
import { getOrgMonthlySmsQuota, getOrgMonthlySmsUsage } from "@/lib/clinic/sms-quota";

export const dynamic = "force-dynamic";

// GET — סקירה מהירה לדף overview של בעל קליניקה.
// מחזיר: ארגון, ספירות חברים/מטופלים/פגישות, מחיר אפקטיבי, מכסת SMS.
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
      return NextResponse.json(
        { message: "אין הרשאה" },
        { status: 403 }
      );
    }
    if (!user.organizationId) {
      return NextResponse.json(
        { message: "אינך משויך/ת לקליניקה" },
        { status: 404 }
      );
    }

    const orgId = user.organizationId;

    const [org, members, clientsCount, sessionsCount, transfersCount] = await Promise.all([
      prisma.organization.findUnique({
        where: { id: orgId },
        select: {
          id: true,
          name: true,
          subscriptionStatus: true,
          aiTier: true,
          pricingPlan: { select: { name: true, baseFeeIls: true } },
          customContract: {
            select: { id: true, monthlyEquivPriceIls: true, endDate: true },
          },
        },
      }),
      prisma.user.groupBy({
        by: ["clinicRole"],
        where: { organizationId: orgId, isBlocked: false },
        _count: { _all: true },
      }),
      prisma.client.count({ where: { organizationId: orgId } }),
      prisma.therapySession.count({ where: { organizationId: orgId } }),
      prisma.clientTransferLog.count({ where: { organizationId: orgId } }),
    ]);

    if (!org) {
      return NextResponse.json({ message: "הקליניקה לא נמצאה" }, { status: 404 });
    }

    const counts = {
      owners: members.find((m) => m.clinicRole === "OWNER")?._count._all ?? 0,
      therapists: members.find((m) => m.clinicRole === "THERAPIST")?._count._all ?? 0,
      secretaries: members.find((m) => m.clinicRole === "SECRETARY")?._count._all ?? 0,
      clients: clientsCount,
      sessions: sessionsCount,
      transfers: transfersCount,
    };

    const effectivePriceResult = await getEffectivePrice(orgId);
    const effectivePrice = "error" in effectivePriceResult ? null : effectivePriceResult;

    let smsUsage: { quota: number; used: number; remaining: number } | null = null;
    try {
      const [quota, used] = await Promise.all([
        getOrgMonthlySmsQuota(orgId),
        getOrgMonthlySmsUsage(orgId),
      ]);
      smsUsage = {
        quota,
        used,
        remaining: Math.max(0, quota - used),
      };
    } catch {
      // אם נכשל — לא קריטי, פשוט לא מציגים
    }

    return NextResponse.json(
      JSON.parse(
        JSON.stringify({
          organization: org,
          counts,
          effectivePrice,
          smsUsage,
        })
      )
    );
  } catch (error) {
    logger.error("[clinic-admin/overview] GET error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "שגיאה בטעינת הסקירה" },
      { status: 500 }
    );
  }
}
