/**
 * Clinic invitations — helpers for token generation, OTP, expiry.
 * Used by /api/clinic-admin/invitations/* and /api/p/clinic-invite/[token]/*.
 *
 * Security model:
 *   - Token: cuid (~190 bits), unique, sent in URL.
 *   - OTP: 6 digits, hashed with bcrypt(10), never persisted in plaintext.
 *   - Max attempts: 5 → invitation auto-revoked.
 *   - Expiry: 48h from creation.
 */

import bcrypt from "bcryptjs";
import { randomInt } from "node:crypto";
import type { InvitationStatus } from "@prisma/client";

// ─── Constants ───────────────────────────────────────────────────────────────

export const INVITATION_TTL_MS = 48 * 60 * 60 * 1000; // 48 שעות
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_LENGTH = 6;
const BCRYPT_ROUNDS = 10;

// ─── Token & OTP generation ─────────────────────────────────────────────────

/**
 * 6-digit OTP. Uses crypto.randomInt for unbiased entropy
 * (Math.random is not cryptographically secure).
 */
export function generateOtp(): string {
  // randomInt(0, 1_000_000) → "000000".."999999"
  return randomInt(0, 1_000_000).toString().padStart(OTP_LENGTH, "0");
}

export async function hashOtp(otp: string): Promise<string> {
  return bcrypt.hash(otp, BCRYPT_ROUNDS);
}

export async function verifyOtp(otp: string, hash: string): Promise<boolean> {
  return bcrypt.compare(otp, hash);
}

// ─── Expiry ──────────────────────────────────────────────────────────────────

export function computeExpiresAt(): Date {
  return new Date(Date.now() + INVITATION_TTL_MS);
}

export function isExpired(expiresAt: Date): boolean {
  return expiresAt.getTime() < Date.now();
}

// ─── Email masking (for public invitation page) ─────────────────────────────

/**
 * Masks an email for display: `david@gmail.com` → `d***@gmail.com`.
 * Used on /invite/[token] so the user knows which account is targeted
 * without leaking the full address to anyone holding the link.
 */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!local || !domain) return email;
  if (local.length <= 1) return `${local}***@${domain}`;
  return `${local[0]}***@${domain}`;
}

// ─── Phone validation (E.164, Israel-friendly) ───────────────────────────────

/**
 * Normalizes Israeli phone numbers to E.164 format `+972XXXXXXXXX`.
 * Returns null on invalid input.
 *
 * Accepts:
 *   05XXXXXXXX → +9725XXXXXXXX
 *   +9725XXXXXXXX → +9725XXXXXXXX
 *   9725XXXXXXXX → +9725XXXXXXXX
 */
export function normalizeE164(phone: string | null | undefined): string | null {
  if (!phone) return null;
  const cleaned = phone.replace(/[\s\-().]/g, "");
  if (/^\+972\d{8,9}$/.test(cleaned)) return cleaned;
  if (/^972\d{8,9}$/.test(cleaned)) return `+${cleaned}`;
  if (/^0\d{9}$/.test(cleaned)) return `+972${cleaned.slice(1)}`;
  return null;
}

// ─── Status helpers ──────────────────────────────────────────────────────────

/**
 * Effective status — bumps PENDING → EXPIRED at read time when `expiresAt`
 * has passed. The DB still says PENDING; persistence happens lazily via the
 * invitation cron or on-access (resolveInvitationStatus + DB update).
 */
export function effectiveStatus(
  status: InvitationStatus,
  expiresAt: Date
): InvitationStatus {
  if (status === "PENDING" && isExpired(expiresAt)) return "EXPIRED";
  return status;
}

export function isAcceptable(
  status: InvitationStatus,
  expiresAt: Date
): boolean {
  return effectiveStatus(status, expiresAt) === "PENDING";
}

// ─── Billing pause restore (MyTipul-B) ──────────────────────────────────────

export const RESTORE_FRESH_TRIAL_DAYS = 30;
export const RESTORE_GRACE_DAYS = 7;

interface RestorePlan {
  newStatus: string;
  newTrialEndsAt: Date;
  grantedFreshTrial: boolean;
  appliedGrace: boolean;
}

/**
 * חישוב המעבר של מנוי לאחר הסרה מקליניקה (DELETE /clinic-admin/members/[id]).
 * pure — מקבל את כל המצב כפרמטרים, מחזיר את הסטטוס + trialEndsAt החדשים.
 *
 * החלטות:
 *   1. אם wasNeverActive (subscriptionStatusBeforeClinic=null) → TRIALING + 30 ימים חדשים.
 *      רציונל: המשתמש הצטרף ישירות דרך הזמנה ולא הספיק להחליט על מנוי. נותנים לו זמן.
 *   2. אם trialEndsAt פג (כי עברו חודשים בקליניקה) → סטטוס קודם + grace 7 ימים.
 *      רציונל: לא רוצים לחזור למצב חסום מיד; מאפשרים זמן לחדש תשלום.
 *   3. אחרת → סטטוס קודם + trialEndsAt המקורי.
 */
export function computeBillingRestore(params: {
  subscriptionStatusBeforeClinic: string | null;
  trialEndsAt: Date | null;
  now?: Date;
}): RestorePlan {
  const now = params.now ?? new Date();
  const wasNeverActive = params.subscriptionStatusBeforeClinic === null;

  if (wasNeverActive) {
    return {
      newStatus: "TRIALING",
      newTrialEndsAt: new Date(
        now.getTime() + RESTORE_FRESH_TRIAL_DAYS * 24 * 60 * 60 * 1000
      ),
      grantedFreshTrial: true,
      appliedGrace: false,
    };
  }

  const trialExpired =
    params.trialEndsAt !== null && params.trialEndsAt.getTime() < now.getTime();

  if (trialExpired) {
    return {
      newStatus: params.subscriptionStatusBeforeClinic ?? "TRIALING",
      newTrialEndsAt: new Date(
        now.getTime() + RESTORE_GRACE_DAYS * 24 * 60 * 60 * 1000
      ),
      grantedFreshTrial: false,
      appliedGrace: true,
    };
  }

  // trialEndsAt could be null here (e.g., ACTIVE without trial); we still need to set
  // a value because ה-update כתוב כך שתמיד מציב trialEndsAt. נשמור על המקור.
  return {
    newStatus: params.subscriptionStatusBeforeClinic ?? "TRIALING",
    newTrialEndsAt:
      params.trialEndsAt ??
      new Date(now.getTime() + RESTORE_GRACE_DAYS * 24 * 60 * 60 * 1000),
    grantedFreshTrial: false,
    appliedGrace: false,
  };
}
