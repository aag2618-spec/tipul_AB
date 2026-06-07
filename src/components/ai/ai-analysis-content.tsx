"use client";

import {
  AlertTriangle,
  BarChart3,
  Brain,
  Eye,
  FileText,
  Heart,
  Lightbulb,
  List,
  Shield,
  Sparkles,
  Target,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Fragment, type ReactNode } from "react";

/**
 * AiAnalysisContent — רכיב תצוגה משותף לכל ניתוחי ה-AI (פגישות + שאלונים).
 *
 * ה-AI מחזיר טקסט בעברית ללא Markdown, לפי מוסכמה קבועה:
 *   • כותרת = שורה נפרדת שמסתיימת בנקודתיים (לדוגמה: "נושאים מרכזיים:")
 *   • רשימה = שורה שמתחילה בתבליט "•"
 *   • הפרדה בין סעיפים = שורה ריקה
 *
 * הרכיב מפרק את הטקסט הזה ומציג אותו בצורה צבעונית עם כותרות ברורות,
 * אייקון וצבע מותאמים לכל סעיף, ותבליטים מעוצבים — במקום טקסט שטוח אחד.
 */

interface Theme {
  icon: LucideIcon;
  text: string; // צבע הכותרת
  header: string; // רקע פס הכותרת
  dot: string; // צבע נקודת התבליט
}

// התאמת צבע + אייקון לכל סעיף לפי מילות מפתח בכותרת.
// הסדר חשוב: הביטוי הראשון שמתאים — מנצח.
const THEMES: Array<{ re: RegExp; theme: Theme }> = [
  {
    re: /סיכון|אובדנ|התאבד|פגיעה עצמית|מסוכ/,
    theme: { icon: AlertTriangle, text: "text-red-700 dark:text-red-300", header: "bg-red-50 dark:bg-red-950/40", dot: "bg-red-500" },
  },
  {
    re: /עיוור|נקודות עיוורון/,
    theme: { icon: Eye, text: "text-orange-700 dark:text-orange-300", header: "bg-orange-50 dark:bg-orange-950/40", dot: "bg-orange-500" },
  },
  {
    re: /המלצ|המשך|מפגש הבא|פגישה הבא|כיוון טיפול|התערבו/,
    theme: { icon: Lightbulb, text: "text-emerald-700 dark:text-emerald-300", header: "bg-emerald-50 dark:bg-emerald-950/40", dot: "bg-emerald-500" },
  },
  {
    re: /רגש/,
    theme: { icon: Heart, text: "text-rose-700 dark:text-rose-300", header: "bg-rose-50 dark:bg-rose-950/40", dot: "bg-rose-500" },
  },
  {
    re: /העברה/,
    theme: { icon: Users, text: "text-sky-700 dark:text-sky-300", header: "bg-sky-50 dark:bg-sky-950/40", dot: "bg-sky-500" },
  },
  {
    re: /הגנה|מנגנון/,
    theme: { icon: Shield, text: "text-amber-700 dark:text-amber-300", header: "bg-amber-50 dark:bg-amber-950/40", dot: "bg-amber-500" },
  },
  {
    re: /גישה|ויניקוט|תיאורי|אקלקט/,
    theme: { icon: Brain, text: "text-purple-700 dark:text-purple-300", header: "bg-purple-50 dark:bg-purple-950/40", dot: "bg-purple-500" },
  },
  {
    re: /רגע|מכונן/,
    theme: { icon: Sparkles, text: "text-teal-700 dark:text-teal-300", header: "bg-teal-50 dark:bg-teal-950/40", dot: "bg-teal-500" },
  },
  {
    re: /נושא/,
    theme: { icon: List, text: "text-indigo-700 dark:text-indigo-300", header: "bg-indigo-50 dark:bg-indigo-950/40", dot: "bg-indigo-500" },
  },
  {
    re: /הערכה|כמות|סולם|ציון|מדד/,
    theme: { icon: BarChart3, text: "text-cyan-700 dark:text-cyan-300", header: "bg-cyan-50 dark:bg-cyan-950/40", dot: "bg-cyan-500" },
  },
  {
    re: /סיכום|תמצית|תוכן/,
    theme: { icon: FileText, text: "text-blue-700 dark:text-blue-300", header: "bg-blue-50 dark:bg-blue-950/40", dot: "bg-blue-500" },
  },
];

const FALLBACK: Theme = {
  icon: Target,
  text: "text-slate-700 dark:text-slate-200",
  header: "bg-slate-100 dark:bg-slate-800/60",
  dot: "bg-slate-400",
};

function themeFor(heading: string): Theme {
  for (const { re, theme } of THEMES) {
    if (re.test(heading)) return theme;
  }
  return FALLBACK;
}

// ----- זיהוי שורות -----

function isHeading(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  if (/^[•\-*]/.test(t)) return false; // תבליט, לא כותרת
  if (/^#{1,6}\s/.test(t)) return true; // Markdown (ליתר ביטחון)
  return /[:：]\s*$/.test(t) && t.length <= 100; // מסתיים בנקודתיים = כותרת
}

function cleanHeading(line: string): string {
  return line
    .trim()
    .replace(/^#{1,6}\s*/, "")
    .replace(/\*\*/g, "")
    .replace(/[:：]\s*$/, "")
    .trim();
}

function isBullet(line: string): boolean {
  return /^[•\-*]\s?/.test(line.trim());
}

function bulletText(line: string): string {
  return line.trim().replace(/^[•\-*]\s?/, "").trim();
}

// ----- מבנה הנתונים אחרי פירוק -----

type BodyItem = { type: "p"; text: string } | { type: "ul"; items: string[] };
interface Section {
  heading: string; // "" = סעיף ללא כותרת (פתיח)
  lines: string[];
}

function parseSections(text: string): Section[] {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const sections: Section[] = [{ heading: "", lines: [] }];
  for (const line of lines) {
    if (isHeading(line)) {
      sections.push({ heading: cleanHeading(line), lines: [] });
    } else {
      sections[sections.length - 1].lines.push(line);
    }
  }
  return sections;
}

function parseBody(lines: string[]): BodyItem[] {
  const items: BodyItem[] = [];
  let bullets: string[] = [];
  let para: string[] = [];

  const flushPara = () => {
    if (para.length) {
      items.push({ type: "p", text: para.join(" ") });
      para = [];
    }
  };
  const flushBullets = () => {
    if (bullets.length) {
      items.push({ type: "ul", items: bullets });
      bullets = [];
    }
  };

  for (const line of lines) {
    const t = line.trim();
    if (isBullet(line)) {
      flushPara();
      bullets.push(bulletText(line));
    } else if (t === "") {
      flushBullets();
      flushPara();
    } else {
      flushBullets();
      para.push(t);
    }
  }
  flushBullets();
  flushPara();
  return items;
}

// ----- תצוגה inline (הדגשה ל-**bold** אם בכל זאת הופיע) -----

function renderInline(text: string): ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) => {
    const m = /^\*\*([^*]+)\*\*$/.exec(p);
    if (m) {
      return (
        <strong key={i} className="font-semibold">
          {m[1]}
        </strong>
      );
    }
    return <Fragment key={i}>{p}</Fragment>;
  });
}

// תבליט עם "פתיח: המשך" — מדגיש את הפתיח הקצר לפני הנקודתיים.
function renderBullet(text: string): ReactNode {
  const m = /^([^:：]{2,40})[:：]\s+(.+)$/.exec(text);
  if (m) {
    return (
      <>
        <strong className="font-semibold">{m[1]}:</strong> {renderInline(m[2])}
      </>
    );
  }
  return renderInline(text);
}

function renderItem(it: BodyItem, theme: Theme, key: number): ReactNode {
  if (it.type === "p") {
    return <p key={key}>{renderInline(it.text)}</p>;
  }
  return (
    <ul key={key} className="space-y-1.5">
      {it.items.map((b, k) => (
        <li key={k} className="flex gap-2">
          <span className={`mt-2 h-1.5 w-1.5 shrink-0 rounded-full ${theme.dot}`} />
          <span className="flex-1">{renderBullet(b)}</span>
        </li>
      ))}
    </ul>
  );
}

export function AiAnalysisContent({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  if (!text?.trim()) return null;

  const sections = parseSections(text);

  return (
    <div dir="rtl" className={`space-y-3 text-right ${className ?? ""}`}>
      {sections.map((sec, i) => {
        const body = parseBody(sec.lines);
        if (!sec.heading && body.length === 0) return null;

        // פתיח ללא כותרת — טקסט ניטרלי
        if (!sec.heading) {
          return (
            <div key={i} className="space-y-2.5 text-sm leading-relaxed text-slate-700 dark:text-slate-200">
              {body.map((it, j) => renderItem(it, FALLBACK, j))}
            </div>
          );
        }

        const theme = themeFor(sec.heading);
        const Icon = theme.icon;
        return (
          <section
            key={i}
            className="overflow-hidden rounded-xl border border-black/5 shadow-sm dark:border-white/10"
          >
            <div className={`flex items-center gap-2 px-4 py-2.5 ${theme.header}`}>
              <Icon className={`h-4 w-4 shrink-0 ${theme.text}`} />
              <h3 className={`text-sm font-bold ${theme.text}`}>{sec.heading}</h3>
            </div>
            <div className="space-y-2.5 px-4 py-3 text-sm leading-relaxed text-slate-700 dark:text-slate-200">
              {body.map((it, j) => renderItem(it, theme, j))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
