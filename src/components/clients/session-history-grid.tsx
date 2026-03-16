"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { TodaySessionCard } from "@/components/dashboard/today-session-card";
import { ChevronDown, ChevronUp } from "lucide-react";
import { format } from "date-fns";
import { he } from "date-fns/locale";

interface SessionData {
  id: string;
  startTime: string;
  endTime: string;
  type: string;
  status: string;
  price: number;
  sessionNote: string | null;
  cancellationReason: string | null;
  payment: {
    id: string;
    status: string;
    amount: number;
    expectedAmount?: number;
  } | null;
  client: {
    id: string;
    name: string;
    creditBalance: number;
    totalDebt?: number;
    unpaidSessionsCount?: number;
  };
}

interface SessionHistoryGridProps {
  sessions: SessionData[];
}

export function SessionHistoryGrid({ sessions }: SessionHistoryGridProps) {
  const [showAll, setShowAll] = useState(false);
  const INITIAL_COUNT = 8;

  const sorted = useMemo(() =>
    [...sessions].sort(
      (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime()
    ), [sessions]
  );

  const visible = showAll ? sorted : sorted.slice(0, INITIAL_COUNT);
  const remaining = sorted.length - INITIAL_COUNT;

  const grouped = useMemo(() => {
    const groups: { month: string; items: SessionData[] }[] = [];
    let current: { month: string; items: SessionData[] } | null = null;

    for (const s of visible) {
      const monthKey = format(new Date(s.startTime), "MMMM yyyy", { locale: he });
      if (!current || current.month !== monthKey) {
        current = { month: monthKey, items: [] };
        groups.push(current);
      }
      current.items.push(s);
    }
    return groups;
  }, [visible]);

  return (
    <div className="space-y-5">
      {grouped.map((group) => (
        <div key={group.month}>
          <div className="flex items-center gap-3 mb-3">
            <div className="h-px bg-muted-foreground/15 flex-1" />
            <span className="text-xs text-muted-foreground/60 font-medium shrink-0">
              {group.month}
            </span>
            <div className="h-px bg-muted-foreground/15 flex-1" />
          </div>
          <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {group.items.map((session) => (
              <TodaySessionCard key={session.id} session={session} />
            ))}
          </div>
        </div>
      ))}

      {!showAll && remaining > 0 && (
        <Button
          variant="outline"
          className="w-full gap-2 text-muted-foreground"
          onClick={() => setShowAll(true)}
        >
          <ChevronDown className="h-4 w-4" />
          הצג הכל ({sorted.length} פגישות)
        </Button>
      )}

      {showAll && sorted.length > INITIAL_COUNT && (
        <Button
          variant="outline"
          className="w-full gap-2 text-muted-foreground"
          onClick={() => setShowAll(false)}
        >
          <ChevronUp className="h-4 w-4" />
          הצג פחות
        </Button>
      )}
    </div>
  );
}
