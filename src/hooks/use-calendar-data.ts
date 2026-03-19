"use client";

import { useState, useCallback, useEffect } from "react";
import { toast } from "sonner";
import type { SessionOverlap } from "@/types";

export interface CalendarClient {
  id: string;
  name: string;
  email?: string | null;
  phone?: string | null;
  defaultSessionPrice?: number | null;
  creditBalance?: number | null;
}

export interface CalendarSession {
  id: string;
  startTime: string;
  endTime: string;
  status: string;
  type: string;
  price: number;
  client: CalendarClient | null;
  payment?: { id: string; status: string; amount?: number; expectedAmount?: number } | null;
  sessionNote?: string | null;
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

export function useCalendarData() {
  const [sessions, setSessions] = useState<CalendarSession[]>([]);
  const [clients, setClients] = useState<CalendarClient[]>([]);
  const [recurringPatterns, setRecurringPatterns] = useState<RecurringPattern[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [defaultSessionDuration, setDefaultSessionDuration] = useState(50);
  const [overlaps, setOverlaps] = useState<SessionOverlap[]>([]);

  const fetchData = useCallback(async () => {
    try {
      const [sessionsRes, clientsRes, patternsRes, profileRes] = await Promise.all([
        fetch("/api/sessions"),
        fetch("/api/clients"),
        fetch("/api/recurring-patterns"),
        fetch("/api/user/profile"),
      ]);

      if (sessionsRes.ok && clientsRes.ok) {
        const sessionsData = await sessionsRes.json();
        const clientsData = await clientsRes.json();
        const mappedSessions = sessionsData.map((session: CalendarSession & { sessionNote?: { content?: string } | string }) => ({
          ...session,
          sessionNote: typeof session.sessionNote === "object" && session.sessionNote && "content" in session.sessionNote
            ? (session.sessionNote as { content?: string }).content ?? null
            : (typeof session.sessionNote === "string" ? session.sessionNote : null),
        }));
        setSessions(mappedSessions);
        setClients(clientsData);
      }

      if (patternsRes.ok) {
        const patternsData = await patternsRes.json();
        setRecurringPatterns(patternsData);
      }

      if (profileRes.ok) {
        const profileData = await profileRes.json();
        setDefaultSessionDuration(profileData.defaultSessionDuration || 50);
      }
    } catch (error) {
      console.error("Failed to fetch data:", error);
      toast.error("שגיאה בטעינת הנתונים");
    } finally {
      setIsLoading(false);
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

  useEffect(() => {
    fetchData();
    checkOverlaps();

    const interval = setInterval(() => {
      fetch("/api/sessions")
        .then(async (res) => {
          if (res.ok) {
            const data = await res.json();
            const mapped = data.map((s: CalendarSession & { sessionNote?: { content?: string } | string }) => ({
              ...s,
              sessionNote: typeof s.sessionNote === "object" && s.sessionNote && "content" in s.sessionNote
                ? (s.sessionNote as { content?: string }).content ?? null
                : (typeof s.sessionNote === "string" ? s.sessionNote : null),
            }));
            setSessions(mapped);
          }
        })
        .catch(() => {});
    }, 30_000);

    const onFocus = () => {
      fetch("/api/sessions")
        .then(async (res) => {
          if (res.ok) {
            const data = await res.json();
            const mapped = data.map((s: CalendarSession & { sessionNote?: { content?: string } | string }) => ({
              ...s,
              sessionNote: typeof s.sessionNote === "object" && s.sessionNote && "content" in s.sessionNote
                ? (s.sessionNote as { content?: string }).content ?? null
                : (typeof s.sessionNote === "string" ? s.sessionNote : null),
            }));
            setSessions(mapped);
          }
        })
        .catch(() => {});
    };
    window.addEventListener("focus", onFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
    };
  }, [fetchData, checkOverlaps]);

  return {
    sessions,
    setSessions,
    clients,
    recurringPatterns,
    isLoading,
    defaultSessionDuration,
    fetchData,
    checkOverlaps,
    overlaps,
    setOverlaps,
  };
}
