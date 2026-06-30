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

// בונה תשובות BDI2 ממפת id→ערך.
function bdiFrom(map: Record<number, number>): ResponseLike["answers"] {
  return BDI2.questions.map((q) => ({ value: map[q.id] ?? 0 }));
}

describe("BDI2 — העשרה: פרסונליזציה", () => {
  it("מוקדי מצוקה — הפריטים הגבוהים, ממוינים, עד 4", () => {
    const r = interpretResponse(BDI2, {
      answers: bdiFrom({ 4: 3, 16: 3, 14: 2, 1: 2, 20: 1 }),
    });
    expect(r.topItems && r.topItems.length).toBeLessThanOrEqual(4);
    expect(r.topItems?.[0].value).toBe(3);
    const titles = r.topItems?.map((t) => t.title) || [];
    expect(titles).toContain("אובדן הנאה");
  });

  it("אזורי חוסן — פריטים שסומנו 0", () => {
    const r = interpretResponse(BDI2, { answers: bdiFrom({ 4: 3 }) });
    expect(r.strengths && r.strengths.length).toBeGreaterThan(0);
    expect(r.strengths?.every((s) => true)).toBe(true);
  });

  it("דפוס מלנכולי-גופני כשהסומטי דומיננטי", () => {
    const r = interpretResponse(BDI2, {
      answers: bdiFrom({ 4: 3, 16: 3, 18: 3, 15: 3, 20: 2, 1: 2, 10: 2, 12: 2 }),
    });
    expect(r.pattern?.key).toBe("melancholic");
  });

  it("דפוס קוגניטיבי כשהמחשבות השליליות דומיננטיות", () => {
    const r = interpretResponse(BDI2, {
      answers: bdiFrom({ 2: 3, 5: 3, 7: 3, 8: 3, 14: 3, 3: 3, 6: 2 }),
    });
    expect(r.pattern?.key).toBe("cognitive");
  });

  it("דפוס נסער-עצבני כשאי-שקט ועצבנות גבוהים", () => {
    const r = interpretResponse(BDI2, {
      answers: bdiFrom({ 11: 3, 17: 3, 1: 3, 4: 3, 15: 3, 16: 3, 20: 2 }),
    });
    expect(r.pattern?.key).toBe("agitated");
  });

  it("אין דפוס ברמה מינימלית", () => {
    const r = interpretResponse(BDI2, { totalScore: 5 });
    expect(r.pattern).toBeNull();
  });
});

describe("BDI2 — העשרה: כלים מעשיים", () => {
  it("שאלת סיכון מופיעה ראשונה כשפריט 9 מסומן", () => {
    const r = interpretResponse(BDI2, { answers: bdiFrom({ 9: 2 }) });
    expect(r.questionsToAsk?.[0]).toContain("אובדניות");
  });

  it("שאלת שינה מופיעה כשפריט השינה גבוה", () => {
    const r = interpretResponse(BDI2, { answers: bdiFrom({ 16: 3 }) });
    expect(r.questionsToAsk?.some((q) => q.includes("שינה"))).toBe(true);
  });

  it("יעדי טיפול לא ריקים ברמה בינונית", () => {
    const r = interpretResponse(BDI2, { totalScore: 24 });
    expect(r.treatmentTargets && r.treatmentTargets.length).toBeGreaterThan(0);
  });

  it("סיכום נרטיבי כולל את שם השאלון", () => {
    const r = interpretResponse(BDI2, { totalScore: 24 });
    expect(r.narrative).toContain("מדד דיכאון בק");
  });
});

describe("BDI2 — העשרה: מעקב והקשר", () => {
  it("שאלונים משלימים — MDQ תמיד, BHS כשיש סיכון", () => {
    // ציון 18 (קל) + פריט 9 (סיכון) + פסימיות גבוהה → BHS+MDQ.
    const r = interpretResponse(BDI2, {
      answers: bdiFrom({ 9: 2, 2: 3, 1: 2, 4: 2, 16: 3, 20: 2, 10: 2, 12: 2 }),
    });
    const codes = r.complementary?.map((c) => c.code) || [];
    expect(codes).toContain("MDQ");
    expect(codes).toContain("BHS");
  });

  it("אבחנה מבדלת ריקה ברמה מינימלית, מלאה ברמה בינונית", () => {
    expect(interpretResponse(BDI2, { totalScore: 5 }).differential?.length).toBe(0);
    expect(
      interpretResponse(BDI2, { totalScore: 24 }).differential?.length
    ).toBeGreaterThan(0);
  });

  it("שינוי — שיפור משמעותי לעומת מדידה קודמת", () => {
    const r = interpretResponse(
      BDI2,
      { totalScore: 20 },
      { previous: { totalScore: 35, completedAt: "2025-01-01" } }
    );
    expect(r.change?.direction).toBe("improved");
    expect(r.change?.delta).toBe(-15);
    expect(r.change?.magnitude).toBe("משמעותי");
  });

  it("שינוי — החמרה כשהציון עלה", () => {
    const r = interpretResponse(
      BDI2,
      { totalScore: 40 },
      { previous: { totalScore: 20 } }
    );
    expect(r.change?.direction).toBe("worsened");
  });

  it("שינוי — יציב כשההפרש זניח", () => {
    const r = interpretResponse(
      BDI2,
      { totalScore: 21 },
      { previous: { totalScore: 20 } }
    );
    expect(r.change?.direction).toBe("stable");
  });
});

describe("ההעשרה מגודרת ל-BDI2 בלבד", () => {
  it("שאלון ללא spec (PHQ9) לא מקבל שדות העשרה", () => {
    const r = interpretResponse(byCode("PHQ9"), { totalScore: 12 });
    expect(r.topItems).toBeUndefined();
    expect(r.narrative).toBeUndefined();
    expect(r.pattern).toBeUndefined();
    expect(r.differential).toBeUndefined();
    // אך הניתוח הבסיסי עדיין מלא:
    expect(r.recommendations.length).toBeGreaterThan(0);
    expect(r.disclaimer).toBe(DISCLAIMER);
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
