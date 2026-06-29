import { describe, it, expect } from "vitest";
import { escapeHtml, sanitizeEmailSubject, safeEmailSubject, safeHttpUrl } from "@/lib/email-utils";

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
  it("מסיר גם תווי קו-מפריד נדירים (\\v \\f NEL U+2028 U+2029)", () => {
    expect(sanitizeEmailSubject("a\vb")).toBe("a b"); // vertical tab
    expect(sanitizeEmailSubject("a\fb")).toBe("a b"); // form feed
    expect(sanitizeEmailSubject("a\u0085b")).toBe("a b"); // NEL
    expect(sanitizeEmailSubject("a\u2028b")).toBe("a b"); // line separator
    expect(sanitizeEmailSubject("a\u2029b")).toBe("a b"); // paragraph separator
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

describe("safeHttpUrl", () => {
  it("מחזיר URL תקין של http/https", () => {
    expect(safeHttpUrl("https://pay.example.com/abc")).toBe(
      "https://pay.example.com/abc"
    );
    expect(safeHttpUrl("http://example.com")).toBe("http://example.com/");
  });
  it("חוסם scheme לא בטוח (javascript:/data:/file:)", () => {
    expect(safeHttpUrl("javascript:alert(1)")).toBeNull();
    expect(safeHttpUrl("JavaScript:alert(1)")).toBeNull();
    expect(safeHttpUrl("data:text/html,<script>alert(1)</script>")).toBeNull();
    expect(safeHttpUrl("file:///etc/passwd")).toBeNull();
  });
  it("מחזיר null לקלט ריק/לא תקין/ארוך מדי", () => {
    expect(safeHttpUrl(null)).toBeNull();
    expect(safeHttpUrl(undefined)).toBeNull();
    expect(safeHttpUrl("")).toBeNull();
    expect(safeHttpUrl("לא-כתובת")).toBeNull();
    expect(safeHttpUrl("https://example.com/" + "a".repeat(2000))).toBeNull();
  });
});
