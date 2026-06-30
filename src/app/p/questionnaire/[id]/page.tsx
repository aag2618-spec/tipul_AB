"use client";

import { useState, useEffect, useRef, use } from "react";

interface PublicOption {
  value: number;
  text: string;
}

interface PublicQuestion {
  index: number;
  title: string;
  description?: string;
  section?: string | null;
  sectionName?: string | null;
  instruction?: string | null;
  options: PublicOption[];
}

interface QuestionnairePublic {
  templateName: string;
  description: string;
  questions: PublicQuestion[];
  clientFirstName: string;
  therapistName: string;
  alreadyCompleted: boolean;
}

type Answer = { value?: number; text?: string };

export default function PublicQuestionnairePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [data, setData] = useState<QuestionnairePublic | null>(null);
  const [answers, setAnswers] = useState<Record<number, Answer>>({});
  const [error, setError] = useState("");
  const [formError, setFormError] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const tokenRef = useRef<string | null>(null);

  useEffect(() => {
    const hash = window.location.hash;
    if (!hash.startsWith("#t=")) {
      setError("קישור לא תקין");
      setLoading(false);
      return;
    }
    const token = decodeURIComponent(hash.substring("#t=".length));
    // הסרת הטוקן מה-URL כדי שלא יישאר בהיסטוריה/Referer.
    window.history.replaceState(null, "", window.location.pathname);

    if (!token || !/^[0-9a-f]{32}$/.test(token)) {
      setError("קישור לא תקין");
      setLoading(false);
      return;
    }
    tokenRef.current = token;

    // הטוקן נשלח ב-header (לא ב-URL) כדי שלא יופיע ביומני-שרת/Referer.
    fetch(`/api/p/questionnaire/${id}`, { headers: { "x-quest-token": token } })
      .then((res) => {
        if (!res.ok) throw new Error("not ok");
        return res.json();
      })
      .then((d: QuestionnairePublic) => {
        setData(d);
        if (d.alreadyCompleted) setDone(true);
      })
      .catch(() => setError("הקישור לא תקין או שפג תוקפו"))
      .finally(() => setLoading(false));
  }, [id]);

  const setChoice = (qIndex: number, value: number) =>
    setAnswers((prev) => ({ ...prev, [qIndex]: { value } }));

  const setText = (qIndex: number, text: string) =>
    setAnswers((prev) => ({ ...prev, [qIndex]: { text } }));

  const answeredCount = Object.values(answers).filter(
    (a) => a.value !== undefined || (a.text && a.text.trim())
  ).length;

  const handleSubmit = async () => {
    if (!data || !tokenRef.current) return;

    if (answeredCount === 0) {
      setFormError("יש לענות על השאלון לפני השליחה.");
      return;
    }
    if (answeredCount < data.questions.length) {
      const ok = window.confirm(
        `ענית על ${answeredCount} מתוך ${data.questions.length} שאלות. לשלוח בכל זאת?`
      );
      if (!ok) return;
    }

    setFormError("");
    setSubmitting(true);
    try {
      const res = await fetch(`/api/p/questionnaire/${id}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-quest-token": tokenRef.current,
        },
        body: JSON.stringify({ answers }),
      });
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        throw new Error(e.message || "שגיאה בשליחה");
      }
      setDone(true);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "שגיאה בשליחה. נסה/י שוב.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-teal-600" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div
        className="min-h-screen flex items-center justify-center bg-gray-50 px-4"
        dir="rtl"
      >
        <div className="bg-white rounded-xl shadow-lg p-10 text-center max-w-md">
          <div className="text-5xl mb-4">&#128274;</div>
          <h1 className="text-xl font-bold text-gray-800 mb-2">
            {error || "השאלון לא נמצא"}
          </h1>
          <p className="text-gray-500 text-sm">
            הקישור שגוי או שפג תוקפו. פנה/י למטפל/ת לקבלת קישור חדש.
          </p>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div
        className="min-h-screen flex items-center justify-center bg-gray-50 px-4"
        dir="rtl"
      >
        <div className="bg-white rounded-xl shadow-lg p-10 text-center max-w-md">
          <div className="text-5xl mb-4">&#9989;</div>
          <h1 className="text-2xl font-bold text-green-700 mb-2">תודה!</h1>
          <p className="text-gray-600">
            השאלון נשלח בהצלחה למטפל/ת. אפשר לסגור את הדף.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4" dir="rtl">
      <div className="max-w-2xl mx-auto">
        <div
          className="rounded-t-xl text-center py-6 px-6"
          style={{ background: "linear-gradient(135deg, #0f766e, #14b8a6)" }}
        >
          <h1 className="text-white text-2xl font-bold m-0">
            {data.templateName || "שאלון"}
          </h1>
          {data.therapistName && (
            <p className="text-white/90 text-sm mt-1">{data.therapistName}</p>
          )}
        </div>

        <div className="bg-white rounded-b-xl shadow-lg p-6">
          {data.clientFirstName && (
            <p className="text-lg font-semibold text-gray-800 mb-1">
              שלום {data.clientFirstName},
            </p>
          )}
          <p className="text-gray-600 text-sm mb-2">
            {data.description ||
              "נשמח שתמלא/י את השאלון הבא. בחר/י את התשובה שהכי מתאימה לך בכל שאלה."}
          </p>
          <p className="text-gray-400 text-xs mb-6">
            ענית על {answeredCount} מתוך {data.questions.length} שאלות.
          </p>

          <div className="space-y-7">
            {data.questions.map((q, index) => {
              const showSection =
                q.section &&
                (index === 0 ||
                  data.questions[index - 1].section !== q.section);
              return (
                <div key={q.index}>
                  {showSection && (
                    <div className="text-xs font-bold text-teal-700 bg-teal-50 rounded px-3 py-1.5 mb-3">
                      {q.sectionName || q.section}
                    </div>
                  )}
                  <div className="space-y-2">
                    <label className="block font-medium text-gray-800">
                      {index + 1}. {q.title}
                    </label>
                    {q.description && (
                      <p className="text-xs text-gray-500">{q.description}</p>
                    )}
                    {q.instruction && (
                      <p className="text-xs text-sky-700 bg-sky-50 rounded p-2">
                        {q.instruction}
                      </p>
                    )}

                    {q.options.length > 0 ? (
                      <div className="space-y-2">
                        {q.options.map((opt) => {
                          const selected = answers[index]?.value === opt.value;
                          return (
                            <label
                              key={opt.value}
                              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                                selected
                                  ? "border-teal-600 bg-teal-50"
                                  : "border-gray-200 hover:bg-gray-50"
                              }`}
                            >
                              <input
                                type="radio"
                                name={`q-${index}`}
                                checked={selected}
                                onChange={() => setChoice(index, opt.value)}
                                className="accent-teal-600"
                              />
                              <span className="text-sm text-gray-700">
                                {opt.text}
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    ) : (
                      <textarea
                        className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                        rows={3}
                        value={answers[index]?.text || ""}
                        onChange={(e) => setText(index, e.target.value)}
                      />
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {formError && (
            <p className="text-red-600 text-sm mt-4 text-center">{formError}</p>
          )}

          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full mt-6 bg-teal-600 hover:bg-teal-700 text-white py-4 rounded-xl font-bold text-lg transition-colors shadow-md disabled:opacity-50"
          >
            {submitting ? "שולח..." : "שליחה"}
          </button>

          <p className="text-center text-xs text-gray-400 mt-4">
            המידע נשלח באופן מאובטח למטפל/ת בלבד.
          </p>
        </div>
      </div>
    </div>
  );
}
