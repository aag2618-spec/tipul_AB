// ============================================================================
// Tests: Subscription Recurring Charge
// ============================================================================
// TDD לפי feedback_critical_changes_process — שינוי קריטי (כסף!) חייב טסטים
// לפני impl. בדיקות כיסוי:
//   1. pure helpers: calculateNextAttemptDate, shouldBlockAfterAttempt,
//      isTokenExpired, getPeriodMonthsFromDates
//   2. retry schedule: יום 1 → +2 ימים → יום 3; יום 3 → +4 → יום 7
//   3. block-after-3: אחרי 3 ניסיונות → block + dunning final
//   4. token expiry detection
//   5. period months חישוב מתאריכים
// ============================================================================

import { describe, it, expect } from "vitest";
import {
  calculateNextAttemptDate,
  shouldBlockAfterAttempt,
  isTokenExpired,
  getPeriodMonthsFromDates,
  addCalendarMonths,
  MAX_CHARGE_ATTEMPTS,
  RETRY_SCHEDULE_DAYS,
} from "@/lib/payments/subscription-recurring-helpers";

const ts = (iso: string) => new Date(iso);

// ============================================================================
// RETRY_SCHEDULE — קבועים
// ============================================================================

describe("RETRY_SCHEDULE_DAYS", () => {
  it("מגדיר את ימי הניסיון: יום 1, יום 3, יום 7 (offsets מהיום המקורי)", () => {
    // attempt 1 = יום 1 (היום שהחיוב התחיל)
    // attempt 2 = יום 3 (כעבור 2 ימים)
    // attempt 3 = יום 7 (כעבור 6 ימים מהמקורי, 4 מהקודם)
    expect(RETRY_SCHEDULE_DAYS).toEqual([1, 3, 7]);
  });

  it("MAX_CHARGE_ATTEMPTS = 3", () => {
    expect(MAX_CHARGE_ATTEMPTS).toBe(3);
  });
});

// ============================================================================
// calculateNextAttemptDate — מתי לנסות שוב
// ============================================================================

describe("calculateNextAttemptDate", () => {
  it("אחרי ניסיון 1 (יום 1) — מתזמן לעוד 2 ימים (יום 3)", () => {
    const firstAttemptDate = ts("2026-06-01T09:00:00Z");
    const next = calculateNextAttemptDate({
      firstAttemptDate,
      attemptJustCompleted: 1,
    });
    // יום 3 = +2 ימים מהיום הראשון
    expect(next).toEqual(ts("2026-06-03T09:00:00Z"));
  });

  it("אחרי ניסיון 2 (יום 3) — מתזמן לעוד 4 ימים (יום 7)", () => {
    const firstAttemptDate = ts("2026-06-01T09:00:00Z");
    const next = calculateNextAttemptDate({
      firstAttemptDate,
      attemptJustCompleted: 2,
    });
    // יום 7 = +6 ימים מהיום הראשון
    expect(next).toEqual(ts("2026-06-07T09:00:00Z"));
  });

  it("אחרי ניסיון 3 (יום 7) — null (אין יותר ניסיונות)", () => {
    const firstAttemptDate = ts("2026-06-01T09:00:00Z");
    const next = calculateNextAttemptDate({
      firstAttemptDate,
      attemptJustCompleted: 3,
    });
    expect(next).toBeNull();
  });

  it("ערך שלילי או מחוץ לטווח — null", () => {
    const firstAttemptDate = ts("2026-06-01T09:00:00Z");
    expect(
      calculateNextAttemptDate({ firstAttemptDate, attemptJustCompleted: 0 })
    ).toBeNull();
    expect(
      calculateNextAttemptDate({ firstAttemptDate, attemptJustCompleted: 99 })
    ).toBeNull();
  });
});

// ============================================================================
// shouldBlockAfterAttempt — האם לחסום משתמש
// ============================================================================

describe("shouldBlockAfterAttempt", () => {
  it("אחרי ניסיון 1 כושל — לא לחסום", () => {
    expect(shouldBlockAfterAttempt(1)).toBe(false);
  });
  it("אחרי ניסיון 2 כושל — לא לחסום (יש עוד ניסיון אחד)", () => {
    expect(shouldBlockAfterAttempt(2)).toBe(false);
  });
  it("אחרי ניסיון 3 כושל — חסימה (זה הניסיון האחרון)", () => {
    expect(shouldBlockAfterAttempt(3)).toBe(true);
  });
  it("ערכים מעבר ל-3 — חסימה (defensive)", () => {
    expect(shouldBlockAfterAttempt(4)).toBe(true);
    expect(shouldBlockAfterAttempt(10)).toBe(true);
  });
});

// ============================================================================
// isTokenExpired — בדיקה שהטוקן עוד בתוקף לפי MM/YYYY
// ============================================================================

describe("isTokenExpired", () => {
  it("טוקן עם תוקף עתידי — לא פג", () => {
    const result = isTokenExpired({
      expiryMonth: 12,
      expiryYear: 2030,
      now: ts("2026-06-15T10:00:00Z"),
    });
    expect(result).toBe(false);
  });

  it("טוקן בחודש הנוכחי — עוד בתוקף עד סוף החודש (כלל קארדקום)", () => {
    // 06/2026 → תוקף עד 30/06/2026 23:59
    const result = isTokenExpired({
      expiryMonth: 6,
      expiryYear: 2026,
      now: ts("2026-06-15T10:00:00Z"),
    });
    expect(result).toBe(false);
  });

  it("טוקן שעבר בחודש — פג", () => {
    const result = isTokenExpired({
      expiryMonth: 5,
      expiryYear: 2026,
      now: ts("2026-06-01T00:00:00Z"),
    });
    expect(result).toBe(true);
  });

  it("טוקן בשנה שעברה — פג", () => {
    const result = isTokenExpired({
      expiryMonth: 12,
      expiryYear: 2025,
      now: ts("2026-06-15T10:00:00Z"),
    });
    expect(result).toBe(true);
  });

  it("תאריך לא חוקי (חודש 0) — נחשב פג (fail-safe)", () => {
    const result = isTokenExpired({
      expiryMonth: 0,
      expiryYear: 2030,
      now: ts("2026-06-15T10:00:00Z"),
    });
    expect(result).toBe(true);
  });

  it("חודש 13 — fail-safe (פג)", () => {
    const result = isTokenExpired({
      expiryMonth: 13,
      expiryYear: 2030,
      now: ts("2026-06-15T10:00:00Z"),
    });
    expect(result).toBe(true);
  });
});

// ============================================================================
// getPeriodMonthsFromDates — חישוב כמה חודשים יש בין שני תאריכים
// ============================================================================

describe("getPeriodMonthsFromDates", () => {
  it("חודשי (30 ימים) → 1", () => {
    const start = ts("2026-06-01T00:00:00Z");
    const end = ts("2026-07-01T00:00:00Z");
    expect(getPeriodMonthsFromDates(start, end)).toBe(1);
  });

  it("רבעוני (90 ימים) → 3", () => {
    const start = ts("2026-06-01T00:00:00Z");
    const end = ts("2026-08-30T00:00:00Z");
    expect(getPeriodMonthsFromDates(start, end)).toBe(3);
  });

  it("חצי שנתי (180 ימים) → 6", () => {
    const start = ts("2026-06-01T00:00:00Z");
    const end = ts("2026-11-28T00:00:00Z");
    expect(getPeriodMonthsFromDates(start, end)).toBe(6);
  });

  it("שנתי (365 ימים) → 12", () => {
    const start = ts("2026-06-01T00:00:00Z");
    const end = ts("2027-06-01T00:00:00Z");
    expect(getPeriodMonthsFromDates(start, end)).toBe(12);
  });

  it("תקופה חריגה (15 ימים) → ברירת מחדל 1 חודש", () => {
    const start = ts("2026-06-01T00:00:00Z");
    const end = ts("2026-06-16T00:00:00Z");
    expect(getPeriodMonthsFromDates(start, end)).toBe(1);
  });

  it("periodEnd לפני periodStart → ברירת מחדל 1 חודש (fail-safe)", () => {
    const start = ts("2026-06-01T00:00:00Z");
    const end = ts("2026-05-01T00:00:00Z");
    expect(getPeriodMonthsFromDates(start, end)).toBe(1);
  });

  it("null periodEnd → ברירת מחדל 1 חודש", () => {
    const start = ts("2026-06-01T00:00:00Z");
    expect(getPeriodMonthsFromDates(start, null)).toBe(1);
  });

  it("null periodStart → ברירת מחדל 1 חודש", () => {
    const end = ts("2026-06-01T00:00:00Z");
    expect(getPeriodMonthsFromDates(null, end)).toBe(1);
  });
});

// ============================================================================
// addCalendarMonths — calendar-aware month math
// ============================================================================

describe("addCalendarMonths", () => {
  it("+1 חודש מ-1/6/2026 → 1/7/2026", () => {
    const result = addCalendarMonths(ts("2026-06-01T10:00:00Z"), 1);
    expect(result.toISOString()).toBe("2026-07-01T10:00:00.000Z");
  });

  it("+3 חודשים מ-15/3/2026 → 15/6/2026", () => {
    const result = addCalendarMonths(ts("2026-03-15T10:00:00Z"), 3);
    expect(result.toISOString()).toBe("2026-06-15T10:00:00.000Z");
  });

  it("+12 חודשים מ-29/2/2024 → 28/2/2025 (clamping)", () => {
    const result = addCalendarMonths(ts("2024-02-29T10:00:00Z"), 12);
    expect(result.toISOString()).toBe("2025-02-28T10:00:00.000Z");
  });

  it("+1 חודש מ-31/1/2026 → 28/2/2026 (clamping ליום אחרון)", () => {
    const result = addCalendarMonths(ts("2026-01-31T10:00:00Z"), 1);
    expect(result.toISOString()).toBe("2026-02-28T10:00:00.000Z");
  });

  it("+6 חודשים מ-31/8/2026 → 28/2/2027 (year rollover + clamping)", () => {
    const result = addCalendarMonths(ts("2026-08-31T10:00:00Z"), 6);
    expect(result.toISOString()).toBe("2027-02-28T10:00:00.000Z");
  });

  it("שומר את השעה ב-UTC (10:00 נשאר 10:00)", () => {
    const result = addCalendarMonths(ts("2026-06-15T14:30:00Z"), 1);
    expect(result.getUTCHours()).toBe(14);
    expect(result.getUTCMinutes()).toBe(30);
  });
});

// ============================================================================
// isTokenExpired — edge cases
// ============================================================================

describe("isTokenExpired — edge cases", () => {
  it("חודש 12 + שנה 2026, now=Dec 2026 → לא פג", () => {
    const result = isTokenExpired({
      expiryMonth: 12,
      expiryYear: 2026,
      now: ts("2026-12-25T10:00:00Z"),
    });
    expect(result).toBe(false);
  });

  it("חודש 12 + שנה 2025, now=Jan 2026 → פג", () => {
    const result = isTokenExpired({
      expiryMonth: 12,
      expiryYear: 2025,
      now: ts("2026-01-01T00:00:01Z"),
    });
    expect(result).toBe(true);
  });

  it("חודש 12 + שנה 2026, now=Dec 31 23:59 → לא פג", () => {
    const result = isTokenExpired({
      expiryMonth: 12,
      expiryYear: 2026,
      now: ts("2026-12-31T23:59:00Z"),
    });
    expect(result).toBe(false);
  });
});

// ============================================================================
// אינטגרציה: מסלול retry מלא
// ============================================================================

describe("retry schedule — מסלול מלא", () => {
  it("יום 1 (כשל) → יום 3 → יום 7 → חסימה", () => {
    const day1 = ts("2026-06-01T09:00:00Z");

    // אחרי ניסיון 1
    const after1 = calculateNextAttemptDate({
      firstAttemptDate: day1,
      attemptJustCompleted: 1,
    });
    expect(after1).toEqual(ts("2026-06-03T09:00:00Z"));
    expect(shouldBlockAfterAttempt(1)).toBe(false);

    // אחרי ניסיון 2 (ביום 3)
    const after2 = calculateNextAttemptDate({
      firstAttemptDate: day1,
      attemptJustCompleted: 2,
    });
    expect(after2).toEqual(ts("2026-06-07T09:00:00Z"));
    expect(shouldBlockAfterAttempt(2)).toBe(false);

    // אחרי ניסיון 3 (ביום 7) — חסימה
    const after3 = calculateNextAttemptDate({
      firstAttemptDate: day1,
      attemptJustCompleted: 3,
    });
    expect(after3).toBeNull();
    expect(shouldBlockAfterAttempt(3)).toBe(true);
  });
});
