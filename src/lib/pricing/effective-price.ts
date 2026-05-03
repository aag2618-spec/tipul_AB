// ==================== Effective Price Calculation ====================
// חישוב מחיר חודשי אפקטיבי לקליניקה לפי שילוב של:
//   1. CustomContract פעיל (גובר תמיד אם קיים)
//   2. ClinicPricingPlan (תוכנית בסיס)
//   3. שכבת AI (אם תוסף)
//
// מקום קריאה: cron של cardcom-subscription-charge, webhook של תשלום מנוי,
// UI "מה אני אשלם החודש" בדשבורד הקליניקה.
//
// כל החישובים ב-ILS, מספרים חיוביים בלבד. ערכי Decimal מ-Prisma מומרים ל-Number
// דרך `toNumber()` (Prisma Decimal לא בטוח לסידור JSON).

import prisma from "@/lib/prisma";

// ============================================================================
// Types
// ============================================================================

/**
 * תוצאת החישוב — pricing breakdown מלא.
 * כל הסכומים ב-ILS (שקלים שלמים או עם 2 ספרות אחרי הנקודה).
 */
export type EffectivePrice = {
  /** המחיר החודשי הסופי לחיוב (ILS). */
  monthlyTotalIls: number;
  /** האם הופעל חוזה מותאם (שגבר על התוכנית). */
  hasCustomContract: boolean;
  /** מקור המחיר. */
  source: "custom_contract" | "pricing_plan";
  /** פירוט המחיר — לתצוגה ב-UI ולביקורת חשבונאית. */
  breakdown: {
    baseFeeIls: number;
    therapistsFeeIls: number;
    secretariesFeeIls: number;
    /** כמות מטפלים שמחויבים מעבר ל-includedTherapists. */
    chargeableTherapists: number;
    /** האם הופעלה הנחת נפח. */
    volumeDiscountApplied: boolean;
    /** כמות מזכירות שמחויבות מעבר ל-freeSecretaries. */
    chargeableSecretaries: number;
  };
  /** ה-snapshot של ה-plan/contract בזמן החישוב — חשוב ל-audit. */
  appliedAt: Date;
};

/**
 * פלט שגיאות — Organization לא קיים, אין plan, וכו'.
 */
export type EffectivePriceError = {
  error: "org_not_found" | "no_plan" | "invalid_data";
  message: string;
};

// ============================================================================
// Pure helpers — בלי Prisma, נוחים ל-unit testing
// ============================================================================

/**
 * הקלט הנקי לחישוב המחיר — בלי תלות ב-Prisma.
 * חולץ מ-Organization + ClinicPricingPlan + CustomContract + ספירת חברים.
 */
export type PriceInputs = {
  /** האם קיים חוזה מותאם פעיל. */
  customContract: {
    monthlyEquivPriceIls: number;
    startDate: Date;
    endDate: Date;
  } | null;

  /** התוכנית הבסיסית. */
  plan: {
    baseFeeIls: number;
    includedTherapists: number;
    perTherapistFeeIls: number;
    volumeDiscountAtCount: number | null;
    perTherapistAtVolumeIls: number | null;
    freeSecretaries: number;
    perSecretaryFeeIls: number | null;
  };

  /** כמות חברים בארגון לפי תפקיד (clinicRole). */
  counts: {
    therapists: number;
    secretaries: number;
  };

  /** התאריך לחישוב — בדרך כלל now. נחוץ לבדיקת חוזה פעיל. */
  asOf: Date;
};

/**
 * האם החוזה המותאם פעיל בתאריך הנתון? (startDate <= asOf < endDate).
 */
export function isCustomContractActive(
  contract: PriceInputs["customContract"],
  asOf: Date
): boolean {
  if (!contract) return false;
  return contract.startDate <= asOf && asOf < contract.endDate;
}

/**
 * חישוב עלות מטפלים לפי תוכנית — מתחשב בהנחת נפח.
 *
 * דוגמה:
 *   includedTherapists=1, perTherapistFeeIls=200, therapists=5
 *   → 4 chargeable * 200 = 800
 *
 *   includedTherapists=1, perTherapistFeeIls=200, volumeDiscountAtCount=10,
 *   perTherapistAtVolumeIls=150, therapists=15
 *   → 14 chargeable, 14 >= 10 ⇒ 14 * 150 = 2100 (כל המטפלים החיוביים בתעריף הנפח)
 */
export function calcTherapistFee(plan: PriceInputs["plan"], therapists: number): {
  fee: number;
  chargeable: number;
  volumeApplied: boolean;
} {
  const chargeable = Math.max(0, therapists - plan.includedTherapists);

  if (chargeable === 0) {
    return { fee: 0, chargeable: 0, volumeApplied: false };
  }

  const useVolume =
    plan.volumeDiscountAtCount !== null &&
    plan.perTherapistAtVolumeIls !== null &&
    therapists >= plan.volumeDiscountAtCount;

  const rate = useVolume ? plan.perTherapistAtVolumeIls! : plan.perTherapistFeeIls;
  return { fee: chargeable * rate, chargeable, volumeApplied: useVolume };
}

/**
 * חישוב עלות מזכירות מעבר לכלולות בחינם.
 */
export function calcSecretaryFee(plan: PriceInputs["plan"], secretaries: number): {
  fee: number;
  chargeable: number;
} {
  const chargeable = Math.max(0, secretaries - plan.freeSecretaries);
  if (chargeable === 0 || plan.perSecretaryFeeIls === null) {
    return { fee: 0, chargeable: 0 };
  }
  return { fee: chargeable * plan.perSecretaryFeeIls, chargeable };
}

/**
 * חישוב המחיר האפקטיבי — pure function. מקבל את כל הקלט מראש.
 * מועיל ל-unit testing מבלי לעשות mock ל-Prisma.
 */
export function computeEffectivePrice(inputs: PriceInputs): EffectivePrice {
  if (isCustomContractActive(inputs.customContract, inputs.asOf)) {
    const contract = inputs.customContract!;
    return {
      monthlyTotalIls: contract.monthlyEquivPriceIls,
      hasCustomContract: true,
      source: "custom_contract",
      breakdown: {
        baseFeeIls: contract.monthlyEquivPriceIls,
        therapistsFeeIls: 0,
        secretariesFeeIls: 0,
        chargeableTherapists: 0,
        volumeDiscountApplied: false,
        chargeableSecretaries: 0,
      },
      appliedAt: inputs.asOf,
    };
  }

  const therapistCalc = calcTherapistFee(inputs.plan, inputs.counts.therapists);
  const secretaryCalc = calcSecretaryFee(inputs.plan, inputs.counts.secretaries);

  return {
    monthlyTotalIls:
      inputs.plan.baseFeeIls + therapistCalc.fee + secretaryCalc.fee,
    hasCustomContract: false,
    source: "pricing_plan",
    breakdown: {
      baseFeeIls: inputs.plan.baseFeeIls,
      therapistsFeeIls: therapistCalc.fee,
      secretariesFeeIls: secretaryCalc.fee,
      chargeableTherapists: therapistCalc.chargeable,
      volumeDiscountApplied: therapistCalc.volumeApplied,
      chargeableSecretaries: secretaryCalc.chargeable,
    },
    appliedAt: inputs.asOf,
  };
}

// ============================================================================
// DB-aware entry point — עוטף computeEffectivePrice עם Prisma fetch
// ============================================================================

/**
 * שולף Organization + plan + contract + ספירות מטפלים/מזכירות מה-DB
 * ומחשב את המחיר האפקטיבי. מקבל את userCounts כפרמטר אופציונלי לדפוס Snapshot
 * (למשל בעת הרצת cron, רוצים להקפיא את הספירה לפי end-of-month).
 */
export async function getEffectivePrice(
  organizationId: string,
  options: { asOf?: Date; therapistCount?: number; secretaryCount?: number } = {}
): Promise<EffectivePrice | EffectivePriceError> {
  const asOf = options.asOf ?? new Date();

  const org = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: {
      id: true,
      pricingPlan: {
        select: {
          baseFeeIls: true,
          includedTherapists: true,
          perTherapistFeeIls: true,
          volumeDiscountAtCount: true,
          perTherapistAtVolumeIls: true,
          freeSecretaries: true,
          perSecretaryFeeIls: true,
        },
      },
      customContract: {
        select: {
          monthlyEquivPriceIls: true,
          startDate: true,
          endDate: true,
        },
      },
    },
  });

  if (!org) {
    return { error: "org_not_found", message: `Organization not found: ${organizationId}` };
  }
  if (!org.pricingPlan) {
    return { error: "no_plan", message: `No pricing plan attached to organization ${organizationId}` };
  }

  // ספירות מטפלים/מזכירות — אם לא הועברו, נטען מה-DB.
  let therapistCount = options.therapistCount;
  let secretaryCount = options.secretaryCount;

  if (therapistCount === undefined || secretaryCount === undefined) {
    const members = await prisma.user.groupBy({
      by: ["clinicRole"],
      where: { organizationId, isBlocked: false },
      _count: { _all: true },
    });

    therapistCount = members
      .filter((m) => m.clinicRole === "THERAPIST" || m.clinicRole === "OWNER")
      .reduce((sum, m) => sum + m._count._all, 0);
    secretaryCount = members
      .filter((m) => m.clinicRole === "SECRETARY")
      .reduce((sum, m) => sum + m._count._all, 0);
  }

  return computeEffectivePrice({
    customContract: org.customContract
      ? {
          monthlyEquivPriceIls: Number(org.customContract.monthlyEquivPriceIls),
          startDate: org.customContract.startDate,
          endDate: org.customContract.endDate,
        }
      : null,
    plan: {
      baseFeeIls: Number(org.pricingPlan.baseFeeIls),
      includedTherapists: org.pricingPlan.includedTherapists,
      perTherapistFeeIls: Number(org.pricingPlan.perTherapistFeeIls),
      volumeDiscountAtCount: org.pricingPlan.volumeDiscountAtCount,
      perTherapistAtVolumeIls:
        org.pricingPlan.perTherapistAtVolumeIls !== null
          ? Number(org.pricingPlan.perTherapistAtVolumeIls)
          : null,
      freeSecretaries: org.pricingPlan.freeSecretaries,
      perSecretaryFeeIls:
        org.pricingPlan.perSecretaryFeeIls !== null
          ? Number(org.pricingPlan.perSecretaryFeeIls)
          : null,
    },
    counts: { therapists: therapistCount, secretaries: secretaryCount },
    asOf,
  });
}
