import { describe, it, expect } from "vitest";
import {
  computeCaseload,
  sortByOverload,
  HIGH_LOAD_WEEKLY_HOURS,
  LOW_LOAD_WEEKLY_HOURS,
  LOW_LOAD_MAX_ACTIVE_CLIENTS,
  type CaseloadSessionInput,
  type CaseloadTherapistInput,
} from "../caseload";

// M11.G5: בדיקות יחידה לחישוב עומס מטפלים.
// השבוע מחושב לפי Asia/Jerusalem — Sunday 00:00 IL עד Sunday 00:00 IL הבא.
// `now` מועבר ידנית לכל בדיקה כדי שתהיה דטרמיניסטית גם כשמריצים שנים קדימה.

// יום שלישי, 26 במאי 2026 בשעה 10:00 בבוקר, ישראל (UTC+3 בקיץ).
// תחילת השבוע באותו זמן: Sunday 24 May 2026 00:00 IL = 23 May 2026 21:00 UTC.
const NOW = new Date("2026-05-26T07:00:00Z");

const THERAPISTS: CaseloadTherapistInput[] = [
  { id: "t1", name: "דנה", email: "dana@example.com" },
  { id: "t2", name: "יוסי", email: "yossi@example.com" },
  { id: "t3", name: null, email: "unnamed@example.com" },
];

// פגישה של שעה בשעה X בתאריך Y בישראל. מחזיר ISO string תואם UTC.
// סופר IL_OFFSET = +03:00 בקיץ של 2026.
function ilSession(
  therapistId: string,
  isoLocal: string,
  durationHours: number,
  status: CaseloadSessionInput["status"]
): CaseloadSessionInput {
  // isoLocal לדוגמה: "2026-05-25T14:00" — נפרש כשעון ישראל.
  const start = new Date(`${isoLocal}:00+03:00`);
  const end = new Date(start.getTime() + durationHours * 60 * 60 * 1000);
  return {
    therapistId,
    startTime: start,
    endTime: end,
    status,
  };
}

describe("computeCaseload — basic shape", () => {
  it("returns one row per therapist, with all fields populated", () => {
    const result = computeCaseload({
      therapists: THERAPISTS,
      sessions: [],
      clientCounts: [],
      now: NOW,
    });
    expect(result).toHaveLength(3);
    for (const row of result) {
      expect(row).toHaveProperty("therapistId");
      expect(row).toHaveProperty("name");
      expect(row).toHaveProperty("email");
      expect(row.sessionsThisWeek).toBe(0);
      expect(row.hoursThisWeek).toBe(0);
      expect(row.completedLast4Weeks).toBe(0);
      expect(row.avgWeeklyHours).toBe(0);
      expect(row.activeClients).toBe(0);
      expect(row.overloadLevel).toBe("low");
    }
  });

  it("populates activeClients from clientCounts map", () => {
    const result = computeCaseload({
      therapists: THERAPISTS,
      sessions: [],
      clientCounts: [
        { therapistId: "t1", activeClients: 15 },
        { therapistId: "t2", activeClients: 2 },
      ],
      now: NOW,
    });
    expect(result.find((r) => r.therapistId === "t1")?.activeClients).toBe(15);
    expect(result.find((r) => r.therapistId === "t2")?.activeClients).toBe(2);
    expect(result.find((r) => r.therapistId === "t3")?.activeClients).toBe(0);
  });
});

describe("computeCaseload — this week counters", () => {
  it("counts SCHEDULED + COMPLETED + PENDING_* in current week (Sun-Sat IL)", () => {
    const sessions: CaseloadSessionInput[] = [
      ilSession("t1", "2026-05-24T09:00", 1, "SCHEDULED"),
      ilSession("t1", "2026-05-25T10:00", 1, "COMPLETED"),
      ilSession("t1", "2026-05-27T11:00", 1.5, "PENDING_CANCELLATION"),
      ilSession("t1", "2026-05-28T12:00", 1, "PENDING_APPROVAL"),
    ];
    const result = computeCaseload({
      therapists: [THERAPISTS[0]],
      sessions,
      clientCounts: [],
      now: NOW,
    });
    expect(result[0].sessionsThisWeek).toBe(4);
    expect(result[0].hoursThisWeek).toBe(4.5);
  });

  it("excludes CANCELLED and NO_SHOW from this-week counters", () => {
    const sessions: CaseloadSessionInput[] = [
      ilSession("t1", "2026-05-24T09:00", 1, "CANCELLED"),
      ilSession("t1", "2026-05-25T10:00", 1, "NO_SHOW"),
      ilSession("t1", "2026-05-26T11:00", 1, "SCHEDULED"),
    ];
    const result = computeCaseload({
      therapists: [THERAPISTS[0]],
      sessions,
      clientCounts: [],
      now: NOW,
    });
    expect(result[0].sessionsThisWeek).toBe(1);
    expect(result[0].hoursThisWeek).toBe(1);
  });

  it("ignores sessions outside [weekStart, weekEnd) window", () => {
    const sessions: CaseloadSessionInput[] = [
      ilSession("t1", "2026-05-23T23:30", 1, "SCHEDULED"),
      ilSession("t1", "2026-05-31T08:00", 1, "SCHEDULED"),
      ilSession("t1", "2026-05-26T10:00", 1, "SCHEDULED"),
    ];
    const result = computeCaseload({
      therapists: [THERAPISTS[0]],
      sessions,
      clientCounts: [],
      now: NOW,
    });
    expect(result[0].sessionsThisWeek).toBe(1);
  });
});

describe("computeCaseload — 4-week average", () => {
  it("averages COMPLETED hours over the 4 previous weeks (only COMPLETED counts)", () => {
    const sessions: CaseloadSessionInput[] = [
      ilSession("t1", "2026-05-18T09:00", 2, "COMPLETED"),
      ilSession("t1", "2026-05-12T09:00", 2, "COMPLETED"),
      ilSession("t1", "2026-05-05T09:00", 2, "COMPLETED"),
      ilSession("t1", "2026-04-28T09:00", 2, "COMPLETED"),
      ilSession("t1", "2026-05-12T11:00", 2, "SCHEDULED"),
    ];
    const result = computeCaseload({
      therapists: [THERAPISTS[0]],
      sessions,
      clientCounts: [],
      now: NOW,
    });
    expect(result[0].completedLast4Weeks).toBe(4);
    expect(result[0].avgWeeklyHours).toBe(2);
  });

  it("ignores sessions older than 4 weeks ago", () => {
    const sessions: CaseloadSessionInput[] = [
      ilSession("t1", "2026-04-15T09:00", 5, "COMPLETED"),
      ilSession("t1", "2026-05-18T09:00", 1, "COMPLETED"),
    ];
    const result = computeCaseload({
      therapists: [THERAPISTS[0]],
      sessions,
      clientCounts: [],
      now: NOW,
    });
    expect(result[0].completedLast4Weeks).toBe(1);
    expect(result[0].avgWeeklyHours).toBe(0.25);
  });

  it("does not include current-week sessions in the 4-week average", () => {
    const sessions: CaseloadSessionInput[] = [
      ilSession("t1", "2026-05-26T09:00", 8, "COMPLETED"),
    ];
    const result = computeCaseload({
      therapists: [THERAPISTS[0]],
      sessions,
      clientCounts: [],
      now: NOW,
    });
    expect(result[0].completedLast4Weeks).toBe(0);
    expect(result[0].avgWeeklyHours).toBe(0);
    expect(result[0].sessionsThisWeek).toBe(1);
  });
});

describe("computeCaseload — overload classification", () => {
  it("classifies high when hoursThisWeek >= HIGH threshold", () => {
    const sessions: CaseloadSessionInput[] = Array.from({ length: HIGH_LOAD_WEEKLY_HOURS }, (_, i) =>
      ilSession("t1", `2026-05-2${4 + (i % 6)}T${String(9 + Math.floor(i / 6)).padStart(2, "0")}:00`, 1, "SCHEDULED")
    );
    const result = computeCaseload({
      therapists: [THERAPISTS[0]],
      sessions,
      clientCounts: [{ therapistId: "t1", activeClients: 20 }],
      now: NOW,
    });
    expect(result[0].overloadLevel).toBe("high");
    expect(result[0].hoursThisWeek).toBeGreaterThanOrEqual(HIGH_LOAD_WEEKLY_HOURS);
  });

  it("classifies high when avgWeeklyHours >= HIGH threshold (even with empty current week)", () => {
    const sessions: CaseloadSessionInput[] = [
      ilSession("t1", "2026-04-29T08:00", HIGH_LOAD_WEEKLY_HOURS, "COMPLETED"),
      ilSession("t1", "2026-05-06T08:00", HIGH_LOAD_WEEKLY_HOURS, "COMPLETED"),
      ilSession("t1", "2026-05-13T08:00", HIGH_LOAD_WEEKLY_HOURS, "COMPLETED"),
      ilSession("t1", "2026-05-20T08:00", HIGH_LOAD_WEEKLY_HOURS, "COMPLETED"),
    ];
    const result = computeCaseload({
      therapists: [THERAPISTS[0]],
      sessions,
      clientCounts: [{ therapistId: "t1", activeClients: 30 }],
      now: NOW,
    });
    expect(result[0].overloadLevel).toBe("high");
    expect(result[0].avgWeeklyHours).toBe(HIGH_LOAD_WEEKLY_HOURS);
  });

  it("classifies low only when all three conditions are met", () => {
    const result = computeCaseload({
      therapists: [THERAPISTS[0]],
      sessions: [
        ilSession("t1", "2026-05-25T09:00", LOW_LOAD_WEEKLY_HOURS, "SCHEDULED"),
      ],
      clientCounts: [{ therapistId: "t1", activeClients: LOW_LOAD_MAX_ACTIVE_CLIENTS }],
      now: NOW,
    });
    expect(result[0].overloadLevel).toBe("low");
  });

  it("classifies normal when none of high/low conditions are met", () => {
    const result = computeCaseload({
      therapists: [THERAPISTS[0]],
      sessions: [
        ilSession("t1", "2026-05-25T09:00", 10, "SCHEDULED"),
      ],
      clientCounts: [{ therapistId: "t1", activeClients: 8 }],
      now: NOW,
    });
    expect(result[0].overloadLevel).toBe("normal");
  });

  it("does NOT classify low when active clients exceed threshold even with light hours", () => {
    const result = computeCaseload({
      therapists: [THERAPISTS[0]],
      sessions: [
        ilSession("t1", "2026-05-25T09:00", 1, "SCHEDULED"),
      ],
      clientCounts: [
        { therapistId: "t1", activeClients: LOW_LOAD_MAX_ACTIVE_CLIENTS + 1 },
      ],
      now: NOW,
    });
    expect(result[0].overloadLevel).toBe("normal");
  });
});

describe("computeCaseload — robustness", () => {
  it("accepts ISO string dates (post JSON.parse(JSON.stringify(...)))", () => {
    const sessions: CaseloadSessionInput[] = [
      {
        therapistId: "t1",
        startTime: "2026-05-25T09:00:00+03:00",
        endTime: "2026-05-25T10:00:00+03:00",
        status: "SCHEDULED",
      },
    ];
    const result = computeCaseload({
      therapists: [THERAPISTS[0]],
      sessions,
      clientCounts: [],
      now: NOW,
    });
    expect(result[0].sessionsThisWeek).toBe(1);
    expect(result[0].hoursThisWeek).toBe(1);
  });

  it("treats negative or zero duration as 0 hours (defensive)", () => {
    const sessions: CaseloadSessionInput[] = [
      {
        therapistId: "t1",
        startTime: new Date("2026-05-25T10:00:00+03:00"),
        endTime: new Date("2026-05-25T09:00:00+03:00"),
        status: "SCHEDULED",
      },
    ];
    const result = computeCaseload({
      therapists: [THERAPISTS[0]],
      sessions,
      clientCounts: [],
      now: NOW,
    });
    expect(result[0].sessionsThisWeek).toBe(1);
    expect(result[0].hoursThisWeek).toBe(0);
  });

  it("filters sessions by therapist correctly (no cross-contamination)", () => {
    const sessions: CaseloadSessionInput[] = [
      ilSession("t1", "2026-05-25T09:00", 2, "SCHEDULED"),
      ilSession("t2", "2026-05-25T09:00", 1, "SCHEDULED"),
    ];
    const result = computeCaseload({
      therapists: [THERAPISTS[0], THERAPISTS[1]],
      sessions,
      clientCounts: [],
      now: NOW,
    });
    expect(result.find((r) => r.therapistId === "t1")?.hoursThisWeek).toBe(2);
    expect(result.find((r) => r.therapistId === "t2")?.hoursThisWeek).toBe(1);
  });
});

describe("sortByOverload", () => {
  it("places high before normal before low", () => {
    const items = computeCaseload({
      therapists: THERAPISTS,
      sessions: [
        ilSession("t1", "2026-05-25T09:00", 35, "SCHEDULED"),
        ilSession("t2", "2026-05-25T09:00", 12, "SCHEDULED"),
      ],
      clientCounts: [
        { therapistId: "t1", activeClients: 20 },
        { therapistId: "t2", activeClients: 8 },
        { therapistId: "t3", activeClients: 1 },
      ],
      now: NOW,
    });
    const sorted = sortByOverload(items);
    expect(sorted.map((s) => s.overloadLevel)).toEqual(["high", "normal", "low"]);
  });

  it("ties are broken by hoursThisWeek descending", () => {
    const items = computeCaseload({
      therapists: [
        { id: "a", name: "א", email: "a@x.com" },
        { id: "b", name: "ב", email: "b@x.com" },
      ],
      sessions: [
        ilSession("a", "2026-05-25T09:00", 10, "SCHEDULED"),
        ilSession("b", "2026-05-25T09:00", 15, "SCHEDULED"),
      ],
      clientCounts: [
        { therapistId: "a", activeClients: 8 },
        { therapistId: "b", activeClients: 8 },
      ],
      now: NOW,
    });
    const sorted = sortByOverload(items);
    expect(sorted[0].therapistId).toBe("b");
    expect(sorted[1].therapistId).toBe("a");
  });

  it("does not mutate the input array", () => {
    const items = computeCaseload({
      therapists: THERAPISTS,
      sessions: [],
      clientCounts: [],
      now: NOW,
    });
    const orig = [...items];
    sortByOverload(items);
    expect(items).toEqual(orig);
  });
});
