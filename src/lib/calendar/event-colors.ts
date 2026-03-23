import type { CalendarSession } from "@/hooks/use-calendar-data";

interface EventColors {
  bg: string;
  text: string;
  border: string;
}

const STATUS_COLORS: Record<string, EventColors> = {
  BREAK:            { bg: "var(--chart-2)", text: "#ffffff", border: "var(--chart-2)" },
  CANCELLED:        { bg: "#E5E7EB",       text: "#6B7280", border: "#9CA3AF" },
  COMPLETED:        { bg: "var(--primary)", text: "#ffffff", border: "var(--primary)" },
  NO_SHOW:          { bg: "#FCA5A5",       text: "#7F1D1D", border: "#DC2626" },
  PENDING_APPROVAL: { bg: "#FDE68A",       text: "#92400E", border: "#F59E0B" },
  SCHEDULED_PAST:   { bg: "#BAE6FD",       text: "#0C4A6E", border: "#0EA5E9" },
  SCHEDULED:        { bg: "#A7F3D0",       text: "#064E3B", border: "#059669" },
};

export function getEventColors(session: CalendarSession): EventColors {
  if (session.type === "BREAK") return STATUS_COLORS.BREAK;
  if (session.status === "SCHEDULED" && new Date(session.endTime) < new Date())
    return STATUS_COLORS.SCHEDULED_PAST;
  return STATUS_COLORS[session.status] || STATUS_COLORS.SCHEDULED;
}
