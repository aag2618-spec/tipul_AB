// H12: zod schemas ל-/api/admin/* — Batch 12.
// כל ה-routes כבר מאובטחים ב-requirePermission, אבל zod מוסיף DoS protection
// (caps על אורכים) + הגנה מפני body מעוות (NoSQL operator injection).

import { z } from "zod";

const zId = z.string().min(1).max(64);

const MAX_KEY_LEN = 100;
const MAX_NAME_LEN = 200;
const MAX_TITLE_LEN = 200;
const MAX_DESCRIPTION_LEN = 1_000;
const MAX_CONTENT_LEN = 10_000;
const MAX_NOTES_LEN = 2_000;
const MAX_MESSAGE_LEN = 5_000;
const MAX_TIERS_COUNT = 20;
const MAX_TIER_NAME = 50;
const MAX_LIMIT_PARAM = 500;
const MAX_EMAIL_LEN = 254;

// === ENUMS משותפים =============================================================
// AdminAlertType (schema.prisma:361) — שומרים בסנכרון ידני.
const ALERT_TYPE = [
  "PAYMENT_DUE",
  "PAYMENT_OVERDUE",
  "PAYMENT_FAILED",
  "SUBSCRIPTION_EXPIRING",
  "SUBSCRIPTION_EXPIRED",
  "HIGH_AI_USAGE",
  "NEW_USER",
  "USER_BLOCKED",
  "TIER_CHANGE_REQUEST",
  "MANUAL_REMINDER",
  "SYSTEM",
  "SUPPORT_TICKET",
  "CREDIT_CONSUMPTION_FAILED",
  "IDEMPOTENCY_REPLAY_OF_FAILURE",
] as const;
const ALERT_PRIORITY = ["URGENT", "HIGH", "MEDIUM", "LOW"] as const;
const ALERT_STATUS = [
  "PENDING",
  "IN_PROGRESS",
  "RESOLVED",
  "DISMISSED",
  "SNOOZED",
] as const;
const SUPPORT_STATUS = [
  "OPEN",
  "WAITING",
  "WAITING_USER",
  "IN_PROGRESS",
  "RESOLVED",
  "CLOSED",
] as const;
const SUPPORT_PRIORITY = ["LOW", "MEDIUM", "HIGH", "URGENT"] as const;
const TIER_LEVELS = ["ESSENTIAL", "PRO", "ENTERPRISE"] as const;

// === POST /api/admin/feature-flags =============================================
const tiersField = z
  .array(z.string().max(MAX_TIER_NAME, "שם מכס ארוך מדי"))
  .max(MAX_TIERS_COUNT, `יותר מדי מסלולים (מקסימום ${MAX_TIERS_COUNT})`)
  .optional()
  .default([]);

export const createFeatureFlagSchema = z
  .object({
    key: z
      .string()
      .trim()
      .min(1, "key חובה")
      .max(MAX_KEY_LEN, `key ארוך מדי (מקסימום ${MAX_KEY_LEN})`)
      .regex(/^[a-zA-Z0-9_.-]+$/, "key יכול להכיל אותיות, ספרות, _ . או -"),
    name: z
      .string()
      .trim()
      .min(1, "name חובה")
      .max(MAX_NAME_LEN, `name ארוך מדי (מקסימום ${MAX_NAME_LEN})`),
    description: z
      .string()
      .max(MAX_DESCRIPTION_LEN, `description ארוך מדי (מקסימום ${MAX_DESCRIPTION_LEN})`)
      .optional()
      .nullable(),
    tiers: tiersField,
  })
  .strict();
export type CreateFeatureFlagInput = z.infer<typeof createFeatureFlagSchema>;

// === PUT /api/admin/feature-flags/[id] =========================================
export const updateFeatureFlagSchema = z
  .object({
    isEnabled: z.boolean().optional(),
    tiers: tiersField.optional(),
    name: z.string().trim().max(MAX_NAME_LEN).optional(),
    description: z.string().max(MAX_DESCRIPTION_LEN).optional(),
  })
  .strict();
export type UpdateFeatureFlagInput = z.infer<typeof updateFeatureFlagSchema>;

// === GET /api/admin/alerts (search params) =====================================
// limit מגיע כstring מ-URL ולכן z.coerce.number.
export const alertsQuerySchema = z.object({
  status: z.string().max(64).optional().nullable(),
  type: z.string().max(64).optional().nullable(),
  priority: z.string().max(64).optional().nullable(),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT_PARAM).default(50),
});
export type AlertsQuery = z.infer<typeof alertsQuerySchema>;

// === POST /api/admin/alerts ===================================================
// metadata: Json — מקבלים אובייקט/null. cap על גודל JSON serialize.
const metadataField = z
  .union([z.record(z.unknown()), z.array(z.unknown()), z.null()])
  .optional()
  .refine(
    (v) => {
      if (v === null || v === undefined) return true;
      try {
        return JSON.stringify(v).length <= 20_000;
      } catch {
        return false;
      }
    },
    { message: "metadata גדול מדי" }
  );

export const createAlertSchema = z
  .object({
    type: z.enum(ALERT_TYPE, {
      errorMap: () => ({ message: "סוג ההתראה לא תקין" }),
    }),
    priority: z.enum(ALERT_PRIORITY).optional().default("MEDIUM"),
    title: z.string().trim().min(1, "כותרת חובה").max(MAX_TITLE_LEN),
    message: z.string().min(1, "הודעה חובה").max(MAX_MESSAGE_LEN),
    userId: zId.optional().nullable(),
    actionRequired: z.string().max(MAX_NOTES_LEN).optional().nullable(),
    scheduledFor: z.string().max(64).optional().nullable(),
    metadata: metadataField,
  })
  .strict();
export type CreateAlertInput = z.infer<typeof createAlertSchema>;

// === PATCH /api/admin/alerts/[id] =============================================
export const updateAlertSchema = z
  .object({
    status: z.enum(ALERT_STATUS).optional(),
    priority: z.enum(ALERT_PRIORITY).optional(),
    actionTaken: z.string().max(MAX_NOTES_LEN).optional().nullable(),
    scheduledFor: z.string().max(64).optional().nullable(),
  })
  .strict();
export type UpdateAlertInput = z.infer<typeof updateAlertSchema>;

// === POST /api/admin/announcements =============================================
const ANNOUNCEMENT_TYPES = ["info", "warning", "success", "error"] as const;
export const createAnnouncementSchema = z
  .object({
    title: z.string().trim().min(1, "כותרת חובה").max(MAX_TITLE_LEN),
    content: z.string().min(1, "תוכן חובה").max(MAX_CONTENT_LEN),
    type: z.enum(ANNOUNCEMENT_TYPES).optional(),
    expiresAt: z.string().max(64).optional().nullable(),
    showBanner: z.boolean().optional(),
  })
  .strict();
export type CreateAnnouncementInput = z.infer<typeof createAnnouncementSchema>;

// === PUT /api/admin/announcements/[id] =========================================
export const updateAnnouncementSchema = z
  .object({
    title: z.string().trim().max(MAX_TITLE_LEN).optional(),
    content: z.string().max(MAX_CONTENT_LEN).optional(),
    type: z.enum(ANNOUNCEMENT_TYPES).optional(),
    isActive: z.boolean().optional(),
    showBanner: z.boolean().optional(),
    expiresAt: z.string().max(64).optional().nullable(),
  })
  .strict();
export type UpdateAnnouncementInput = z.infer<typeof updateAnnouncementSchema>;

// === PATCH /api/admin/support/[id] =============================================
export const updateSupportTicketSchema = z
  .object({
    status: z.enum(SUPPORT_STATUS).optional(),
    adminNotes: z.string().max(MAX_NOTES_LEN).optional().nullable(),
    priority: z.enum(SUPPORT_PRIORITY).optional(),
  })
  .strict();
export type UpdateSupportTicketInput = z.infer<typeof updateSupportTicketSchema>;

// === POST /api/admin/support/[id] (JSON branch בלבד) ============================
// multipart/form-data משתמש ב-formData parsing נפרד; כאן רק JSON message.
export const supportReplySchema = z
  .object({
    message: z
      .string()
      .min(1, "יש לכתוב הודעה")
      .max(MAX_MESSAGE_LEN, `הודעה ארוכה מדי (מקסימום ${MAX_MESSAGE_LEN})`),
  })
  .strict();
export type SupportReplyInput = z.infer<typeof supportReplySchema>;

// === POST /api/admin/set-admin ================================================
export const setAdminSchema = z
  .object({
    email: z
      .string()
      .trim()
      .toLowerCase()
      .min(1, "נא לספק כתובת אימייל")
      .max(MAX_EMAIL_LEN, "אימייל ארוך מדי")
      .email("אימייל לא תקין"),
  })
  .strict();
export type SetAdminInput = z.infer<typeof setAdminSchema>;

// === GET /api/admin/trials (search params) ====================================
export const trialsQuerySchema = z.object({
  search: z.string().max(200).optional().nullable(),
  status: z.string().max(32).optional().nullable(),
});
export type TrialsQuery = z.infer<typeof trialsQuerySchema>;

// === PATCH /api/admin/trials ==================================================
const TRIAL_ACTIONS = ["block", "unblock", "grantFree"] as const;
export const updateTrialUserSchema = z
  .object({
    userId: zId,
    action: z.enum(TRIAL_ACTIONS, {
      errorMap: () => ({ message: "פעולה לא מוכרת" }),
    }),
    aiTier: z.enum(TIER_LEVELS).optional().nullable(),
    note: z.string().max(MAX_NOTES_LEN).optional().nullable(),
  })
  .strict();
export type UpdateTrialUserInput = z.infer<typeof updateTrialUserSchema>;

// === PUT /api/admin/tier-limits ===============================================
// המרה: priceMonthly עשוי להגיע כ-number או string. שאר השדות int או -1.
const limitInt = z
  .number()
  .int("חייב להיות מספר שלם")
  .min(-1, "ערך מינימלי הוא -1 (חסום)")
  .max(1_000_000, "ערך גבוה מדי")
  .optional();

export const updateTierLimitsSchema = z
  .object({
    tier: z.enum(TIER_LEVELS, {
      errorMap: () => ({ message: "תוכנית לא תקינה" }),
    }),
    displayNameHe: z.string().trim().max(80).optional(),
    displayNameEn: z.string().trim().max(80).optional(),
    // priceMonthly מגיע כ-number מה-UI (input type=number); התקבלות string היא
    // תאימות-לאחור — z.coerce.number ממיר string→number ב-output type.
    priceMonthly: z.coerce.number().min(0).max(100_000).optional(),
    description: z.string().max(MAX_DESCRIPTION_LEN).optional(),
    sessionPrepLimit: limitInt,
    conciseAnalysisLimit: limitInt,
    detailedAnalysisLimit: limitInt,
    singleQuestionnaireLimit: limitInt,
    combinedQuestionnaireLimit: limitInt,
    progressReportLimit: limitInt,
    discountQuarterly: z.coerce.number().int().min(0).max(100).optional(),
    discountSemiAnnual: z.coerce.number().int().min(0).max(100).optional(),
    discountAnnual: z.coerce.number().int().min(0).max(100).optional(),
  })
  .strict();
export type UpdateTierLimitsInput = z.infer<typeof updateTierLimitsSchema>;

// === POST /api/admin/tier-limits (RESET) =====================================
const RESET_TIER_LIMITS_TOKEN = "RESET_TIER_LIMITS";
export const resetTierLimitsSchema = z
  .object({
    confirm: z.literal(RESET_TIER_LIMITS_TOKEN, {
      errorMap: () => ({
        message:
          'פעולה הרסנית: יש לשלוח confirm="RESET_TIER_LIMITS" בגוף הבקשה כדי לאשר איפוס מלא של כל המכסות.',
      }),
    }),
  })
  .strict();
export type ResetTierLimitsInput = z.infer<typeof resetTierLimitsSchema>;

// === POST /api/admin/ai-settings ==============================================
// allowlist: רק 12 השדות האלה — שאר השדות (id, updatedAt) נדחים. zod strict
// מחזק את ALLOWED_FIELDS שכבר קיים ב-route.
export const updateAiSettingsSchema = z
  .object({
    dailyLimitEssential: limitInt,
    dailyLimitPro: limitInt,
    dailyLimitEnterprise: limitInt,
    monthlyLimitEssential: limitInt,
    monthlyLimitPro: limitInt,
    monthlyLimitEnterprise: limitInt,
    maxMonthlyCostBudget: z.coerce.number().min(0).max(1_000_000).optional(),
    alertThreshold: z.coerce.number().min(0).max(100).optional(),
    blockOnExceed: z.boolean().optional(),
    alertAdminOnExceed: z.boolean().optional(),
    enableCache: z.boolean().optional(),
    compressPrompts: z.boolean().optional(),
  })
  .strict();
export type UpdateAiSettingsInput = z.infer<typeof updateAiSettingsSchema>;

// === POST /api/admin/business-settings ========================================
// SiteSetting upsert per field. cap על אורכים, vatRate 0..100.
const MAX_BUSINESS_TEXT = 500;
export const updateAdminBusinessSettingsSchema = z
  .object({
    type: z.enum(["EXEMPT", "LICENSED"]).optional(),
    name: z.string().max(MAX_BUSINESS_TEXT).optional(),
    idNumber: z.string().max(50).optional(),
    address: z.string().max(MAX_BUSINESS_TEXT).optional(),
    phone: z.string().max(50).optional(),
    email: z
      .string()
      .max(MAX_EMAIL_LEN)
      .email("כתובת מייל לא תקינה")
      .or(z.literal(""))
      .optional(),
    vatRate: z
      .number()
      .min(0, 'אחוז מע"מ חייב להיות בין 0 ל-100')
      .max(100, 'אחוז מע"מ חייב להיות בין 0 ל-100')
      .optional(),
    logoUrl: z.string().max(2_000).nullable().optional(),
    footerText: z.string().max(2_000).nullable().optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "אין שדות לעדכון",
  });
export type UpdateAdminBusinessSettingsInput = z.infer<
  typeof updateAdminBusinessSettingsSchema
>;

// === GET /api/admin/terms (search params) =====================================
export const termsQuerySchema = z.object({
  userId: zId.optional().nullable(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  limit: z.coerce.number().int().min(1).max(MAX_LIMIT_PARAM).default(50),
});
export type TermsQuery = z.infer<typeof termsQuerySchema>;

// === PATCH /api/admin/clinics/[id] ============================================
// body גדול — שילוב של פרטי קליניקה + אופציה להעברת בעלות + שינוי תוכנית.
const SUBSCRIPTION_STATUSES = [
  "TRIALING",
  "ACTIVE",
  "PAST_DUE",
  "CANCELLED",
  "PAUSED",
] as const;

// === GET /api/admin/clinics/transfers (search params) =========================
export const clinicTransfersQuerySchema = z.object({
  orgId: z.string().max(64).optional().nullable(),
  from: z.string().max(64).optional().nullable(),
  to: z.string().max(64).optional().nullable(),
  limit: z.coerce.number().int().min(1).max(1000).default(200),
});
export type ClinicTransfersQuery = z.infer<typeof clinicTransfersQuerySchema>;

// === GET /api/admin/clinics/owner-candidates (search params) ==================
export const ownerCandidatesQuerySchema = z.object({
  q: z.string().max(200).optional().nullable(),
  excludeOrgId: z.string().max(64).optional().nullable(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
export type OwnerCandidatesQuery = z.infer<typeof ownerCandidatesQuerySchema>;

// === GET /api/admin/audit-log (search params) ================================
export const auditLogQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  action: z.string().max(100).optional().nullable(),
  from: z.string().max(64).optional().nullable(),
  to: z.string().max(64).optional().nullable(),
  userId: zId.optional().nullable(),
  targetId: zId.optional().nullable(),
});
export type AuditLogQuery = z.infer<typeof auditLogQuerySchema>;

// === GET /api/admin/audit/data-access (search params) ========================
export const dataAccessAuditQuerySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  size: z.coerce.number().int().min(1).max(200).default(50),
  userId: zId.optional().nullable(),
  recordType: z.string().max(64).optional().nullable(),
  recordId: zId.optional().nullable(),
  action: z.string().max(64).optional().nullable(),
  clientId: zId.optional().nullable(),
  from: z.string().max(64).optional().nullable(),
  to: z.string().max(64).optional().nullable(),
});
export type DataAccessAuditQuery = z.infer<typeof dataAccessAuditQuerySchema>;

// === GET /api/admin/search (search params) ===================================
export const adminSearchQuerySchema = z.object({
  q: z.string().max(200).optional().nullable(),
});
export type AdminSearchQuery = z.infer<typeof adminSearchQuerySchema>;

export const updateClinicSchema = z
  .object({
    name: z.string().trim().max(MAX_NAME_LEN).optional(),
    businessIdNumber: z.string().max(50).optional().nullable(),
    businessName: z.string().max(MAX_BUSINESS_TEXT).optional().nullable(),
    businessAddress: z.string().max(MAX_BUSINESS_TEXT).optional().nullable(),
    businessPhone: z.string().max(50).optional().nullable(),
    logoUrl: z.string().max(2_000).optional().nullable(),
    ownerIsTherapist: z.boolean().optional(),
    aiTier: z.enum(TIER_LEVELS).optional(),
    subscriptionStatus: z.enum(SUBSCRIPTION_STATUSES).optional(),
    subscriptionStartedAt: z.string().max(64).optional().nullable(),
    subscriptionEndsAt: z.string().max(64).optional().nullable(),
    pricingPlanId: zId.optional(),
    ownerUserId: zId.optional(),
  })
  .strict();
export type UpdateClinicInput = z.infer<typeof updateClinicSchema>;
