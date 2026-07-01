import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { logger } from "@/lib/logger";

// ה-logger כותב JSON ל-console.log/warn/error. לוכדים את הפלט ומפענחים אותו
// כדי לאמת שמפתחות רגישים (PHI/PII) הוחלפו ב-[REDACTED] לפני הכתיבה ל-stdout.
function lastJson(spy: ReturnType<typeof vi.spyOn>): Record<string, unknown> {
  const calls = spy.mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  return JSON.parse(String(calls[calls.length - 1][0]));
}

describe("logger — סניטיזציה של PHI/PII בלוגים", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let warnSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    logSpy.mockRestore();
    warnSpy.mockRestore();
    errorSpy.mockRestore();
  });

  // ── הפער שזוהה: מפתח בשם `to`/`recipient`/`toNumber` לא נתפס ─────────────
  it("מסתיר טלפון שמועבר תחת המפתח `to` (sms.ts:254,671)", () => {
    logger.info("[sms] test", { to: "0501234567" });
    expect(lastJson(logSpy).to).toBe("[REDACTED]");
  });

  it("מסתיר אימייל שמועבר תחת המפתח `recipient` (cron/notifications, debt-reminders)", () => {
    logger.info("[cron] test", { recipient: "client@example.com" });
    expect(lastJson(logSpy).recipient).toBe("[REDACTED]");
  });

  it("מסתיר את המפתח `toNumber`", () => {
    logger.warn("[sms] test", { toNumber: "0501234567" });
    expect(lastJson(warnSpy).toNumber).toBe("[REDACTED]");
  });

  // ── התנהגות קיימת שחייבת להישמר ──────────────────────────────────────────
  it("ממשיך להסתיר phone/email/token", () => {
    logger.error("test", { phone: "0501234567", email: "a@b.com", token: "secret123" });
    const out = lastJson(errorSpy);
    expect(out.phone).toBe("[REDACTED]");
    expect(out.email).toBe("[REDACTED]");
    expect(out.token).toBe("[REDACTED]");
  });

  // ── הגנה מפני over-redaction: מפתחות לגיטימיים שמכילים את הרצף "to" ───────
  it("לא מסתיר בטעות total/status/history/errorCode (debug חיוני בחיוב)", () => {
    logger.info("test", { total: 100, status: "APPROVED", history: "x", errorCode: "E12" });
    const out = lastJson(logSpy);
    expect(out.total).toBe(100);
    expect(out.status).toBe("APPROVED");
    expect(out.history).toBe("x");
    expect(out.errorCode).toBe("E12");
  });

  // ── subject: נושאי מייל מכילים שמות מטופלים/מטפלים (resend.ts, webhooks/resend) ─
  it("מסתיר את המפתח `subject` (נושא מייל מכיל שם מטופל)", () => {
    logger.info("[email] חסום בשבת/חג", { subject: "🔔 בקשת ביטול חדשה - שרה כהן" });
    expect(lastJson(logSpy).subject).toBe("[REDACTED]");
  });

  it("מסתיר `subject` גם בתוך אובייקט מקונן (data.subject ב-webhook נכנס), בלי over-redaction לאחים", () => {
    logger.info("Processing incoming email:", {
      data: { subject: "תזכורת תשלום - שרה כהן", status: "received" },
    });
    const data = lastJson(logSpy).data as Record<string, unknown>;
    expect(data.subject).toBe("[REDACTED]");
    expect(data.status).toBe("received"); // מפתח לא-PHI — חייב להישאר
  });
});
