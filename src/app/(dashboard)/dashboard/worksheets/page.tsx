"use client";

import { useState, useEffect } from "react";
import { Download, Eye, BookOpen, Printer, FileText, ClipboardList, ChevronDown, ChevronUp, Baby } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { worksheetsContent } from "@/lib/worksheets-content.mjs";

interface WorksheetData {
  id: string;
  title: string;
  titleEn: string;
  approach: string;
  approachHe: string;
  description: string;
  color: string;
  file: string;
  therapistInstructions: React.ReactNode;
  worksheetPreview: React.ReactNode;
  examplePreview: React.ReactNode;
}

interface ApproachCategory {
  id: string;
  approach: string;
  approachHe: string;
  description: string;
  color: string;
  worksheets: WorksheetData[];
}

const colorMap: Record<
  string,
  {
    bg: string;
    border: string;
    text: string;
    badge: string;
    badgeText: string;
    accent: string;
    ring: string;
    hoverBg: string;
    hoverBorder: string;
    tabActiveBorder: string;
    tabActiveText: string;
  }
> = {
  violet: {
    bg: "bg-violet-50",
    border: "border-violet-200",
    text: "text-violet-800",
    badge: "bg-violet-100",
    badgeText: "text-violet-700",
    accent: "bg-violet-600",
    ring: "ring-violet-300",
    hoverBg: "hover:bg-violet-50",
    hoverBorder: "hover:border-violet-200",
    tabActiveBorder: "data-[state=active]:border-violet-600",
    tabActiveText: "data-[state=active]:text-violet-700",
  },
  teal: {
    bg: "bg-teal-50",
    border: "border-teal-200",
    text: "text-teal-800",
    badge: "bg-teal-100",
    badgeText: "text-teal-700",
    accent: "bg-teal-600",
    ring: "ring-teal-300",
    hoverBg: "hover:bg-teal-50",
    hoverBorder: "hover:border-teal-200",
    tabActiveBorder: "data-[state=active]:border-teal-600",
    tabActiveText: "data-[state=active]:text-teal-700",
  },
  orange: {
    bg: "bg-orange-50",
    border: "border-orange-200",
    text: "text-orange-800",
    badge: "bg-orange-100",
    badgeText: "text-orange-700",
    accent: "bg-orange-600",
    ring: "ring-orange-300",
    hoverBg: "hover:bg-orange-50",
    hoverBorder: "hover:border-orange-200",
    tabActiveBorder: "data-[state=active]:border-orange-600",
    tabActiveText: "data-[state=active]:text-orange-700",
  },
  emerald: {
    bg: "bg-emerald-50",
    border: "border-emerald-200",
    text: "text-emerald-800",
    badge: "bg-emerald-100",
    badgeText: "text-emerald-700",
    accent: "bg-emerald-600",
    ring: "ring-emerald-300",
    hoverBg: "hover:bg-emerald-50",
    hoverBorder: "hover:border-emerald-200",
    tabActiveBorder: "data-[state=active]:border-emerald-600",
    tabActiveText: "data-[state=active]:text-emerald-700",
  },
  rose: {
    bg: "bg-rose-50",
    border: "border-rose-200",
    text: "text-rose-800",
    badge: "bg-rose-100",
    badgeText: "text-rose-700",
    accent: "bg-rose-600",
    ring: "ring-rose-300",
    hoverBg: "hover:bg-rose-50",
    hoverBorder: "hover:border-rose-200",
    tabActiveBorder: "data-[state=active]:border-rose-600",
    tabActiveText: "data-[state=active]:text-rose-700",
  },
  sky: {
    bg: "bg-sky-50",
    border: "border-sky-200",
    text: "text-sky-800",
    badge: "bg-sky-100",
    badgeText: "text-sky-700",
    accent: "bg-sky-600",
    ring: "ring-sky-300",
    hoverBg: "hover:bg-sky-50",
    hoverBorder: "hover:border-sky-200",
    tabActiveBorder: "data-[state=active]:border-sky-600",
    tabActiveText: "data-[state=active]:text-sky-700",
  },
  indigo: {
    bg: "bg-indigo-50",
    border: "border-indigo-200",
    text: "text-indigo-800",
    badge: "bg-indigo-100",
    badgeText: "text-indigo-700",
    accent: "bg-indigo-600",
    ring: "ring-indigo-300",
    hoverBg: "hover:bg-indigo-50",
    hoverBorder: "hover:border-indigo-200",
    tabActiveBorder: "data-[state=active]:border-indigo-600",
    tabActiveText: "data-[state=active]:text-indigo-700",
  },
  cyan: {
    bg: "bg-cyan-50",
    border: "border-cyan-200",
    text: "text-cyan-800",
    badge: "bg-cyan-100",
    badgeText: "text-cyan-700",
    accent: "bg-cyan-600",
    ring: "ring-cyan-300",
    hoverBg: "hover:bg-cyan-50",
    hoverBorder: "hover:border-cyan-200",
    tabActiveBorder: "data-[state=active]:border-cyan-600",
    tabActiveText: "data-[state=active]:text-cyan-700",
  },
  amber: {
    bg: "bg-amber-50",
    border: "border-amber-200",
    text: "text-amber-800",
    badge: "bg-amber-100",
    badgeText: "text-amber-700",
    accent: "bg-amber-600",
    ring: "ring-amber-300",
    hoverBg: "hover:bg-amber-50",
    hoverBorder: "hover:border-amber-200",
    tabActiveBorder: "data-[state=active]:border-amber-600",
    tabActiveText: "data-[state=active]:text-amber-700",
  },
  blue: {
    bg: "bg-blue-50",
    border: "border-blue-200",
    text: "text-blue-800",
    badge: "bg-blue-100",
    badgeText: "text-blue-700",
    accent: "bg-blue-600",
    ring: "ring-blue-300",
    hoverBg: "hover:bg-blue-50",
    hoverBorder: "hover:border-blue-200",
    tabActiveBorder: "data-[state=active]:border-blue-600",
    tabActiveText: "data-[state=active]:text-blue-700",
  },
  green: {
    bg: "bg-green-50",
    border: "border-green-200",
    text: "text-green-800",
    badge: "bg-green-100",
    badgeText: "text-green-700",
    accent: "bg-green-600",
    ring: "ring-green-300",
    hoverBg: "hover:bg-green-50",
    hoverBorder: "hover:border-green-200",
    tabActiveBorder: "data-[state=active]:border-green-600",
    tabActiveText: "data-[state=active]:text-green-700",
  },
  fuchsia: {
    bg: "bg-fuchsia-50",
    border: "border-fuchsia-200",
    text: "text-fuchsia-800",
    badge: "bg-fuchsia-100",
    badgeText: "text-fuchsia-700",
    accent: "bg-fuchsia-600",
    ring: "ring-fuchsia-300",
    hoverBg: "hover:bg-fuchsia-50",
    hoverBorder: "hover:border-fuchsia-200",
    tabActiveBorder: "data-[state=active]:border-fuchsia-600",
    tabActiveText: "data-[state=active]:text-fuchsia-700",
  },
  purple: {
    bg: "bg-purple-50",
    border: "border-purple-200",
    text: "text-purple-800",
    badge: "bg-purple-100",
    badgeText: "text-purple-700",
    accent: "bg-purple-600",
    ring: "ring-purple-300",
    hoverBg: "hover:bg-purple-50",
    hoverBorder: "hover:border-purple-200",
    tabActiveBorder: "data-[state=active]:border-purple-600",
    tabActiveText: "data-[state=active]:text-purple-700",
  },
  lime: {
    bg: "bg-lime-50",
    border: "border-lime-200",
    text: "text-lime-800",
    badge: "bg-lime-100",
    badgeText: "text-lime-700",
    accent: "bg-lime-600",
    ring: "ring-lime-300",
    hoverBg: "hover:bg-lime-50",
    hoverBorder: "hover:border-lime-200",
    tabActiveBorder: "data-[state=active]:border-lime-600",
    tabActiveText: "data-[state=active]:text-lime-700",
  },
  pink: {
    bg: "bg-pink-50",
    border: "border-pink-200",
    text: "text-pink-800",
    badge: "bg-pink-100",
    badgeText: "text-pink-700",
    accent: "bg-pink-600",
    ring: "ring-pink-300",
    hoverBg: "hover:bg-pink-50",
    hoverBorder: "hover:border-pink-200",
    tabActiveBorder: "data-[state=active]:border-pink-600",
    tabActiveText: "data-[state=active]:text-pink-700",
  },
};

/* ═══ תוכן TIPP ═══ */

const tippTherapistInstructions = (
  <div className="space-y-4 text-sm leading-relaxed">
    <p>
      <strong>מהי טכניקת TIPP?</strong> ארבע טכניקות גוף מגישת DBT של מרשה לינהן,
      שנועדו להוריד עוררות רגשית חריפה תוך דקות ספורות.
      הטכניקות פועלות ישירות על מערכת העצבים ולא דורשות חשיבה מורכבת.
    </p>
    <div>
      <strong>מתי להשתמש:</strong>
      <ul className="mt-1 list-disc pr-5 space-y-1">
        <li>רגעי הצפה רגשית שמובילים להתנהגויות בעייתיות</li>
        <li>כתרגיל בית — לתרגל יומיום גם כשלא במשבר</li>
        <li>כהתערבות ראשונה לפני עבודה קוגניטיבית</li>
      </ul>
    </div>
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="bg-amber-50">
            <th className="border border-gray-200 p-2 text-right font-bold text-amber-700">טכניקה</th>
            <th className="border border-gray-200 p-2 text-right font-bold text-amber-700">מנגנון</th>
            <th className="border border-gray-200 p-2 text-right font-bold text-amber-700">מתאים ל...</th>
            <th className="border border-gray-200 p-2 text-right font-bold text-amber-700">שימו לב</th>
          </tr>
        </thead>
        <tbody>
          <tr><td className="border border-gray-200 p-2"><strong>T</strong> — טמפרטורה</td><td className="border border-gray-200 p-2">רפלקס צלילה, הורדת דופק</td><td className="border border-gray-200 p-2">חרדה, פאניקה, כעס</td><td className="border border-gray-200 p-2">לא מתאים לבעיות לב</td></tr>
          <tr><td className="border border-gray-200 p-2"><strong>I</strong> — פעילות גופנית</td><td className="border border-gray-200 p-2">שחרור אדרנלין</td><td className="border border-gray-200 p-2">כעס, אי שקט, מתח</td><td className="border border-gray-200 p-2">לוודא כושר מתאים</td></tr>
          <tr><td className="border border-gray-200 p-2"><strong>P</strong> — נשימה</td><td className="border border-gray-200 p-2">הפעלת פאראסימפטית</td><td className="border border-gray-200 p-2">חרדה, מחשבות מירוץ</td><td className="border border-gray-200 p-2">נשיפה ארוכה = מפתח</td></tr>
          <tr><td className="border border-gray-200 p-2"><strong>P</strong> — הרפיית שרירים</td><td className="border border-gray-200 p-2">שחרור מתח פיזי</td><td className="border border-gray-200 p-2">מתח כרוני</td><td className="border border-gray-200 p-2">אפשר מאזור אחד</td></tr>
        </tbody>
      </table>
    </div>
    <p>
      <strong>איך להנחות:</strong> תרגלו <strong>יחד בפגישה</strong> לפני שנותנים הביתה.
      עם ילדים — הפכו לשחק. עם מבוגרים — הסבירו את המנגנון הפיזיולוגי.
    </p>
  </div>
);

const tippWorksheetPreview = (
  <div className="space-y-4 text-sm">
    <div className="rounded-lg bg-violet-50 border border-violet-200 p-3 text-center">
      <strong className="text-violet-800">⏸ לפני שמתחילים:</strong> עצור/י. שים/י יד על הבטן. נשום/נשמי 3 נשימות עמוקות.
    </div>
    {[
      { letter: "1", title: "מה קרה?", hint: "תארו בקצרה את המצב שעורר את המצוקה" },
      { letter: "T", title: "שינוי טמפרטורה", hint: "מים קרים על הפנים, קוביית קרח, שטיפת ידיים" },
      { letter: "I", title: "פעילות גופנית אינטנסיבית", hint: "ריצה במקום, קפיצות, מדרגות" },
      { letter: "P", title: "נשימה מווסתת", hint: "שאיפה 4 — עצירה 2 — נשיפה 6, חמש פעמים" },
      { letter: "P", title: "הרפיית שרירים מתקדמת", hint: "כווצו ושחררו: ידיים, כתפיים, רגליים" },
    ].map((section) => (
      <div key={section.title} className="rounded-lg border border-gray-200 bg-white">
        <div className="flex items-center gap-2 border-b border-gray-100 bg-gray-50 px-4 py-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-600 text-xs font-bold text-white">
            {section.letter}
          </span>
          <span className="font-bold text-gray-800">{section.title}</span>
        </div>
        <div className="px-4 py-3">
          <p className="text-xs text-gray-500 mb-2">{section.hint}</p>
          <div className="h-12 rounded border border-dashed border-gray-300 bg-gray-50"></div>
        </div>
      </div>
    ))}
    <div className="rounded-lg bg-violet-50 border-2 border-violet-200 p-3">
      <strong className="text-violet-800">📝 סיכום</strong>
      <p className="text-xs text-gray-500 mt-1">איזו טכניקה עזרה הכי הרבה? מה למדתי על עצמי?</p>
    </div>
    <div className="rounded-lg bg-amber-50 border border-amber-300 p-3">
      <strong className="text-amber-700">🔄 מעקב דפוסים:</strong> <span className="text-gray-600">המצוקה חוזרת? כן / לא</span>
    </div>
    <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-center">
      <strong className="text-rose-600">💜 רגע של חמלה עצמית</strong><br />
      <span className="text-gray-600">פתחת את הדף הזה ברגע קשה — זה כבר צעד אמיץ.</span>
    </div>
  </div>
);

const tippExamplePreview = (
  <div className="space-y-4 text-sm">
    <div className="rounded-lg bg-amber-50 border-2 border-amber-400 p-4 text-center">
      <h3 className="text-lg font-extrabold text-amber-700">📝 דוגמה ממולאת</h3>
      <p className="text-sm text-amber-600">הדגמה ללמידה — לא דוגמה אמיתית</p>
    </div>
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="font-bold text-gray-700 mb-1">מה קרה?</p>
      <p className="italic text-gray-500">קיבלתי הודעה מהמנהלת שהיא רוצה לדבר איתי מחר. מיד הרגשתי פאניקה וחשבתי שהיא רוצה לפטר אותי.</p>
      <p className="mt-2 text-xs"><strong>מצוקה לפני:</strong> <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-violet-500 text-white text-xs font-bold">9</span>/10</p>
    </div>
    {[
      { letter: "T", title: "שינוי טמפרטורה", text: "שטפתי פנים במים קרים. אחרי 30 שניות הדופק ירד." },
      { letter: "I", title: "פעילות גופנית", text: "רצתי במקום דקה. האנרגיה \"יצאה\" מהגוף." },
      { letter: "P", title: "נשימה מווסתת", text: "נשימות 4-2-6, חמש פעמים. הגוף נרגע." },
      { letter: "P", title: "הרפיית שרירים", text: "כווצתי ושחררתי ידיים, כתפיים ורגליים. הרגשתי הקלה." },
    ].map((s) => (
      <div key={s.title} className="rounded-lg border border-gray-200 bg-white p-3">
        <div className="flex items-center gap-2 mb-1">
          <span className="flex h-6 w-6 items-center justify-center rounded bg-violet-600 text-xs font-bold text-white">{s.letter}</span>
          <span className="font-bold text-gray-700">{s.title}</span>
        </div>
        <p className="italic text-gray-500">{s.text}</p>
      </div>
    ))}
    <div className="rounded-lg bg-violet-50 border-2 border-violet-200 p-3">
      <p><strong>מצוקה אחרי:</strong> <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-violet-500 text-white text-xs font-bold">4</span>/10</p>
      <p className="italic text-gray-500 mt-1"><strong>מה עזר:</strong> מים קרים + נשימה. הגוף נרגע לפני הראש.</p>
    </div>
  </div>
);

/* ═══ תוכן CBT — רישום מחשבות ═══ */

const cbtTherapistInstructions = (
  <div className="space-y-4 text-sm leading-relaxed">
    <p>
      <strong>מהו רישום מחשבות?</strong> כלי CBT לזיהוי מחשבות אוטומטיות, בחינת ראיות והבניית
      מחשבות מאוזנות יותר — מתאים לחרדה, דיכאון ומצוקה קוגניטיבית.
    </p>
    <div>
      <strong>מתי להשתמש:</strong>
      <ul className="mt-1 list-disc pr-5 space-y-1">
        <li>אחרי אירוע שעורר מחשבה מעכבת או רגש חזק</li>
        <li>כחלק משיעורי בית בין פגישות</li>
        <li>כהכנה לחשיפה או שינוי התנהגותי</li>
      </ul>
    </div>
    <p>
      <strong>איך להנחות:</strong> עודדו סקרנות, לא &quot;תיקון&quot; מיידי. התאימו שפה לגיל ולרמת סבילות.
    </p>
    <p>
      <strong>שימו לב:</strong> בסיכון לעצמך או לאחרים — עדיפות לבטיחות והפניה מתאימה.
    </p>
  </div>
);

const cbtWorksheetPreview = (
  <div className="space-y-4 text-sm">
    <div className="rounded-lg border border-amber-300 bg-amber-50/80 p-3 text-center text-xs text-amber-800">
      <strong>דף מילוי</strong> — זהה למבנה הקובץ להדפסה
    </div>
    {[
      { n: "1", title: "מצב / אירוע", hint: "מה קרה? מתי? איפה?" },
      { n: "2", title: "מחשבות אוטומטיות", hint: "מה עבר לי בראש?" },
      { n: "3", title: "רגשות ועוצמה", hint: "רגש + דירוג 0–10" },
      { n: "4", title: "ראיות בעד המחשבה", hint: "עובדות שתומכות" },
      { n: "5", title: "ראיות נגד / חלופות", hint: "מה גם נכון?" },
      { n: "6", title: "מחשבה מאוזנת", hint: "ניסוח מאוזן יותר" },
      { n: "7", title: "רגשות אחרי", hint: "איך הרגש השתנה?" },
    ].map((row) => (
      <div key={row.title} className="rounded-lg border border-gray-200 bg-white">
        <div className="flex items-center gap-2 border-b border-gray-100 bg-teal-50 px-3 py-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-600 text-xs font-bold text-white">
            {row.n}
          </span>
          <span className="font-bold text-gray-800">{row.title}</span>
        </div>
        <div className="px-3 py-2">
          <p className="text-xs text-gray-500 mb-2">{row.hint}</p>
          <div className="min-h-10 rounded border border-dashed border-gray-300 bg-gray-50" />
        </div>
      </div>
    ))}
    <div className="rounded-lg border-2 border-teal-200 bg-teal-50/90 p-3">
      <strong className="text-teal-800">סיכום</strong>
      <p className="text-xs text-gray-600 mt-1">מה למדתי? מה ארצה לנסות בפעם הבאה?</p>
      <div className="mt-2 min-h-12 rounded border border-dashed border-teal-200 bg-white" />
    </div>
    <div className="rounded-xl border border-emerald-200 bg-linear-to-br from-emerald-50 to-teal-50 p-4 text-center print:border print:[print-color-adjust:exact] print:[-webkit-print-color-adjust:exact]">
      <h3 className="text-base font-bold text-teal-800">🌱 עוד רגע של עידוד</h3>
      <p className="mt-2 text-sm text-slate-700">
        כל שורה שאת/ה כותב/ת כאן היא השקעה בעצמך — זה מספיק חשוב.
      </p>
    </div>
  </div>
);

const cbtExamplePreview = (
  <div className="space-y-4 text-sm">
    <div className="rounded-lg bg-amber-50 border-2 border-amber-400 p-4 text-center">
      <h3 className="text-lg font-extrabold text-amber-700">דוגמה ממולאת</h3>
      <p className="text-sm text-amber-600">הדגמה ללמידה — לא מקרה אמיתי</p>
    </div>
    <div className="rounded-lg border border-gray-200 bg-white p-3 space-y-2">
      <p>
        <strong>מצב:</strong> <span className="italic text-gray-600">המורה ביקשה לדבר איתי אחרי השיעור.</span>
      </p>
      <p>
        <strong>מחשבה אוטומטית:</strong>{" "}
        <span className="italic text-gray-600">&quot;היא בטוחה כועסת עליי, אני כישלון.&quot;</span>
      </p>
      <p>
        <strong>מחשבה מאוזנת:</strong>{" "}
        <span className="italic text-gray-600">אולי יש משהו לתקן — זה לא אומר שאני כישלון כבן אדם.</span>
      </p>
    </div>
    <div className="rounded-xl border border-amber-200 bg-linear-to-br from-amber-50 to-orange-50 p-4 text-center print:border print:[print-color-adjust:exact] print:[-webkit-print-color-adjust:exact]">
      <h3 className="text-base font-bold text-amber-900">💡 לסיום</h3>
      <p className="mt-2 text-sm text-slate-700">
        הדוגמה מראה שאפשר לעצור ולבחון — גם אצלך זה יתפתח עם תרגול והתמדה.
      </p>
    </div>
  </div>
);

/* ═══ תוכן ACT — זיהוי ערכים ═══ */

const actTherapistInstructions = (
  <div className="space-y-4 text-sm leading-relaxed">
    <p>
      <strong>מהו זיהוי ערכים?</strong> דף עבודה מגישת ACT (טיפול באמצעות קבלה ומחויבות) שעוזר
      למטופל לזהות מה באמת חשוב לו בחיים, לבדוק פערים בין ערכים להתנהגות, ולבחור צעד קטן לשינוי.
    </p>
    <p>
      <strong>המנגנון:</strong> ערכים הם כיוון, לא יעד. כשאנחנו חיים לפי הערכים שלנו, אנחנו מרגישים
      יותר שלמים ומשמעותיים — גם כשקשה.
    </p>
    <div>
      <strong>מתי להשתמש:</strong>
      <ul className="mt-1 list-disc pr-5 space-y-1">
        <li>תחושת ריקנות או חוסר כיוון</li>
        <li>קושי לקבל החלטות</li>
        <li>פער בין רצון לפעולה</li>
        <li>תחילת תהליך טיפולי ACT</li>
        <li>אחרי משבר או שינוי חיים</li>
      </ul>
    </div>
    <p>
      <strong>טיפים:</strong> אין ערכים &quot;נכונים&quot; או &quot;שגויים&quot;. עודדו כנות — לא מה &quot;צריך&quot;
      להיות חשוב, אלא מה באמת חשוב. הפער בין חשיבות לפעולה הוא נורמלי — לא כישלון. מתאים מגיל 14+.
    </p>
    <p>
      <strong>שימו לב:</strong> ערכים של &quot;להיות מושלם/ת&quot; — בדקו אם זה דפוס הימנעות. לא מתאים
      לרגע משבר חריף — במצב כזה השתמשו קודם בכלי ויסות (כמו TIPP).
    </p>
  </div>
);

const actWorksheetPreview = (
  <div className="space-y-4 text-sm">
    <div className="rounded-lg bg-orange-50 border border-orange-200 p-3 text-center">
      <strong className="text-orange-800">⏸ עצור, נשום 3 נשימות, והתחל/י.</strong>{" "}
      <span className="text-gray-600">אין תשובות נכונות או שגויות — יש רק מה שחשוב לך.</span>
    </div>

    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="flex items-center gap-2 border-b border-gray-100 bg-gray-50 px-4 py-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-orange-600 text-xs font-bold text-white">1</span>
        <span className="font-bold text-gray-800">מה זה ערכים?</span>
        <span className="text-xs text-gray-400">What Are Values?</span>
      </div>
      <div className="px-4 py-3">
        <p className="text-xs text-gray-500 mb-2">🧭 ערכים = מצפן, לא מטרה. מטרה אפשר לסיים. ערך הוא כיוון שתמיד ממשיך.</p>
        <div className="h-10 rounded border border-dashed border-gray-300 bg-gray-50"></div>
      </div>
    </div>

    <div className="rounded-lg border border-gray-200 bg-white">
      <div className="flex items-center gap-2 border-b border-gray-100 bg-gray-50 px-4 py-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-orange-600 text-xs font-bold text-white">2</span>
        <span className="font-bold text-gray-800">תחומי החיים שלי</span>
        <span className="text-xs text-gray-400">Life Domains</span>
      </div>
      <div className="px-4 py-3 space-y-2">
        {["🏠 משפחה", "🤝 חברויות", "💼 עבודה", "🏃 בריאות", "🎨 פנאי", "📚 צמיחה אישית", "🤲 קהילה", "✨ רוחניות"].map((d) => (
          <div key={d} className="rounded bg-orange-50 border border-orange-100 px-3 py-2">
            <span className="font-bold text-orange-800 text-xs">{d}</span>
            <div className="flex gap-4 mt-1 text-[10px] text-gray-500">
              <span>חשיבות: 0━━━━━━━━10</span>
              <span>התאמה: 0━━━━━━━━10</span>
            </div>
          </div>
        ))}
      </div>
    </div>

    {[
      { n: "3", title: "ניתוח פערים", hint: "באיזה תחום הפער הכי גדול?" },
      { n: "4", title: "צעד אחד קטן", hint: "פעולה קטנה אחת שאוכל לעשות השבוע" },
    ].map((row) => (
      <div key={row.title} className="rounded-lg border border-gray-200 bg-white">
        <div className="flex items-center gap-2 border-b border-gray-100 bg-gray-50 px-3 py-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-orange-600 text-xs font-bold text-white">{row.n}</span>
          <span className="font-bold text-gray-800">{row.title}</span>
        </div>
        <div className="px-3 py-2">
          <p className="text-xs text-gray-500 mb-2">{row.hint}</p>
          <div className="min-h-10 rounded border border-dashed border-gray-300 bg-gray-50" />
        </div>
      </div>
    ))}

    <div className="rounded-lg border-2 border-orange-200 bg-orange-50/90 p-3">
      <strong className="text-orange-800">📝 סיכום</strong>
      <p className="text-xs text-gray-600 mt-1">כמה אני מחובר/ת לערכים שלי? מה למדתי על עצמי?</p>
    </div>
    <div className="rounded-lg bg-amber-50 border border-amber-300 p-3">
      <strong className="text-amber-700">🔄 מעקב דפוסים:</strong>{" "}
      <span className="text-gray-600">האם יש תחום שבו אני תמיד מתרחק/ת מהערכים? כן / לא</span>
    </div>
    <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-center">
      <strong className="text-rose-600">💜 רגע של חמלה עצמית</strong><br />
      <span className="text-gray-600">לזהות מה חשוב לנו זה לא פשוט — אבל עצם ההסתכלות אומרת שאכפת לך.</span>
    </div>
  </div>
);

const actExamplePreview = (
  <div className="space-y-4 text-sm">
    <div className="rounded-lg bg-amber-50 border-2 border-amber-400 p-4 text-center">
      <h3 className="text-lg font-extrabold text-amber-700">📝 דוגמה ממולאת</h3>
      <p className="text-sm text-amber-600">הדגמה ללמידה — לא דוגמה אמיתית</p>
    </div>
    <div className="rounded-lg border border-gray-200 bg-white p-3 space-y-3">
      <div>
        <p className="font-bold text-gray-700 mb-1">🏠 משפחה</p>
        <p className="text-xs">חשיבות: <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-orange-500 text-white text-[10px] font-bold">9</span> | התאמה: <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-orange-500 text-white text-[10px] font-bold">4</span></p>
        <p className="italic text-gray-500 mt-1">להיות אבא נוכח, שמקשיב ומשתתף ביומיום.</p>
      </div>
      <div>
        <p className="font-bold text-gray-700 mb-1">💼 עבודה</p>
        <p className="text-xs">חשיבות: <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-orange-500 text-white text-[10px] font-bold">7</span> | התאמה: <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-orange-500 text-white text-[10px] font-bold">7</span></p>
        <p className="italic text-gray-500 mt-1">לעשות עבודה שיש בה משמעות.</p>
      </div>
      <div>
        <p className="font-bold text-gray-700 mb-1">🏃 בריאות</p>
        <p className="text-xs">חשיבות: <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-orange-500 text-white text-[10px] font-bold">8</span> | התאמה: <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-orange-500 text-white text-[10px] font-bold">3</span></p>
        <p className="italic text-gray-500 mt-1">לטפל בגוף — תנועה, שינה, אוכל טוב.</p>
      </div>
    </div>
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <p><strong>הפער הכי גדול:</strong> <span className="italic text-gray-600">משפחה (חשיבות 9, התאמה 4)</span></p>
      <p className="mt-1"><strong>צעד קטן:</strong> <span className="italic text-gray-600">לצאת מהעבודה עד 17:00 יומיים בשבוע ולשחק עם הילדים.</span></p>
    </div>
    <div className="rounded-xl border border-orange-200 bg-linear-to-br from-orange-50 to-amber-50 p-4 text-center">
      <h3 className="text-base font-bold text-orange-800">💜 לסיום</h3>
      <p className="mt-2 text-sm text-slate-700">
        עצרתי, הסתכלתי על מה שבאמת חשוב לי, ובחרתי צעד קטן. אפילו הצעד הקטן הזה — הוא כבר שינוי.
      </p>
    </div>
  </div>
);

/* ═══ תוכן CBT — הפעלה התנהגותית ═══ */

const baTherapistInstructions = (
  <div className="space-y-4 text-sm leading-relaxed">
    <p>
      <strong>מהי הפעלה התנהגותית?</strong> כלי מרכזי ב-CBT לטיפול בדכדוך ובמצב רוח ירוד.
      כשאנחנו עצובים אנחנו נוטים להפסיק לעשות דברים שעושים לנו טוב — וזה דווקא מעמיק את הדכדוך.
      הדף עוזר לחזור בהדרגה לפעילות שמביאה הנאה ומשמעות.
    </p>
    <p>
      <strong>המנגנון:</strong> לא מחכים להרגיש מוטיבציה כדי לפעול — פועלים קודם, והמוטיבציה
      מגיעה אחרי. פעולה קטנה אחת משנה את מצב הרוח, וזה מצטבר.
    </p>
    <div>
      <strong>מתי להשתמש:</strong>
      <ul className="mt-1 list-disc pr-5 space-y-1">
        <li>דכדוך ומצב רוח ירוד (&quot;אין לי כוח לכלום&quot;)</li>
        <li>נסיגה והימנעות — הפסקת תחביבים ומפגשים</li>
        <li>תחושת ריקנות וחוסר עניין</li>
        <li>שגרה תקועה שבה הימים מטשטשים</li>
      </ul>
    </div>
    <p>
      <strong>טיפים למטפל:</strong> התחילו קטן מאוד — פעולה של חמש דקות עדיפה על תוכנית גדולה
      שלא תקרה. הבחינו בין פעילות שמביאה <strong>הנאה</strong> (כיף) לבין כזו שמביאה{" "}
      <strong>משמעות</strong> (סיפוק) — צריך משני הסוגים. תכננו לזמן מסוים ביומן, לא &quot;מתישהו&quot;.
    </p>
    <p>
      <strong>שימו לב:</strong> אל תעמיסו — שתיים-שלוש פעילויות בשבוע זו התחלה מצוינת.
      בדכדוך עמוק או מחשבות אובדניות — עדיפות לבטיחות והפניה מתאימה.
    </p>
  </div>
);

const baWorksheetPreview = (
  <div className="space-y-4 text-sm">
    <div className="rounded-lg bg-teal-50 border border-teal-200 p-3 text-center">
      <strong className="text-teal-800">⏸ עצור, נשום 3 נשימות, והתחילו.</strong>{" "}
      <span className="text-gray-600">לא מחכים להרגיש כוח — פעולה קטנה אחת כבר מזיזה משהו.</span>
    </div>
    {[
      { n: "1", title: "איך אני מרגיש עכשיו?", hint: "מצב הרוח היום במילה או שתיים + דירוג 0–10" },
      { n: "2", title: "מה הפסקתי לעשות?", hint: "דברים שעשו לי טוב פעם, והפסקתי לאחרונה" },
      { n: "3", title: "רשימת פעילויות", hint: "פעילויות קטנות + דירוג הנאה ומשמעות (0–10)" },
      { n: "4", title: "תכנון השבוע", hint: "3 פעילויות, ומתי בדיוק אעשה כל אחת" },
      { n: "5", title: "מכשולים ופתרונות", hint: "מה עלול להפריע, ומה הפתרון הקטן לכל מכשול" },
    ].map((row) => (
      <div key={row.title} className="rounded-lg border border-gray-200 bg-white">
        <div className="flex items-center gap-2 border-b border-gray-100 bg-teal-50 px-3 py-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-600 text-xs font-bold text-white">
            {row.n}
          </span>
          <span className="font-bold text-gray-800">{row.title}</span>
        </div>
        <div className="px-3 py-2">
          <p className="text-xs text-gray-500 mb-2">{row.hint}</p>
          <div className="min-h-10 rounded border border-dashed border-gray-300 bg-gray-50" />
        </div>
      </div>
    ))}
    <div className="rounded-lg border-2 border-teal-200 bg-teal-50/90 p-3">
      <strong className="text-teal-800">📝 סיכום</strong>
      <p className="text-xs text-gray-600 mt-1">אחרי שביצעתי פעילות אחת — איך השתנה מצב הרוח? מה למדתי?</p>
    </div>
    <div className="rounded-lg bg-amber-50 border border-amber-300 p-3">
      <strong className="text-amber-700">🔄 מעקב דפוסים:</strong>{" "}
      <span className="text-gray-600">כשאני בדכדוך — אני נוטה להפסיק פעילויות? כן / לא</span>
    </div>
    <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-center">
      <strong className="text-rose-600">💜 רגע של חמלה עצמית</strong>
      <br />
      <span className="text-gray-600">גם כשקשה לזוז — עצם זה שאתם מתכננים צעד קטן זו גבורה. צעד אחד מספיק.</span>
    </div>
  </div>
);

const baExamplePreview = (
  <div className="space-y-4 text-sm">
    <div className="rounded-lg bg-amber-50 border-2 border-amber-400 p-4 text-center">
      <h3 className="text-lg font-extrabold text-amber-700">📝 דוגמה ממולאת</h3>
      <p className="text-sm text-amber-600">הדגמה ללמידה — לא דוגמה אמיתית</p>
    </div>
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="font-bold text-gray-700 mb-1">איך אני מרגיש?</p>
      <p className="italic text-gray-500">כבד, חסר חשק. כבר שבועיים שאני בעיקר בבית ולא עושה כלום מעבר להכרחי.</p>
      <p className="mt-2 text-xs">
        <strong>מצב רוח לפני:</strong>{" "}
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-teal-500 text-white text-xs font-bold">3</span>/10
      </p>
    </div>
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <p className="font-bold text-gray-700 mb-1">תכנון השבוע</p>
      <p className="italic text-gray-500">הליכה 15 דק׳ (ראשון, אחרי ארוחת ערב) · שיחה עם חבר ותיק (שלישי 20:00) · שיעור בבוקר (חמישי 06:45).</p>
    </div>
    <div className="rounded-lg border-2 border-teal-200 bg-teal-50/90 p-3">
      <p>
        <strong>מצב רוח אחרי:</strong>{" "}
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-teal-500 text-white text-xs font-bold">6</span>/10
      </p>
      <p className="italic text-gray-500 mt-1">
        <strong>מה למדתי:</strong> לא צריך לחכות שיהיה לי חשק — דווקא הפעולה היא שמחזירה את החשק.
      </p>
    </div>
  </div>
);

/* ═══ תוכן CFT — חמלה עצמית ═══ */

const cftTherapistInstructions = (
  <div className="space-y-4 text-sm leading-relaxed">
    <p>
      <strong>מהו &quot;הקול החומל&quot;?</strong> דף עבודה מגישת CFT (טיפול ממוקד חמלה) שעוזר
      לזהות את הקול הביקורתי הפנימי, ולהחליף אותו בקול חומל — כזה שהיה מדבר אל חבר יקר.
      רבים מתייחסים לעצמם בקשיחות שלא היו מעלים בדעתם כלפי אדם אחר.
    </p>
    <p>
      <strong>המנגנון:</strong> ביקורת עצמית מפעילה את מערכת האיום במוח ומגבירה מתח ובושה.
      חמלה עצמית מפעילה את מערכת ההרגעה — ומאפשרת ללמוד מטעות בלי להישבר.
    </p>
    <div>
      <strong>מתי להשתמש:</strong>
      <ul className="mt-1 list-disc pr-5 space-y-1">
        <li>אחרי טעות או כישלון (&quot;איך לא חשבתי? אני מטומטם&quot;)</li>
        <li>ביקורת עצמית כרונית (&quot;אני אף פעם לא מספיק טוב&quot;)</li>
        <li>בושה ואשמה</li>
        <li>פרפקציוניזם</li>
      </ul>
    </div>
    <p>
      <strong>טיפים למטפל:</strong> חמלה עצמית <strong>אינה</strong> ויתור או פינוק — היא דרך
      נבונה יותר להתמודד עם קושי. השאלה המרכזית: &quot;מה היית אומר לחבר יקר במצב הזה?&quot;.
      עבדו גם על טון הקול הפנימי, לא רק על המילים.
    </p>
    <p>
      <strong>שימו לב:</strong> חלק מהמטופלים חוששים מחמלה עצמית (&quot;אם לא אהיה קשוח לא
      אתקדם&quot;) — תנו מקום לחשש. בבושה עמוקה התקדמו לאט ובעדינות. מתאים מגיל 12 ומעלה.
    </p>
  </div>
);

const cftWorksheetPreview = (
  <div className="space-y-4 text-sm">
    <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-center">
      <strong className="text-rose-800">⏸ עצור, נשום 3 נשימות, והתחילו.</strong>{" "}
      <span className="text-gray-600">הניחו יד על הלב. דברו אל עצמכם כמו אל חבר יקר.</span>
    </div>
    {[
      { n: "1", title: "מה קרה?", hint: "מצב שבו הייתם קשוחים עם עצמכם" },
      { n: "2", title: "הקול הביקורתי", hint: "מה הקול הקשוח אמר? + דירוג כאב 0–10" },
      { n: "3", title: "מה הייתי אומר לחבר?", hint: "דמיינו חבר יקר במצב הזה — מה ובאיזה טון?" },
      { n: "4", title: "הקול החומל", hint: "נסחו מחדש לעצמכם — באותה חמלה" },
      { n: "5", title: "המשותף לכולם", hint: "טעויות וקשיים הם חלק מלהיות אדם" },
    ].map((row) => (
      <div key={row.title} className="rounded-lg border border-gray-200 bg-white">
        <div className="flex items-center gap-2 border-b border-gray-100 bg-rose-50 px-3 py-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-rose-600 text-xs font-bold text-white">
            {row.n}
          </span>
          <span className="font-bold text-gray-800">{row.title}</span>
        </div>
        <div className="px-3 py-2">
          <p className="text-xs text-gray-500 mb-2">{row.hint}</p>
          <div className="min-h-10 rounded border border-dashed border-gray-300 bg-gray-50" />
        </div>
      </div>
    ))}
    <div className="rounded-lg border-2 border-rose-200 bg-rose-50/90 p-3">
      <strong className="text-rose-800">📝 סיכום</strong>
      <p className="text-xs text-gray-600 mt-1">איך הרגשתי כשדיברתי אל עצמי בחמלה? מה אקח מהתרגיל?</p>
    </div>
    <div className="rounded-lg bg-amber-50 border border-amber-300 p-3">
      <strong className="text-amber-700">🔄 מעקב דפוסים:</strong>{" "}
      <span className="text-gray-600">הקול הביקורתי הזה חוזר? באילו מצבים הוא מופיע הכי הרבה?</span>
    </div>
    <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-center">
      <strong className="text-rose-600">💜 רגע של חמלה עצמית</strong>
      <br />
      <span className="text-gray-600">עצם זה שאתם מתאמנים לדבר אל עצמכם ברכות — זו מתנה גדולה. מגיע לכם אותה כמו לכל אדם.</span>
    </div>
  </div>
);

const cftExamplePreview = (
  <div className="space-y-4 text-sm">
    <div className="rounded-lg bg-amber-50 border-2 border-amber-400 p-4 text-center">
      <h3 className="text-lg font-extrabold text-amber-700">📝 דוגמה ממולאת</h3>
      <p className="text-sm text-amber-600">הדגמה ללמידה — לא דוגמה אמיתית</p>
    </div>
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="font-bold text-gray-700 mb-1">הקול הביקורתי</p>
      <p className="italic text-gray-500">&quot;איך שכחת? את אף פעם לא זוכרת כלום. את פשוט לא מתפקדת, וכולם רואים את זה.&quot;</p>
      <p className="mt-2 text-xs">
        <strong>כמה זה כאב:</strong>{" "}
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-rose-500 text-white text-xs font-bold">8</span>/10
      </p>
    </div>
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <p className="font-bold text-gray-700 mb-1">הקול החומל</p>
      <p className="italic text-gray-500">
        &quot;מרים, שכחת דבר אחד מתוך עשרות שכן זכרת. את אדם עסוק ומסור, וטעות קטנה לא מבטלת את כל מה שאת כן עושה. מותר לך לטעות.&quot;
      </p>
    </div>
    <div className="rounded-lg border-2 border-rose-200 bg-rose-50/90 p-3">
      <p>
        <strong>כמה זה כואב עכשיו:</strong>{" "}
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-rose-500 text-white text-xs font-bold">3</span>/10
      </p>
      <p className="italic text-gray-500 mt-1">
        <strong>מה למדתי:</strong> אני הרבה יותר קשוחה עם עצמי מאשר עם כל אדם אחר. מגיע לי אותה רכות.
      </p>
    </div>
  </div>
);

/* ═══ תוכן פסיכולוגיה חיובית — הכרת טובה ═══ */

const gratTherapistInstructions = (
  <div className="space-y-4 text-sm leading-relaxed">
    <p>
      <strong>מהי הכרת טובה?</strong> דף עבודה מהפסיכולוגיה החיובית שמאמן את תשומת הלב לזהות
      את הטוב שכבר קיים בחיים. תרגול קבוע נמצא במחקרים כמשפר מצב רוח, שינה ותחושת רווחה.
    </p>
    <p>
      <strong>המנגנון:</strong> המוח מטבעו &quot;נצמד&quot; לשלילי (הטיית שליליות). תרגול הכרת טובה
      מאמן את המוח לשים לב גם לטוב — וכך מאזן את התמונה.
    </p>
    <div>
      <strong>מתי להשתמש:</strong>
      <ul className="mt-1 list-disc pr-5 space-y-1">
        <li>מצב רוח ירוד קל</li>
        <li>נטייה לראות רק את החסר</li>
        <li>שחיקה ותחושת ריקנות</li>
        <li>תרגול שגרתי לחיזוק החוסן</li>
      </ul>
    </div>
    <p>
      <strong>טיפים למטפל:</strong> עודדו <strong>ספציפיות</strong> — לא &quot;המשפחה שלי&quot; אלא
      &quot;שהבן חיבק אותי הבוקר&quot;. גם דברים קטנים נחשבים. השאלה &quot;למה זה קרה?&quot; מחזקת
      תחושת השפעה. מומלץ כתרגול יומי, עדיף לפני השינה.
    </p>
    <p>
      <strong>שימו לב:</strong> בדכדוך עמוק התרגיל עלול להרגיש מאולץ — התחילו מדבר קטן אחד.
      אם המטופל אומר &quot;אין לי על מה להודות&quot; — קבלו זאת בלי ויכוח, וחפשו יחד דבר זעיר אחד.
    </p>
  </div>
);

const gratWorksheetPreview = (
  <div className="space-y-4 text-sm">
    <div className="rounded-lg bg-sky-50 border border-sky-200 p-3 text-center">
      <strong className="text-sky-800">⏸ עצור, נשום 3 נשימות, והתחילו.</strong>{" "}
      <span className="text-gray-600">אין תשובות נכונות או שגויות — גם הדבר הכי קטן נחשב.</span>
    </div>
    {[
      { n: "1", title: "שלושה דברים טובים מהיום", hint: "שלושה דברים שקרו היום ושאתם אסירי תודה עליהם — ספציפי" },
      { n: "2", title: "למה כל אחד קרה?", hint: "מה גרם לזה? מה החלק שלכם או של אחרים בזה?" },
      { n: "3", title: "אדם שאני אסיר תודה לו", hint: "מי עזר או שאתם מעריכים? על מה בדיוק?" },
      { n: "4", title: "דבר שאני מעריך בעצמי", hint: "תכונה, מעשה או מאמץ שלכם מהיום" },
    ].map((row) => (
      <div key={row.title} className="rounded-lg border border-gray-200 bg-white">
        <div className="flex items-center gap-2 border-b border-gray-100 bg-sky-50 px-3 py-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-sky-600 text-xs font-bold text-white">
            {row.n}
          </span>
          <span className="font-bold text-gray-800">{row.title}</span>
        </div>
        <div className="px-3 py-2">
          <p className="text-xs text-gray-500 mb-2">{row.hint}</p>
          <div className="min-h-10 rounded border border-dashed border-gray-300 bg-gray-50" />
        </div>
      </div>
    ))}
    <div className="rounded-lg border-2 border-sky-200 bg-sky-50/90 p-3">
      <strong className="text-sky-800">📝 סיכום</strong>
      <p className="text-xs text-gray-600 mt-1">איך הרגשתי אחרי שכתבתי? מה שמתי לב אליו שלא שמתי לב קודם?</p>
    </div>
    <div className="rounded-lg bg-amber-50 border border-amber-300 p-3">
      <strong className="text-amber-700">🔄 מעקב דפוסים:</strong>{" "}
      <span className="text-gray-600">על אילו דברים אני מודה הכי הרבה? (אנשים / בריאות / רגעים קטנים / הישגים)</span>
    </div>
    <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-center">
      <strong className="text-rose-600">💜 רגע של חמלה עצמית</strong>
      <br />
      <span className="text-gray-600">גם ביום קשה הצלחתם למצוא טוב — זו לא קלילות, זו חוזק. עין שמחפשת את הטוב היא מתנה.</span>
    </div>
  </div>
);

const gratExamplePreview = (
  <div className="space-y-4 text-sm">
    <div className="rounded-lg bg-amber-50 border-2 border-amber-400 p-4 text-center">
      <h3 className="text-lg font-extrabold text-amber-700">📝 דוגמה ממולאת</h3>
      <p className="text-sm text-amber-600">הדגמה ללמידה — לא דוגמה אמיתית</p>
    </div>
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="font-bold text-gray-700 mb-1">שלושה דברים טובים מהיום</p>
      <p className="italic text-gray-500">1. השכנה הביאה לי עוגה חמה בלי שביקשתי.</p>
      <p className="italic text-gray-500">2. הספקתי לסיים את הכביסה לפני שהילדים חזרו — והרגשתי רגועה.</p>
      <p className="italic text-gray-500">3. ראיתי שקיעה יפה מהמרפסת.</p>
    </div>
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <p className="font-bold text-gray-700 mb-1">דבר שאני מעריכה בעצמי</p>
      <p className="italic text-gray-500">שלמרות שהייתי עייפה, התאזרתי בסבלנות ולא הרמתי את הקול על הילדים. אני גאה בזה.</p>
    </div>
    <div className="rounded-lg border-2 border-sky-200 bg-sky-50/90 p-3">
      <p>
        <strong>מצב רוח עכשיו:</strong>{" "}
        <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-sky-500 text-white text-xs font-bold">8</span>/10
      </p>
      <p className="italic text-gray-500 mt-1">
        <strong>מה שמתי לב אליו:</strong> חשבתי שהיה יום אפור ורגיל, אבל ככל שכתבתי גיליתי הרבה דברים טובים קטנים שלא עצרתי לשים לב אליהם.
      </p>
    </div>
  </div>
);

/* ═══ תוכן SFBT — שאלת הנס וסולם ההתקדמות ═══ */

const sfbtTherapistInstructions = (
  <div className="space-y-4 text-sm leading-relaxed">
    <p>
      <strong>מהם שאלת הנס וסולם ההתקדמות?</strong> שני כלים מרכזיים מהגישה הממוקדת בפתרון
      (SFBT): &quot;שאלת הנס&quot; שעוזרת לדמיין את העתיד הרצוי בפירוט, ו&quot;סולם ההתקדמות&quot; שממקם
      את המטופל ביחס למטרה ומזהה את הצעד הקטן הבא. הגישה מתמקדת בפתרונות ובחוזקות — לא בניתוח הבעיה.
    </p>
    <p>
      <strong>המנגנון:</strong> כשמדמיינים את הפתרון בפירוט, הוא הופך מוחשי ובר-השגה. וכשמזהים
      מה <strong>כבר עובד</strong> — אפשר לעשות יותר מזה.
    </p>
    <div>
      <strong>מתי להשתמש:</strong>
      <ul className="mt-1 list-disc pr-5 space-y-1">
        <li>תחושת תקיעות</li>
        <li>קושי להגדיר מטרה</li>
        <li>התמקדות יתר בבעיה</li>
        <li>תחילת תהליך טיפולי</li>
      </ul>
    </div>
    <p>
      <strong>טיפים למטפל:</strong> שאלת הנס — &quot;נניח שבלילה קרה נס והקושי נפתר, אבל לא ידעת.
      מה הסימן הראשון מחר בבוקר?&quot;. חפשו תיאורים ספציפיים והתנהגותיים. בסולם, אחרי שהמטופל
      נותן מספר, שאלו &quot;איך הגעת ל-X ולא ל-0?&quot; — זה חושף חוזקות. הצעד הבא תמיד קטן.
    </p>
    <p>
      <strong>שימו לב:</strong> אל &quot;תתקנו&quot; תשובות — כל תיאור תקף. אם קשה לדמיין נס — שאלו
      על &quot;יום קצת יותר טוב&quot;. בכאב נפשי חריף — תנו מקום קודם, ורק אז עברו לכלי הפתרון.
    </p>
  </div>
);

const sfbtWorksheetPreview = (
  <div className="space-y-4 text-sm">
    <div className="rounded-lg bg-indigo-50 border border-indigo-200 p-3 text-center">
      <strong className="text-indigo-800">⏸ עצור, נשום 3 נשימות, והתחילו.</strong>{" "}
      <span className="text-gray-600">אין תשובות נכונות — רק העתיד שאתם רוצים, והצעד הקרוב אליו.</span>
    </div>
    {[
      { n: "1", title: "המטרה שלי", hint: "מה הייתי רוצה שיהיה שונה? נסחו כמטרה, לא כבעיה" },
      { n: "2", title: "שאלת הנס", hint: "אם בלילה נפתר הקושי — מה הסימן הראשון בבוקר? מי ישים לב?" },
      { n: "3", title: "סולם ההתקדמות", hint: "0 = הכי רחוק, 10 = הנס התגשם. איפה אני היום?" },
      { n: "4", title: "מה כבר עובד?", hint: "איך הגעתי למספר הזה ולא ל-0? מה כבר עוזר?" },
      { n: "5", title: "הצעד הקטן הבא", hint: "מה יקדם אותי נקודה אחת בסולם (לא עד 10)" },
    ].map((row) => (
      <div key={row.title} className="rounded-lg border border-gray-200 bg-white">
        <div className="flex items-center gap-2 border-b border-gray-100 bg-indigo-50 px-3 py-2">
          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-600 text-xs font-bold text-white">
            {row.n}
          </span>
          <span className="font-bold text-gray-800">{row.title}</span>
        </div>
        <div className="px-3 py-2">
          <p className="text-xs text-gray-500 mb-2">{row.hint}</p>
          {row.n === "3" ? (
            <div className="flex flex-wrap gap-1.5 justify-center py-1">
              {Array.from({ length: 11 }).map((_, i) => (
                <span key={i} className="flex h-6 w-6 items-center justify-center rounded-full border border-indigo-200 text-[10px] font-semibold text-indigo-700">
                  {i}
                </span>
              ))}
            </div>
          ) : (
            <div className="min-h-10 rounded border border-dashed border-gray-300 bg-gray-50" />
          )}
        </div>
      </div>
    ))}
    <div className="rounded-lg border-2 border-indigo-200 bg-indigo-50/90 p-3">
      <strong className="text-indigo-800">📝 סיכום</strong>
      <p className="text-xs text-gray-600 mt-1">מה גיליתי על עצמי בתרגיל הזה? מה אני לוקח איתי?</p>
    </div>
    <div className="rounded-lg bg-amber-50 border border-amber-300 p-3">
      <strong className="text-amber-700">🔄 מעקב דפוסים:</strong>{" "}
      <span className="text-gray-600">מתי בשבוע האחרון הייתי נקודה אחת גבוה יותר? מה היה שונה אז?</span>
    </div>
    <div className="rounded-lg bg-rose-50 border border-rose-200 p-3 text-center">
      <strong className="text-rose-600">💜 רגע של חמלה עצמית</strong>
      <br />
      <span className="text-gray-600">עצם זה שאתם כבר לא ב-0 אומר שיש בכם כוחות שעבדו עד היום. אתם לא מתחילים מאפס.</span>
    </div>
  </div>
);

const sfbtExamplePreview = (
  <div className="space-y-4 text-sm">
    <div className="rounded-lg bg-amber-50 border-2 border-amber-400 p-4 text-center">
      <h3 className="text-lg font-extrabold text-amber-700">📝 דוגמה ממולאת</h3>
      <p className="text-sm text-amber-600">הדגמה ללמידה — לא דוגמה אמיתית</p>
    </div>
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <p className="font-bold text-gray-700 mb-1">שאלת הנס</p>
      <p className="italic text-gray-500">
        הייתי קם בלי לדחות שוב ושוב, שותה כוס מים, מתלבש מיד ויוצא לשיעור בבוקר. אשתי הייתה שמה לב שאני רגוע יותר ולא רץ ברגע האחרון.
      </p>
    </div>
    <div className="rounded-lg border border-gray-200 bg-white p-3">
      <p className="font-bold text-gray-700 mb-1">סולם ההתקדמות</p>
      <p className="text-xs">
        היום אני ב-<span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-indigo-500 text-white text-xs font-bold">4</span> מתוך 10
      </p>
      <p className="italic text-gray-500 mt-1">הגעתי ל-4 כי בימים שאני מכין בגדים מראש בערב — הבוקר הרבה יותר קל.</p>
    </div>
    <div className="rounded-lg border-2 border-indigo-200 bg-indigo-50/90 p-3">
      <p className="font-bold text-gray-700">הצעד הקטן הבא</p>
      <p className="italic text-gray-500 mt-1">
        לקדם מ-4 ל-5: השבוע אכין בגדים בערב לפחות שלוש פעמים, ואשים את הטלפון לטעינה רחוק מהמיטה.
      </p>
    </div>
  </div>
);

/* ═══ Placeholder לדפים חדשים ═══ */

const simplePlaceholder = (title: string, desc: string) => (
  <div className="space-y-4 text-sm">
    <div className="rounded-lg bg-gray-50 border border-gray-200 p-4 text-center">
      <strong className="text-gray-700">{title}</strong>
    </div>
    <p className="text-gray-600 leading-relaxed">{desc}</p>
    <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-6 text-center text-xs text-gray-400">
      הורידו את הקובץ המלא לצפייה בתוכן המלא עם הדר, לוגו ועיצוב מקצועי
    </div>
  </div>
);

/* ═══ תצוגה מבוססת-נתונים ל-10 הדפים המורחבים ═══ */
/* התוכן נשמר פעם אחת ב-src/lib/worksheets-content.mjs ומשמש גם את מחולל ה-HTML.
   כאן ממירים אותו לתצוגות (הוראות / דף / דוגמה) זהות בעיצובן לדפים שכבר באתר. */

interface WCSection {
  n: string | number;
  title: string;
  titleEn?: string;
  hint?: string;
  type: "write" | "write-scale" | "scale" | "table" | "numbered";
  icon?: string;
  scaleLabel?: string;
  headers?: string[];
  rows?: number;
  count?: number;
}
interface WCExampleItem {
  n?: string | number;
  title?: string;
  text: string;
  scale?: { label: string; value: number };
}
interface WCWorksheet {
  slug: string;
  title: string;
  titleEn: string;
  subtitle: string;
  description: string;
  color: string;
  grounding: string;
  therapist: {
    background?: { founder: string; story: string[] };
    purpose: string[];
    when?: { headers: string[]; rows: string[][] };
    tips: string[];
    cautions: string[];
  };
  sections: WCSection[];
  summary?: { hint: string; scaleLabel?: string };
  pattern?: string;
  compassion?: string;
  example: {
    name: string;
    date: string;
    grounding?: string;
    items: WCExampleItem[];
    summary?: string;
    pattern?: string;
    compassion?: string;
  };
}
interface WCCategory {
  id: string;
  approach: string;
  approachHe: string;
  description: string;
  color: string;
  worksheets: WCWorksheet[];
}
interface WCContent {
  categories: WCCategory[];
}

const wc = worksheetsContent as unknown as WCContent;

// מחלקות Tailwind מלאות לכל צבע (Tailwind לא תופס מחלקות דינמיות, לכן מפורשות).
const pc: Record<
  string,
  {
    soft: string;
    border: string;
    text: string;
    num: string;
    dot: string;
    dotBorder: string;
    dotText: string;
    numBg: string;
    numText: string;
    summaryBg: string;
  }
> = {
  teal: { soft: "bg-teal-50", border: "border-teal-200", text: "text-teal-800", num: "bg-teal-600", dot: "bg-teal-500", dotBorder: "border-teal-200", dotText: "text-teal-700", numBg: "bg-teal-100", numText: "text-teal-700", summaryBg: "bg-teal-50/90" },
  violet: { soft: "bg-violet-50", border: "border-violet-200", text: "text-violet-800", num: "bg-violet-600", dot: "bg-violet-500", dotBorder: "border-violet-200", dotText: "text-violet-700", numBg: "bg-violet-100", numText: "text-violet-700", summaryBg: "bg-violet-50/90" },
  orange: { soft: "bg-orange-50", border: "border-orange-200", text: "text-orange-800", num: "bg-orange-600", dot: "bg-orange-500", dotBorder: "border-orange-200", dotText: "text-orange-700", numBg: "bg-orange-100", numText: "text-orange-700", summaryBg: "bg-orange-50/90" },
  emerald: { soft: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-800", num: "bg-emerald-600", dot: "bg-emerald-500", dotBorder: "border-emerald-200", dotText: "text-emerald-700", numBg: "bg-emerald-100", numText: "text-emerald-700", summaryBg: "bg-emerald-50/90" },
  rose: { soft: "bg-rose-50", border: "border-rose-200", text: "text-rose-800", num: "bg-rose-600", dot: "bg-rose-500", dotBorder: "border-rose-200", dotText: "text-rose-700", numBg: "bg-rose-100", numText: "text-rose-700", summaryBg: "bg-rose-50/90" },
  sky: { soft: "bg-sky-50", border: "border-sky-200", text: "text-sky-800", num: "bg-sky-600", dot: "bg-sky-500", dotBorder: "border-sky-200", dotText: "text-sky-700", numBg: "bg-sky-100", numText: "text-sky-700", summaryBg: "bg-sky-50/90" },
  indigo: { soft: "bg-indigo-50", border: "border-indigo-200", text: "text-indigo-800", num: "bg-indigo-600", dot: "bg-indigo-500", dotBorder: "border-indigo-200", dotText: "text-indigo-700", numBg: "bg-indigo-100", numText: "text-indigo-700", summaryBg: "bg-indigo-50/90" },
  cyan: { soft: "bg-cyan-50", border: "border-cyan-200", text: "text-cyan-800", num: "bg-cyan-600", dot: "bg-cyan-500", dotBorder: "border-cyan-200", dotText: "text-cyan-700", numBg: "bg-cyan-100", numText: "text-cyan-700", summaryBg: "bg-cyan-50/90" },
  amber: { soft: "bg-amber-50", border: "border-amber-200", text: "text-amber-800", num: "bg-amber-600", dot: "bg-amber-500", dotBorder: "border-amber-200", dotText: "text-amber-700", numBg: "bg-amber-100", numText: "text-amber-700", summaryBg: "bg-amber-50/90" },
  blue: { soft: "bg-blue-50", border: "border-blue-200", text: "text-blue-800", num: "bg-blue-600", dot: "bg-blue-500", dotBorder: "border-blue-200", dotText: "text-blue-700", numBg: "bg-blue-100", numText: "text-blue-700", summaryBg: "bg-blue-50/90" },
  green: { soft: "bg-green-50", border: "border-green-200", text: "text-green-800", num: "bg-green-600", dot: "bg-green-500", dotBorder: "border-green-200", dotText: "text-green-700", numBg: "bg-green-100", numText: "text-green-700", summaryBg: "bg-green-50/90" },
  fuchsia: { soft: "bg-fuchsia-50", border: "border-fuchsia-200", text: "text-fuchsia-800", num: "bg-fuchsia-600", dot: "bg-fuchsia-500", dotBorder: "border-fuchsia-200", dotText: "text-fuchsia-700", numBg: "bg-fuchsia-100", numText: "text-fuchsia-700", summaryBg: "bg-fuchsia-50/90" },
  purple: { soft: "bg-purple-50", border: "border-purple-200", text: "text-purple-800", num: "bg-purple-600", dot: "bg-purple-500", dotBorder: "border-purple-200", dotText: "text-purple-700", numBg: "bg-purple-100", numText: "text-purple-700", summaryBg: "bg-purple-50/90" },
  lime: { soft: "bg-lime-50", border: "border-lime-200", text: "text-lime-800", num: "bg-lime-600", dot: "bg-lime-500", dotBorder: "border-lime-200", dotText: "text-lime-700", numBg: "bg-lime-100", numText: "text-lime-700", summaryBg: "bg-lime-50/90" },
  pink: { soft: "bg-pink-50", border: "border-pink-200", text: "text-pink-800", num: "bg-pink-600", dot: "bg-pink-500", dotBorder: "border-pink-200", dotText: "text-pink-700", numBg: "bg-pink-100", numText: "text-pink-700", summaryBg: "bg-pink-50/90" },
};

function renderScale(label: string, color: string, value?: number) {
  const p = pc[color] ?? pc.teal;
  return (
    <div className={`mt-2 flex flex-wrap items-center gap-2 rounded-lg border ${p.border} ${p.soft} px-3 py-2`}>
      <span className={`text-xs font-semibold ${p.text} whitespace-nowrap`}>{label}</span>
      <div className="flex flex-1 flex-wrap justify-center gap-1.5">
        {Array.from({ length: 11 }).map((_, i) => (
          <span
            key={i}
            className={
              value === i
                ? `flex h-6 w-6 items-center justify-center rounded-full ${p.dot} text-[10px] font-bold text-white`
                : `flex h-6 w-6 items-center justify-center rounded-full border ${p.dotBorder} bg-white text-[10px] font-semibold ${p.dotText}`
            }
          >
            {i}
          </span>
        ))}
      </div>
    </div>
  );
}

function renderSectionBody(s: WCSection, color: string) {
  if (s.type === "scale") return renderScale(s.scaleLabel || "דרגו 0–10:", color);
  if (s.type === "write-scale")
    return (
      <>
        <div className="min-h-10 rounded border border-dashed border-gray-300 bg-gray-50" />
        {renderScale(s.scaleLabel || "דרגו 0–10:", color)}
      </>
    );
  if (s.type === "table") {
    const headers = s.headers || [];
    return (
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-xs">
          <thead>
            <tr className={pc[color]?.soft ?? pc.teal.soft}>
              {headers.map((h, i) => (
                <th key={i} className={`border border-gray-200 p-2 text-right font-bold ${pc[color]?.text ?? pc.teal.text}`}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: s.rows || 4 }).map((_, r) => (
              <tr key={r}>
                {headers.map((_, ci) => (
                  <td key={ci} className="border border-gray-200 p-2 h-9" />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }
  if (s.type === "numbered") {
    const p = pc[color] ?? pc.teal;
    return (
      <div className="space-y-2">
        {Array.from({ length: s.count || 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${p.numBg} text-xs font-bold ${p.numText}`}>{i + 1}</span>
            <div className="min-h-9 flex-1 rounded border border-dashed border-gray-300 bg-gray-50" />
          </div>
        ))}
      </div>
    );
  }
  return <div className="min-h-10 rounded border border-dashed border-gray-300 bg-gray-50" />;
}

function renderTherapist(w: WCWorksheet) {
  const t = w.therapist;
  const p = pc[w.color] ?? pc.teal;
  return (
    <div className="space-y-4 text-sm leading-relaxed">
      {t.background && (
        <div className={`rounded-lg border ${p.border} border-r-4 ${p.soft} p-3`}>
          <strong className={p.text}>📖 על הגישה והיוצר</strong>
          <p className={`mt-1 font-semibold ${p.text}`}>{t.background.founder}</p>
          {t.background.story.map((para, i) => (
            <p key={i} className="mt-1 text-gray-600">{para}</p>
          ))}
        </div>
      )}
      {t.purpose.map((para, i) => (
        <p key={i}>{para}</p>
      ))}
      {t.when && (
        <div className="overflow-x-auto">
          <strong>🛠 מתי להשתמש:</strong>
          <table className="mt-1 w-full border-collapse text-xs">
            <thead>
              <tr className="bg-amber-50">
                {t.when.headers.map((h, i) => (
                  <th key={i} className="border border-gray-200 p-2 text-right font-bold text-amber-700">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {t.when.rows.map((row, ri) => (
                <tr key={ri}>
                  {row.map((cell, ci) => (
                    <td key={ci} className="border border-gray-200 p-2">{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div>
        <strong>🎓 טיפים למטפל:</strong>
        <ul className="mt-1 list-disc pr-5 space-y-1">
          {t.tips.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ul>
      </div>
      <div>
        <strong>⚠️ שימו לב:</strong>
        <ul className="mt-1 list-disc pr-5 space-y-1">
          {t.cautions.map((x, i) => (
            <li key={i}>{x}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function renderSheet(w: WCWorksheet) {
  const p = pc[w.color] ?? pc.teal;
  return (
    <div className="space-y-4 text-sm">
      <div className={`rounded-lg border ${p.border} ${p.soft} p-3 text-center`}>
        <strong className={p.text}>⏸ {w.grounding}</strong>
      </div>
      {w.sections.map((s, i) => (
        <div key={i} className="rounded-lg border border-gray-200 bg-white">
          <div className={`flex items-center gap-2 border-b border-gray-100 ${p.soft} px-3 py-2`}>
            <span className={`flex h-7 w-7 items-center justify-center rounded-lg ${p.num} text-xs font-bold text-white`}>{s.n}</span>
            <span className="font-bold text-gray-800">{s.title}</span>
            {s.titleEn && <span className="text-[10px] text-gray-400">{s.titleEn}</span>}
          </div>
          <div className="px-3 py-2">
            {s.hint && <p className="mb-2 text-xs text-gray-500">{s.hint}</p>}
            {renderSectionBody(s, w.color)}
          </div>
        </div>
      ))}
      {w.summary && (
        <div className={`rounded-lg border-2 ${p.border} ${p.summaryBg} p-3`}>
          <strong className={p.text}>📝 סיכום</strong>
          {w.summary.scaleLabel && renderScale(w.summary.scaleLabel, w.color)}
          <p className="mt-1 text-xs text-gray-600">{w.summary.hint}</p>
        </div>
      )}
      {w.pattern && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
          <strong className="text-amber-700">🔄 מעקב דפוסים:</strong> <span className="text-gray-600">{w.pattern}</span>
        </div>
      )}
      {w.compassion && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-center">
          <strong className="text-rose-600">💜 רגע של חמלה עצמית</strong>
          <br />
          <span className="text-gray-600">{w.compassion}</span>
        </div>
      )}
    </div>
  );
}

function renderExample(w: WCWorksheet) {
  const p = pc[w.color] ?? pc.teal;
  const ex = w.example;
  return (
    <div className="space-y-4 text-sm">
      <div className="rounded-lg border-2 border-amber-400 bg-amber-50 p-4 text-center">
        <h3 className="text-lg font-extrabold text-amber-700">📝 דוגמה ממולאת</h3>
        <p className="text-sm text-amber-600">הדגמה ללמידה — לא דוגמה אמיתית</p>
      </div>
      <p className="text-xs text-gray-500">
        <strong className="text-gray-600">{ex.name}</strong> · {ex.date}
      </p>
      {ex.items.map((it, i) => (
        <div key={i} className="rounded-lg border border-gray-200 bg-white p-3">
          {it.title && (
            <div className="mb-1 flex items-center gap-2">
              <span className={`flex h-6 w-6 items-center justify-center rounded ${p.num} text-xs font-bold text-white`}>{it.n ?? "•"}</span>
              <span className="font-bold text-gray-700">{it.title}</span>
            </div>
          )}
          <p className="italic text-gray-500">{it.text}</p>
          {it.scale && renderScale(it.scale.label, w.color, it.scale.value)}
        </div>
      ))}
      {ex.summary && (
        <div className={`rounded-lg border-2 ${p.border} ${p.summaryBg} p-3`}>
          <strong className={p.text}>📝 סיכום</strong>
          <p className="mt-1 italic text-gray-500">{ex.summary}</p>
        </div>
      )}
      {ex.pattern && (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
          <strong className="text-amber-700">🔄 דפוס:</strong> <span className="text-gray-600">{ex.pattern}</span>
        </div>
      )}
      {ex.compassion && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-center">
          <strong className="text-rose-600">💜</strong> <span className="text-gray-600">{ex.compassion}</span>
        </div>
      )}
    </div>
  );
}

function toWorksheetData(w: WCWorksheet, cat: WCCategory): WorksheetData {
  return {
    id: w.slug,
    title: w.title,
    titleEn: w.titleEn,
    approach: cat.approach,
    approachHe: cat.approachHe,
    description: w.description,
    color: w.color,
    file: `/worksheets/${w.slug}-mytipul.html`,
    therapistInstructions: renderTherapist(w),
    worksheetPreview: renderSheet(w),
    examplePreview: renderExample(w),
  };
}

/* ═══ רשימת קטגוריות ודפי עבודה ═══ */

const baseCategories: ApproachCategory[] = [
  {
    id: "dbt",
    approach: "DBT",
    approachHe: "טיפול דיאלקטי התנהגותי",
    description: "טכניקות ויסות רגשי, סבילות למצוקה ויעילות בין-אישית מגישת DBT של מרשה לינהן.",
    color: "violet",
    worksheets: [
      {
        id: "dbt-distress-tolerance",
        title: "סבילות למצוקה – TIPP",
        titleEn: "Distress Tolerance",
        approach: "DBT",
        approachHe: "טיפול דיאלקטי התנהגותי",
        description: "ארבע טכניקות גוף להורדת עוררות רגשית חריפה: טמפרטורה, פעילות גופנית, נשימה, הרפיית שרירים.",
        color: "violet",
        file: "/worksheets/dbt-distress-tolerance-mytipul.html",
        therapistInstructions: tippTherapistInstructions,
        worksheetPreview: tippWorksheetPreview,
        examplePreview: tippExamplePreview,
      },
      {
        id: "dbt-opposite-action",
        title: "פעולה הפוכה",
        titleEn: "Opposite Action",
        approach: "DBT",
        approachHe: "טיפול דיאלקטי התנהגותי",
        description: "כשהרגש דוחף לכיוון אחד — לעשות את ההפך. זיהוי רגש, בדיקת עובדות, דחף מול הפך.",
        color: "violet",
        file: "/worksheets/dbt-opposite-action-mytipul.html",
        therapistInstructions: simplePlaceholder("הוראות למטפל — פעולה הפוכה", "פעולה הפוכה היא מיומנות DBT לוויסות רגשי: זיהוי הרגש והדחף, בדיקת עובדות, ובחירה לפעול הפוך. כולל טבלת רגש-דחף-הפך, התאמות לגיל ואזהרות."),
        worksheetPreview: simplePlaceholder("דף עבודה — פעולה הפוכה", "4 שלבים: זיהוי הרגש (עם רשת רגשות לבחירה), בדיקת עובדות, מה הדחף מול מה ההפך, ביצוע ומעקב. כולל תיבות \"איך עושים\" ו\"למה זה עובד\"."),
        examplePreview: simplePlaceholder("דוגמה ממולאת — פעולה הפוכה", "נועה בת 10, כועסת על חברה שלא הזמינה ליום הולדת. במקום להתעלם — דיברה איתה בשקט. הכעס ירד, קבעו להיפגש."),
      },
      {
        id: "dbt-emotion-regulation",
        title: "ויסות רגשי",
        titleEn: "Emotion Regulation",
        approach: "DBT",
        approachHe: "טיפול דיאלקטי התנהגותי",
        description: "כלים לזיהוי רגשות, הבנת המנגנון שלהם, והפחתת פגיעות רגשית.",
        color: "violet",
        file: "/worksheets/dbt-emotion-regulation-mytipul.html",
        therapistInstructions: simplePlaceholder("הוראות למטפל — ויסות רגשי", "דף עבודה לזיהוי רגשות, הבנת המנגנון שלהם, וכלים להפחתת פגיעות רגשית מגישת DBT."),
        worksheetPreview: simplePlaceholder("דף עבודה — ויסות רגשי", "מיפוי רגשות, זיהוי טריגרים, אסטרטגיות ויסות ומעקב."),
        examplePreview: simplePlaceholder("דוגמה ממולאת — ויסות רגשי", "דוגמה ממולאת עם תרחיש ריאליסטי להמחשת השימוש בדף."),
      },
    ],
  },
  {
    id: "cbt",
    approach: "CBT",
    approachHe: "טיפול קוגניטיבי־התנהגותי",
    description: "כלים לזיהוי ושינוי דפוסי חשיבה שליליים — רישום מחשבות, בחינת ראיות ומחשבה מאוזנת.",
    color: "teal",
    worksheets: [
      {
        id: "cbt-thought-record",
        title: "רישום מחשבות",
        titleEn: "Thought Record",
        approach: "CBT",
        approachHe: "טיפול קוגניטיבי־התנהגותי",
        description: "גליון רישום מחשבות בעברית קלינית: הוראות למטפל, דף מילוי ודוגמה ממולאת — מותאם להדפסה.",
        color: "teal",
        file: "/worksheets/cbt-thought-record-mytipul.html",
        therapistInstructions: cbtTherapistInstructions,
        worksheetPreview: cbtWorksheetPreview,
        examplePreview: cbtExamplePreview,
      },
      {
        id: "cbt-behavioral-activation",
        title: "הפעלה התנהגותית",
        titleEn: "Behavioral Activation",
        approach: "CBT",
        approachHe: "טיפול קוגניטיבי־התנהגותי",
        description: "כלי נגד דכדוך: לחזור בהדרגה לפעילויות שמביאות הנאה ומשמעות — לא לחכות למוטיבציה, אלא לפעול וליצור אותה.",
        color: "teal",
        file: "/worksheets/cbt-behavioral-activation-mytipul.html",
        therapistInstructions: baTherapistInstructions,
        worksheetPreview: baWorksheetPreview,
        examplePreview: baExamplePreview,
      },
    ],
  },
  {
    id: "act",
    approach: "ACT",
    approachHe: "טיפול באמצעות קבלה ומחויבות",
    description: "תרגול קבלה, זיהוי ערכים, התנתקות ממחשבות ומחויבות לפעולה משמעותית.",
    color: "orange",
    worksheets: [
      {
        id: "act-values-identification",
        title: "זיהוי ערכים",
        titleEn: "Values Identification",
        approach: "ACT",
        approachHe: "טיפול באמצעות קבלה ומחויבות",
        description: "דף עבודה לזיהוי ערכים אישיים ב-8 תחומי חיים, בדיקת פערים בין ערכים להתנהגות, ובחירת צעד קטן לשינוי.",
        color: "orange",
        file: "/worksheets/act-values-identification-mytipul.html",
        therapistInstructions: actTherapistInstructions,
        worksheetPreview: actWorksheetPreview,
        examplePreview: actExamplePreview,
      },
      {
        id: "act-cognitive-defusion",
        title: "התנתקות קוגניטיבית",
        titleEn: "Cognitive Defusion",
        approach: "ACT",
        approachHe: "טיפול באמצעות קבלה ומחויבות",
        description: "טכניקות להתנתקות ממחשבות — ראייה של מחשבות כמחשבות, לא כעובדות.",
        color: "orange",
        file: "/worksheets/act-cognitive-defusion-mytipul.html",
        therapistInstructions: simplePlaceholder("הוראות למטפל — התנתקות קוגניטיבית", "טכניקות ACT להתנתקות ממחשבות: ראייה של מחשבות כמחשבות ולא כעובדות, תרגילי דמיון ומטאפורות."),
        worksheetPreview: simplePlaceholder("דף עבודה — התנתקות קוגניטיבית", "7 טכניקות התנתקות מעשיות עם הסבר והנחיה לכל אחת."),
        examplePreview: simplePlaceholder("דוגמה ממולאת — התנתקות קוגניטיבית", "דוגמה ממולאת עם תרחיש ריאליסטי להמחשת השימוש בטכניקות."),
      },
    ],
  },
  {
    id: "mindfulness",
    approach: "Mindfulness",
    approachHe: "קשיבות",
    description: "תרגולי קשיבות להגברת מודעות לרגע הנוכחי — STOP, חמשת החושים, סריקת גוף.",
    color: "emerald",
    worksheets: [
      {
        id: "mindfulness-present-moment",
        title: "נוכחות ברגע",
        titleEn: "Present Moment Awareness",
        approach: "Mindfulness",
        approachHe: "קשיבות",
        description: "שלושה תרגילי קשיבות: STOP, חמשת החושים (5-4-3-2-1) וסריקת גוף — עם הנחיות נשימה מדויקות.",
        color: "emerald",
        file: "/worksheets/mindfulness-present-moment-mytipul.html",
        therapistInstructions: simplePlaceholder("הוראות למטפל — נוכחות ברגע", "שלוש טכניקות קשיבות: STOP (עצירה מודעת עם נשימה 4-2-6), חמשת החושים (הארקה 5-4-3-2-1), וסריקת גוף (5 אזורים). כולל טבלת טכניקות, התאמות לגיל ואזהרות."),
        worksheetPreview: simplePlaceholder("דף עבודה — נוכחות ברגע", "3 תרגילים עם תיבות \"איך עושים\" ו\"למה זה עובד\", הנחיות נשימה מדויקות, וסריקת גוף ב-5 אזורים."),
        examplePreview: simplePlaceholder("דוגמה ממולאת — נוכחות ברגע", "יוסי בן 11, לחץ לפני מבחן. עשה STOP עם נשימות 4-2-6, חמשת החושים בכיתה, וסריקת גוף — הכתפיים ירדו, הנשימה התעמקה."),
      },
    ],
  },
  {
    id: "cft",
    approach: "CFT",
    approachHe: "טיפול ממוקד חמלה",
    description: "כלים להחלפת הקול הביקורתי הפנימי בקול חומל יותר — כזה שמדבר אל עצמנו כמו אל חבר יקר.",
    color: "rose",
    worksheets: [
      {
        id: "cft-self-compassion",
        title: "הקול החומל",
        titleEn: "Self-Compassion",
        approach: "CFT",
        approachHe: "טיפול ממוקד חמלה",
        description: "דף עבודה לזיהוי הקול הביקורתי הפנימי ולהחלפתו בקול חומל — דרך נבונה יותר להתמודד עם טעות וקושי.",
        color: "rose",
        file: "/worksheets/cft-self-compassion-mytipul.html",
        therapistInstructions: cftTherapistInstructions,
        worksheetPreview: cftWorksheetPreview,
        examplePreview: cftExamplePreview,
      },
    ],
  },
  {
    id: "positive",
    approach: "פסיכולוגיה חיובית",
    approachHe: "פסיכולוגיה חיובית",
    description: "תרגול הכרת טובה וזיהוי הטוב הקיים — לאיזון הנטייה הטבעית להתמקד בחסר.",
    color: "sky",
    worksheets: [
      {
        id: "positive-gratitude",
        title: "הכרת טובה",
        titleEn: "Gratitude",
        approach: "פסיכולוגיה חיובית",
        approachHe: "פסיכולוגיה חיובית",
        description: "דף עבודה לתרגול הכרת טובה: שלושה דברים טובים, אדם שאני מודה לו, ודבר שאני מעריך בעצמי — לאיזון הטיית השליליות.",
        color: "sky",
        file: "/worksheets/positive-gratitude-mytipul.html",
        therapistInstructions: gratTherapistInstructions,
        worksheetPreview: gratWorksheetPreview,
        examplePreview: gratExamplePreview,
      },
    ],
  },
  {
    id: "sfbt",
    approach: "SFBT",
    approachHe: "טיפול ממוקד פתרון",
    description: "כלים שמתמקדים בעתיד הרצוי ובחוזקות הקיימות — שאלת הנס וסולם ההתקדמות.",
    color: "indigo",
    worksheets: [
      {
        id: "sfbt-miracle-question",
        title: "שאלת הנס וסולם ההתקדמות",
        titleEn: "Miracle Question & Scaling",
        approach: "SFBT",
        approachHe: "טיפול ממוקד פתרון",
        description: "שני כלים ממוקדי פתרון: לדמיין את העתיד הרצוי בפירוט, ולמקם את עצמי על סולם 0–10 כדי לזהות את הצעד הקטן הבא.",
        color: "indigo",
        file: "/worksheets/sfbt-miracle-question-mytipul.html",
        therapistInstructions: sfbtTherapistInstructions,
        worksheetPreview: sfbtWorksheetPreview,
        examplePreview: sfbtExamplePreview,
      },
    ],
  },
];

// מיזוג: דפים חדשים מ-worksheets-content מתווספים לקטגוריה קיימת (לפי id),
// וקטגוריות חדשות (polyvagal, anger) נוספות בסוף.
const categories: ApproachCategory[] = (() => {
  // דפי legacy שהומרו למערכת המאוחדת (worksheets-content) — מסננים אותם מ-baseCategories
  // לפי slug, כדי שלא יופיעו פעמיים בקטלוג. דף legacy שטרם הומר נשאר כרגיל.
  const contentSlugs = new Set(wc.categories.flatMap((c) => c.worksheets.map((w) => w.slug)));
  const merged: ApproachCategory[] = baseCategories
    .map((c) => ({ ...c, worksheets: c.worksheets.filter((w) => !contentSlugs.has(w.id)) }))
    .filter((c) => c.worksheets.length > 0);
  for (const dc of wc.categories) {
    const list = dc.worksheets.map((w) => toWorksheetData(w, dc));
    const existing = merged.find((c) => c.id === dc.id);
    if (existing) {
      existing.worksheets.push(...list);
    } else {
      merged.push({
        id: dc.id,
        approach: dc.approach,
        approachHe: dc.approachHe,
        description: dc.description,
        color: dc.color,
        worksheets: list,
      });
    }
  }
  return merged;
})();

/* ═══ קומפוננטה ═══ */

export default function WorksheetsPage() {
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const [openWorksheet, setOpenWorksheet] = useState<string | null>(null);
  // רשימת הנושאים שיש להם גרסת ילדים — נטענת מ-manifest שנוצר ע"י build-worksheets.mjs.
  // כך כפתור "גרסת ילדים" מופיע רק לדפים שבאמת קיימת להם גרסה כזו.
  const [kidsSlugs, setKidsSlugs] = useState<string[]>([]);
  useEffect(() => {
    fetch("/worksheets/kids-manifest.json")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => { if (Array.isArray(data)) setKidsSlugs(data); })
      .catch(() => {});
  }, []);

  // ההורדה וההדפסה מגישות PDF מוכן מ-/worksheets/pdf/ במקום ה-HTML — פוטר "כל הזכויות
  // שמורות" + קישור לחיץ בכל עמוד, שוליים קבועים. כך הפלט זהה תמיד, ללא תלות בהגדרות
  // הדפסת הדפדפן (שוליים/scaling). ה-PDFs נוצרים ע"י: npm run worksheets:pdf all public
  const toPdf = (file: string) =>
    file.replace("/worksheets/", "/worksheets/pdf/").replace(/\.html$/, ".pdf");

  const handleDownload = (file: string) => {
    const pdf = toPdf(file);
    const link = document.createElement("a");
    link.href = pdf;
    link.download = pdf.split("/").pop() || "worksheet.pdf";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = (file: string) => {
    window.open(toPdf(file), "_blank");
  };

  const toggleCategory = (catId: string) => {
    if (openCategory === catId) {
      setOpenCategory(null);
      setOpenWorksheet(null);
    } else {
      setOpenCategory(catId);
      setOpenWorksheet(null);
    }
  };

  const activeCat = categories.find((cat) => cat.id === openCategory);
  const activeWs = activeCat?.worksheets.find((ws) => ws.id === openWorksheet);
  const activeColor = activeWs ? colorMap[activeWs.color] : null;

  return (
    <div className="space-y-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
          <BookOpen className="h-5 w-5 text-primary" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">דפי עבודה טיפוליים</h1>
          <p className="text-sm text-muted-foreground">
            דפי עבודה מקצועיים להורדה והדפסה, מקוטלגים לפי גישה טיפולית
          </p>
        </div>
      </div>

      {/* Category Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {categories.map((cat) => {
          const c = colorMap[cat.color];
          const isOpen = openCategory === cat.id;

          return (
            <button
              key={cat.id}
              onClick={() => toggleCategory(cat.id)}
              className={`group relative text-right rounded-xl border-2 p-4 transition-all duration-200 cursor-pointer ${
                isOpen
                  ? `${c.border} ${c.bg} shadow-lg ring-2 ring-offset-1 ${c.ring}`
                  : `border-gray-200 bg-white ${c.hoverBg} ${c.hoverBorder} hover:shadow-md`
              }`}
            >
              <div className={`absolute top-0 right-0 left-0 h-1 rounded-t-xl ${c.accent}`} />

              <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold ${c.badge} ${c.badgeText} mb-2`}>
                {cat.approach} &bull; {cat.approachHe}
              </span>

              <h3 className={`text-base font-bold ${c.text} mb-1`}>{cat.approachHe}</h3>

              <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground mb-2">
                <FileText className="h-3 w-3" />
                {cat.worksheets.length} {cat.worksheets.length === 1 ? "דף עבודה" : "דפי עבודה"}
              </span>

              <p className="text-xs leading-relaxed text-muted-foreground line-clamp-2">{cat.description}</p>

              <div className={`mt-3 flex items-center gap-1.5 text-xs font-medium ${isOpen ? c.badgeText : "text-gray-400"}`}>
                {isOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                {isOpen ? "סגירה" : "פתיחה"}
              </div>
            </button>
          );
        })}
      </div>

      {/* Expanded Category */}
      {activeCat && (
        <div className="space-y-4 animate-in slide-in-from-top-2 duration-200">
          {/* Category Header */}
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold ${colorMap[activeCat.color].badge} ${colorMap[activeCat.color].badgeText}`}>
              {activeCat.approach}
            </span>
            <h2 className="text-lg font-bold">{activeCat.approachHe}</h2>
          </div>

          {/* Worksheet Mini Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {activeCat.worksheets.map((ws) => {
              const c = colorMap[ws.color];
              const isSelected = openWorksheet === ws.id;

              return (
                <button
                  key={ws.id}
                  onClick={() => setOpenWorksheet(isSelected ? null : ws.id)}
                  className={`text-right rounded-lg border-2 p-3 transition-all duration-150 cursor-pointer ${
                    isSelected
                      ? `${c.border} ${c.bg} shadow-md ring-1 ring-offset-1 ${c.ring}`
                      : `border-gray-200 bg-white ${c.hoverBg} ${c.hoverBorder} hover:shadow-sm`
                  }`}
                >
                  <h4 className={`text-sm font-bold ${c.text}`}>{ws.title}</h4>
                  <p className="text-[10px] text-muted-foreground mb-1">{ws.titleEn}</p>
                  <p className="text-xs text-muted-foreground line-clamp-1">{ws.description}</p>
                  <div className={`mt-2 flex items-center gap-1 text-[10px] font-medium ${isSelected ? c.badgeText : "text-gray-400"}`}>
                    <Eye className="h-3 w-3" />
                    {isSelected ? "תצוגה פתוחה" : "לחצו לתצוגה"}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Tabs Preview Panel */}
          {activeWs && activeColor && (
            <div className="rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden animate-in slide-in-from-top-2 duration-200">
              <p className="border-b border-amber-100 bg-amber-50/60 px-4 py-2 text-xs text-muted-foreground print:hidden">
                טיפ להדפסה: בחלון ההדפסה כבו &quot;כותרת ותחתית&quot; (Headers and footers) כדי שלא
                יודפסו כתובת הקובץ ומספרי עמודים בשוליים.
              </p>
              <Tabs key={activeWs.id} defaultValue="instructions" dir="rtl">
                <div className="flex items-center justify-between border-b bg-gray-50 px-1">
                  <TabsList className="flex-1 justify-start rounded-none border-b-0 bg-transparent p-0 h-auto">
                    <TabsTrigger
                      value="instructions"
                      className={`flex-1 gap-2 rounded-none border-b-2 border-transparent py-3 data-[state=active]:bg-white data-[state=active]:shadow-none ${activeColor.tabActiveBorder} ${activeColor.tabActiveText}`}
                    >
                      <ClipboardList className="h-4 w-4" />
                      הוראות למטפל
                    </TabsTrigger>
                    <TabsTrigger
                      value="worksheet"
                      className={`flex-1 gap-2 rounded-none border-b-2 border-transparent py-3 data-[state=active]:bg-white data-[state=active]:shadow-none ${activeColor.tabActiveBorder} ${activeColor.tabActiveText}`}
                    >
                      <FileText className="h-4 w-4" />
                      דף עבודה
                    </TabsTrigger>
                    <TabsTrigger
                      value="example"
                      className={`flex-1 gap-2 rounded-none border-b-2 border-transparent py-3 data-[state=active]:bg-white data-[state=active]:shadow-none ${activeColor.tabActiveBorder} ${activeColor.tabActiveText}`}
                    >
                      <BookOpen className="h-4 w-4" />
                      דוגמה ממולאת
                    </TabsTrigger>
                  </TabsList>
                  <div className="flex items-center gap-1 px-2">
                    <button
                      onClick={() => handleDownload(activeWs.file)}
                      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-80 ${activeColor.badge} ${activeColor.badgeText}`}
                      title="הורדה"
                    >
                      <Download className="h-3.5 w-3.5" />
                      הורדה
                    </button>
                    <button
                      onClick={() => handlePrint(activeWs.file)}
                      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-80 ${activeColor.badge} ${activeColor.badgeText}`}
                      title="הדפסה"
                    >
                      <Printer className="h-3.5 w-3.5" />
                      הדפסה
                    </button>
                    {kidsSlugs.includes(activeWs.id) && (
                      <button
                        onClick={() => handlePrint(activeWs.file.replace("-mytipul.html", "-kids-mytipul.html"))}
                        className="flex items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-100 px-3 py-1.5 text-xs font-semibold text-amber-700 transition-opacity hover:opacity-80"
                        title="גרסת ילדים — דף משחקי עם סיפור וחיה מהתנ״ך"
                      >
                        <Baby className="h-3.5 w-3.5" />
                        גרסת ילדים
                      </button>
                    )}
                  </div>
                </div>

                <div className="max-h-[600px] overflow-y-auto p-5">
                  <TabsContent value="instructions">{activeWs.therapistInstructions}</TabsContent>
                  <TabsContent value="worksheet">{activeWs.worksheetPreview}</TabsContent>
                  <TabsContent value="example">{activeWs.examplePreview}</TabsContent>
                </div>
              </Tabs>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
