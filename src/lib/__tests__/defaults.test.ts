/**
 * Snapshot tests — src/lib/defaults.ts
 *
 * מטרת הטסטים האלה: להגן על public contract של ערכי ברירת המחדל.
 * שינוי לא מתוכנן של key/field יישבר את הטסט — מאלץ לתעד את השינוי.
 */

import { describe, it, expect } from "vitest";
import { DEFAULT_FEATURE_FLAGS } from "../defaults";

describe("DEFAULT_FEATURE_FLAGS", () => {
  it("has exactly 6 flags", () => {
    expect(DEFAULT_FEATURE_FLAGS).toHaveLength(6);
  });

  it("flag keys snapshot — public contract", () => {
    // מפתחות אלה מוזכרים מ-routes / UI / hooks. שינוי שובר אינטגרציה.
    const keys = DEFAULT_FEATURE_FLAGS.map((f) => f.key).sort();
    expect(keys).toEqual([
      "advanced_reports",
      "ai_detailed_analysis",
      "ai_questionnaire",
      "ai_session_prep",
      "email_threads",
      "file_attachments",
    ]);
  });

  it("every flag has key+name+description+tiers", () => {
    for (const flag of DEFAULT_FEATURE_FLAGS) {
      expect(flag.key).toBeTruthy();
      expect(flag.name).toBeTruthy();
      expect(flag.description).toBeTruthy();
      expect(Array.isArray(flag.tiers)).toBe(true);
      expect(flag.tiers.length).toBeGreaterThan(0);
    }
  });

  it("all flags include valid tier values only", () => {
    const validTiers = new Set(["ESSENTIAL", "PRO", "ENTERPRISE"]);
    for (const flag of DEFAULT_FEATURE_FLAGS) {
      for (const tier of flag.tiers) {
        expect(validTiers.has(tier)).toBe(true);
      }
    }
  });
});
