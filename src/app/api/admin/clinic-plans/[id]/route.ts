import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requirePermission } from "@/lib/api-auth";
import { withAudit } from "@/lib/audit";

export const dynamic = "force-dynamic";

// PATCH — עדכון תוכנית קיימת. כל השדות אופציונליים, רק מה שהועבר משתנה.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requirePermission("settings.pricing");
    if ("error" in auth) return auth.error;
    const { session } = auth;

    const { id } = await params;
    const body = await request.json();

    const existing = await prisma.clinicPricingPlan.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ message: "תוכנית לא נמצאה" }, { status: 404 });
    }

    // ולידציה של מספרים אם הועברו
    if (body.baseFeeIls !== undefined && (typeof body.baseFeeIls !== "number" || body.baseFeeIls < 0)) {
      return NextResponse.json({ message: "מחיר בסיס שגוי" }, { status: 400 });
    }
    if (body.perTherapistFeeIls !== undefined && (typeof body.perTherapistFeeIls !== "number" || body.perTherapistFeeIls < 0)) {
      return NextResponse.json({ message: "מחיר לכל מטפל שגוי" }, { status: 400 });
    }

    const plan = await withAudit(
      { kind: "user", session },
      {
        action: "update_clinic_pricing_plan",
        targetType: "ClinicPricingPlan",
        targetId: id,
        details: { changes: Object.keys(body) },
      },
      async (tx) => {
        if (body.isDefault === true) {
          await tx.clinicPricingPlan.updateMany({
            where: { isDefault: true, id: { not: id } },
            data: { isDefault: false },
          });
        }

        return tx.clinicPricingPlan.update({
          where: { id },
          data: {
            ...(body.name !== undefined && { name: String(body.name).trim() }),
            ...(body.isActive !== undefined && { isActive: Boolean(body.isActive) }),
            ...(body.isDefault !== undefined && { isDefault: Boolean(body.isDefault) }),
            ...(body.baseFeeIls !== undefined && { baseFeeIls: body.baseFeeIls }),
            ...(body.includedTherapists !== undefined && { includedTherapists: body.includedTherapists }),
            ...(body.perTherapistFeeIls !== undefined && { perTherapistFeeIls: body.perTherapistFeeIls }),
            ...(body.volumeDiscountAtCount !== undefined && { volumeDiscountAtCount: body.volumeDiscountAtCount }),
            ...(body.perTherapistAtVolumeIls !== undefined && { perTherapistAtVolumeIls: body.perTherapistAtVolumeIls }),
            ...(body.freeSecretaries !== undefined && { freeSecretaries: body.freeSecretaries }),
            ...(body.perSecretaryFeeIls !== undefined && { perSecretaryFeeIls: body.perSecretaryFeeIls }),
            ...(body.smsQuotaPerMonth !== undefined && { smsQuotaPerMonth: body.smsQuotaPerMonth }),
            ...(body.aiTierIncluded !== undefined && { aiTierIncluded: body.aiTierIncluded }),
            ...(body.aiAddonDiscountPercent !== undefined && { aiAddonDiscountPercent: body.aiAddonDiscountPercent }),
            ...(body.maxTherapists !== undefined && { maxTherapists: body.maxTherapists }),
            ...(body.maxSecretaries !== undefined && { maxSecretaries: body.maxSecretaries }),
            ...(body.description !== undefined && { description: body.description }),
          },
        });
      }
    );

    return NextResponse.json(JSON.parse(JSON.stringify(plan)));
  } catch (error) {
    logger.error("[admin/clinic-plans] PATCH error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "אירעה שגיאה בעדכון תוכנית התמחור" },
      { status: 500 }
    );
  }
}

// DELETE — חוסם מחיקה אם יש קליניקות שמצביעות על התוכנית. במקום למחוק, אפשר ל-isActive=false.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requirePermission("settings.pricing");
    if ("error" in auth) return auth.error;
    const { session } = auth;

    const { id } = await params;

    const orgCount = await prisma.organization.count({
      where: { pricingPlanId: id },
    });

    if (orgCount > 0) {
      return NextResponse.json(
        {
          message: `לא ניתן למחוק — ${orgCount} קליניקות משתמשות בתוכנית זו. במקום, סמן כלא-פעילה.`,
        },
        { status: 400 }
      );
    }

    const plan = await prisma.clinicPricingPlan.findUnique({ where: { id } });
    if (!plan) {
      return NextResponse.json({ message: "תוכנית לא נמצאה" }, { status: 404 });
    }

    await withAudit(
      { kind: "user", session },
      {
        action: "delete_clinic_pricing_plan",
        targetType: "ClinicPricingPlan",
        targetId: id,
        details: { name: plan.name, code: plan.internalCode },
      },
      async (tx) => tx.clinicPricingPlan.delete({ where: { id } })
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error("[admin/clinic-plans] DELETE error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "אירעה שגיאה במחיקת התוכנית" },
      { status: 500 }
    );
  }
}
