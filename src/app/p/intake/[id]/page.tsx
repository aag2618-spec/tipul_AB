"use client";

import { useState, useEffect, useRef, use } from "react";

interface Question {
  id: string;
  text?: string;
  type?: string;
  options?: string[];
  required?: boolean;
}

interface IntakePublic {
  templateName: string;
  description: string;
  questions: Question[];
  clientFirstName: string;
  therapistName: string;
  alreadyCompleted: boolean;
}

export default function PublicIntakePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [data, setData] = useState<IntakePublic | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
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

    fetch(`/api/p/intake/${id}?t=${encodeURIComponent(token)}`)
      .then((res) => {
        if (!res.ok) throw new Error("not ok");
        return res.json();
      })
      .then((d: IntakePublic) => {
        setData(d);
        if (d.alreadyCompleted) setDone(true);
      })
      .catch(() => setError("הקישור לא תקין או שפג תוקפו"))
      .finally(() => setLoading(false));
  }, [id]);

  const setAnswer = (qid: string, value: string) =>
    setAnswers((prev) => ({ ...prev, [qid]: value }));

  const handleSubmit = async () => {
    if (!data || !tokenRef.current) return;

    const missing = data.questions.find(
      (q) => q.required && !(answers[q.id] && answers[q.id].trim())
    );
    if (missing) {
      setFormError("יש למלא את כל שדות החובה (מסומנים ב-*)");
      return;
    }
    setFormError("");
    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/p/intake/${id}?t=${encodeURIComponent(tokenRef.current)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ responses: answers }),
        }
      );
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
            התשובות נשלחו בהצלחה. נתראה בפגישה.
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
            {data.templateName || "שאלון פנייה"}
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
          <p className="text-gray-600 text-sm mb-6">
            {data.description ||
              "כדי שנגיע מוכנים לפגישה, נשמח שתמלא/י את השאלון הקצר הבא."}
          </p>

          <div className="space-y-6">
            {data.questions.map((q, index) => {
              const qType = (q.type || "TEXT").toUpperCase();
              const label = q.text || `שאלה ${index + 1}`;
              return (
                <div key={q.id || index} className="space-y-2">
                  <label
                    htmlFor={q.id}
                    className="block font-medium text-gray-800"
                  >
                    {index + 1}. {label}
                    {q.required && <span className="text-red-500 mr-1">*</span>}
                  </label>
                  {qType === "TEXTAREA" ? (
                    <textarea
                      id={q.id}
                      className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                      rows={3}
                      value={answers[q.id] || ""}
                      onChange={(e) => setAnswer(q.id, e.target.value)}
                    />
                  ) : qType === "SELECT" ? (
                    <select
                      id={q.id}
                      className="w-full border border-gray-300 rounded-lg p-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                      value={answers[q.id] || ""}
                      onChange={(e) => setAnswer(q.id, e.target.value)}
                    >
                      <option value="">בחר/י...</option>
                      {(q.options || []).map((opt, i) => (
                        <option key={i} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      id={q.id}
                      className="w-full border border-gray-300 rounded-lg p-3 text-sm focus:outline-none focus:ring-2 focus:ring-teal-500"
                      value={answers[q.id] || ""}
                      onChange={(e) => setAnswer(q.id, e.target.value)}
                    />
                  )}
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
