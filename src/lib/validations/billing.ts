// H12: zod schemas ל-/api/admin/billing + /admin/pricing + /admin/clinic-plans +
// /admin/sms-packages + /admin/custom-contracts + /admin/coupons +
// /admin/chargebacks + /admin/receipts — Batch 13.
//
// כל ה-routes כאן כבר מאובטחים ב-requirePermission (settings.pricing,
// payments.view_all, payments.manual, payments.delete, payments.refund,
// packages.catalog_manage, receipts.resend, receipts.void). zod מוסיף:
//   - DoS protection (caps על אורכים)
//   - הגנה מפני body מעוות (NoSQL operator injection)
//   - typed body — מסיר את הצורך ב-validations ידניים פזורים בקבצים

import { z } from "zod";

const zId = z.string().min(1).max(64);

const MAX_NAME_LEN = 200;
const MAX_DESCRIPTION_LEN = 1_000;
const MAX_NOTES_LEN = 2_000;
const MAX_URL_LEN = 2_000;
const MAX_EMAIL_LEN = 254;
const MAX_LIMIT_PARAM = 500;

// === enums (תואם ל-prisma/schema.prisma — שומרים בסנכרון ידני) =================
const PRICING_SCOPES = ["GLOBAL", "ORGANIZATION", "CLINIC_MEMBER", "USER"] as const;
const PACKAGE_TYPES = ["SMS", "AI_DETAILED_ANALYSIS"] as const;
const AI_TIERS = ["ESSENTIAL", "PRO", "ENTERPRISE"] as const;
const SUBSCRIPTION_PAYMENT_STATUS = [
  "PENDING",
  "PAID",
  "OVERDUE",
  "CANCELLED",
  "REFUNDED",
] as const;
const COUPON_TYPES = ["SINGLE_USE", "LIMITED", "UNLIMITED"] as const;

// === helpers ===================================================================
// Decimal(10,2): מחירים יכולים להכיל עד 2 ספרות אחרי הנקודה.
const priceField = z
  .number()
  .finite("ערך לא חוקי")
  .min(0, "מחיר חייב להיות מספר אי-שלילי")
  .max(1_000_000, "מחיר גבוה מדי")
  .refine((v) => Math.round(v * 100) === v * 100, {
    message: "מחיר יכול להכיל עד 2 ספרות אחרי הנקודה",
  });

const optionalPriceField = priceField.optional().nullable();

const positiveIntField = z
  .number()
  .int("חייב להיות מספר שלם")
  .min(1, "חייב להיות חיובי")
  .max(1_000_000, "ערך גבוה מדי");

const nonNegativeIntField = z
  .number()
  .int("חייב להיות מספר שלם")
  .min(0, "ערך לא יכול להיות שלילי")
  .max(1_000_000, "ערך גבוה מדי");

// תאריך כ-ISO string — בודקים שמתפרש לתאריך חוקי. cap על אורך למניעת DoS.
const isoDateString = z
  .string()
  .max(64, "מחרוזת תאריך ארוכה מדי")
  .refine((v) => !Number.isNaN(new Date(v).getTime()), {
    message: "תאריך לא חוקי",
  });

// === GET /api/admin/billing (search params) ===================================
export const billingQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT_PARAM).default(50),
  offset: z.coerce.number().int().min(0).max(1_000_000).default(0),
  userId: zId.optional().nullable(),
  status: z.enum(SUBSCRIPTION_PAYMENT_STATUS).optional().nullable(),
});
export type BillingQuery = z.infer<typeof billingQuerySchema>;

// === POST /api/admin/billing ==================================================
export const createBillingSchema = z
  .object({
    userId: zId,
    amount: priceField,
    description: z.string().max(MAX_DESCRIPTION_LEN).optional().nullable(),
    periodStart: isoDateString.optional().nullable(),
    periodEnd: isoDateString.optional().nullable(),
    status: z.enum(SUBSCRIPTION_PAYMENT_STATUS).optional(),
  })
  .strict();
export type CreateBillingInput = z.infer<typeof createBillingSchema>;

// === PUT /api/admin/billing/[id] ==============================================
export const updateBillingSchema = z
  .object({
    amount: priceField.optional(),
    description: z.string().max(MAX_DESCRIPTION_LEN).optional().nullable(),
    status: z.enum(SUBSCRIPTION_PAYMENT_STATUS).optional(),
    paidAt: isoDateString.optional().nullable(),
    invoiceUrl: z.string().max(MAX_URL_LEN).optional().nullable(),
  })
  .strict();
export type UpdateBillingInput = z.infer<typeof updateBillingSchema>;

// === GET /api/admin/pricing/package-policies (search params) ==================
export const packagePoliciesQuerySchema = z.object({
  scope: z.enum(PRICING_SCOPES).optional().nullable(),
  organizationId: zId.optional().nullable(),
  userId: zId.optional().nullable(),
  packageType: z.enum(PACKAGE_TYPES).optional().nullable(),
  activeOnly: z.enum(["true", "false"]).optional().nullable(),
  take: z.coerce.number().int().min(1).max(500).default(200),
});
export type PackagePoliciesQuery = z.infer<typeof packagePoliciesQuerySchema>;

// === POST /api/admin/pricing/package-policies =================================
export const createPackagePolicySchema = z
  .object({
    scope: z.enum(PRICING_SCOPES, {
      errorMap: () => ({ message: "ערך 'היקף' לא חוקי" }),
    }),
    organizationId: zId.optional().nullable(),
    userId: zId.optional().nullable(),
    packageType: z.enum(PACKAGE_TYPES, {
      errorMap: () => ({ message: "ערך 'סוג חבילה' לא חוקי" }),
    }),
    credits: positiveIntField,
    priceIls: priceField,
    validFrom: isoDateString.optional().nullable(),
    validUntil: isoDateString.optional().nullable(),
    notes: z.string().max(MAX_NOTES_LEN).optional().nullable(),
  })
  .strict();
export type CreatePackagePolicyInput = z.infer<typeof createPackagePolicySchema>;

// === PATCH /api/admin/pricing/package-policies/[id] ===========================
// המודל immutable — מותרים רק notes ו-validUntil. שאר השדות נדחים בקובץ ה-route
// (אנחנו מאפשרים אותם ב-schema כדי לתת error message ברור על immutability).
export const updatePackagePolicySchema = z
  .object({
    notes: z.string().max(MAX_NOTES_LEN).optional().nullable(),
    validUntil: z.union([isoDateString, z.null()]).optional(),
    // השדות הבאים נדחים ב-route — מותרים ב-schema רק כדי לאפשר error message
    scope: z.unknown().optional(),
    organizationId: z.unknown().optional(),
    userId: z.unknown().optional(),
    packageType: z.unknown().optional(),
    credits: z.unknown().optional(),
    priceIls: z.unknown().optional(),
    validFrom: z.unknown().optional(),
  })
  .strict();
export type UpdatePackagePolicyInput = z.infer<typeof updatePackagePolicySchema>;

// === GET /api/admin/pricing/policies (search params) ==========================
export const pricingPoliciesQuerySchema = z.object({
  scope: z.enum(PRICING_SCOPES).optional().nullable(),
  organizationId: zId.optional().nullable(),
  userId: zId.optional().nullable(),
  planTier: z.enum(AI_TIERS).optional().nullable(),
  activeOnly: z.enum(["true", "false"]).optional().nullable(),
  take: z.coerce.number().int().min(1).max(500).default(200),
});
export type PricingPoliciesQuery = z.infer<typeof pricingPoliciesQuerySchema>;

// === POST /api/admin/pricing/policies =========================================
export const createPricingPolicySchema = z
  .object({
    scope: z.enum(PRICING_SCOPES, {
      errorMap: () => ({ message: "ערך 'היקף' לא חוקי" }),
    }),
    organizationId: zId.optional().nullable(),
    userId: zId.optional().nullable(),
    planTier: z.enum(AI_TIERS, {
      errorMap: () => ({ message: "ערך 'רמת תוכנית' לא חוקי" }),
    }),
    monthlyIls: priceField,
    quarterlyIls: optionalPriceField,
    halfYearIls: optionalPriceField,
    yearlyIls: optionalPriceField,
    validFrom: isoDateString.optional().nullable(),
    validUntil: isoDateString.optional().nullable(),
    notes: z.string().max(MAX_NOTES_LEN).optional().nullable(),
  })
  .strict();
export type CreatePricingPolicyInput = z.infer<typeof createPricingPolicySchema>;

// === PATCH /api/admin/pricing/policies/[id] ===================================
export const updatePricingPolicySchema = z
  .object({
    notes: z.string().max(MAX_NOTES_LEN).optional().nullable(),
    validUntil: z.union([isoDateString, z.null()]).optional(),
    // immutable: scope, organizationId, userId, planTier, monthlyIls,
    // quarterlyIls, halfYearIls, yearlyIls, validFrom — מותרים ב-schema רק כדי
    // לאפשר error message ברור ב-route.
    scope: z.unknown().optional(),
    organizationId: z.unknown().optional(),
    userId: z.unknown().optional(),
    planTier: z.unknown().optional(),
    monthlyIls: z.unknown().optional(),
    quarterlyIls: z.unknown().optional(),
    halfYearIls: z.unknown().optional(),
    yearlyIls: z.unknown().optional(),
    validFrom: z.unknown().optional(),
  })
  .strict();
export type UpdatePricingPolicyInput = z.infer<typeof updatePricingPolicySchema>;

// === POST /api/admin/clinic-plans =============================================
export const createClinicPlanSchema = z
  .object({
    name: z.string().trim().min(1, "נדרש שם תוכנית").max(MAX_NAME_LEN),
    internalCode: z
      .string()
      .trim()
      .min(1, "נדרש קוד פנימי")
      .max(50, "קוד פנימי ארוך מדי"),
    isActive: z.boolean().optional(),
    isDefault: z.boolean().optional(),
    baseFeeIls: priceField,
    includedTherapists: nonNegativeIntField.optional(),
    perTherapistFeeIls: priceField,
    volumeDiscountAtCount: nonNegativeIntField.optional().nullable(),
    perTherapistAtVolumeIls: optionalPriceField,
    freeSecretaries: nonNegativeIntField.optional(),
    perSecretaryFeeIls: optionalPriceField,
    smsQuotaPerMonth: nonNegativeIntField.optional(),
    aiTierIncluded: z.enum(AI_TIERS).optional().nullable(),
    aiAddonDiscountPercent: z
      .number()
      .min(0, "אחוז חייב להיות בין 0 ל-100")
      .max(100, "אחוז חייב להיות בין 0 ל-100")
      .optional()
      .nullable(),
    maxTherapists: nonNegativeIntField.optional().nullable(),
    maxSecretaries: nonNegativeIntField.optional().nullable(),
    description: z.string().max(MAX_DESCRIPTION_LEN).optional().nullable(),
  })
  .strict();
export type CreateClinicPlanInput = z.infer<typeof createClinicPlanSchema>;

// === PATCH /api/admin/clinic-plans/[id] =======================================
export const updateClinicPlanSchema = z
  .object({
    name: z.string().trim().min(1, "שם תוכנית חובה").max(MAX_NAME_LEN).optional(),
    // internalCode הוא immutable — מותר ב-payload (UI שולח אותו גם בעריכה דרך
    // formToPayload) אבל ה-route מתעלם ממנו. מאפשרים כאן רק כדי לא להישבר
    // מ-.strict(). cap 50 = מגבלת DoS.
    internalCode: z.string().max(50).optional(),
    isActive: z.boolean().optional(),
    isDefault: z.boolean().optional(),
    baseFeeIls: priceField.optional(),
    includedTherapists: nonNegativeIntField.optional(),
    perTherapistFeeIls: priceField.optional(),
    volumeDiscountAtCount: nonNegativeIntField.optional().nullable(),
    perTherapistAtVolumeIls: optionalPriceField,
    freeSecretaries: nonNegativeIntField.optional(),
    perSecretaryFeeIls: optionalPriceField,
    smsQuotaPerMonth: nonNegativeIntField.optional(),
    aiTierIncluded: z.enum(AI_TIERS).optional().nullable(),
    aiAddonDiscountPercent: z
      .number()
      .min(0)
      .max(100)
      .optional()
      .nullable(),
    maxTherapists: nonNegativeIntField.optional().nullable(),
    maxSecretaries: nonNegativeIntField.optional().nullable(),
    description: z.string().max(MAX_DESCRIPTION_LEN).optional().nullable(),
  })
  .strict();
export type UpdateClinicPlanInput = z.infer<typeof updateClinicPlanSchema>;

// === POST /api/admin/sms-packages =============================================
export const createSmsPackageSchema = z
  .object({
    name: z.string().trim().min(1, "נדרש שם חבילה").max(MAX_NAME_LEN),
    credits: positiveIntField,
    priceIls: priceField,
    isActive: z.boolean().optional(),
  })
  .strict();
export type CreateSmsPackageInput = z.infer<typeof createSmsPackageSchema>;

// === PATCH /api/admin/sms-packages/[id] =======================================
export const updateSmsPackageSchema = z
  .object({
    name: z.string().trim().min(1, "שם חבילה חובה").max(MAX_NAME_LEN).optional(),
    credits: positiveIntField.optional(),
    priceIls: priceField.optional(),
    isActive: z.boolean().optional(),
  })
  .strict();
export type UpdateSmsPackageInput = z.infer<typeof updateSmsPackageSchema>;

// === GET /api/admin/custom-contracts (search params) ==========================
export const customContractsQuerySchema = z.object({
  status: z
    .enum(["all", "active", "expiring", "expired", "future"])
    .optional()
    .nullable(),
});
export type CustomContractsQuery = z.infer<typeof customContractsQuerySchema>;

// === POST /api/admin/custom-contracts =========================================
export const createCustomContractSchema = z
  .object({
    organizationId: zId,
    monthlyEquivPriceIls: priceField,
    billingCycleMonths: z.number().int().min(1).max(120).optional(),
    customSmsQuota: nonNegativeIntField.optional().nullable(),
    customAiTier: z.enum(AI_TIERS).optional().nullable(),
    startDate: isoDateString,
    endDate: isoDateString,
    autoRenew: z.boolean().optional(),
    renewalMonths: z.number().int().min(1).max(120).optional(),
    annualIncreasePct: z.number().min(-100).max(1_000).optional().nullable(),
    signedDocumentUrl: z.string().max(MAX_URL_LEN).optional().nullable(),
    notes: z.string().max(MAX_NOTES_LEN).optional().nullable(),
  })
  .strict();
export type CreateCustomContractInput = z.infer<typeof createCustomContractSchema>;

// === PATCH /api/admin/custom-contracts/[id] ===================================
export const updateCustomContractSchema = z
  .object({
    monthlyEquivPriceIls: priceField.optional(),
    billingCycleMonths: z.number().int().min(1).max(120).optional(),
    customSmsQuota: nonNegativeIntField.optional().nullable(),
    customAiTier: z.enum(AI_TIERS).optional().nullable(),
    startDate: isoDateString.optional(),
    endDate: isoDateString.optional(),
    autoRenew: z.boolean().optional(),
    renewalMonths: z.number().int().min(1).max(120).optional(),
    annualIncreasePct: z.number().min(-100).max(1_000).optional().nullable(),
    signedDocumentUrl: z.string().max(MAX_URL_LEN).optional().nullable(),
    notes: z.string().max(MAX_NOTES_LEN).optional().nullable(),
  })
  .strict();
export type UpdateCustomContractInput = z.infer<typeof updateCustomContractSchema>;

// === POST /api/admin/coupons ==================================================
export const createCouponSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(1, "נא לספק קוד")
      .max(50, "קוד ארוך מדי")
      .regex(/^[a-zA-Z0-9_-]+$/, "קוד יכול להכיל אותיות, ספרות, _ או -"),
    name: z.string().trim().min(1, "נא לספק שם").max(MAX_NAME_LEN),
    type: z.enum(COUPON_TYPES).optional(),
    maxUses: z.number().int().min(1).max(1_000_000).optional().nullable(),
    trialDays: z.number().int().min(0).max(3_650).optional(),
    validUntil: isoDateString.optional().nullable(),
    discount: z.number().min(0).max(100).optional(),
  })
  .strict();
export type CreateCouponInput = z.infer<typeof createCouponSchema>;

// === PATCH /api/admin/coupons/[id] ============================================
export const updateCouponSchema = z
  .object({
    name: z.string().trim().min(1, "שם קופון חובה").max(MAX_NAME_LEN).optional(),
    type: z.enum(COUPON_TYPES).optional(),
    maxUses: z.number().int().min(1).max(1_000_000).optional().nullable(),
    trialDays: z.number().int().min(0).max(3_650).optional(),
    validUntil: isoDateString.optional().nullable(),
    isActive: z.boolean().optional(),
    discount: z.number().min(0).max(100).optional(),
  })
  .strict();
export type UpdateCouponInput = z.infer<typeof updateCouponSchema>;

// === POST /api/admin/chargebacks/[id]/review ==================================
export const chargebackReviewSchema = z
  .object({
    note: z.string().max(MAX_NOTES_LEN, "הערה ארוכה מדי (מקסימום 2000 תווים)").optional(),
    reconciled: z.boolean().optional(),
  })
  .strict();
export type ChargebackReviewInput = z.infer<typeof chargebackReviewSchema>;

// === POST /api/admin/receipts/[id]/resend =====================================
export const receiptResendSchema = z
  .object({
    email: z
      .string()
      .trim()
      .max(MAX_EMAIL_LEN, "אימייל ארוך מדי")
      .email("כתובת מייל לא תקינה")
      .optional(),
  })
  .strict();
export type ReceiptResendInput = z.infer<typeof receiptResendSchema>;

// === POST /api/admin/receipts/[id]/void =======================================
export const receiptVoidSchema = z
  .object({
    reason: z.string().max(MAX_NOTES_LEN, "סיבה ארוכה מדי").optional(),
  })
  .strict();
export type ReceiptVoidInput = z.infer<typeof receiptVoidSchema>;
