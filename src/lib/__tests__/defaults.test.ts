/**
 * Snapshot tests — src/lib/defaults.ts
 *
 * מטרת הטסטים האלה: להגן על public contract של ערכי ברירת המחדל.
 * שינוי לא מתוכנן של key/field יישבר את הטסט — מאלץ לתעד את השינוי.
 */

import { describe, it, expect } from "vitest";
import {
  DEFAULT_AI_SETTINGS,
  DEFAULT_FEATURE_FLAGS,
  GLOBAL_AI_SETTINGS_ID,
} from "../defaults";

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

describe("DEFAULT_AI_SETTINGS", () => {
  it("has exactly 12 fields", () => {
    expect(Object.keys(DEFAULT_AI_SETTINGS)).toHaveLength(12);
  });

  it("does NOT include id (id is added per-call via GLOBAL_AI_SETTINGS_ID)", () => {
    expect(DEFAULT_AI_SETTINGS).not.toHaveProperty("id");
  });

  it("expected field set — public contract", () => {
    const fields = Object.keys(DEFAULT_AI_SETTINGS).sort();
    expect(fields).toEqual([
      "alertAdminOnExceed",
      "alertThreshold",
      "blockOnExceed",
      "compressPrompts",
      "dailyLimitEnterprise",
      "dailyLimitEssential",
      "dailyLimitPro",
      "enableCache",
      "maxMonthlyCostBudget",
      "monthlyLimitEnterprise",
      "monthlyLimitEssential",
      "monthlyLimitPro",
    ]);
  });

  it("monetary fields are positive numbers", () => {
    expect(DEFAULT_AI_SETTINGS.maxMonthlyCostBudget).toBeGreaterThan(0);
    expect(DEFAULT_AI_SETTINGS.alertThreshold).toBeGreaterThan(0);
    // alertThreshold should be < budget (early warning)
    expect(DEFAULT_AI_SETTINGS.alertThreshold).toBeLessThan(
      DEFAULT_AI_SETTINGS.maxMonthlyCostBudget
    );
  });

  it("ESSENTIAL tier has 0 limits (no AI)", () => {
    expect(DEFAULT_AI_SETTINGS.dailyLimitEssential).toBe(0);
    expect(DEFAULT_AI_SETTINGS.monthlyLimitEssential).toBe(0);
  });

  it("PRO < ENTERPRISE on daily/monthly limits", () => {
    expect(DEFAULT_AI_SETTINGS.dailyLimitPro).toBeLessThan(
      DEFAULT_AI_SETTINGS.dailyLimitEnterprise
    );
    expect(DEFAULT_AI_SETTINGS.monthlyLimitPro).toBeLessThan(
      DEFAULT_AI_SETTINGS.monthlyLimitEnterprise
    );
  });
});

describe("GLOBAL_AI_SETTINGS_ID", () => {
  it("is the singleton constant 'default'", () => {
    expect(GLOBAL_AI_SETTINGS_ID).toBe("default");
  });
});
