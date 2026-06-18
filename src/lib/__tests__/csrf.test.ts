import { describe, it, expect } from "vitest";
import { isCrossOriginMutation } from "@/lib/csrf";

// עוזר ליצירת Headers מאובייקט פשוט
function h(init: Record<string, string>): Headers {
  return new Headers(init);
}

const HOST = "mytipul.com";

describe("isCrossOriginMutation — הגנת CSRF (defense-in-depth)", () => {
  // ── שיטות קריאה לעולם לא נחסמות ────────────────────────────────────
  it("GET לא נחסם גם ממקור חוצה-אתר", () => {
    expect(
      isCrossOriginMutation("GET", h({ "sec-fetch-site": "cross-site" }), HOST)
    ).toBe(false);
  });

  it("HEAD לא נחסם", () => {
    expect(
      isCrossOriginMutation("HEAD", h({ "sec-fetch-site": "cross-site" }), HOST)
    ).toBe(false);
  });

  it("OPTIONS (preflight) לא נחסם", () => {
    expect(
      isCrossOriginMutation("OPTIONS", h({ "sec-fetch-site": "cross-site" }), HOST)
    ).toBe(false);
  });

  it("שיטה ב-lowercase מטופלת נכון", () => {
    expect(
      isCrossOriginMutation("get", h({ "sec-fetch-site": "cross-site" }), HOST)
    ).toBe(false);
  });

  // ── Sec-Fetch-Site (המסלול העיקרי) ─────────────────────────────────
  it("POST עם Sec-Fetch-Site=cross-site נחסם", () => {
    expect(
      isCrossOriginMutation("POST", h({ "sec-fetch-site": "cross-site" }), HOST)
    ).toBe(true);
  });

  it("POST עם Sec-Fetch-Site=same-origin מותר", () => {
    expect(
      isCrossOriginMutation("POST", h({ "sec-fetch-site": "same-origin" }), HOST)
    ).toBe(false);
  });

  it("POST עם Sec-Fetch-Site=same-site מותר (תת-דומיין של אותו אתר)", () => {
    expect(
      isCrossOriginMutation("POST", h({ "sec-fetch-site": "same-site" }), HOST)
    ).toBe(false);
  });

  it("POST עם Sec-Fetch-Site=none מותר (פעולה ישירה של המשתמש)", () => {
    expect(
      isCrossOriginMutation("POST", h({ "sec-fetch-site": "none" }), HOST)
    ).toBe(false);
  });

  it("Sec-Fetch-Site גובר על Origin — same-origin מותר גם אם Origin לא תואם", () => {
    expect(
      isCrossOriginMutation(
        "POST",
        h({ "sec-fetch-site": "same-origin", origin: "https://evil.com" }),
        HOST
      )
    ).toBe(false);
  });

  // ── נפילה ל-Origin↔Host (דפדפנים ישנים בלי Sec-Fetch-Site) ──────────
  it("POST בלי Sec-Fetch-Site ועם Origin תואם — מותר", () => {
    expect(
      isCrossOriginMutation("POST", h({ origin: "https://mytipul.com" }), HOST)
    ).toBe(false);
  });

  it("POST בלי Sec-Fetch-Site ועם Origin חוצה-אתר — נחסם", () => {
    expect(
      isCrossOriginMutation("POST", h({ origin: "https://evil.com" }), HOST)
    ).toBe(true);
  });

  it("השוואת host אינה תלוית רישיות", () => {
    expect(
      isCrossOriginMutation("POST", h({ origin: "https://MyTipul.com" }), HOST)
    ).toBe(false);
  });

  it("Origin עם פורט שונה נחשב חוצה-אתר", () => {
    expect(
      isCrossOriginMutation("POST", h({ origin: "https://mytipul.com:8080" }), HOST)
    ).toBe(true);
  });

  it('Origin="null" (iframe sandbox / redirect אטום) נחסם', () => {
    expect(
      isCrossOriginMutation("POST", h({ origin: "null" }), HOST)
    ).toBe(true);
  });

  it("Origin פגום נחסם", () => {
    expect(
      isCrossOriginMutation("POST", h({ origin: "%%%not-a-url" }), HOST)
    ).toBe(true);
  });

  it("Origin קיים אך selfHost חסר — מותר (אין מול מה להשוות)", () => {
    expect(
      isCrossOriginMutation("POST", h({ origin: "https://evil.com" }), null)
    ).toBe(false);
  });

  // ── אין שום כותרת מקור ─────────────────────────────────────────────
  it("POST בלי Sec-Fetch-Site ובלי Origin — מותר (לקוח לא-דפדפן; SameSite מגן)", () => {
    expect(isCrossOriginMutation("POST", h({}), HOST)).toBe(false);
  });

  it("PUT/PATCH/DELETE חוצי-אתר נחסמים גם הם", () => {
    for (const m of ["PUT", "PATCH", "DELETE"]) {
      expect(
        isCrossOriginMutation(m, h({ "sec-fetch-site": "cross-site" }), HOST)
      ).toBe(true);
    }
  });
});
