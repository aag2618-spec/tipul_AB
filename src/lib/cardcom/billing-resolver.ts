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
 * @param intendedUserId   The userId we'd LIKE to charge under (typically
 *                         `client.therapistId`).
 * @param organizationId   Optional organizationId of the client/payment.
 *                         When provided and the intended user has no Cardcom,
 *                         the resolver falls back to the org owner's Cardcom.
 */
export async function resolveCardcomBilling(
  intendedUserId: string,
  organizationId?: string | null,
): Promise<ResolvedCardcomBilling | null> {
  if (await hasActiveCardcom(intendedUserId)) {
    return {
      cardcomOwnerUserId: intendedUserId,
      intendedUserId,
      fellbackToOrgOwner: false,
    };
  }

  if (!organizationId) {
    // אבחון — מסביר ב-logs האם המטפל מחק/השעה את ה-Cardcom שלו במקום
    // שמעולם לא חיבר. עוזר לסגור פניות תמיכה מהר.
    const intendedHasInactive = await hasInactiveCardcom(intendedUserId);
    logger.warn("[billing-resolver] no Cardcom resolved", {
      intendedUserId,
      organizationId: "none",
      reason: "no_organization_id",
      intendedHasInactiveCardcom: intendedHasInactive,
    });
    return null;
  }

  // Fall back to the clinic owner's Cardcom. Only same-org owners — never
  // cross-org. We trust the caller passed a valid organizationId from the
  // patient/payment record (which already enforces clinic membership).
  let org;
  try {
    org = await prisma.organization.findUnique({
      where: { id: organizationId },
      select: { ownerUserId: true },
    });
  } catch (err) {
    logger.error("[billing-resolver] organization lookup failed", {
      organizationId,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }

  if (!org) {
    logger.warn("[billing-resolver] no Cardcom resolved", {
      intendedUserId,
      organizationId,
      reason: "organization_not_found",
    });
    return null;
  }

  if (org.ownerUserId === intendedUserId) {
    // The intended user IS the owner — they already failed the active check.
    const intendedHasInactive = await hasInactiveCardcom(intendedUserId);
    logger.warn("[billing-resolver] no Cardcom resolved", {
      intendedUserId,
      organizationId,
      reason: "owner_same_as_intended_no_active_cardcom",
      intendedHasInactiveCardcom: intendedHasInactive,
    });
    return null;
  }

  if (await hasActiveCardcom(org.ownerUserId)) {
    logger.info("[billing-resolver] using org owner Cardcom fallback", {
      intendedUserId,
      organizationId,
      ownerUserId: org.ownerUserId,
    });
    return {
      cardcomOwnerUserId: org.ownerUserId,
      intendedUserId,
      fellbackToOrgOwner: true,
    };
  }

  // Both intended user AND org owner have no active Cardcom.
  const [intendedHasInactive, ownerHasInactive] = await Promise.all([
    hasInactiveCardcom(intendedUserId),
    hasInactiveCardcom(org.ownerUserId),
  ]);
  logger.warn("[billing-resolver] no Cardcom resolved", {
    intendedUserId,
    organizationId,
    ownerUserId: org.ownerUserId,
    reason: "no_active_cardcom_for_intended_or_owner",
    intendedHasInactiveCardcom: intendedHasInactive,
    ownerHasInactiveCardcom: ownerHasInactive,
  });
  return null;
}
