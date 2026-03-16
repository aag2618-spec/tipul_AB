/**
 * Pure debt calculation helpers (no DB/server dependencies).
 * Safe to import in both server components and "use client" components.
 * All trunk read functions delegate to these for consistency.
 */

export function calculateDebtFromPayments(
  payments: Array<{ amount: any; expectedAmount: any }>
): number {
  return payments
    .filter((p) => {
      const paid = Number(p.amount);
      const expected = Number(p.expectedAmount) || 0;
      return expected > 0 && paid < expected;
    })
    .reduce(
      (sum, p) => sum + (Number(p.expectedAmount) - Number(p.amount)),
      0
    );
}

export function calculateSessionDebt(session: {
  price: any;
  payment?: { amount: any; expectedAmount: any } | null;
}): number {
  if (!session.payment) return Number(session.price);
  const paid = Number(session.payment.amount);
  const expected = Number(session.payment.expectedAmount) || 0;
  if (expected > 0 && paid < expected) return expected - paid;
  return 0;
}

export function calculateDebtFromSessions(
  sessions: Array<{
    price: any;
    payment?: { amount: any; expectedAmount: any } | null;
  }>
): number {
  return sessions.reduce((sum, s) => sum + calculateSessionDebt(s), 0);
}
