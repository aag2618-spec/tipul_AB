import type { CalendarSession } from "@/hooks/use-calendar-data";

export function mapSessionNote(note: unknown): string | null {
  if (typeof note === "object" && note && "content" in note)
    return (note as { content?: string }).content ?? null;
  if (typeof note === "string") return note;
  return null;
}

export function mapSessions(
  sessions: (CalendarSession & { sessionNote?: unknown })[]
): CalendarSession[] {
  return sessions.map(s => ({ ...s, sessionNote: mapSessionNote(s.sessionNote) }));
}
