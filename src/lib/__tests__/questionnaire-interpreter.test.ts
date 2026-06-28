/**
 * מנוע פרשנות שאלונים — בדיקות.
 *
 * שלוש שכבות בדיקה:
 *   1. BDI2 ממוקד — תוכן עשיר לכל רמה, פרוטוקול פריט 9 בכל ערך, אשכולות.
 *   2. כיסוי כל השאלונים — כל גבול טווח + כל cutoff מחזיר ניתוח לא-ריק.
 *   3. ניתוח משולב — תבניות חוצות-דומיינים ודגלי סיכון נעוצים.
 */
import { describe, it, expect } from "vitest";
import { questionnaires } from "@/data/questionnaire-seeds";
import {
  interpretResponse,
  interpretCombined,
  DISCLAIMER,
  type TemplateLike,
  type ResponseLike,
} from "@/lib/questionnaire-interpreter";

const all = questionnaires as unknown as TemplateLike[];
const byCode = (c: string) => all.find((t) => t.code === c)!;
const BDI2 = byCode("BDI2");

// בונה מערך תשובות BDI2 (21 פריטים) עם ערך לפריט 9 ולשאר.
function bdiAnswers(item9: number, fill = 0): ResponseLike["answers"] {
  return BDI2.questions.map((q) => ({
    value: q.id === 9 ? item9 : fill,
  }));
}

// ---------------------------------------------------------------------------
// 1. BDI2 — תוכן עשיר
// ---------------------------------------------------------------------------

describe("BDI2 — רמות ותוכן עשיר", () => {
  const cases: Array<[number, string]> = [
    [0, "מינימלי"],
    [13, "מינימלי"],
    [14, "קל"],
    [19, "קל"],
    [20, "בינוני"],
    [28, "בינוני"],
    [29, "חמור"],
    [63, "חמור"],
  ];

  it.each(cases)("ציון %i → רמה '%s' עם ניתוח עשיר", (score, label) => {
    const r = interpretResponse(BDI2, { totalScore: score });
    expect(r.level?.label).toBe(label);
    expect(r.source).toBe("rich");
    expect(r.richBody && r.richBody.length).toBeGreaterThan(0);
    expect(r.recommendations.length).toBeGreaterThan(0);
    expect(r.watchFor.length).toBeGreaterThan(0);
    expect(r.followUp).toBeTruthy();
    expect(r.disclaimer).toBe(DISCLAIMER);
  });

  it("כל רמה מחזירה richBody ייחודי", () => {
    const bodies = [0, 16, 24, 40].map(
      (s) => interpretResponse(BDI2, { totalScore: s }).richBody?.[0]
    );
    expect(new Set(bodies).size).toBe(4);
  });
});

describe("BDI2 — פריט 9 (סיכון אובדני)", () => {
  it("ערך 0 → אין דגל סיכון", () => {
    const r = interpretResponse(BDI2, { answers: bdiAnswers(0) });
    expect(r.riskFlags.length).toBe(0);
  });

  it("ערך 1 → דגל אזהרה", () => {
    const r = interpretResponse(BDI2, { answers: bdiAnswers(1) });
    expect(r.riskFlags.length).toBe(1);
    expect(r.riskFlags[0].level).toBe("warning");
  });

  it.each([2, 3])("ערך %i → דגל קריטי", (v) => {
    const r = interpretResponse(BDI2, { answers: bdiAnswers(v) });
    expect(r.riskFlags[0].level).toBe("critical");
  });

  it("הדגל הקריטי מופיע גם כשהציון הכולל מינימלי", () => {
    // כל הפריטים 0 חוץ מפריט 9 = 2 → ציון כולל 2 (טווח מינימלי), אך דגל קריטי.
    const r = interpretResponse(BDI2, { answers: bdiAnswers(2) });
    expect(r.totalScore).toBe(2);
    expect(r.level?.label).toBe("מינימלי");
    expect(r.riskFlags.some((f) => f.level === "critical")).toBe(true);
  });
});

describe("BDI2 — אשכולות קוגניטיבי/סומטי", () => {
  it("מחזיר שני אשכולות עם הערות", () => {
    const r = interpretResponse(BDI2, { answers: bdiAnswers(0, 1) });
    const keys = r.subscales.map((s) => s.key);
    expect(keys).toContain("cognitive");
    expect(keys).toContain("somatic");
    for (const s of r.subscales) expect(s.note).toBeTruthy();
  });

  it("אשכול קוגניטיבי גבוה → הערה על מחשבות שליליות", () => {
    // פריטים קוגניטיביים (2,3,5,6,7,8,9,14) = 3, השאר 0.
    const cogIds = new Set([2, 3, 5, 6, 7, 8, 9, 14]);
    const answers = BDI2.questions.map((q) => ({
      value: cogIds.has(q.id) ? 3 : 0,
    }));
    const r = interpretResponse(BDI2, { answers });
    const cog = r.subscales.find((s) => s.key === "cognitive");
    expect(cog?.note).toContain("מחשבות שליליות");
  });
});

// ---------------------------------------------------------------------------
// 2. כיסוי כל השאלונים — אף רמה לא נשארת בלי ניתוח
// ---------------------------------------------------------------------------

describe("כיסוי כל השאלונים", () => {
  it("נטענו שאלונים מהמאגר", () => {
    expect(all.length).toBeGreaterThanOrEqual(38);
  });

  it.each(all.map((t) => [t.code, t] as const))(
    "%s — כל גבול טווח מחזיר ניתוח לא-ריק",
    (_code, t) => {
      const ranges = t.scoring?.ranges;
      if (ranges && ranges.length) {
        for (const range of ranges) {
          for (const score of [range.min, range.max]) {
            const r = interpretResponse(t, { totalScore: score });
            expect(r.level?.label).toBe(range.label);
            expect(r.recommendations.length).toBeGreaterThan(0);
            expect(r.headline).toBeTruthy();
            expect(r.disclaimer).toBe(DISCLAIMER);
          }
        }
      }
      // תמיד — קצוות גנריים (מכסה גם שאלונים בלי ranges).
      for (const score of [0, t.scoring?.maxScore ?? 100]) {
        const r = interpretResponse(t, { totalScore: score });
        expect(r.recommendations.length).toBeGreaterThan(0);
        expect(r.disclaimer).toBe(DISCLAIMER);
        expect(r.headline).toBeTruthy();
      }
    }
  );

  it("תת-סולמות עם cutoff — מסומנים מעל/מתחת לסף נכון", () => {
    for (const t of all) {
      const subs = t.scoring?.subscales;
      if (!subs) continue;
      for (const [key, m] of Object.entries(subs)) {
        if (!m || typeof m.cutoff !== "number") continue;
        const over = interpretResponse(t, {
          subscores: { [key]: m.cutoff },
        }).subscales.find((s) => s.key === key);
        const under = interpretResponse(t, {
          subscores: { [key]: m.cutoff - 1 },
        }).subscales.find((s) => s.key === key);
        expect(over?.over).toBe(true);
        expect(under?.over).toBe(false);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// 3. ניתוח משולב
// ---------------------------------------------------------------------------

// תבניות סינתטיות לבדיקת חוקי הצירוף (מנותקות מפרטי המאגר).
const mk = (
  code: string,
  category: string
): TemplateLike => ({
  code,
  name: `שאלון ${code}`,
  category,
  questions: [],
  scoring: {
    maxScore: 100,
    ranges: [
      { min: 0, max: 20, label: "תקין", description: "" },
      { min: 21, max: 100, label: "גבוה", description: "" },
    ],
  },
});
const HIGH: ResponseLike = { totalScore: 100 };
const LOW: ResponseLike = { totalScore: 0 };

describe("ניתוח משולב", () => {
  it("דיכאון גבוה + חרדה גבוהה → תמונה מעורבת", () => {
    const c = interpretCombined([
      { template: mk("BDI2", "דיכאון"), response: HIGH },
      { template: mk("GAD7", "חרדה"), response: HIGH },
    ]);
    expect(c.patterns.some((p) => p.includes("חרדה ודיכאון"))).toBe(true);
    expect(c.domains[0].severity).toBe("high");
  });

  it("טראומה גבוהה + דיכאון גבוה → הערת רקע פוסט-טראומטי", () => {
    const c = interpretCombined([
      { template: mk("PCL5", "טראומה"), response: HIGH },
      { template: mk("BDI2", "דיכאון"), response: HIGH },
    ]);
    expect(c.patterns.some((p) => p.includes("טראומה"))).toBe(true);
  });

  it("דגל סיכון מ-BDI2 נעוץ בראש ומשפיע על הסיכום", () => {
    const c = interpretCombined([
      { template: BDI2, response: { answers: bdiAnswers(3) } },
      { template: mk("GAD7", "חרדה"), response: LOW },
    ]);
    expect(c.riskFlags[0]?.level).toBe("critical");
    expect(c.summary).toContain("מיידית");
  });

  it("ללא מעורבות מוגברת → סיכום מרגיע", () => {
    const c = interpretCombined([
      { template: mk("BDI2", "דיכאון"), response: LOW },
      { template: mk("GAD7", "חרדה"), response: LOW },
    ]);
    expect(c.riskFlags.length).toBe(0);
    expect(c.summary).toContain("לא נמצאה מעורבות מוגברת");
  });
});
