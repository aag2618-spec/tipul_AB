import { describe, it, expect } from 'vitest';
import {
  calculateDebtFromPayments,
  calculateSessionDebt,
  calculateDebtFromSessions,
  calculatePaidAmount,
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
      { price: 150, payment: null }, // no payment record = not counted as debt
      { price: 100, payment: { amount: 100, expectedAmount: 100 } },
    ];
    // 100 + 150 + 0 = 250
    expect(calculateDebtFromSessions(sessions)).toBe(250);
  });
});

describe('calculatePaidAmount', () => {
  it('PAID parent: returns amount', () => {
    expect(
      calculatePaidAmount({ amount: 300, status: 'PAID', method: 'CASH' })
    ).toBe(300);
  });

  it('PENDING + CC + hasReceipt=true: returns amount (אשראי חלקי שסולק)', () => {
    // ⭐ ה-bug המרכזי: parent CC ישיר אחרי REPLACE+sale → status=PENDING
    // (כי amount<expectedAmount), method=CC, hasReceipt=true. הסכום הוא שולם.
    expect(
      calculatePaidAmount({
        amount: 200,
        status: 'PENDING',
        method: 'CREDIT_CARD',
        hasReceipt: true,
      })
    ).toBe(200);
  });

  it('PENDING + CC ללא receipt/children: returns 0 (placeholder לסליקה)', () => {
    expect(
      calculatePaidAmount({
        amount: 300,
        status: 'PENDING',
        method: 'CREDIT_CARD',
        hasReceipt: false,
      })
    ).toBe(0);
  });

  it('PENDING + CC + children PAID: returns sum(children) (השלמת אשראי על מזומן)', () => {
    // bumpParentOnChildApproval: parent.amount=200, status=PENDING+CC, וגם
    // child PAID amount=200 (השלמה דרך אשראי על תשלום מזומן 50 קודם).
    // sum(children PAID) = 200 → paidAmount=200.
    expect(
      calculatePaidAmount({
        amount: 200,
        status: 'PENDING',
        method: 'CREDIT_CARD',
        hasReceipt: false,
        childPayments: [
          { amount: 50, status: 'PAID' },
          { amount: 150, status: 'PAID' },
        ],
      })
    ).toBe(200);
  });

  it('PENDING + CASH: returns amount (תשלום חלקי במזומן שכבר התקבל)', () => {
    expect(
      calculatePaidAmount({
        amount: 150,
        status: 'PENDING',
        method: 'CASH',
        hasReceipt: false,
      })
    ).toBe(150);
  });

  it('children with status non-PAID are ignored', () => {
    expect(
      calculatePaidAmount({
        amount: 100,
        status: 'PENDING',
        method: 'CREDIT_CARD',
        hasReceipt: false,
        childPayments: [
          { amount: 50, status: 'PENDING' },
          { amount: 75, status: 'PAID' },
        ],
      })
    ).toBe(75);
  });
});
