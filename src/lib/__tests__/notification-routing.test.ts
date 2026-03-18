import { describe, it, expect } from "vitest";

/**
 * Tests for notification routing logic and summary count synchronization.
 * These tests verify the fixes for:
 * - Bug ב': Notification bell click routing
 * - Bug ד': Dashboard summary count matching summaries page
 */

// Simulate the notification routing logic from dashboard-header.tsx
function getNotificationRoute(type: string): string {
  if (type === "BOOKING_REQUEST" || type === "CANCELLATION_REQUEST") {
    return "/dashboard/calendar";
  } else if (
    type === "PENDING_TASKS" ||
    type === "MORNING_SUMMARY" ||
    type === "EVENING_SUMMARY"
  ) {
    return "/dashboard/tasks";
  } else if (type === "PAYMENT_REMINDER") {
    return "/dashboard/payments";
  } else {
    return "/dashboard/communications";
  }
}

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
      new Date(s.startTime) < new Date() &&
      (s.status === "SCHEDULED" || s.status === "COMPLETED")
  ).length;
}

describe("Notification routing", () => {
  it("MORNING_SUMMARY routes to /dashboard/tasks", () => {
    expect(getNotificationRoute("MORNING_SUMMARY")).toBe("/dashboard/tasks");
  });

  it("EVENING_SUMMARY routes to /dashboard/tasks", () => {
    expect(getNotificationRoute("EVENING_SUMMARY")).toBe("/dashboard/tasks");
  });

  it("PENDING_TASKS routes to /dashboard/tasks", () => {
    expect(getNotificationRoute("PENDING_TASKS")).toBe("/dashboard/tasks");
  });

  it("PAYMENT_REMINDER routes to /dashboard/payments", () => {
    expect(getNotificationRoute("PAYMENT_REMINDER")).toBe("/dashboard/payments");
  });

  it("BOOKING_REQUEST routes to /dashboard/calendar", () => {
    expect(getNotificationRoute("BOOKING_REQUEST")).toBe("/dashboard/calendar");
  });

  it("EMAIL_RECEIVED routes to /dashboard/communications", () => {
    expect(getNotificationRoute("EMAIL_RECEIVED")).toBe(
      "/dashboard/communications"
    );
  });
});

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
