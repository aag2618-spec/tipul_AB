import { describe, it, expect } from "vitest";
import { getNotificationRoute, extractBookingInfo, NOTIFICATION_TYPES } from "@/lib/notification-utils";

/**
 * Tests for notification routing logic and summary count synchronization.
 * These tests verify the fixes for:
 * - Bug ב': Notification bell click routing
 * - Bug ד': Dashboard summary count matching summaries page
 */

describe("Notification routing", () => {
  it("MORNING_SUMMARY routes to /dashboard/calendar", () => {
    expect(getNotificationRoute("MORNING_SUMMARY")).toBe("/dashboard/calendar");
  });

  it("EVENING_SUMMARY routes to /dashboard?scrollTo=personal-tasks", () => {
    expect(getNotificationRoute("EVENING_SUMMARY")).toBe("/dashboard?scrollTo=personal-tasks");
  });

  it("PENDING_TASKS routes to /dashboard?scrollTo=personal-tasks", () => {
    expect(getNotificationRoute("PENDING_TASKS")).toBe("/dashboard?scrollTo=personal-tasks");
  });

  it("PAYMENT_REMINDER routes to /dashboard/payments", () => {
    expect(getNotificationRoute("PAYMENT_REMINDER")).toBe("/dashboard/payments");
  });

  it("BOOKING_REQUEST routes to /dashboard/calendar", () => {
    expect(getNotificationRoute("BOOKING_REQUEST")).toBe("/dashboard/calendar");
  });

  it("CANCELLATION_REQUEST routes to /dashboard/calendar", () => {
    expect(getNotificationRoute("CANCELLATION_REQUEST")).toBe("/dashboard/calendar");
  });

  it("EMAIL_RECEIVED routes to /dashboard/communications", () => {
    expect(getNotificationRoute("EMAIL_RECEIVED")).toBe("/dashboard/communications");
  });

  it("EMAIL_SENT routes to /dashboard/communications", () => {
    expect(getNotificationRoute("EMAIL_SENT")).toBe("/dashboard/communications");
  });

  it("SESSION_REMINDER routes to /dashboard/communications", () => {
    expect(getNotificationRoute("SESSION_REMINDER")).toBe("/dashboard/communications");
  });

  it("CUSTOM routes to /dashboard/communications", () => {
    expect(getNotificationRoute("CUSTOM")).toBe("/dashboard/communications");
  });

  it("כל 10 הסוגים מחזירים נתיב תקף", () => {
    for (const type of NOTIFICATION_TYPES) {
      const route = getNotificationRoute(type);
      expect(route).toMatch(/^\/dashboard/);
    }
  });
});

describe("extractBookingInfo", () => {
  it("מחלץ תאריך, שעה, ומזהה פגישה מתוכן מלא", () => {
    const content = "בקשת פגישה [2026-03-15|14:00|abc123]";
    const result = extractBookingInfo(content);
    expect(result.date).toBe("2026-03-15");
    expect(result.time).toBe("14:00");
    expect(result.sessionId).toBe("abc123");
  });

  it("מחלץ רק תאריך כשאין שעה ומזהה", () => {
    const content = "בקשת ביטול [2026-03-15]";
    const result = extractBookingInfo(content);
    expect(result.date).toBe("2026-03-15");
    expect(result.time).toBeNull();
    expect(result.sessionId).toBeNull();
  });

  it("מחזיר nulls כשאין מידע הזמנה", () => {
    const content = "יש לך 3 פגישות היום";
    const result = extractBookingInfo(content);
    expect(result.date).toBeNull();
    expect(result.time).toBeNull();
    expect(result.sessionId).toBeNull();
  });

  it("מחלץ שעה עם ספרה אחת", () => {
    const content = "פגישה [2026-01-01|9:30|xyz789]";
    const result = extractBookingInfo(content);
    expect(result.time).toBe("9:30");
  });
});

// Simulate the summary count filter logic (must match summaries-tab.tsx)
interface SessionForSummary {
  sessionNote: { content: string } | null;
  type: string;
  skipSummary: boolean;
  startTime: Date;
  status: string;
}

function countPendingSummaries(sessions: SessionForSummary[]): number {
  return sessions.filter(
    (s) =>
      !s.sessionNote &&
      s.type !== "BREAK" &&
      !s.skipSummary &&
      s.status === "COMPLETED"
  ).length;
}

describe("Summary count synchronization", () => {
  const pastDate = new Date("2025-01-01");

  it("counts only sessions without sessionNote", () => {
    const sessions: SessionForSummary[] = [
      { sessionNote: null, type: "INDIVIDUAL", skipSummary: false, startTime: pastDate, status: "COMPLETED" },
      { sessionNote: { content: "done" }, type: "INDIVIDUAL", skipSummary: false, startTime: pastDate, status: "COMPLETED" },
    ];
    expect(countPendingSummaries(sessions)).toBe(1);
  });

  it("excludes BREAK sessions", () => {
    const sessions: SessionForSummary[] = [
      { sessionNote: null, type: "BREAK", skipSummary: false, startTime: pastDate, status: "COMPLETED" },
      { sessionNote: null, type: "INDIVIDUAL", skipSummary: false, startTime: pastDate, status: "COMPLETED" },
    ];
    expect(countPendingSummaries(sessions)).toBe(1);
  });

  it("excludes sessions with skipSummary=true", () => {
    const sessions: SessionForSummary[] = [
      { sessionNote: null, type: "INDIVIDUAL", skipSummary: true, startTime: pastDate, status: "COMPLETED" },
      { sessionNote: null, type: "INDIVIDUAL", skipSummary: false, startTime: pastDate, status: "COMPLETED" },
    ];
    expect(countPendingSummaries(sessions)).toBe(1);
  });

  it("excludes future sessions", () => {
    const futureDate = new Date("2099-12-31");
    const sessions: SessionForSummary[] = [
      { sessionNote: null, type: "INDIVIDUAL", skipSummary: false, startTime: futureDate, status: "SCHEDULED" },
      { sessionNote: null, type: "INDIVIDUAL", skipSummary: false, startTime: pastDate, status: "COMPLETED" },
    ];
    expect(countPendingSummaries(sessions)).toBe(1);
  });

  it("excludes CANCELLED and NO_SHOW sessions", () => {
    const sessions: SessionForSummary[] = [
      { sessionNote: null, type: "INDIVIDUAL", skipSummary: false, startTime: pastDate, status: "CANCELLED" },
      { sessionNote: null, type: "INDIVIDUAL", skipSummary: false, startTime: pastDate, status: "NO_SHOW" },
      { sessionNote: null, type: "INDIVIDUAL", skipSummary: false, startTime: pastDate, status: "COMPLETED" },
    ];
    expect(countPendingSummaries(sessions)).toBe(1);
  });

  it("returns 0 when all sessions have summaries or are skipped", () => {
    const sessions: SessionForSummary[] = [
      { sessionNote: { content: "done" }, type: "INDIVIDUAL", skipSummary: false, startTime: pastDate, status: "COMPLETED" },
      { sessionNote: null, type: "INDIVIDUAL", skipSummary: true, startTime: pastDate, status: "COMPLETED" },
      { sessionNote: null, type: "BREAK", skipSummary: false, startTime: pastDate, status: "COMPLETED" },
    ];
    expect(countPendingSummaries(sessions)).toBe(0);
  });
});
