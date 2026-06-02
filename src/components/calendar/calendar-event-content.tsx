"use client";

import type { EventContentArg } from "@fullcalendar/core";
import type { CalendarSession } from "@/hooks/use-calendar-data";
import { getTherapistAccent } from "@/lib/calendar/event-colors";

interface CalendarEventContentProps {
  eventInfo: EventContentArg;
  sessions: CalendarSession[];
  onAddSessionAfter: (session: CalendarSession) => void;
  // יומן רב-מטפלים: כשהקליניקה כוללת כמה מטפלים, מציגים שם מטפל + נקודת צבע.
  showTherapist?: boolean;
  // מזהה המשתמש המחובר — הפגישות שלו עצמו נשארות "נקיות" (בלי שם/פס מטפל).
  currentTherapistId?: string | null;
}

export function CalendarEventContent({ eventInfo, sessions, onAddSessionAfter, showTherapist, currentTherapistId }: CalendarEventContentProps) {
  const session = sessions.find(s => s.id === eventInfo.event.id);
  if (!session) return null;

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

  // יומן רב-מטפלים: פס הצבע ושם המטפל מוצגים רק לפגישות של מטפלים *אחרים*.
  // הפגישות של המשתמש עצמו נשארות "נקיות" (בלי שם/פס) — הוא ממילא יודע שהן שלו.
  const isOwnSession = !!(
    currentTherapistId && session.therapistId && session.therapistId === currentTherapistId
  );
  const isOtherTherapist = !!(showTherapist && session.therapistId && !isOwnSession);
  // משך הפגישה בדקות. בפגישה קצרה (פחות מ-45 דק') אין מקום ל-3 שורות, אז
  // מוותרים על שורת שם המטפל — פס הצבע עדיין מזהה אותו — כדי ששם המטופל
  // (החשוב ביותר) לא ייחתך.
  const durationMin =
    (new Date(session.endTime).getTime() - new Date(session.startTime).getTime()) / 60000;
  const showAccent = isOtherTherapist;
  const showTherapistName = isOtherTherapist && !!session.therapistName && durationMin >= 45;

  return (
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
        {showTherapistName && (
          <div className="text-[10px] leading-tight opacity-90 mt-0.5 break-words">{session.therapistName}</div>
        )}
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onAddSessionAfter(session);
        }}
        className="shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity bg-white hover:bg-green-50 text-green-600 rounded-full w-8 h-8 sm:w-6 sm:h-6 flex items-center justify-center text-lg font-bold shadow-sm"
        title="הוסף פגישה מיד אחרי"
      >
        +
      </button>
    </div>
  );
}
