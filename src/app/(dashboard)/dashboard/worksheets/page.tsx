"use client";

import { useState } from "react";
import { Download, Eye, BookOpen, Printer, FileText, ClipboardList, ChevronDown, ChevronUp } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

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

/* ═══ רשימת קטגוריות ודפי עבודה ═══ */

const categories: ApproachCategory[] = [
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
];

/* ═══ קומפוננטה ═══ */

export default function WorksheetsPage() {
  const [openCategory, setOpenCategory] = useState<string | null>(null);
  const [openWorksheet, setOpenWorksheet] = useState<string | null>(null);

  const handleDownload = (file: string) => {
    const link = document.createElement("a");
    link.href = file;
    link.download = file.split("/").pop() || "worksheet.html";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handlePrint = (file: string) => {
    window.open(file, "_blank");
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
