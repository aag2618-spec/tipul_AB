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

// יומן רב-מטפלים: פלטת צבעים יציבה לכל מטפל. הצבע נקבע דטרמיניסטית מ-id
// המטפל (hash), כך שאותו מטפל מקבל תמיד אותו צבע. משמש כפס/נקודת היכר
// בצד האירוע — לא מחליף את צבע הסטטוס (מתוכננת/בוטלה/לא הגיע).
const THERAPIST_PALETTE = [
  "#6366F1", // indigo
  "#0EA5E9", // sky
  "#10B981", // emerald
  "#F59E0B", // amber
  "#EC4899", // pink
  "#8B5CF6", // violet
  "#14B8A6", // teal
  "#F43F5E", // rose
  "#84CC16", // lime
  "#06B6D4", // cyan
  "#A855F7", // purple
  "#EAB308", // yellow
];

export function getTherapistAccent(therapistId: string | null | undefined): string {
  if (!therapistId) return "#94A3B8"; // אפור ניטרלי כשאין מטפל
  let hash = 0;
  for (let i = 0; i < therapistId.length; i++) {
    hash = (hash * 31 + therapistId.charCodeAt(i)) >>> 0;
  }
  return THERAPIST_PALETTE[hash % THERAPIST_PALETTE.length];
}
