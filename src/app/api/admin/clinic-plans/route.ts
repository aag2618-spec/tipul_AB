import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";
import { requirePermission } from "@/lib/api-auth";
import { withAudit } from "@/lib/audit";
import { parseBody } from "@/lib/validations/helpers";
import { createClinicPlanSchema } from "@/lib/validations/billing";

export const dynamic = "force-dynamic";

// GET — רשימת כל תוכניות התמחור לקליניקה (פעילות + מארכבות).
export async function GET() {
  try {
    const auth = await requirePermission("settings.pricing");
    if ("error" in auth) return auth.error;

    const plans = await prisma.clinicPricingPlan.findMany({
      include: {
        _count: { select: { organizations: true } },
      },
      orderBy: [{ isDefault: "desc" }, { isActive: "desc" }, { name: "asc" }],
    });

    return NextResponse.json(JSON.parse(JSON.stringify(plans)));
  } catch (error) {
    logger.error("[admin/clinic-plans] GET error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "אירעה שגיאה בטעינת תוכניות התמחור" },
      { status: 500 }
    );
  }
}

// POST — יצירת תוכנית תמחור חדשה.
export async function POST(request: NextRequest) {
  try {
    const auth = await requirePermission("settings.pricing");
    if ("error" in auth) return auth.error;
    const { session } = auth;

    const parsed = await parseBody(request, createClinicPlanSchema);
    if ("error" in parsed) return parsed.error;
    const {
      name,
      internalCode,
      isActive,
      isDefault,
      baseFeeIls,
      includedTherapists,
      perTherapistFeeIls,
      volumeDiscountAtCount,
      perTherapistAtVolumeIls,
      freeSecretaries,
      perSecretaryFeeIls,
      smsQuotaPerMonth,
      aiTierIncluded,
      aiAddonDiscountPercent,
      maxTherapists,
      maxSecretaries,
      description,
    } = parsed.data;

    const normalizedCode = internalCode.toUpperCase();

    const existing = await prisma.clinicPricingPlan.findFirst({
      where: { OR: [{ name }, { internalCode: normalizedCode }] },
    });
    if (existing) {
      return NextResponse.json(
        { message: "כבר קיימת תוכנית עם שם או קוד זהים" },
        { status: 400 }
      );
    }

    const plan = await withAudit(
      { kind: "user", session },
      {
        action: "create_clinic_pricing_plan",
        targetType: "ClinicPricingPlan",
        details: { name, code: normalizedCode },
      },
      async (tx) => {
        if (isDefault) {
          await tx.clinicPricingPlan.updateMany({
            where: { isDefault: true },
            data: { isDefault: false },
          });
        }
        return tx.clinicPricingPlan.create({
          data: {
            name: name.trim(),
            internalCode: normalizedCode,
            isActive: isActive !== false,
            isDefault: Boolean(isDefault),
            baseFeeIls,
            includedTherapists: includedTherapists ?? 1,
            perTherapistFeeIls,
            volumeDiscountAtCount: volumeDiscountAtCount ?? null,
            perTherapistAtVolumeIls: perTherapistAtVolumeIls ?? null,
            freeSecretaries: freeSecretaries ?? 3,
            perSecretaryFeeIls: perSecretaryFeeIls ?? null,
            smsQuotaPerMonth: smsQuotaPerMonth ?? 500,
            aiTierIncluded: aiTierIncluded ?? null,
            aiAddonDiscountPercent: aiAddonDiscountPercent ?? null,
            maxTherapists: maxTherapists ?? null,
            maxSecretaries: maxSecretaries ?? null,
            description: description ?? null,
          },
        });
      }
    );

    return NextResponse.json(JSON.parse(JSON.stringify(plan)));
  } catch (error) {
    logger.error("[admin/clinic-plans] POST error:", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { message: "אירעה שגיאה ביצירת תוכנית התמחור" },
      { status: 500 }
    );
  }
}
