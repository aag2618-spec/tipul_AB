// ============================================================================
// Clinic Limits — Pure Helpers
// ============================================================================
// פונקציות טהורות (ללא DB) הניתנות לבדיקה ב-vitest בלי mocks.
// מופרדות מ-limits.ts הראשי שמשתמש ב-Prisma.
// ============================================================================

export interface ResolvablePlan {
  maxTherapists: number | null;
  maxSecretaries: number | null;
}

export interface ResolvableContract {
  startDate: Date;
  endDate: Date;
  customMaxTherapists: number | null;
  customMaxSecretaries: number | null;
}

export interface LimitCheck {
  allowed: boolean;
  current: number;
  max: number | null;
  remaining: number | null;
  message?: string;
}

interface ResolveContext {
  plan: ResolvablePlan;
  contract: ResolvableContract | null;
  now: Date;
}

function isContractActive(c: ResolvableContract, now: Date): boolean {
  return c.startDate.getTime() <= now.getTime() && c.endDate.getTime() >= now.getTime();
}

export function resolveTherapistLimit(ctx: ResolveContext): number | null {
  const { plan, contract, now } = ctx;
  if (contract && isContractActive(contract, now) && contract.customMaxTherapists !== null) {
    return contract.customMaxTherapists;
  }
  return plan.maxTherapists;
}

export function resolveSecretaryLimit(ctx: ResolveContext): number | null {
  const { plan, contract, now } = ctx;
  if (contract && isContractActive(contract, now) && contract.customMaxSecretaries !== null) {
    return contract.customMaxSecretaries;
  }
  return plan.maxSecretaries;
}

export function checkLimit(params: { current: number; max: number | null }): LimitCheck {
  const { current, max } = params;
  if (max === null) {
    return { allowed: true, current, max: null, remaining: null };
  }
  const allowed = current < max;
  const remaining = Math.max(0, max - current);
  return {
    allowed,
    current,
    max,
    remaining,
    ...(allowed
      ? {}
      : {
          message: `הגעת לתקרה של ${max} מקומות (כעת ${current}). לשדרוג התוכנית פני/ה לתמיכה.`,
        }),
  };
}
