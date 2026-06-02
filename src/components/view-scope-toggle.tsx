"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { User, Building2 } from "lucide-react";

// ⚠️ חייב להתאים ל-VIEW_MODE_COOKIE ב-src/lib/view-scope.ts (השרת קורא את אותו cookie).
const VIEW_MODE_COOKIE = "mytipul_view";
const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

type ViewMode = "personal" | "clinic";

/**
 * מתג גלובלי "שלי / כל הקליניקה" לבעל/ת קליניקה. שומר את הבחירה ב-cookie
 * (פר-דפדפן) ומרענן את המסך כך שכל הנתונים נטענים מחדש בהיקף שנבחר. השרת קורא
 * את אותו cookie (view-scope.ts) ומחיל personalOnly בכל המסכים.
 *
 * `initialMode` מגיע מהשרת (layout) כדי שה-render הראשון יציג את המצב הנכון
 * בלי אי-התאמת hydration ובלי setState ב-effect.
 */
export function ViewScopeToggle({ initialMode = "personal" }: { initialMode?: ViewMode }) {
  const router = useRouter();
  const [mode, setMode] = useState<ViewMode>(initialMode);

  const choose = (next: ViewMode) => {
    if (next === mode) return;
    document.cookie = `${VIEW_MODE_COOKIE}=${next}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax`;
    setMode(next);
    // מרענן את כל ה-Server Components עם ה-cookie החדש (כל המסכים מושפעים).
    router.refresh();
  };

  return (
    <div className="px-2 pb-1 group-data-[collapsible=icon]:hidden">
      <div className="text-[11px] text-muted-foreground mb-1 px-1">תצוגה</div>
      <div className="flex items-center gap-1 rounded-lg bg-muted/60 p-1" role="group" aria-label="בחירת תצוגה">
        <button
          type="button"
          onClick={() => choose("personal")}
          aria-pressed={mode === "personal"}
          className={`flex-1 inline-flex items-center justify-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
            mode === "personal"
              ? "bg-background shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <User className="h-3.5 w-3.5" />
          שלי
        </button>
        <button
          type="button"
          onClick={() => choose("clinic")}
          aria-pressed={mode === "clinic"}
          className={`flex-1 inline-flex items-center justify-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors ${
            mode === "clinic"
              ? "bg-background shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          <Building2 className="h-3.5 w-3.5" />
          כל הקליניקה
        </button>
      </div>
    </div>
  );
}
