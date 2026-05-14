// ============================================================================
// Package Purchase — Pure Helpers (Stage 5)
// ============================================================================
// פונקציות טהורות (ללא DB / HTTP) ל-decision logic של רכישת חבילות SMS/AI.
// כל שינוי כאן חייב להתחיל בעדכון package-purchase.test.ts (כסף!).
// ============================================================================

import type { PackageType } from "@prisma/client";

export type ValidationResult =
  | { allowed: true }
  | { allowed: false; reason: string };

// ============================================================================
// validatePackagePurchase — מי יכול לרכוש חבילה חד-פעמית
// ============================================================================
// חבילות SMS/AI הן חד-פעמיות ואישיות. גם מטפל ב-billingPaidByClinic יכול
// לקנות חבילה לעצמו (זה מעבר למכסה של הקליניקה). חסימה רק על isBlocked
// והגיון של מחיר.

export function validatePackagePurchase(input: {
  isBlocked: boolean;
  packageIsActive: boolean;
  priceIls: number | null;
}): ValidationResult {
  if (input.isBlocked) {
    return {
      allowed: false,
      reason: "החשבון חסום — פנה/י לתמיכה לפני רכישה.",
    };
  }
  if (!input.packageIsActive) {
    return {
      allowed: false,
      reason: "החבילה לא זמינה לרכישה כעת.",
    };
  }
  if (input.priceIls === null) {
    return {
      allowed: false,
      reason: "לא נמצא מחיר עבור החבילה. פנה/י לתמיכה.",
    };
  }
  if (input.priceIls <= 0) {
    return {
      allowed: false,
      reason: "מחיר לא תקין. חבילות חינם מתחלקות רק דרך הנהלת המערכת.",
    };
  }
  return { allowed: true };
}

// ============================================================================
// resolvePackagePurchaseWebhookOutcome — webhook decision logic
// ============================================================================

export type PackagePurchaseOutcome = "GRANT_CREDITS" | "SKIP_ALREADY" | "DECLINE";

export function resolvePackagePurchaseWebhookOutcome(input: {
  success: boolean;
  alreadyGranted: boolean;
}): { action: PackagePurchaseOutcome } {
  // אם credits כבר ניתנו (UserPackagePurchase קיים עם externalId זה) —
  // לעולם לא לבטל אותם. SKIP_ALREADY מוחזר גם במקרה של "duplicate decline".
  if (input.alreadyGranted) {
    return { action: "SKIP_ALREADY" };
  }
  if (!input.success) {
    return { action: "DECLINE" };
  }
  return { action: "GRANT_CREDITS" };
}

// ============================================================================
// calculateRemainingCredits — יתרה לפי type
// ============================================================================

export interface PurchaseLike {
  type: PackageType;
  credits: number;
  creditsUsed: number;
  reverted: boolean;
}

export function calculateRemainingCredits(
  purchases: PurchaseLike[],
  type: PackageType
): number {
  let total = 0;
  for (const p of purchases) {
    if (p.reverted) continue;
    if (p.type !== type) continue;
    const remaining = p.credits - p.creditsUsed;
    if (remaining > 0) total += remaining;
  }
  return total;
}

// ============================================================================
// buildPackagesView — תצוגת קטלוג ל-Client
// ============================================================================

export interface PackageInput {
  id: string;
  type: PackageType;
  name: string;
  credits: number;
  priceIls: number | string | { toString(): string }; // Decimal compatibility
  isActive: boolean;
}

export interface PackageViewItem {
  id: string;
  type: PackageType;
  typeLabelHe: string;
  name: string;
  credits: number;
  /** המחיר ה-resolved (override per-user/clinic/global) או fallback מהקטלוג. */
  priceIls: number;
  /** האם המחיר מקור מ-PricingPolicy (override) או מהקטלוג. */
  priceSource: "POLICY" | "CATALOG";
}

export interface PackagesView {
  packages: PackageViewItem[];
  balances: Record<PackageType, number>;
}

const TYPE_LABEL_HE: Record<PackageType, string> = {
  SMS: "הודעות SMS",
  AI_DETAILED_ANALYSIS: "ניתוחי AI מתקדם",
};

export function buildPackagesView(input: {
  packages: PackageInput[];
  /** Map<packageId, priceIls מ-policy>. אם חסר — fallback ל-pkg.priceIls. */
  resolvedPrices: Map<string, number>;
  userPurchases: PurchaseLike[];
}): PackagesView {
  const items: PackageViewItem[] = [];
  for (const pkg of input.packages) {
    if (!pkg.isActive) continue;
    const policyPrice = input.resolvedPrices.get(pkg.id);
    const catalogPrice = Number(pkg.priceIls) || 0;
    const finalPrice = policyPrice !== undefined ? policyPrice : catalogPrice;
    items.push({
      id: pkg.id,
      type: pkg.type,
      typeLabelHe: TYPE_LABEL_HE[pkg.type] ?? pkg.type,
      name: pkg.name,
      credits: pkg.credits,
      priceIls: finalPrice,
      priceSource: policyPrice !== undefined ? "POLICY" : "CATALOG",
    });
  }

  const balances: Record<PackageType, number> = {
    SMS: calculateRemainingCredits(input.userPurchases, "SMS"),
    AI_DETAILED_ANALYSIS: calculateRemainingCredits(
      input.userPurchases,
      "AI_DETAILED_ANALYSIS"
    ),
  };

  return { packages: items, balances };
}
