import { describe, it, expect } from "vitest";
import {
  getTemplateQuestions,
  scoreFromSelections,
  type TemplateQuestionLike,
} from "@/lib/questionnaire-scoring";

describe("getTemplateQuestions", () => {
  it("מחזיר מערך כשהקלט מערך", () => {
    const q = [{ title: "א" }, { title: "ב" }];
    expect(getTemplateQuestions(q)).toHaveLength(2);
  });

  it("מחלץ questions מפורמט ישן {questions:[...]}", () => {
    const raw = { questions: [{ title: "א" }] };
    expect(getTemplateQuestions(raw)).toHaveLength(1);
  });

  it("מחזיר ריק על קלט לא תקין", () => {
    expect(getTemplateQuestions(null)).toEqual([]);
    expect(getTemplateQuestions("oops")).toEqual([]);
    expect(getTemplateQuestions({})).toEqual([]);
  });
});

describe("scoreFromSelections", () => {
  const fourPoint = (): TemplateQuestionLike[] => [
    {
      options: [
        { value: 0, text: "אף פעם" },
        { value: 1, text: "לפעמים" },
        { value: 2, text: "לעיתים קרובות" },
        { value: 3, text: "תמיד" },
      ],
    },
    {
      options: [
        { value: 0, text: "אף פעם" },
        { value: 1, text: "לפעמים" },
        { value: 2, text: "לעיתים קרובות" },
        { value: 3, text: "תמיד" },
      ],
    },
  ];

  it("מסכם ניקוד מבחירות value (ניקוד = value)", () => {
    const { totalScore } = scoreFromSelections(fourPoint(), {
      "0": { value: 2 },
      "1": { value: 3 },
    });
    expect(totalScore).toBe(5);
  });

  it("מיישר את מערך התשובות לפי אינדקס — לא נענתה => {}", () => {
    const { answers } = scoreFromSelections(fourPoint(), { "1": { value: 1 } });
    expect(answers).toHaveLength(2);
    expect(answers[0]).toEqual({}); // שאלה 0 לא נענתה
    expect(answers[1]).toMatchObject({ value: 1, text: "לפעמים" });
  });

  it("שולף את הניקוד מהתבנית — לא סומך על הדפדפן", () => {
    // הדפדפן שולח רק value=2; השרת קובע את הטקסט והניקוד מהתבנית.
    const { answers, totalScore } = scoreFromSelections(fourPoint(), {
      "0": { value: 2 },
    });
    expect(totalScore).toBe(2);
    expect(answers[0]).toEqual({ value: 2, text: "לעיתים קרובות" });
    // אין שדה score כי option.score לא הוגדר (value = הניקוד).
    expect("score" in (answers[0] as object)).toBe(false);
  });

  it("תומך ב-score נפרד מ-value (סגנון AQ)", () => {
    const aq: TemplateQuestionLike[] = [
      {
        options: [
          { value: 0, text: "מסכים מאוד", score: 1 },
          { value: 1, text: "מסכים מעט", score: 1 },
          { value: 2, text: "לא מסכים מעט", score: 0 },
          { value: 3, text: "לא מסכים מאוד", score: 0 },
        ],
      },
    ];
    const { answers, totalScore } = scoreFromSelections(aq, { "0": { value: 1 } });
    expect(totalScore).toBe(1); // score=1 גובר על value=1 (כאן זהה במקרה)
    expect(answers[0]).toEqual({ value: 1, text: "מסכים מעט", score: 1 });

    const r2 = scoreFromSelections(aq, { "0": { value: 2 } });
    expect(r2.totalScore).toBe(0); // value=2 אך score=0
  });

  it("מקבץ תת-ציונים לפי section", () => {
    const withSections: TemplateQuestionLike[] = [
      { section: "A", options: [{ value: 0 }, { value: 1 }, { value: 2 }] },
      { section: "A", options: [{ value: 0 }, { value: 1 }, { value: 2 }] },
      { section: "B", options: [{ value: 0 }, { value: 1 }, { value: 2 }] },
    ];
    const { subscores, totalScore } = scoreFromSelections(withSections, {
      "0": { value: 2 },
      "1": { value: 1 },
      "2": { value: 2 },
    });
    expect(subscores).toEqual({ A: 3, B: 2 });
    expect(totalScore).toBe(5);
  });

  it("שאלה פתוחה — נשמר טקסט, אין תרומה לניקוד", () => {
    const mixed: TemplateQuestionLike[] = [
      { options: [{ value: 0 }, { value: 1 }] },
      {}, // שאלה פתוחה (בלי options)
    ];
    const { answers, totalScore } = scoreFromSelections(mixed, {
      "0": { value: 1 },
      "1": { text: "  הערה חופשית  " },
    });
    expect(totalScore).toBe(1);
    expect(answers[1]).toEqual({ text: "הערה חופשית" }); // trim
  });

  it("מתעלם מ-value שלא קיים באפשרויות התבנית", () => {
    const { answers, totalScore } = scoreFromSelections(fourPoint(), {
      "0": { value: 99 }, // לא קיים
    });
    expect(totalScore).toBe(0);
    expect(answers[0]).toEqual({}); // נחשב כלא-נענה
  });
});
