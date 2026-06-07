// src/lib/cardcom/billing-resolver.ts
// Resolves WHICH user's Cardcom merchant should handle a charge.
//
// Background:
//   • In a sole-therapist setup, `client.therapistId === user.id` and the
//     therapist connected Cardcom under their own userId. Trivial lookup.
//   • In a clinic, the patient's therapist (`client.therapistId`) may be a
//     non-owner who never connected Cardcom — only the OWNER did. Without a
//     fallback, /api/payments/[id]/charge-cardcom returns
//     "לא הוגדר מסוף Cardcom" even though the clinic IS connected.
//   • Receipt routing (`isCardcomPrimary` in payments/receipt-service.ts)
//     must use the same resolution logic so cash receipts also flow through
//     the same Cardcom merchant.
//
// Returns the userId where the active Cardcom BillingProvider is stored,
// or null when no Cardcom is configured anywhere in the relevant scope.
//
// IMPORTANT — legal note:
//   When fellbackToOrgOwner=true, the resulting receipt is issued under the
//   ORG OWNER's Cardcom merchant (their numbering, registered with מערך
//   חשבוניות ישראל). The audit trail records both `intendedUserId` (the
//   patient's therapist) and `cardcomOwnerUserId` (the actual issuer).

import prisma from "@/lib/prisma";
import { logger } from "@/lib/logger";

export interface ResolvedCardcomBilling {
  /**
   * The userId whose Cardcom BillingProvider will be used. Always points to a
   * row that exists with `provider='CARDCOM' AND isActive=true`.
   */
  cardcomOwnerUserId: string;
  /**
   * The userId we WANTED to charge under (e.g. patient's therapistId). When
   * this matches `cardcomOwnerUserId`, no fallback occurred. When it doesn't,
   * the resolver fell back to the organization owner.
   */
  intendedUserId: string;
  /** True when the resolver used the org-owner fallback. Useful for audit. */
  fellbackToOrgOwner: boolean;
}

async function hasActiveCardcom(userId: string): Promise<boolean> {
  try {
    const provider = await prisma.billingProvider.findFirst({
      where: { userId, provider: "CARDCOM", isActive: true },
      select: { id: true },
    });
    return !!provider;
  } catch (err) {
    logger.error("[billing-resolver] hasActiveCardcom DB error", {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

/**
 * אבחון — האם קיימת רשומת Cardcom שאינה פעילה? עוזר להסביר ב-logs את המצב
 * "התקנתי בעבר אבל המערכת אומרת שאין". cheap select של id בלבד.
 */
async function hasInactiveCardcom(userId: string): Promise<boolean> {
  try {
    const provider = await prisma.billingProvider.findFirst({
      where: { userId, provider: "CARDCOM", isActive: false },
      select: { id: true },
    });
    return !!provider;
  } catch {
    return false;
  }
}

/**
 * Resolve which userId's Cardcom merchant should handle this charge/receipt.
 *
 * MODE-AWARE (per-therapist control via `User.clinicBillingMode`):
 *   • SOLO (no organization)  → the therapist's own terminal, or null.
 *   • OWN  → the therapist's own terminal; if none active → null (BLOCK, no
 *            fallback to the clinic — product decision D). The charge route
 *            turns this null into a clear "connect your terminal" message.
 *   • CLINIC (explicit) → ALWAYS the clinic owner's terminal, even if the
 *            therapist happens to have a personal terminal connected. This is
 *            what gives the owner real control over where patient money goes.
 *   • null (legacy, never set) → original behavior: prefer the therapist's own
 *            terminal, else the clinic owner's. Preserves existing data with no
 *            backfill — only an explicit OWN/CLINIC choice changes routing.
 *
 * NOTE: a `null` return is the same shape used by the receipt path
 * (`resolveCardcomReceiptOwner`), so an OWN-without-terminal therapist simply
 * has no Cardcom receipt — money is never routed to the wrong merchant.
 *
 * @param intendedUserId   The userId we'd LIKE to charge under (typically
 *                         `client.therapistId`).
 * @param organizationId   Optional organizationId of the client/payment
 *                         (authoritative when provided).
 */
export async function resolveCardcomBilling(
  intendedUserId: string,
  organizationId?: string | null,
): Promise<ResolvedCardcomBilling | null> {
  // טוענים את מצב הסליקה של המטפל/ת + השיוך לארגון. נשמרות ברירות מחדל בטוחות
  // (CLINIC / ה-organizationId שהועבר) אם השליפה נכשלת — לא מפילים את הקריאה.
  // mode: "OWN" | "CLINIC" | null. null = legacy (טרם הוגדר במפורש) → מעדיף
  // מסוף פרטי, אחרת מסוף הבעלים (התנהגות מקורית, ללא שינוי לנתונים קיימים).
  let mode: string | null = null;
  let userOrgId: string | null = null;
  try {
    const user = await prisma.user.findUnique({
      where: { id: intendedUserId },
      select: { clinicBillingMode: true, organizationId: true },
    });
    if (user) {
      mode = user.clinicBillingMode ?? null;
      userOrgId = user.organizationId;
    }
  } catch (err) {
    logger.error("[billing-resolver] user lookup failed", {
      intendedUserId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  // ה-organizationId המועבר (מרשומת ה-Payment/Client) סמכותי; נופלים ל-
  // organizationId של המשתמש רק אם לא הועבר.
  const orgId = organizationId ?? userOrgId ?? null;

  // ── מטפל/ת עצמאי/ת (לא בקליניקה) — התנהגות קיימת, ללא שינוי: מסוף עצמי או null.
  if (!orgId) {
    if (await hasActiveCardcom(intendedUserId)) {
      return {
        cardcomOwnerUserId: intendedUserId,
        intendedUserId,
        fellbackToOrgOwner: false,
      };
    }
    const intendedHasInactive = await hasInactiveCardcom(intendedUserId);
    logger.warn("[billing-resolver] no Cardcom resolved", {
      intendedUserId,
      organizationId: "none",
      reason: "no_organization_id",
      intendedHasInactiveCardcom: intendedHasInactive,
    });
    return null;
  }

  // ── מצב OWN: גובים לחשבון העצמאי של המטפל/ת. מסוף פעיל → דרכו; אין מסוף →
  // null (חסימה), בלי fallback לקליניקה (החלטת מוצר D).
  if (mode === "OWN") {
    if (await hasActiveCardcom(intendedUserId)) {
      return {
        cardcomOwnerUserId: intendedUserId,
        intendedUserId,
        fellbackToOrgOwner: false,
      };
    }
    const intendedHasInactive = await hasInactiveCardcom(intendedUserId);
    logger.warn("[billing-resolver] OWN mode but no active Cardcom → blocked", {
      intendedUserId,
      organizationId: orgId,
      reason: "own_mode_no_active_cardcom",
      intendedHasInactiveCardcom: intendedHasInactive,
    });
    return null;
  }

  // ── מצב null (legacy — טרם הוגדר במפורש): מעדיפים מסוף פרטי אם קיים; אחרת
  // נופלים למסוף הבעלים בהמשך. שומר התנהגות זהה לחלוטין לנתונים קיימים.
  if (mode === null && (await hasActiveCardcom(intendedUserId))) {
    return {
      cardcomOwnerUserId: intendedUserId,
      intendedUserId,
      fellbackToOrgOwner: false,
    };
  }

  // ── מצב CLINIC (מפורש) או null-בלי-מסוף-פרטי: דרך מסוף הבעלים. ב-CLINIC זה
  // נכון תמיד — גם אם למטפל/ת יש מסוף פרטי (הבעלים שולט/ת). רק same-org owner.
  let org;
  try {
    org = await prisma.organization.findUnique({
      where: { id: orgId },
      select: { ownerUserId: true },
    });
  } catch (err) {
    logger.error("[billing-resolver] organization lookup failed", {
      organizationId: orgId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }

  if (!org) {
    logger.warn("[billing-resolver] no Cardcom resolved", {
      intendedUserId,
      organizationId: orgId,
      reason: "organization_not_found",
    });
    return null;
  }

  if (await hasActiveCardcom(org.ownerUserId)) {
    if (org.ownerUserId !== intendedUserId) {
      logger.info("[billing-resolver] using clinic owner Cardcom", {
        intendedUserId,
        organizationId: orgId,
        ownerUserId: org.ownerUserId,
        mode: mode ?? "legacy",
      });
    }
    return {
      cardcomOwnerUserId: org.ownerUserId,
      intendedUserId,
      // true רק כשהמסוף בפועל אינו של המטפל/ת המיועד/ת (audit trail).
      fellbackToOrgOwner: org.ownerUserId !== intendedUserId,
    };
  }

  // הבעלים ללא מסוף פעיל — אין דרך לגבות בקליניקה.
  const [intendedHasInactive, ownerHasInactive] = await Promise.all([
    hasInactiveCardcom(intendedUserId),
    hasInactiveCardcom(org.ownerUserId),
  ]);
  logger.warn("[billing-resolver] no Cardcom resolved", {
    intendedUserId,
    organizationId: orgId,
    ownerUserId: org.ownerUserId,
    reason: "clinic_or_legacy_owner_no_active_cardcom",
    mode: mode ?? "legacy",
    intendedHasInactiveCardcom: intendedHasInactive,
    ownerHasInactiveCardcom: ownerHasInactive,
  });
  return null;
}
