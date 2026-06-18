"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Phone, Users } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Match {
  id: string;
  clientId: string;
  clientName: string | null;
  clientPhone: string | null;
  durationMinutes: number;
  priority: number;
}

interface WaitlistMatchPanelProps {
  sessionId: string;
  /** זמן ההתחלה של המשבצת שהתפנתה (ISO) — לחישוב התאריך לקישור הזימון. */
  sessionStartISO: string;
  /** נקרא לפני ניווט (לסגירת הדיאלוג). */
  onNavigate?: () => void;
}

/** YYYY-MM-DD של תאריך לפי שעון ישראל. */
function israelDate(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Jerusalem",
  }).format(new Date(iso));
}

/**
 * מילוי-בביטול: כשפגישה בוטלה, מציג את הממתינים מרשימת ההמתנה שמתאימים למשבצת
 * שהתפנתה — שם + טלפון להתקשרות, וכפתור "קבע" שמעביר ליומן עם המטופל בחור.
 * מידע אדמיניסטרטיבי בלבד (אין תוכן קליני). אם אין התאמות — לא מציג כלום.
 */
export function WaitlistMatchPanel({
  sessionId,
  sessionStartISO,
  onNavigate,
}: WaitlistMatchPanelProps) {
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    // loading מאותחל ל-true; הפאנל ממונה מחדש לכל פגישה (key במקום הקורא),
    // ולכן אין צורך (ואסור — react-hooks/set-state-in-effect) לאפס כאן סינכרונית.
    let cancelled = false;
    fetch(`/api/waitlist/match?sessionId=${sessionId}`)
      .then((res) => (res.ok ? res.json() : { matches: [] }))
      .then((data) => {
        if (!cancelled) {
          setMatches(Array.isArray(data.matches) ? data.matches : []);
        }
      })
      .catch(() => {
        if (!cancelled) setMatches([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  if (loading || matches.length === 0) return null;

  const date = israelDate(sessionStartISO);

  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
        <Users className="h-3.5 w-3.5" aria-hidden />
        ממתינים שמתאימים למשבצת ({matches.length})
      </p>
      <div className="space-y-1.5">
        {matches.map((m) => (
          <div
            key={m.id}
            className="flex items-center justify-between rounded-md border bg-background px-2.5 py-1.5 text-sm"
          >
            <div className="flex flex-col min-w-0">
              <span className="font-medium truncate">
                {m.clientName || "מטופל/ת"}
              </span>
              {m.clientPhone && (
                <a
                  href={`tel:${m.clientPhone}`}
                  dir="ltr"
                  className="text-xs text-muted-foreground flex items-center gap-1 hover:underline"
                >
                  <Phone className="h-3 w-3" aria-hidden />
                  {m.clientPhone}
                </a>
              )}
            </div>
            <Button
              size="sm"
              variant="outline"
              className="shrink-0"
              onClick={() => {
                onNavigate?.();
                router.push(
                  `/dashboard/calendar?client=${m.clientId}&date=${date}&new=true`,
                );
              }}
            >
              קבע
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
