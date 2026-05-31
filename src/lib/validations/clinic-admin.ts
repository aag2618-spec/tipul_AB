// H12: zod schemas ל-clinic-admin endpoints —
//   members/[id] PATCH, transfer-client POST, impersonate/start POST,
//   dashboard/clinic/leave POST.
// כולם דורשים auth + הרשאות נוספות (OWNER/ADMIN) — הולידציה כאן רק על body.

import { z } from "zod";
import { zId } from "./shared";

const MAX_REASON_LEN = 500;
const MAX_NOTES_LEN = 2_000;
const MAX_SESSION_IDS = 1_000; // cap על batch של פגישות בהעברה — DoS protection.

// === PATCH /api/clinic-admin/members/[id] ======================================
// D6: secretaryPermissions: Json? בסכמה. בעבר התקבל record גנרי (כל key/כל ערך),
// מה שאיפשר לאחסן מפתחות לא-מוכרים. עכשיו allow-list מפורש של ההרשאות הידועות
// בלבד, כל אחת boolean אופציונלי. ה-source-of-truth לרשימה הוא
// `SecretaryPermissions` ב-`src/lib/scope.ts` — לשמור סנכרון בעת הוספת הרשאה.
//
// תאימות לאחור: `.strip()` (ברירת המחדל של zod) — מפתחות לא-מוכרים מנוקים
// בשקט במקום לדחות את הבקשה. כך בקשה ישנה/עתידית עם key נוסף לא נשברת,
// אבל רק ההרשאות המוכרות נשמרות בפועל ל-DB.
//
// מיוצא כדי שגם POST /api/clinic-admin/invitations ישתמש באותה סכמה
// (במקום כפילות בת 7 מפתחות שהשמיטה את canTransferClient) — מונע drift.
export const secretaryPermissionsSchema = z
  .object({
    canViewPayments: z.boolean().optional(),
    canIssueReceipts: z.boolean().optional(),
    canSendReminders: z.boolean().optional(),
    canCreateClient: z.boolean().optional(),
    canViewDebts: z.boolean().optional(),
    canViewStats: z.boolean().optional(),
    canViewConsentForms: z.boolean().optional(),
    canTransferClient: z.boolean().optional(),
  })
  .strip();

export const updateMemberSchema = z
  .object({
    clinicRole: z.enum(["THERAPIST", "SECRETARY"]).optional(),
    secretaryPermissions: secretaryPermissionsSchema.optional().nullable(),
  })
  .strict()
  .refine(
    (data) =>
      data.clinicRole !== undefined || data.secretaryPermissions !== undefined,
    { message: "לא הועברו שינויים" }
  );
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;

// === POST /api/clinic-admin/transfer-client ====================================
const sessionIdsSchema = z
  .array(zId)
  .max(MAX_SESSION_IDS, `יותר מדי פגישות (מקסימום ${MAX_SESSION_IDS})`)
  .default([]);

export const transferClientSchema = z
  .object({
    clientId: zId,
    toTherapistId: zId,
    reason: z
      .string()
      .max(MAX_REASON_LEN, `סיבה ארוכה מדי (מקסימום ${MAX_REASON_LEN} תווים)`)
      .optional()
      .nullable(),
    transferFutureSessions: z.boolean().optional().default(false),
    sessionsToTransfer: sessionIdsSchema.optional(),
    sessionsToTransferWithOverride: sessionIdsSchema.optional(),
    sessionsToCancel: sessionIdsSchema.optional(),
  })
  .strict();
export type TransferClientInput = z.infer<typeof transferClientSchema>;

// === POST /api/clinic-admin/impersonate/start ==================================
// reason: 5..500 תווים (אכיפת minimum כדי שתהיה תיעוד אמיתי באודיט).
const MIN_IMPERSONATE_REASON = 5;
export const impersonateStartSchema = z
  .object({
    targetUserId: zId,
    reason: z
      .string()
      .trim()
      .min(
        MIN_IMPERSONATE_REASON,
        `סיבה לא תקינה (לפחות ${MIN_IMPERSONATE_REASON} תווים)`
      )
      .max(MAX_REASON_LEN, `הסיבה ארוכה מדי (מקסימום ${MAX_REASON_LEN} תווים)`),
  })
  .strict();
export type ImpersonateStartInput = z.infer<typeof impersonateStartSchema>;

// === POST /api/dashboard/clinic/leave ==========================================
// decisionDeadlineDays: 7..90, integer.
export const leaveClinicSchema = z
  .object({
    reason: z
      .string()
      .max(MAX_NOTES_LEN, `סיבה ארוכה מדי (מקסימום ${MAX_NOTES_LEN} תווים)`)
      .optional()
      .nullable(),
    decisionDeadlineDays: z
      .number()
      .int("מספר ימים חייב להיות מספר שלם")
      .min(7, "תקופת ההחלטה חייבת להיות לפחות 7 ימים")
      .max(90, "תקופת ההחלטה לא יכולה לעבור 90 ימים"),
  })
  .strict();
export type LeaveClinicInput = z.infer<typeof leaveClinicSchema>;
