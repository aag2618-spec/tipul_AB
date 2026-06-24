import { BookOpen, FileText, ClipboardCheck, Layers } from "lucide-react";
import { APPROACHES } from "./landing-data";
import { Reveal } from "./reveal";

// מחלקות מלאות לכל גוון — חובה סטטי כדי ש-Tailwind יזהה אותן (לא bg-${x}).
const BADGE: Record<string, string> = {
  violet: "bg-violet-100 text-violet-700",
  teal: "bg-teal-100 text-teal-700",
  orange: "bg-orange-100 text-orange-700",
  emerald: "bg-emerald-100 text-emerald-700",
  rose: "bg-rose-100 text-rose-700",
  sky: "bg-sky-100 text-sky-700",
  indigo: "bg-indigo-100 text-indigo-700",
  cyan: "bg-cyan-100 text-cyan-700",
  amber: "bg-amber-100 text-amber-700",
  blue: "bg-blue-100 text-blue-700",
  green: "bg-green-100 text-green-700",
  fuchsia: "bg-fuchsia-100 text-fuchsia-700",
  purple: "bg-purple-100 text-purple-700",
  lime: "bg-lime-100 text-lime-700",
  pink: "bg-pink-100 text-pink-700",
  red: "bg-red-100 text-red-700",
};

const PARTS = [
  { icon: FileText, title: "הוראות למטפל", desc: "מתי להשתמש, איך להנחות, ושיקולים קליניים — לכל דף" },
  { icon: ClipboardCheck, title: "דף מילוי מעוצב", desc: "מבנה מסודר ונקי, מוכן להדפסה ולמילוי יחד עם המטופל" },
  { icon: BookOpen, title: "דוגמה ממולאת", desc: "דוגמה שממחישה למטופל איך למלא ולמה לצפות" },
];

// סקציית הדגל — דפי עבודה טיפוליים לפי גישה. הפיצ'ר הבלעדי של MyTipul.
export function WorksheetsShowcase() {
  return (
    <section id="worksheets" className="py-20 bg-gradient-to-b from-secondary/30 to-background">
      <div className="container mx-auto px-4">
        <Reveal className="landing-centered max-w-3xl mx-auto">
          <span className="inline-block text-sm font-medium bg-primary/10 text-primary rounded-full px-4 py-1.5 mb-4">
            בלעדי ל-MyTipul
          </span>
          <h2 className="text-3xl md:text-4xl font-bold mb-4">
            ספריית דפי העבודה הטיפוליים — לפי הגישה שלכם
          </h2>
          <p className="text-muted-foreground text-lg leading-relaxed">
            עשרות דפי עבודה מקצועיים, מאורגנים לפי הגישה הטיפולית שלכם. כל דף עוצב בקפידה,
            מוכן להדפסה כ-PDF, וכולל שלושה חלקים:
          </p>
        </Reveal>

        <Reveal className="mt-12 grid gap-6 md:grid-cols-3 max-w-4xl mx-auto" delay={100}>
          {PARTS.map((part) => (
            <div key={part.title} className="p-6 rounded-2xl bg-card border shadow-sm landing-centered">
              <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <part.icon className="w-6 h-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">{part.title}</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">{part.desc}</p>
            </div>
          ))}
        </Reveal>

        <Reveal className="mt-14 landing-centered" delay={150}>
          <div className="inline-flex items-center gap-2 text-sm text-muted-foreground mb-5">
            <Layers className="w-4 h-4" />
            18 גישות טיפוליות — וכל הזמן מתווספות עוד
          </div>
          <div className="flex flex-wrap gap-2.5 justify-center max-w-4xl mx-auto">
            {APPROACHES.map((a) => (
              <span
                key={a.label}
                className={`text-sm px-3.5 py-1.5 rounded-full font-medium ${BADGE[a.color] ?? "bg-muted text-muted-foreground"}`}
              >
                {a.label}
              </span>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
