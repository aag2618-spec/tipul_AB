"use client";

import { useState, useCallback, useEffect } from "react";
import { toast } from "sonner";
import type { SessionOverlap } from "@/types";
import { mapSessions } from "@/lib/calendar/session-mapper";

export interface CalendarClient {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  defaultSessionPrice?: number | null;
  creditBalance?: number | null;
  isQuickClient?: boolean;
  // יומן רב-מטפלים: המטפל הקבוע של המטופל. משמש לברירת-מחדל של בורר המטפל
  // בטופס פגישה ולסינון התנגשות מול המטפל הנכון. אופציונלי לתאימות לאחור.
  therapistId?: string | null;
}

export interface CalendarSession {
  id: string;
  startTime: string;
  endTime: string;
  status: string;
  type: string;
  price: number;
  client: CalendarClient | null;
  payment?: {
    id: string;
    status: string;
    amount?: number;
    /**
     * הסכום ששולם בפועל (מחושב ע"י /api/sessions ו-/api/sessions/calendar).
     * השדה הזה הוא הקנון לחישוב "כמה נותר לתשלום" — `amount` לבד יכול להיות
     * מטעה כש-status=PENDING+CC (placeholder לסליקה ממתינה, או אחרי
     * השלמת אשראי חלקי).
     */
    paidAmount?: number;
    expectedAmount?: number;
    method?: string;
    hasReceipt?: boolean;
    receiptUrl?: string | null;
    receiptNumber?: string | null;
    paidAt?: string | null;
    paymentType?: string;
  } | null;
  sessionNote?: string | null;
  skipSummary?: boolean;
  cancellationReason?: string | null;
  cancelledBy?: string | null;
  cancelledAt?: string | null;
  topic?: string | null;
  // יומן רב-מטפלים: המטפל האחראי לפגישה (לתצוגה/מסנן/צבע בקליניקה).
  therapistId?: string | null;
  therapistName?: string | null;
}

export interface RecurringPattern {
  id: string;
  dayOfWeek: number;
  time: string;
  duration: number;
  isActive: boolean;
  clientId: string | null;
  client?: { name: string } | null;
}

function getDefaultDateRange(): { start: string; end: string } {
  const now = new Date();
  const start = new Date(now);
  start.setDate(start.getDate() - 30);
  const end = new Date(now);
  end.setDate(end.getDate() + 60);
  return {
    start: start.toISOString().split("T")[0] + "T00:00",
    end: end.toISOString().split("T")[0] + "T23:59",
  };
}

export function useCalendarData() {
  const [sessions, setSessions] = useState<CalendarSession[]>([]);
  const [clients, setClients] = useState<CalendarClient[]>([]);
  const [recurringPatterns, setRecurringPatterns] = useState<RecurringPattern[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [defaultSessionDuration, setDefaultSessionDuration] = useState(50);
  const [defaultSessionPrice, setDefaultSessionPrice] = useState<number | null>(null);
  const [overlaps, setOverlaps] = useState<SessionOverlap[]>([]);
  const [dateRange, setDateRange] = useState<{ start: string; end: string } | null>(getDefaultDateRange);

  const buildCalendarUrl = useCallback(() => {
    if (!dateRange) return "/api/sessions/calendar";
    return `/api/sessions/calendar?startDate=${dateRange.start}&endDate=${dateRange.end}`;
  }, [dateRange]);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(buildCalendarUrl());
      if (res.ok) {
        const data = await res.json();
        setSessions(mapSessions(data));
      }
    } catch (error) {
      console.error("Failed to fetch data:", error);
      toast.error("שגיאה בטעינת הנתונים");
    } finally {
      setIsLoading(false);
    }
  }, [buildCalendarUrl]);

  const fetchSecondary = useCallback(async () => {
    try {
      const [clientsRes, patternsRes, profileRes] = await Promise.all([
        fetch("/api/clients?includeQuick=true"),
        fetch("/api/recurring-patterns"),
        fetch("/api/user/profile"),
      ]);
      if (clientsRes.ok) setClients(await clientsRes.json());
      if (patternsRes.ok) setRecurringPatterns(await patternsRes.json());
      if (profileRes.ok) {
        const profileData = await profileRes.json();
        setDefaultSessionDuration(profileData.defaultSessionDuration || 50);
        const priceRaw = profileData.defaultSessionPrice;
        const priceNum = priceRaw === null || priceRaw === undefined ? null : Number(priceRaw);
        setDefaultSessionPrice(priceNum !== null && Number.isFinite(priceNum) ? priceNum : null);
      }
    } catch {
      // secondary data — silent fail
    }
  }, []);

  const checkOverlaps = useCallback(async () => {
    try {
      const res = await fetch("/api/sessions/overlaps");
      if (res.ok) {
        const data = await res.json();
        setOverlaps(data.overlaps || []);
      }
    } catch {
      // silently fail
    }
  }, []);

  // היקף תצוגה "שלי / כל הקליניקה" — נקרא מה-cookie בכל render. כשהמתג מתחלף
  // (cookie + router.refresh), הערך משתנה והיומן נטען מחדש בהיקף הנכון. קודם
  // היומן החזיק את הפגישות ב-state ולא הגיב למתג (התעדכן רק בניווט תאריך או
  // ב-poll כל 2 דקות), ולכן "כל הקליניקה" הראה רק את הפגישות של הבעלים.
  const viewScope =
    typeof document !== "undefined" &&
    /(?:^|;\s*)mytipul_view=clinic/.test(document.cookie)
      ? "clinic"
      : "personal";

  useEffect(() => {
    fetchData();
    fetchSecondary();
    checkOverlaps();

    // Poll סשנים + overlaps כל 2 דקות. ב-e8f53d72 הוסר checkOverlaps
    // מה-poll/focus (ביצועים), מה שגרם ל-badge "חפיפה" להיות stale עד
    // 2 דקות אחרי עריכת פגישה — מבלבל מטפלים. /api/sessions/overlaps
    // היא שאילתה זולה (count + group-by זמן) — אין שיקול perf אמיתי
    // שלא לכלול אותה בפול.
    const interval = setInterval(() => {
      fetch(buildCalendarUrl())
        .then(async (res) => {
          if (res.ok) {
            const data = await res.json();
            setSessions(mapSessions(data));
          }
        })
        .catch(() => {});
      checkOverlaps();
    }, 120_000);

    const onFocus = () => {
      fetch(buildCalendarUrl())
        .then(async (res) => {
          if (res.ok) {
            const data = await res.json();
            setSessions(mapSessions(data));
          }
        })
        .catch(() => {});
      checkOverlaps();
    };
    window.addEventListener("focus", onFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [fetchData, fetchSecondary, checkOverlaps, buildCalendarUrl, viewScope]);

  return {
    sessions,
    setSessions,
    clients,
    recurringPatterns,
    isLoading,
    defaultSessionDuration,
    defaultSessionPrice,
    fetchData,
    checkOverlaps,
    overlaps,
    setOverlaps,
    setDateRange,
  };
}
