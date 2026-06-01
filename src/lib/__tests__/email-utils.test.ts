import { describe, it, expect } from "vitest";
import { escapeHtml, sanitizeEmailSubject, safeEmailSubject } from "@/lib/email-utils";

describe("escapeHtml", () => {
  it("escapes HTML-significant characters", () => {
    expect(escapeHtml(`<b>"x"&'y'</b>`)).toBe(
      "&lt;b&gt;&quot;x&quot;&amp;&#039;y&#039;&lt;/b&gt;"
    );
  });
});

describe("sanitizeEmailSubject", () => {
  it("מסיר תווי שורה וטאב (מניעת Email Header Injection)", () => {
    expect(sanitizeEmailSubject("Dr. Smith\r\nBcc: attacker@example.com")).toBe(
      "Dr. Smith Bcc: attacker@example.com"
    );
    expect(sanitizeEmailSubject("שם\nשורה")).toBe("שם שורה");
    expect(sanitizeEmailSubject("a\tb")).toBe("a b");
  });
  it("רצף תווי שורה מתכווץ לרווח אחד ונחתך בקצוות", () => {
    expect(sanitizeEmailSubject("  כותרת\r\n\r\n  ")).toBe("כותרת");
  });
  it("מחרוזת תקינה נשארת כמות שהיא", () => {
    expect(sanitizeEmailSubject("אישור תור - ד״ר כהן")).toBe("אישור תור - ד״ר כהן");
  });
});

describe("safeEmailSubject", () => {
  it("מנקה תווי שורה כמו sanitizeEmailSubject", () => {
    expect(safeEmailSubject("a\r\nb")).toBe("a b");
  });
  it("חותך לאורך מרבי של 200 תווים", () => {
    expect([...safeEmailSubject("x".repeat(500))].length).toBe(200);
  });
  it("לא חותך באמצע אימוג'י (אין surrogate בודד בקצה)", () => {
    const res = safeEmailSubject("a".repeat(199) + "📬", 200);
    expect([...res].length).toBe(200);
    expect(res.endsWith("📬")).toBe(true);
  });
});
