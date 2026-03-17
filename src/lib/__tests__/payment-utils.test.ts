import { describe, it, expect } from 'vitest';
import {
  calculateDebtFromPayments,
  calculateSessionDebt,
  calculateDebtFromSessions,
} from '@/lib/payment-utils';

describe('calculateDebtFromPayments', () => {
  it('calculates basic debt', () => {
    const payments = [
      { amount: 100, expectedAmount: 200 },
      { amount: 50, expectedAmount: 100 },
    ];
    // (200-100) + (100-50) = 150
    expect(calculateDebtFromPayments(payments)).toBe(150);
  });

  it('handles partial payments', () => {
    const payments = [
      { amount: 80, expectedAmount: 100 },
      { amount: 100, expectedAmount: 100 }, // fully paid, no debt
    ];
    expect(calculateDebtFromPayments(payments)).toBe(20);
  });

  it('returns 0 when there are no payments', () => {
    expect(calculateDebtFromPayments([])).toBe(0);
  });
});

describe('calculateSessionDebt', () => {
  it('returns session price when there is no payment', () => {
    expect(calculateSessionDebt({ price: 300 })).toBe(300);
    expect(calculateSessionDebt({ price: 300, payment: null })).toBe(300);
  });

  it('returns remaining debt for partial payment', () => {
    expect(
      calculateSessionDebt({
        price: 300,
        payment: { amount: 200, expectedAmount: 300 },
      })
    ).toBe(100);
  });

  it('returns 0 for fully paid session', () => {
    expect(
      calculateSessionDebt({
        price: 300,
        payment: { amount: 300, expectedAmount: 300 },
      })
    ).toBe(0);
  });
});

describe('calculateDebtFromSessions', () => {
  it('sums debt across multiple sessions', () => {
    const sessions = [
      { price: 200, payment: { amount: 100, expectedAmount: 200 } },
      { price: 150, payment: null },
      { price: 100, payment: { amount: 100, expectedAmount: 100 } },
    ];
    // 100 + 150 + 0 = 250
    expect(calculateDebtFromSessions(sessions)).toBe(250);
  });
});
