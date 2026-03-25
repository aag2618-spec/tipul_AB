"use client";

import { useState } from "react";
import { Download, Eye, BookOpen, Printer, FileText, ClipboardList } from "lucide-react";
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

const colorMap: Record<
  string,
  {
    bg: string;
    border: string;
    text: string;
    badge: string;
    badgeText: string;
    accent: string;
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
    tabActiveBorder: "data-[state=active]:border-teal-600",
    tabActiveText: "data-[state=active]:text-teal-700",
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

/* ═══ רשימת דפי עבודה ═══ */

const worksheets: WorksheetData[] = [
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
    id: "cbt-thought-record",
    title: "רישום מחשבות",
    titleEn: "Thought Record",
    approach: "CBT",
    approachHe: "טיפול קוגניטיבי־התנהגותי",
    description:
      "גליון רישום מחשבות בעברית קלינית: הוראות למטפל, דף מילוי ודוגמה ממולאת — מותאם להדפסה.",
    color: "teal",
    file: "/worksheets/cbt-thought-record-mytipul.html",
    therapistInstructions: cbtTherapistInstructions,
    worksheetPreview: cbtWorksheetPreview,
    examplePreview: cbtExamplePreview,
  },
];

/* ═══ קומפוננטה ═══ */

export default function WorksheetsPage() {
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
    const win = window.open(file, "_blank");
    if (win) {
      win.addEventListener("load", () => {
        win.print();
      });
    }
  };

  return (
    <div className="space-y-8 p-6">
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

      {/* Cards */}
      {worksheets.map((ws) => {
        const c = colorMap[ws.color];
        const isOpen = openWorksheet === ws.id;

        return (
          <div key={ws.id} className="space-y-4">
            {/* Approach Badge */}
            <div className="flex items-center gap-3">
              <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-bold ${c.badge} ${c.badgeText}`}>
                {ws.approach}
              </span>
              <span className="text-sm text-muted-foreground">{ws.approachHe}</span>
            </div>

            {/* Card */}
            <div className={`rounded-xl border-2 ${c.border} ${c.bg} p-5 transition-shadow hover:shadow-md`}>
              <div className="mb-3">
                <h3 className={`text-lg font-bold ${c.text}`}>{ws.title}</h3>
                <p className="text-xs text-muted-foreground">{ws.titleEn}</p>
              </div>
              <p className="mb-4 text-sm leading-relaxed text-muted-foreground">{ws.description}</p>
              <button
                onClick={() => setOpenWorksheet(isOpen ? null : ws.id)}
                className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-opacity hover:opacity-80 ${
                  isOpen
                    ? `${c.accent} text-white border-transparent`
                    : "border-gray-200 bg-white text-gray-600"
                }`}
              >
                <Eye className="h-4 w-4" />
                {isOpen ? "סגור תצוגה" : "תצוגה מקדימה"}
              </button>
            </div>

            {/* Tabs Preview */}
            {isOpen && (
              <div className="rounded-xl border border-gray-200 bg-white shadow-lg overflow-hidden animate-in slide-in-from-top-2 duration-200">
                <p className="border-b border-amber-100 bg-amber-50/60 px-4 py-2 text-xs text-muted-foreground print:hidden">
                  טיפ להדפסה: בחלון ההדפסה כבו &quot;כותרת ותחתית&quot; (Headers and footers) כדי שלא
                  יודפסו כתובת הקובץ ומספרי עמודים בשוליים.
                </p>
                <Tabs defaultValue="instructions" dir="rtl">
                  <div className="flex items-center justify-between border-b bg-gray-50 px-1">
                    <TabsList className="flex-1 justify-start rounded-none border-b-0 bg-transparent p-0 h-auto">
                    <TabsTrigger
                      value="instructions"
                      className={`flex-1 gap-2 rounded-none border-b-2 border-transparent py-3 data-[state=active]:bg-white data-[state=active]:shadow-none ${c.tabActiveBorder} ${c.tabActiveText}`}
                    >
                      <ClipboardList className="h-4 w-4" />
                      הוראות למטפל
                    </TabsTrigger>
                    <TabsTrigger
                      value="worksheet"
                      className={`flex-1 gap-2 rounded-none border-b-2 border-transparent py-3 data-[state=active]:bg-white data-[state=active]:shadow-none ${c.tabActiveBorder} ${c.tabActiveText}`}
                    >
                      <FileText className="h-4 w-4" />
                      דף עבודה
                    </TabsTrigger>
                    <TabsTrigger
                      value="example"
                      className={`flex-1 gap-2 rounded-none border-b-2 border-transparent py-3 data-[state=active]:bg-white data-[state=active]:shadow-none ${c.tabActiveBorder} ${c.tabActiveText}`}
                    >
                      <BookOpen className="h-4 w-4" />
                      דוגמה ממולאת
                    </TabsTrigger>
                    </TabsList>
                    <div className="flex items-center gap-1 px-2">
                      <button
                        onClick={() => handleDownload(ws.file)}
                        className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-80 ${c.badge} ${c.badgeText}`}
                        title="הורדה"
                      >
                        <Download className="h-3.5 w-3.5" />
                        הורדה
                      </button>
                      <button
                        onClick={() => handlePrint(ws.file)}
                        className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-opacity hover:opacity-80 ${c.badge} ${c.badgeText}`}
                        title="הדפסה"
                      >
                        <Printer className="h-3.5 w-3.5" />
                        הדפסה
                      </button>
                    </div>
                  </div>

                  <div className="max-h-[600px] overflow-y-auto p-5">
                    <TabsContent value="instructions">{ws.therapistInstructions}</TabsContent>
                    <TabsContent value="worksheet">{ws.worksheetPreview}</TabsContent>
                    <TabsContent value="example">{ws.examplePreview}</TabsContent>
                  </div>
                </Tabs>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
