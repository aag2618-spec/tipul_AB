// קטלוג הנושאים הקליניים לסינון דפי העבודה.
// כל דף מתויג בנושא אחד או יותר בקובץ worksheets-meta.mjs (לפי ה-slug שלו).
// הסדר כאן הוא סדר ההצגה ב"סינון לפי נושא" בעמוד דפי העבודה.
// להוספת נושא: מוסיפים שורה כאן { slug, label } ומשייכים דפים אליו ב-worksheets-meta.mjs.
export const worksheetTopics = [
  { slug: "anxiety", label: "חרדה ודאגה" },
  { slug: "fears", label: "פחדים והימנעות" },
  { slug: "depression", label: "דיכאון ודכדוך" },
  { slug: "anger", label: "כעס ותסכול" },
  { slug: "emotion-regulation", label: "ויסות רגשי" },
  { slug: "self-esteem", label: "ערך עצמי וביקורת פנימית" },
  { slug: "stress", label: "לחץ ומתח" },
  { slug: "trauma", label: "טראומה והצפה" },
  { slug: "grief", label: "אובדן ואבל" },
  { slug: "relationships", label: "תקשורת ויחסים" },
  { slug: "habits", label: "הרגלים ושינוי התנהגות" },
  { slug: "motivation", label: "מוטיבציה ומטרות" },
  { slug: "mindfulness", label: "קשיבות והרגעה" },
  { slug: "meaning", label: "משמעות וערכים" },
];
