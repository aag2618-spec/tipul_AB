import { describe, it, expect, vi, beforeEach } from "vitest";

// מוק ל-Resend SDK — לוכדים את הארגומנטים שמועברים ל-emails.send בלי לשלוח מייל אמיתי.
const sendMock = vi.hoisted(() => vi.fn());

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: sendMock };
  },
}));
// שבת/חג — מכבים בבדיקה כדי שהשליחה לא תיחסם.
vi.mock("@/lib/shabbat", () => ({ isShabbatOrYomTov: () => false }));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { sendEmail } from "@/lib/resend";

beforeEach(() => {
  sendMock.mockReset();
  sendMock.mockResolvedValue({ data: { id: "msg_test" }, error: null });
  process.env.RESEND_API_KEY = "test_key";
});

describe("sendEmail — הגנה מפני Email Header Injection", () => {
  it("מנקה תווי שורה (\\r\\n) משורת הנושא לפני השליחה ל-Resend", async () => {
    await sendEmail({
      to: "client@example.com",
      subject: "אישור תור\r\nBcc: attacker@evil.com",
      html: "<p>שלום</p>",
    });

    expect(sendMock).toHaveBeenCalledTimes(1);
    const sent = sendMock.mock.calls[0][0];
    expect(sent.subject).not.toMatch(/[\r\n]/);
    expect(sent.subject).toBe("אישור תור Bcc: attacker@evil.com");
  });

  it("חוסם הזרקת נמען נוסף (פסיק/נקודה-פסיק) בכתובת היעד", async () => {
    await sendEmail({
      to: "client@example.com,attacker@evil.com",
      subject: "תזכורת",
      html: "<p>שלום</p>",
    });

    const sent = sendMock.mock.calls[0][0];
    expect(sent.to).not.toContain(",");
    expect(sent.to).not.toMatch(/[;\r\n]/);
  });

  it("חותך שורת נושא ארוכה במיוחד עד 200 תווים", async () => {
    await sendEmail({
      to: "client@example.com",
      subject: "א".repeat(500),
      html: "<p>שלום</p>",
    });

    const sent = sendMock.mock.calls[0][0];
    expect(sent.subject.length).toBeLessThanOrEqual(200);
  });

  it("שורת נושא תקינה נשארת ללא שינוי", async () => {
    await sendEmail({
      to: "client@example.com",
      subject: "אישור תור - ד״ר כהן",
      html: "<p>שלום</p>",
    });

    const sent = sendMock.mock.calls[0][0];
    expect(sent.subject).toBe("אישור תור - ד״ר כהן");
  });
});
