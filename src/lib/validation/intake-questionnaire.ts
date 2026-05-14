// M-validation: שיתוף ולידציה ל-POST/PUT של intake-questionnaires.
//
// מטרה: למנוע (א) DoS דרך JSON ענק, (ב) data corruption דרך טיפוסים
// לא צפויים, (ג) injection דרך שדות text שיוצגו בעתיד.

import { NextResponse } from "next/server";

const MAX_NAME = 200;
const MAX_DESCRIPTION = 2000;
const MAX_QUESTIONS = 100;
const MAX_QUESTION_LABEL = 500;
const MAX_QUESTION_OPTIONS = 50;
const MAX_OPTION_TEXT = 200;
// סוגי שאלות נתמכים — שווה ל-Question types שה-UI שולח.
const ALLOWED_QUESTION_TYPES = [
  "TEXT",
  "TEXTAREA",
  "RADIO",
  "CHECKBOX",
  "SELECT",
  "NUMBER",
  "DATE",
  "EMAIL",
  "PHONE",
];

export function validateQuestionnaireInput(params: {
  body: Record<string, unknown>;
  requireName?: boolean;
}): NextResponse | null {
  const { body, requireName = true } = params;
  const { name, description, questions } = body;

  // name
  if (requireName || name !== undefined) {
    if (typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json({ message: "שם השאלון חובה" }, { status: 400 });
    }
    if (name.length > MAX_NAME) {
      return NextResponse.json(
        { message: `שם ארוך מדי (מקסימום ${MAX_NAME} תווים)` },
        { status: 400 }
      );
    }
  }

  // description (אופציונלי)
  if (description !== undefined && description !== null) {
    if (typeof description !== "string") {
      return NextResponse.json({ message: "תיאור חייב להיות טקסט" }, { status: 400 });
    }
    if (description.length > MAX_DESCRIPTION) {
      return NextResponse.json(
        { message: `תיאור ארוך מדי (מקסימום ${MAX_DESCRIPTION} תווים)` },
        { status: 400 }
      );
    }
  }

  // questions: מערך של אובייקטים, מקס 100. כל שאלה: type מ-enum, label עד 500.
  if (questions !== undefined && questions !== null) {
    if (!Array.isArray(questions)) {
      return NextResponse.json({ message: "שאלות חייבות להיות מערך" }, { status: 400 });
    }
    if (questions.length > MAX_QUESTIONS) {
      return NextResponse.json(
        { message: `יותר מדי שאלות (מקסימום ${MAX_QUESTIONS})` },
        { status: 400 }
      );
    }
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      if (!q || typeof q !== "object" || Array.isArray(q)) {
        return NextResponse.json({ message: `שאלה ${i + 1}: פורמט לא תקין` }, { status: 400 });
      }
      const qObj = q as Record<string, unknown>;
      // type
      if (qObj.type !== undefined) {
        if (typeof qObj.type !== "string" || !ALLOWED_QUESTION_TYPES.includes(qObj.type)) {
          return NextResponse.json(
            { message: `שאלה ${i + 1}: סוג לא תקין` },
            { status: 400 }
          );
        }
      }
      // label/text/title — שמות שונים בהתאם ל-UI; כל אחד עם cap.
      for (const field of ["label", "text", "title", "question"]) {
        const v = qObj[field];
        if (v !== undefined && v !== null) {
          if (typeof v !== "string") {
            return NextResponse.json(
              { message: `שאלה ${i + 1}: ${field} חייב להיות טקסט` },
              { status: 400 }
            );
          }
          if (v.length > MAX_QUESTION_LABEL) {
            return NextResponse.json(
              { message: `שאלה ${i + 1}: ${field} ארוך מדי (מקסימום ${MAX_QUESTION_LABEL})` },
              { status: 400 }
            );
          }
        }
      }
      // options array (RADIO/CHECKBOX/SELECT)
      if (qObj.options !== undefined && qObj.options !== null) {
        if (!Array.isArray(qObj.options)) {
          return NextResponse.json(
            { message: `שאלה ${i + 1}: options חייבות להיות מערך` },
            { status: 400 }
          );
        }
        if (qObj.options.length > MAX_QUESTION_OPTIONS) {
          return NextResponse.json(
            { message: `שאלה ${i + 1}: יותר מדי אפשרויות (מקסימום ${MAX_QUESTION_OPTIONS})` },
            { status: 400 }
          );
        }
        for (let j = 0; j < qObj.options.length; j++) {
          const opt = qObj.options[j];
          // option יכול להיות string או object {value, label}.
          if (typeof opt === "string") {
            if (opt.length > MAX_OPTION_TEXT) {
              return NextResponse.json(
                { message: `שאלה ${i + 1} אופציה ${j + 1}: ארוך מדי` },
                { status: 400 }
              );
            }
          } else if (opt && typeof opt === "object" && !Array.isArray(opt)) {
            const o = opt as Record<string, unknown>;
            for (const f of ["value", "label", "text"]) {
              const v = o[f];
              if (typeof v === "string" && v.length > MAX_OPTION_TEXT) {
                return NextResponse.json(
                  { message: `שאלה ${i + 1} אופציה ${j + 1}: ${f} ארוך מדי` },
                  { status: 400 }
                );
              }
            }
          }
        }
      }
    }
  }

  return null;
}
