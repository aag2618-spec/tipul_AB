"use client";

import type { EventContentArg } from "@fullcalendar/core";
import { Columns2 } from "lucide-react";
import type { CalendarSession } from "@/hooks/use-calendar-data";
import { getTherapistAccent } from "@/lib/calendar/event-colors";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

interface CalendarEventContentProps {
  eventInfo: EventContentArg;
  sessions: CalendarSession[];
  onAddSessionAfter: (session: CalendarSession) => void;
  // יומן רב-מטפלים: קביעת פגישה *במקביל* על אותה משבצת (מטפל/חדר אחר). מסופק
  // רק במצב רב-מטפלים; בלעדיו הכפתור לא מוצג והכרטיס מתנהג כמו במטפל יחיד.
  onAddSessionParallel?: (session: CalendarSession) => void;
  // יומן רב-מטפלים: כשהקליניקה כוללת כמה מטפלים, מציגים שם מטפל + נקודת צבע.
  showTherapist?: boolean;
  // מזהה המשתמש המחובר — הפגישות שלו עצמו נשארות "נקיות" (בלי שם/פס מטפל).
  currentTherapistId?: string | null;
  // יומן הקליניקה בלבד (תצוגת מזכירה / "כל הקליניקה"): מקטין מעט את כפתורי
  // הפעולה ומצמצם את הרווח ביניהם, כך שה-"+" לא נחתך בכרטיס צר (חצי-רוחב
  // בפגישות מקבילות). ב"שלי" / מטפל עצמאי הדגל false והכפתורים נשארים כמו קודם.
  isClinicCalendar?: boolean;
}

export function CalendarEventContent({ eventInfo, sessions, onAddSessionAfter, onAddSessionParallel, showTherapist, currentTherapistId, isClinicCalendar }: CalendarEventContentProps) {
  const session = sessions.find(s => s.id === eventInfo.event.id);
  if (!session) return null;

  // תצוגת רשימה (listWeek): כל פגישה היא שורה רחבה. FullCalendar כבר מציג שעה
  // ונקודת סטטוס; כאן מוסיפים שם מטופל + שם המטפל (עם צבע). ביומן הקליניקה —
  // לכל הפגישות (כולל של הצופה, כמו פס הצבע); מחוץ לו — רק לפגישות של אחרים.
  if (eventInfo.view.type.startsWith("list")) {
    const isOwn = !!(
      currentTherapistId && session.therapistId && session.therapistId === currentTherapistId
    );
    const showTher = isClinicCalendar
      ? !!(showTherapist && session.therapistId && session.therapistName)
      : !!(showTherapist && session.therapistId && !isOwn && session.therapistName);
    return (
      <span className="flex items-center gap-2 w-full">
        <span className="font-medium">{eventInfo.event.title}</span>
        {showTher && (
          <span className="flex items-center gap-1 text-xs opacity-75">
            <span
              className="inline-block w-2 h-2 rounded-full shrink-0"
              style={{ backgroundColor: getTherapistAccent(session.therapistId) }}
              aria-hidden
            />
            {session.therapistName}
          </span>
        )}
      </span>
    );
  }

  const isBreak = session.type === "BREAK";

  if (isBreak) {
    return (
      <div className="relative w-full h-full overflow-hidden group break-event-card">
        {/* Mountain-to-River Gradient Background */}
        <div className="absolute inset-0 bg-gradient-to-b from-amber-800/70 via-emerald-600/60 to-cyan-400/80 opacity-90"></div>

        {/* Mountains and Trees - Top */}
        <div className="absolute top-1 left-0 right-0 z-10 flex justify-around px-2 text-xs opacity-70">
          <span>🏔️</span>
          <span>🌲</span>
          <span>🌲</span>
          <span>🏔️</span>
        </div>

        {/* Content */}
        <div className="relative z-20 flex items-center justify-between w-full h-full px-2 py-1">
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <div className="font-bold text-sm text-white drop-shadow-md">🌊 הפסקה</div>
            <div className="text-xs text-white/90 drop-shadow">{eventInfo.timeText}</div>
            <div className="text-xs text-white/80 mt-1 italic font-light">זמן לנשום...</div>
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onAddSessionAfter(session);
            }}
            className="relative z-30 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 bg-white hover:bg-green-50 text-green-600 rounded-full w-8 h-8 sm:w-6 sm:h-6 flex items-center justify-center text-lg font-bold shadow-sm"
            title="הוסף פגישה מיד אחרי"
          >
            +
          </button>
        </div>

        {/* Waves - static, no animation */}
        <div className="absolute bottom-0 left-0 right-0 h-6 z-10">
          <div className="text-sm opacity-60">
            🌊 🌊 🌊 🌊 🌊 🌊
          </div>
        </div>
      </div>
    );
  }

  // יומן רב-מטפלים: פס הצבע מוצג רק לפגישות של מטפלים *אחרים*. הפגישות של
  // המשתמש עצמו נשארות "נקיות" (בלי פס) — הוא ממילא יודע שהן שלו.
  const isOwnSession = !!(
    currentTherapistId && session.therapistId && session.therapistId === currentTherapistId
  );
  const isOtherTherapist = !!(showTherapist && session.therapistId && !isOwnSession);
  // פס הצבע מזהה את המטפל. שם המטפל עצמו אינו מוצג בכרטיס (היה נחתך ומיותר) —
  // הוא זמין בחלון הריחוף ובתצוגת הרשימה.
  // ביומן הקליניקה מציגים את פס הצבע (ושם המטפל בריחוף) לכל פגישה שיש לה מטפל,
  // *כולל* הפגישות של הצופה עצמו — כך שגם המנהל רואה את הצבע הקבוע שלו, בדיוק
  // כמו שהמזכירה רואה אותו. מחוץ ליומן הקליניקה ("שלי"/עצמאי) — רק לפגישות של
  // מטפלים אחרים (התנהגות קודמת, "שלי" לא משתנה).
  const showTherapistIdentity = isClinicCalendar
    ? !!(showTherapist && session.therapistId)
    : isOtherTherapist;
  const showAccent = showTherapistIdentity;

  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>
        <div className="relative flex items-center justify-between w-full h-full gap-1 group overflow-hidden">
          {/* פס צבע לכל גובה הפגישה בקצה המוביל (ימין ב-RTL), בצבע המטפל — מחליף את
              הנקודה הזעירה שהייתה בתחתית וכמעט לא נראתה, בולט גם בפגישה קצרה וגם כששני
              מטפלים מוצגים יחד. קו לבן דק מפריד מהרקע כדי שהפס יבלוט גם כשצבע המטפל
              קרוב לצבע הסטטוס (למשל ירוק על ירוק). */}
          {showAccent && (
            <span
              className="absolute inset-y-0 right-0 w-1.5 shadow-[inset_2px_0_0_0_rgba(255,255,255,0.6)]"
              style={{ backgroundColor: getTherapistAccent(session.therapistId) }}
              aria-hidden
            />
          )}
          <div className={`flex-1 min-w-0 overflow-hidden ${showAccent ? "pr-2.5 pl-0.5" : "px-1"}`}>
            <div className="font-semibold text-xs leading-tight break-words">{eventInfo.event.title}</div>
            <div className="text-xs font-semibold opacity-90">{eventInfo.timeText}</div>
          </div>
          {/* יומן הקליניקה: בכרטיס צר (חצי-רוחב בפגישות מקבילות) שני הכפתורים
              ברוחב מלא (w-6) + רווח רגיל לא נכנסים, וה-"+" (בקצה) נחתך ע"י
              overflow-hidden — לכן נשאר רק "במקביל". התיקון: ביומן הקליניקה
              מקטינים מעט את הכפתורים (sm:w-5) ומצמצמים את הרווח (sm:gap-0.5),
              כך ששניהם נכנסים בחצי-רוחב. נשארים אופקיים (לא ערימה אנכית, שהייתה
              נחתכת אנכית בכרטיס נמוך/פגישה קצרה). ב"שלי"/עצמאי — בדיוק כמו קודם. */}
          <div className={`shrink-0 flex items-center gap-1 ${isClinicCalendar ? "sm:gap-0.5" : ""}`}>
            {/* יומן רב-מטפלים: "קבע במקביל" — פגישה נוספת על אותה משבצת (מטפל/חדר
                אחר), בשונה מ-"+" שמוסיף *אחרי*. מוצג רק כשמסופק onAddSessionParallel
                (כלומר במצב רב-מטפלים), אז יומן מטפל יחיד נשאר עם כפתור "+" בלבד. */}
            {showTherapist && onAddSessionParallel && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onAddSessionParallel(session);
                }}
                // מוסתר במובייל (hidden) כדי לא לדחוס כרטיסים צרים זה-לצד-זה; שם
                // נקודת הכניסה היא הכפתור בדיאלוג הפרטים. בדסקטופ מופיע בריחוף בלבד.
                className={`hidden sm:flex items-center justify-center w-6 h-6 ${isClinicCalendar ? "sm:w-5 sm:h-5" : ""} sm:opacity-0 sm:group-hover:opacity-100 transition-opacity bg-white hover:bg-indigo-50 text-indigo-600 rounded-full shadow-sm`}
                title="קבע פגישה במקביל (מטפל/חדר אחר, אותה שעה)"
                aria-label="קבע פגישה במקביל"
              >
                <Columns2 className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onAddSessionAfter(session);
              }}
              className={`opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity bg-white hover:bg-green-50 text-green-600 rounded-full w-8 h-8 ${isClinicCalendar ? "sm:w-5 sm:h-5" : "sm:w-6 sm:h-6"} flex items-center justify-center text-lg font-bold shadow-sm`}
              title="הוסף פגישה מיד אחרי"
            >
              +
            </button>
          </div>
        </div>
      </TooltipTrigger>
      {/* חלון מידע צף בריחוף — נפתח מעל המשבצת ולא נחתך ע"י overflow-hidden (מרונדר
          ב-Portal לגוף הדף). רשת ביטחון לזיהוי הפגישה גם כשהמשבצת צרה/קצרה והטקסט
          המלא לא נכנס (הרבה פגישות באותה שעה זו לצד זו). מציג מטופל, שעה, ושם מטפל
          (לפגישות של מטפלים אחרים — כמו בתצוגה הרגילה, וגם כשהיא קצרה מ-45 דק'). */}
      <TooltipContent side="top" className="max-w-[240px]">
        <div dir="rtl" className="flex flex-col gap-0.5 text-right">
          <span className="font-semibold">{eventInfo.event.title}</span>
          {eventInfo.timeText && <span className="opacity-90">{eventInfo.timeText}</span>}
          {showTherapistIdentity && session.therapistName && (
            <span className="flex items-center gap-1.5">
              <span
                className="inline-block w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: getTherapistAccent(session.therapistId) }}
                aria-hidden
              />
              מטפל: {session.therapistName}
            </span>
          )}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
