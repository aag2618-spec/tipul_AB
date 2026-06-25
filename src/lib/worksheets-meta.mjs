// מטא-דאטה צדדי לדפי העבודה: תאריך הוספה (addedAt) ותיוג נושאים (topics).
// נפרד ממקורות התוכן (worksheets-content*.mjs) בכוונה — כדי לא לשבור את סקריפטי
// ה-build וה-PDF שצורכים אותם. ממוזג לקטלוג ב-page.tsx לפי ה-slug (=id) של כל דף.
//
// addedAt — תאריך הוספת הדף בפורמט "YYYY-MM-DD". משמש לסינון "לפי תקופה".
//   הערה: כל הדפים הקיימים נוצרו ב-06/2026, לכן ההבחנה ביניהם קטנה כיום; הסינון
//   יתחיל להבדיל מאליו ככל שיתווספו דפים חדשים (לכל דף חדש שמים את תאריך יצירתו).
// topics — מערך slugs מתוך worksheets-topics.mjs. לכוונון: מוסיפים/מסירים slug כאן.
//
// slug שחסר כאן פשוט לא ייתפס בסינון נושא/תקופה (מסומן בכך שיש להשלים לו תיוג).
export const worksheetsMeta = {
  // ── CBT — טיפול קוגניטיבי־התנהגותי ──
  "cbt-exposure-ladder": { addedAt: "2026-06-22", topics: ["fears", "anxiety"] },
  "cbt-cognitive-distortions": { addedAt: "2026-06-22", topics: ["anxiety", "depression"] },
  "cbt-decatastrophizing": { addedAt: "2026-06-22", topics: ["anxiety", "fears"] },
  "cbt-problem-solving": { addedAt: "2026-06-22", topics: ["stress", "motivation"] },
  "cbt-behavioral-activation": { addedAt: "2026-06-24", topics: ["depression", "motivation"] },
  "cbt-good-enough": { addedAt: "2026-06-24", topics: ["self-esteem", "anxiety"] },
  "cbt-procrastination": { addedAt: "2026-06-24", topics: ["habits", "motivation"] },
  "cbt-thought-record": { addedAt: "2026-06-24", topics: ["anxiety", "depression"] },
  "cbt-worry-tree": { addedAt: "2026-06-24", topics: ["anxiety"] },

  // ── DBT — טיפול דיאלקטי־התנהגותי ──
  "dbt-dearman": { addedAt: "2026-06-22", topics: ["relationships"] },
  "dbt-radical-acceptance": { addedAt: "2026-06-22", topics: ["emotion-regulation", "grief"] },
  "dbt-accepts": { addedAt: "2026-06-22", topics: ["emotion-regulation", "stress"] },
  "dbt-wise-mind": { addedAt: "2026-06-22", topics: ["emotion-regulation"] },
  "dbt-distress-tolerance": { addedAt: "2026-06-24", topics: ["emotion-regulation", "stress"] },
  "dbt-emotion-regulation": { addedAt: "2026-06-24", topics: ["emotion-regulation"] },
  "dbt-emotion-wheel": { addedAt: "2026-06-24", topics: ["emotion-regulation"] },
  "dbt-healthy-boundaries": { addedAt: "2026-06-24", topics: ["relationships"] },
  "dbt-i-statements": { addedAt: "2026-06-24", topics: ["relationships"] },
  "dbt-opposite-action": { addedAt: "2026-06-24", topics: ["emotion-regulation"] },

  // ── ACT — טיפול בקבלה ומחויבות ──
  "act-matrix": { addedAt: "2026-06-22", topics: ["meaning", "motivation"] },
  "act-observing-self": { addedAt: "2026-06-22", topics: ["mindfulness"] },
  "act-committed-action": { addedAt: "2026-06-22", topics: ["meaning", "motivation"] },
  "act-acceptance-letting-go": { addedAt: "2026-06-24", topics: ["emotion-regulation", "mindfulness"] },
  "act-circle-of-control": { addedAt: "2026-06-24", topics: ["anxiety", "stress"] },
  "act-cognitive-defusion": { addedAt: "2026-06-24", topics: ["anxiety", "mindfulness"] },
  "act-values-identification": { addedAt: "2026-06-24", topics: ["meaning"] },

  // ── Mindfulness — קשיבות ──
  "mindfulness-breath-anchor": { addedAt: "2026-06-22", topics: ["mindfulness", "anxiety"] },
  "mindfulness-body-scan": { addedAt: "2026-06-22", topics: ["mindfulness", "stress"] },
  "mindfulness-grounding-54321": { addedAt: "2026-06-22", topics: ["mindfulness", "anxiety"] },
  "mindfulness-attention-anchor": { addedAt: "2026-06-24", topics: ["mindfulness"] },
  "mindfulness-diaphragmatic-breathing": { addedAt: "2026-06-24", topics: ["mindfulness", "stress"] },
  "mindfulness-mindful-eating": { addedAt: "2026-06-24", topics: ["mindfulness", "habits"] },
  "mindfulness-present-moment": { addedAt: "2026-06-24", topics: ["mindfulness"] },
  "mindfulness-safe-place": { addedAt: "2026-06-24", topics: ["mindfulness", "trauma"] },

  // ── CFT — טיפול ממוקד חמלה ──
  "cft-compassionate-letter": { addedAt: "2026-06-22", topics: ["self-esteem"] },
  "cft-three-circles": { addedAt: "2026-06-22", topics: ["emotion-regulation", "self-esteem"] },
  "cft-compassionate-image": { addedAt: "2026-06-22", topics: ["self-esteem"] },
  "cft-grief-waves": { addedAt: "2026-06-24", topics: ["grief"] },
  "cft-guilt-vs-shame": { addedAt: "2026-06-24", topics: ["self-esteem"] },
  "cft-self-compassion": { addedAt: "2026-06-24", topics: ["self-esteem"] },

  // ── פסיכולוגיה חיובית ──
  "positive-character-strengths": { addedAt: "2026-06-22", topics: ["self-esteem", "motivation"] },
  "positive-best-possible-self": { addedAt: "2026-06-22", topics: ["motivation", "meaning"] },
  "positive-gratitude-letter": { addedAt: "2026-06-22", topics: ["relationships", "meaning"] },
  "positive-gratitude": { addedAt: "2026-06-24", topics: ["depression", "mindfulness"] },
  "positive-hope-ladder": { addedAt: "2026-06-24", topics: ["depression", "motivation"] },
  "positive-kindness-act": { addedAt: "2026-06-24", topics: ["relationships", "motivation"] },
  "positive-resilience": { addedAt: "2026-06-24", topics: ["stress", "motivation"] },
  "positive-small-wins-journal": { addedAt: "2026-06-24", topics: ["depression", "motivation"] },
  "positive-smart-goals": { addedAt: "2026-06-24", topics: ["motivation", "habits"] },

  // ── SFBT — טיפול ממוקד פתרון ──
  "sfbt-miracle-question": { addedAt: "2026-06-24", topics: ["motivation", "meaning"] },
  "sfbt-exception-finding": { addedAt: "2026-06-22", topics: ["motivation"] },
  "sfbt-scaling-questions": { addedAt: "2026-06-22", topics: ["motivation"] },

  // ── Polyvagal — וויסות פוליוואגלי ──
  "polyvagal-states-map": { addedAt: "2026-06-22", topics: ["trauma", "emotion-regulation"] },
  "polyvagal-glimmers": { addedAt: "2026-06-22", topics: ["trauma", "mindfulness"] },
  "polyvagal-regulation-breath": { addedAt: "2026-06-22", topics: ["stress", "mindfulness"] },
  "polyvagal-sensory-regulation": { addedAt: "2026-06-24", topics: ["trauma", "stress"] },
  "polyvagal-window-of-tolerance": { addedAt: "2026-06-24", topics: ["trauma", "emotion-regulation"] },

  // ── ניהול כעס ──
  "anger-thermometer": { addedAt: "2026-06-22", topics: ["anger"] },
  "anger-time-out-plan": { addedAt: "2026-06-22", topics: ["anger"] },
  "anger-trigger-log": { addedAt: "2026-06-22", topics: ["anger"] },
  "anger-letter": { addedAt: "2026-06-24", topics: ["anger"] },

  // ── גישות נוספות ──
  "logotherapy-meaning-search": { addedAt: "2026-06-22", topics: ["meaning"] },
  "narrative-externalizing": { addedAt: "2026-06-22", topics: ["self-esteem", "meaning"] },
  "ifs-internal-parts": { addedAt: "2026-06-22", topics: ["self-esteem", "emotion-regulation"] },
  "schema-identification": { addedAt: "2026-06-22", topics: ["self-esteem", "relationships"] },
  "schema-modes": { addedAt: "2026-06-22", topics: ["self-esteem", "emotion-regulation"] },
  "schema-flashcard": { addedAt: "2026-06-22", topics: ["self-esteem"] },
  "stages-of-change": { addedAt: "2026-06-22", topics: ["habits", "motivation"] },
  "stages-habit-building": { addedAt: "2026-06-24", topics: ["habits", "motivation"] },
  "reality-wdep": { addedAt: "2026-06-22", topics: ["motivation", "relationships"] },
  "reality-conflict-resolution": { addedAt: "2026-06-24", topics: ["relationships"] },
  "gestalt-empty-chair": { addedAt: "2026-06-22", topics: ["grief", "relationships"] },
  "ta-ego-states": { addedAt: "2026-06-22", topics: ["relationships", "self-esteem"] },
  "adler-purpose-belonging": { addedAt: "2026-06-22", topics: ["meaning", "relationships"] },
  "adler-conversation-skills": { addedAt: "2026-06-24", topics: ["relationships"] },
};
