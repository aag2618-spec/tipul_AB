/**
 * Permission system — MyTipul Admin
 *
 * 40 closed-type permissions (26 MANAGER + 14 ADMIN-only) + PERMISSION_RANK
 * for "highest wins" combo logic.
 * Built in Stage 1.1; extended in Stages 1.9 (reports.view_ai, payments.view_all,
 * alerts.manage, payments.delete, announcements.delete) and 1.10 (alerts.view).
 *
 * Key ideas:
 * - `type Permission` = closed union of strings → typos become compile errors
 * - `PERMISSIONS_BY_ROLE` maps USER/MANAGER/ADMIN → allowed permissions
 * - `hasPermission(role, perm)` → boolean check (ADMIN always true)
 * - `PERMISSION_RANK` → numeric ranking; `requireHighestPermission([keys])` uses
 *   max rank to decide the required permission for combo requests
 *   (e.g. {role: "ADMIN", grantFree: true} → requires the higher of
 *    users.change_role and users.grant_free_30d)
 */

import type { Role } from "@prisma/client";

export type Permission =
  // קריאה
  | "users.view"
  | "audit.view_all"
  | "audit.view_per_user"

  // קריאה מורחבת (MANAGER)
  | "reports.view_ai" // דשבורדי AI + api-usage
  | "payments.view_all" // צפייה בכל התשלומים
  | "alerts.view" // צפייה בהתראות מנהל (קריאה בלבד — רישום/עדכון הוא alerts.manage)

  // כתיבה רגילה (MANAGER)
  | "users.update_basic" // name/email/phone בלבד
  | "users.block"
  | "users.reset_password" // אסור על ADMIN — נאכף ב-handler
  | "users.create"
  | "users.change_tier"
  | "users.extend_trial_14d"
  | "users.grant_free_30d"
  | "users.revoke_free"
  | "alerts.manage" // יצירה/עדכון/מחיקה של התראות מנהל
  | "packages.grant_manual"
  | "packages.revert"
  | "payments.manual"
  | "support.respond"
  | "support.view_all"
  | "support.view_internal"
  | "support.assign"
  | "support.internal_note"
  | "support.close"
  | "support.reopen"
  | "support.create_on_behalf"
  | "settings.announcements"

  // ADMIN בלבד
  | "users.change_role"
  | "users.grant_free_unlimited"
  | "users.delete"
  | "packages.catalog_manage"
  | "payments.refund" // ביטול תשלום (soft-refund, עוד לא מומש — שמור למימוש עתידי)
  | "payments.delete" // hard-delete של רשומת תשלום — הרסני
  | "settings.billing_provider"
  | "settings.pricing"
  | "settings.feature_flags"
  | "settings.terms"
  | "announcements.delete" // מחיקת הודעת מערכת — ADMIN בלבד
  | "support.delete"
  | "idempotency.clear"; // @stage-reserved — route יבוצע ב-Stage 1.18

/**
 * Permissions allowed for each role.
 * ADMIN: empty array — handled as "all" in hasPermission().
 */
export const PERMISSIONS_BY_ROLE: Record<Role, Permission[]> = {
  USER: [],
  MANAGER: [
    "users.view",
    "users.update_basic",
    "audit.view_per_user",
    "reports.view_ai",
    "payments.view_all",
    "alerts.view",
    "users.block",
    "users.reset_password",
    "users.create",
    "users.change_tier",
    "users.extend_trial_14d",
    "users.grant_free_30d",
    "users.revoke_free",
    "alerts.manage",
    "packages.grant_manual",
    "packages.revert",
    "payments.manual",
    "support.respond",
    "support.view_all",
    "support.view_internal",
    "support.assign",
    "support.internal_note",
    "support.close",
    "support.reopen",
    "support.create_on_behalf",
    "settings.announcements",
  ],
  ADMIN: [], // special-cased — ADMIN has all permissions
};

/**
 * Numeric rank of each permission — used by requireHighestPermission.
 * Higher rank = more privileged. Rank 10 = ADMIN-only.
 */
export const PERMISSION_RANK: Record<Permission, number> = {
  // 0-1: קריאה בסיסית
  "users.view": 0,
  "audit.view_per_user": 0,
  "support.view_all": 0,
  "reports.view_ai": 1,
  "payments.view_all": 1,
  "alerts.view": 0,
  "users.update_basic": 1,
  "support.view_internal": 1,

  // 2-3: פעולות MANAGER רגילות
  "users.block": 2,
  "users.reset_password": 2,
  "users.create": 2,
  "support.respond": 2,
  "support.assign": 2,
  "support.internal_note": 2,
  "support.close": 2,
  "support.reopen": 2,
  "support.create_on_behalf": 2,
  "users.change_tier": 3,
  "users.grant_free_30d": 3,
  "users.revoke_free": 3,
  "users.extend_trial_14d": 3,
  "alerts.manage": 3,
  "packages.grant_manual": 3,
  "packages.revert": 3,
  "payments.manual": 3,
  "settings.announcements": 3,

  // 10: ADMIN בלבד
  "audit.view_all": 10,
  "users.grant_free_unlimited": 10,
  "users.change_role": 10,
  "users.delete": 10,
  "packages.catalog_manage": 10,
  "payments.refund": 10,
  "payments.delete": 10,
  "settings.billing_provider": 10,
  "settings.pricing": 10,
  "settings.feature_flags": 10,
  "settings.terms": 10,
  "announcements.delete": 10,
  "support.delete": 10,
  "idempotency.clear": 10,
};

/**
 * Returns true if the given role has the given permission.
 * ADMIN always returns true.
 */
export function hasPermission(role: Role, perm: Permission): boolean {
  if (role === "ADMIN") return true;
  return PERMISSIONS_BY_ROLE[role]?.includes(perm) ?? false;
}

/**
 * From a list of required permissions, returns the one with the highest rank.
 * Used when a single request triggers multiple permission checks
 * (e.g. PATCH /users/[id] with {role, grantFree, extendDays} in the body).
 *
 * Empty list throws — callers must pass at least one.
 */
export function highestPermission(keys: Permission[]): Permission {
  if (keys.length === 0) {
    throw new Error("highestPermission: received empty permission list");
  }
  return keys.reduce((max, k) =>
    PERMISSION_RANK[k] > PERMISSION_RANK[max] ? k : max
  , keys[0]);
}
