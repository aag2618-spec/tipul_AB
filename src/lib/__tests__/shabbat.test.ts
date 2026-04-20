/**
 * Unit tests ל-src/lib/shabbat.ts
 *
 * זמנים מחושבים מראש ע"י hebcal עבור אילת + נהריה (scripts/compute-shabbat-test-cases.mjs):
 *   MIN(candle) לכניסה + MAX(havdalah) ליציאה — כדי לכסות את כל תושבי ישראל.
 *
 * כל UTC timestamp בטסט מייצג רגע ספציפי שנבדק באופן ידני.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// Reset the module-level cache between tests
beforeEach(async () => {
  vi.resetModules();
});

// Helper — מייבא טרי
async function loadShabbat() {
  return await import("../shabbat");
}

describe("isShabbatOrYomTov — חורף/קיץ (MIN/MAX cities)", () => {
  // ═════ Winter Shabbat: Dec 12-13, 2025 ═════
  // hebcal: Nahariya candle 16:15 IL (earliest), Eilat havdalah 17:33 IL (latest)
  // IL = UTC+2 (IST, no DST in winter)

  it("1. חורף שישי לפני הדלקת נרות בנהריה → false", async () => {
    const { isShabbatOrYomTov } = await loadShabbat();
    // 2025-12-12 16:10 IL = 14:10 UTC
    expect(isShabbatOrYomTov(new Date("2025-12-12T14:10:00Z"))).toBe(false);
  });

  it("2. חורף שישי אחרי נר בנהריה, לפני נר באילת → true (נהריה נכנסה ראשונה!)", async () => {
    const { isShabbatOrYomTov } = await loadShabbat();
    // 2025-12-12 16:20 IL = 14:20 UTC (בין 16:15 נהריה ל-16:24 אילת)
    expect(isShabbatOrYomTov(new Date("2025-12-12T14:20:00Z"))).toBe(true);
  });

  it("3. שבת בחורף 12:00 → true", async () => {
    const { isShabbatOrYomTov } = await loadShabbat();
    // 2025-12-13 12:00 IL = 10:00 UTC
    expect(isShabbatOrYomTov(new Date("2025-12-13T10:00:00Z"))).toBe(true);
  });

  it("4. חורף מוצ״ש אחרי הבדלה באילת → false", async () => {
    const { isShabbatOrYomTov } = await loadShabbat();
    // 2025-12-13 17:40 IL = 15:40 UTC (אחרי 17:33 havdalah אילת)
    expect(isShabbatOrYomTov(new Date("2025-12-13T15:40:00Z"))).toBe(false);
  });

  // ═════ Summer Shabbat: Jun 13-14, 2025 ═════
  // hebcal: Eilat candle 19:23 IL (earliest), Nahariya havdalah 20:40 IL (latest)
  // IL = UTC+3 (IDT, DST active)

  it("5. קיץ שישי לפני נר באילת → false", async () => {
    const { isShabbatOrYomTov } = await loadShabbat();
    // 2025-06-13 19:00 IL = 16:00 UTC
    expect(isShabbatOrYomTov(new Date("2025-06-13T16:00:00Z"))).toBe(false);
  });

  it("6. קיץ שישי אחרי נר באילת, לפני נר בנהריה → true (אילת נכנסה ראשונה!)", async () => {
    const { isShabbatOrYomTov } = await loadShabbat();
    // 2025-06-13 19:27 IL = 16:27 UTC (בין 19:23 אילת ל-19:31 נהריה)
    expect(isShabbatOrYomTov(new Date("2025-06-13T16:27:00Z"))).toBe(true);
  });

  it("7. קיץ מוצ״ש לפני הבדלה בנהריה → true (נהריה עדיין בשבת)", async () => {
    const { isShabbatOrYomTov } = await loadShabbat();
    // 2025-06-14 20:35 IL = 17:35 UTC (לפני 20:40 נהריה)
    expect(isShabbatOrYomTov(new Date("2025-06-14T17:35:00Z"))).toBe(true);
  });

  it("8. קיץ מוצ״ש אחרי הבדלה בנהריה → false", async () => {
    const { isShabbatOrYomTov } = await loadShabbat();
    // 2025-06-14 20:45 IL = 17:45 UTC
    expect(isShabbatOrYomTov(new Date("2025-06-14T17:45:00Z"))).toBe(false);
  });
});

describe("isShabbatOrYomTov — חגים (YOM_TOV coverage)", () => {
  // ═════ Rosh Hashana 5786: Sep 22-24, 2025 (Mon eve → Wed eve) ═════
  // start 18:18 IL / end 19:24 IL — שני ימים רצופים

  it("9. ראש השנה ערב יום א' 10:00 → false (לפני החג)", async () => {
    const { isShabbatOrYomTov } = await loadShabbat();
    expect(isShabbatOrYomTov(new Date("2025-09-22T07:00:00Z"))).toBe(false);
  });

  it("10. ראש השנה יום א' אחרי נרות 19:00 IL → true", async () => {
    const { isShabbatOrYomTov } = await loadShabbat();
    // 2025-09-22 19:00 IL = 16:00 UTC
    expect(isShabbatOrYomTov(new Date("2025-09-22T16:00:00Z"))).toBe(true);
  });

  it("11. ראש השנה יום ב' בבוקר → true (חלון אחד מחובר 49 שעות)", async () => {
    const { isShabbatOrYomTov } = await loadShabbat();
    // 2025-09-23 10:00 IL = 07:00 UTC — באמצע חלון ר"ה
    expect(isShabbatOrYomTov(new Date("2025-09-23T07:00:00Z"))).toBe(true);
  });

  it("12. ראש השנה מוצ״ח 20:00 → false (אחרי 19:24)", async () => {
    const { isShabbatOrYomTov } = await loadShabbat();
    // 2025-09-24 20:00 IL = 17:00 UTC
    expect(isShabbatOrYomTov(new Date("2025-09-24T17:00:00Z"))).toBe(false);
  });

  // ═════ Yom Kippur 5786: Oct 1-2, 2025 ═════
  it("13. יום כיפור 10:00 בבוקר → true", async () => {
    const { isShabbatOrYomTov } = await loadShabbat();
    // 2025-10-02 10:00 IL (IDT=+03:00) = 07:00 UTC
    expect(isShabbatOrYomTov(new Date("2025-10-02T07:00:00Z"))).toBe(true);
  });

  // ═════ Pesach I 5785: Apr 11-13, 2025 (Friday eve → Sunday eve) ═════
  it("14. ליל הסדר שבת+יו״ט 21:00 IL → true (חלון מחובר של 49 שעות)", async () => {
    const { isShabbatOrYomTov } = await loadShabbat();
    // 2025-04-12 21:00 IL (IDT) = 18:00 UTC — שבת+פסח א׳
    expect(isShabbatOrYomTov(new Date("2025-04-12T18:00:00Z"))).toBe(true);
  });

  // ═════ Pesach VII 5785: Apr 18-19, 2025 ═════
  it("15. שביעי של פסח 15:00 → true", async () => {
    const { isShabbatOrYomTov } = await loadShabbat();
    // 2025-04-19 15:00 IL (IDT) = 12:00 UTC
    expect(isShabbatOrYomTov(new Date("2025-04-19T12:00:00Z"))).toBe(true);
  });

  // ═════ Shavuot 5785: Jun 1-2, 2025 ═════
  it("16. שבועות 10:00 בבוקר → true", async () => {
    const { isShabbatOrYomTov } = await loadShabbat();
    // 2025-06-02 10:00 IL (IDT) = 07:00 UTC
    expect(isShabbatOrYomTov(new Date("2025-06-02T07:00:00Z"))).toBe(true);
  });

  // ═════ Sukkot I 5786: Oct 6-7, 2025 ═════
  it("17. סוכות א׳ 10:00 → true", async () => {
    const { isShabbatOrYomTov } = await loadShabbat();
    // 2025-10-07 10:00 IL (IDT, Oct 7 still DST) = 07:00 UTC
    expect(isShabbatOrYomTov(new Date("2025-10-07T07:00:00Z"))).toBe(true);
  });

  // ═════ Shemini Atzeret 5786: Oct 13-14, 2025 ═════
  it("18. שמחת תורה 10:00 → true", async () => {
    const { isShabbatOrYomTov } = await loadShabbat();
    // 2025-10-14 10:00 IL = 07:00 UTC (Oct 14 still DST)
    expect(isShabbatOrYomTov(new Date("2025-10-14T07:00:00Z"))).toBe(true);
  });
});

describe("isShabbatOrYomTov — ימים שאינם חוסמים", () => {
  // ═════ Chol Hamoed Pesach (Apr 15-17, 2025) ═════
  it("19. חול המועד פסח 14:00 → false", async () => {
    const { isShabbatOrYomTov } = await loadShabbat();
    // 2025-04-16 14:00 IL (IDT) = 11:00 UTC
    expect(isShabbatOrYomTov(new Date("2025-04-16T11:00:00Z"))).toBe(false);
  });

  // ═════ Yom Haatzmaut (May 1, 2025) ═════
  it("20. יום העצמאות 12:00 → false", async () => {
    const { isShabbatOrYomTov } = await loadShabbat();
    // 2025-05-01 12:00 IL (IDT) = 09:00 UTC
    expect(isShabbatOrYomTov(new Date("2025-05-01T09:00:00Z"))).toBe(false);
  });

  // ═════ Purim day (Mar 14, 2025) — Friday daytime ═════
  it("21. פורים 12:00 (יום שישי, לפני שבת) → false", async () => {
    const { isShabbatOrYomTov } = await loadShabbat();
    // 2025-03-14 12:00 IL (IST=+02 in March ≤ 28) = 10:00 UTC
    expect(isShabbatOrYomTov(new Date("2025-03-14T10:00:00Z"))).toBe(false);
  });

  // ═════ Chanukah weekday (Dec 16, 2025) ═════
  it("22. חנוכה יום רגיל 14:00 → false", async () => {
    const { isShabbatOrYomTov } = await loadShabbat();
    // 2025-12-16 14:00 IL (IST) = 12:00 UTC
    expect(isShabbatOrYomTov(new Date("2025-12-16T12:00:00Z"))).toBe(false);
  });

  // ═════ Tisha B'Av (Aug 3, 2025) ═════
  it("23. תשעה באב 14:00 → false (צום בלבד, לא יו״ט)", async () => {
    const { isShabbatOrYomTov } = await loadShabbat();
    // 2025-08-03 14:00 IL (IDT) = 11:00 UTC
    expect(isShabbatOrYomTov(new Date("2025-08-03T11:00:00Z"))).toBe(false);
  });
});

describe("isShabbatOrYomTov — תרחישי קצה", () => {
  // ═════ Rosh Hashana 5785 (Oct 2024) — RH adjacent to Shabbat = merged 73h ═════
  it("24. ר״ה 2024 צמודה לשבת — חלון מחובר 73 שעות → true באמצע", async () => {
    const { isShabbatOrYomTov, getShabbatStatus } = await loadShabbat();
    // 2024-10-04 15:00 IL (IDT) = 12:00 UTC — יום שישי באמצע הבלוק
    const date = new Date("2024-10-04T12:00:00Z");
    expect(isShabbatOrYomTov(date)).toBe(true);
    expect(getShabbatStatus(date).reason).toBe("YOM_TOV"); // chag dominates merged block
  });

  it("25. ר״ה 2024 צמודה לשבת — שבת עצמה עדיין בתוך הבלוק", async () => {
    const { isShabbatOrYomTov } = await loadShabbat();
    // 2024-10-05 10:00 IL = 07:00 UTC (שבת בוקר)
    expect(isShabbatOrYomTov(new Date("2024-10-05T07:00:00Z"))).toBe(true);
  });

  it("26. ר״ה 2024 צמודה לשבת — מיד אחרי הבדלה (19:15 IL) → false", async () => {
    const { isShabbatOrYomTov } = await loadShabbat();
    // 2024-10-05 19:15 IL = 16:15 UTC (אחרי 19:11 havdalah)
    expect(isShabbatOrYomTov(new Date("2024-10-05T16:15:00Z"))).toBe(false);
  });

  // ═════ Shabbat in Chanukah — Shabbat blocks, Chanukah alone doesn't ═════
  it("27. שבת חנוכה 14:00 → true (שבת, לא חנוכה)", async () => {
    const { isShabbatOrYomTov, getShabbatStatus } = await loadShabbat();
    // 2025-12-20 14:00 IL = 12:00 UTC — שבת חנוכה
    const date = new Date("2025-12-20T12:00:00Z");
    expect(isShabbatOrYomTov(date)).toBe(true);
    expect(getShabbatStatus(date).reason).toBe("SHABBAT");
  });

  // ═════ DST transition: Oct 25, 2025 (Shabbat before DST ends Oct 26 02:00) ═════
  it("28. שבת בזמן מעבר משעון קיץ לחורף — 17:45 IL (ביפול DST) → true", async () => {
    const { isShabbatOrYomTov } = await loadShabbat();
    // 2025-10-25 17:45 IL = 14:45 UTC (DST still active on Oct 25)
    expect(isShabbatOrYomTov(new Date("2025-10-25T14:45:00Z"))).toBe(true);
  });

  it("29. שבת בזמן מעבר DST — אחרי הבדלה 18:55 IL → false", async () => {
    const { isShabbatOrYomTov } = await loadShabbat();
    // 2025-10-25 18:55 IL = 15:55 UTC (after havdalah 18:50)
    expect(isShabbatOrYomTov(new Date("2025-10-25T15:55:00Z"))).toBe(false);
  });
});

describe("getShabbatStatus — מטא־דאטה", () => {
  it("30. SHABBAT regular — reason='SHABBAT' + endsAt + name + isDegraded=false", async () => {
    const { getShabbatStatus } = await loadShabbat();
    const status = getShabbatStatus(new Date("2025-12-13T10:00:00Z"));
    expect(status.isShabbat).toBe(true);
    expect(status.reason).toBe("SHABBAT");
    expect(status.endsAt).toBeInstanceOf(Date);
    expect(status.name).toBe("שבת");
    expect(status.isDegraded).toBe(false);
  });

  it("31. YOM_TOV — reason='YOM_TOV' + שם בעברית", async () => {
    const { getShabbatStatus } = await loadShabbat();
    const status = getShabbatStatus(new Date("2025-10-02T07:00:00Z")); // YK
    expect(status.isShabbat).toBe(true);
    expect(status.reason).toBe("YOM_TOV");
    // hebcal מחזיר את השם בניקוד — מסירים לפני ההשוואה
    const nameNoNikud = status.name?.replace(/[\u0591-\u05C7]/g, "");
    expect(nameNoNikud).toMatch(/כפור|יום/);
    expect(status.isDegraded).toBe(false);
  });

  it("32. יום רגיל — isShabbat=false, reason=null, isDegraded=false", async () => {
    const { getShabbatStatus } = await loadShabbat();
    const status = getShabbatStatus(new Date("2025-04-16T11:00:00Z")); // חוה"מ
    expect(status.isShabbat).toBe(false);
    expect(status.reason).toBeNull();
    expect(status.endsAt).toBeNull();
    expect(status.name).toBeNull();
    expect(status.isDegraded).toBe(false);
  });
});

describe("wasShabbatInLastHours — catch-up", () => {
  it("33. מוצ״ש 20:00 חורף — חזרה אחרי הבדלה 17:33 → true (72h default)", async () => {
    const { wasShabbatInLastHours } = await loadShabbat();
    // 2025-12-13 20:00 IL = 18:00 UTC — ~2.5h אחרי havdalah
    expect(wasShabbatInLastHours(new Date("2025-12-13T18:00:00Z"))).toBe(true);
  });

  it("34. 2 ימים אחרי מוצ״ש עדיין true ב-72h", async () => {
    const { wasShabbatInLastHours } = await loadShabbat();
    // 2025-12-15 18:00 UTC — 48h+ אחרי havdalah
    expect(wasShabbatInLastHours(new Date("2025-12-15T18:00:00Z"))).toBe(true);
  });

  it("35. 5 ימים אחרי מוצ״ש → false ב-72h", async () => {
    const { wasShabbatInLastHours } = await loadShabbat();
    // 2025-12-18 18:00 UTC — 120h+ אחרי havdalah
    expect(wasShabbatInLastHours(new Date("2025-12-18T18:00:00Z"))).toBe(false);
  });

  it("36. בתוך שבת (לפני havdalah) → false (עדיין לא יצאנו)", async () => {
    const { wasShabbatInLastHours } = await loadShabbat();
    // 2025-12-13 12:00 IL = 10:00 UTC
    expect(wasShabbatInLastHours(new Date("2025-12-13T10:00:00Z"))).toBe(false);
  });
});
