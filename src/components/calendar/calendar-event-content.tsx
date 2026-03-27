"use client";

import type { CalendarSession } from "@/hooks/use-calendar-data";

interface CalendarEventContentProps {
  eventInfo: any;
  sessions: CalendarSession[];
  onAddSessionAfter: (session: CalendarSession) => void;
}

export function CalendarEventContent({ eventInfo, sessions, onAddSessionAfter }: CalendarEventContentProps) {
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
            className="relative z-30 opacity-0 group-hover:opacity-100 bg-white hover:bg-green-50 text-green-600 rounded-full w-6 h-6 flex items-center justify-center text-lg font-bold shadow-sm"
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

  return (
    <div className="flex items-center justify-between w-full px-1 group">
      <div className="flex-1 overflow-hidden">
        <div className="font-semibold text-xs truncate">{eventInfo.event.title}</div>
        {session.topic && (
          <div className="text-xs opacity-75 truncate">{session.topic}</div>
        )}
        <div className="text-xs opacity-90">{eventInfo.timeText}</div>
      </div>
      <button
        onClick={(e) => {
          e.stopPropagation();
          onAddSessionAfter(session);
        }}
        className="opacity-0 group-hover:opacity-100 transition-opacity bg-white hover:bg-green-50 text-green-600 rounded-full w-6 h-6 flex items-center justify-center text-lg font-bold shadow-sm ml-1"
        title="הוסף פגישה מיד אחרי"
      >
        +
      </button>
    </div>
  );
}
