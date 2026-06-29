// ==================== Tests: matchAmountToPeriodMonths ====================
// תיקון אבטחה (amount tampering ב-webhooks מנוי): התקופה נגזרת מהתאמת הסכום
// למחיר-אמת בצד השרת, ואי-התאמה מחזירה null (דחייה) במקום נפילה שקטה ל-30 יום.
// שינוי קריטי (כסף) — לפי feedback_critical_changes_process חייב טסטים.

import { describe, it, expect } from "vitest";
import { matchAmountToPeriodMonths, PRICING, type PeriodPrice } from "@/lib/pricing";

// טבלת מחירים מציאותית למסלול ESSENTIAL: { 1: 117, 3: 333, 6: 632, 12: 1165 }
const essential: PeriodPrice[] = [1, 3, 6, 12].map((m) => ({
  months: m,
  price: PRICING.ESSENTIAL[m],
}));

describe("matchAmountToPeriodMonths — התאמה מדויקת", () => {
  it("מתאים כל אחת מ-4 התקופות לפי הסכום המדויק", () => {
    expect(matchAmountToPeriodMonths(essential, 117)).toBe(1);
    expect(matchAmountToPeriodMonths(essential, 333)).toBe(3);
    expect(matchAmountToPeriodMonths(essential, 632)).toBe(6);
    expect(matchAmountToPeriodMonths(essential, 1165)).toBe(12);
  });

  it("מעדיף התאמה מדויקת על פני מקורבת כשהשתיים אפשריות", () => {
    // 116 קרוב גם ל-117 (תקופה 1) — אבל אם יש שורה מדויקת 116 ב-prices,
    // היא תיבחר לפני המקורבת.
    const withExact: PeriodPrice[] = [
      { months: 1, price: 117 },
      { months: 3, price: 116 },
    ];
    expect(matchAmountToPeriodMonths(withExact, 116)).toBe(3);
  });
});

describe("matchAmountToPeriodMonths — סבילות מחמירה", () => {
  it("מקבל סטייה זעירה בתוך ברירת המחדל (₪2)", () => {
    expect(matchAmountToPeriodMonths(essential, 116)).toBe(1); // 117-1
    expect(matchAmountToPeriodMonths(essential, 119)).toBe(1); // 117+2
    expect(matchAmountToPeriodMonths(essential, 1167)).toBe(12); // 1165+2
  });

  it("דוחה סטייה מעבר לסבילות — סכום שאינו תואם אף מחיר", () => {
    expect(matchAmountToPeriodMonths(essential, 120)).toBeNull(); // 117+3 > 2
    expect(matchAmountToPeriodMonths(essential, 200)).toBeNull();
    expect(matchAmountToPeriodMonths(essential, 1000)).toBeNull();
  });

  it("מכבד סבילות מותאמת אישית", () => {
    expect(matchAmountToPeriodMonths(essential, 122, 5)).toBe(1); // 117+5
    expect(matchAmountToPeriodMonths(essential, 122, 2)).toBeNull();
    // סבילות 0 = רק התאמה מדויקת
    expect(matchAmountToPeriodMonths(essential, 116, 0)).toBeNull();
    expect(matchAmountToPeriodMonths(essential, 117, 0)).toBe(1);
  });
});

describe("matchAmountToPeriodMonths — סכומים פסולים (הליבה של התיקון)", () => {
  it("דוחה אפס — לא להעניק מנוי על תשלום ₪0", () => {
    expect(matchAmountToPeriodMonths(essential, 0)).toBeNull();
  });

  it("דוחה סכום שלילי", () => {
    expect(matchAmountToPeriodMonths(essential, -100)).toBeNull();
  });

  it("דוחה NaN / Infinity", () => {
    expect(matchAmountToPeriodMonths(essential, NaN)).toBeNull();
    expect(matchAmountToPeriodMonths(essential, Infinity)).toBeNull();
    expect(matchAmountToPeriodMonths(essential, -Infinity)).toBeNull();
  });
});

describe("matchAmountToPeriodMonths — שורות מחיר פסולות", () => {
  it("מדלג על שורות עם price null/undefined ולא קורס", () => {
    const partial: PeriodPrice[] = [
      { months: 1, price: null },
      { months: 3, price: undefined },
      { months: 6, price: 632 },
    ];
    expect(matchAmountToPeriodMonths(partial, 632)).toBe(6);
    expect(matchAmountToPeriodMonths(partial, 117)).toBeNull();
  });

  it("מחזיר null על טבלה ריקה", () => {
    expect(matchAmountToPeriodMonths([], 117)).toBeNull();
  });
});
