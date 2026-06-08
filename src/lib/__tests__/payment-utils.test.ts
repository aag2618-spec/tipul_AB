import { describe, it, expect } from 'vitest';
import {
  calculateDebtFromPayments,
  calculateSessionDebt,
  calculateDebtFromSessions,
  calculatePaidAmount,
  isRollupParentPayment,
  calculateParentOwnPortion,
  paymentRevenueContribution,
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

describe('isRollupParentPayment', () => {
  it('parent with children → true', () => {
    expect(
      isRollupParentPayment({ parentPaymentId: null, childPayments: [{}] })
    ).toBe(true);
  });

  it('childless parent → false', () => {
    expect(
      isRollupParentPayment({ parentPaymentId: null, childPayments: [] })
    ).toBe(false);
    expect(isRollupParentPayment({ parentPaymentId: null })).toBe(false);
  });

  it('child row → false', () => {
    expect(
      isRollupParentPayment({ parentPaymentId: 'p1', childPayments: [] })
    ).toBe(false);
  });
});

describe('calculateParentOwnPortion', () => {
  it('split payment (credit on parent + cash child) → the parent slice', () => {
    // ₪52 אשראי על האב + ₪248 מזומן כ-child, סה"כ ₪300 → חלק-אב 52
    expect(
      calculateParentOwnPortion({
        amount: 300,
        childPayments: [{ amount: 248, status: 'PAID' }],
      })
    ).toBe(52);
  });

  it('normal installments summing to parent → 0', () => {
    expect(
      calculateParentOwnPortion({
        amount: 300,
        childPayments: [
          { amount: 150, status: 'PAID' },
          { amount: 150, status: 'PAID' },
        ],
      })
    ).toBe(0);
  });

  it('no children → 0 (counted directly via amount elsewhere)', () => {
    expect(calculateParentOwnPortion({ amount: 300 })).toBe(0);
    expect(calculateParentOwnPortion({ amount: 300, childPayments: [] })).toBe(0);
  });

  it('non-PAID children are excluded from the children sum', () => {
    expect(
      calculateParentOwnPortion({
        amount: 300,
        childPayments: [
          { amount: 200, status: 'PAID' },
          { amount: 100, status: 'PENDING' },
        ],
      })
    ).toBe(100);
  });

  it('never negative (children exceed parent — defensive)', () => {
    expect(
      calculateParentOwnPortion({
        amount: 100,
        childPayments: [{ amount: 150, status: 'PAID' }],
      })
    ).toBe(0);
  });

  it('handles fractional amounts without float dust', () => {
    expect(
      calculateParentOwnPortion({
        amount: 99.99,
        childPayments: [{ amount: 50, status: 'PAID' }],
      })
    ).toBe(49.99);
  });
});

describe('paymentRevenueContribution', () => {
  it('child row → its own amount', () => {
    expect(
      paymentRevenueContribution({ amount: 248, parentPaymentId: 'p1' })
    ).toBe(248);
  });

  it('childless parent → full amount', () => {
    expect(
      paymentRevenueContribution({ amount: 300, parentPaymentId: null })
    ).toBe(300);
  });

  it('rollup parent of a split payment → only the parent slice (no double count)', () => {
    // הילד (248) נספר בנפרד; ההורה תורם רק את ה-52 → סה"כ 300, בלי כפילות
    expect(
      paymentRevenueContribution({
        amount: 300,
        parentPaymentId: null,
        childPayments: [{ amount: 248, status: 'PAID' }],
      })
    ).toBe(52);
  });

  it('rollup parent of normal installments → 0 (children carry the full amount)', () => {
    expect(
      paymentRevenueContribution({
        amount: 300,
        parentPaymentId: null,
        childPayments: [
          { amount: 150, status: 'PAID' },
          { amount: 150, status: 'PAID' },
        ],
      })
    ).toBe(0);
  });
});
