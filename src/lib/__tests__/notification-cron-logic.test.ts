import { describe, it, expect } from "vitest";
import { isInTimeWindow } from "@/lib/notification-utils";

describe("isInTimeWindow — חלון זמן לקרון", () => {
  it("בתוך החלון — בדיוק בשעת היעד", () => {
    // 08:00 = 480 דקות
    expect(isInTimeWindow(480, "08:00")).toBe(true);
  });

  it("בתוך החלון — 15 דקות אחרי השעה", () => {
    // 08:15 = 495 דקות
    expect(isInTimeWindow(495, "08:00")).toBe(true);
  });

  it("בתוך החלון — 29 דקות אחרי השעה", () => {
    // 08:29 = 509 דקות
    expect(isInTimeWindow(509, "08:00")).toBe(true);
  });

  it("מחוץ לחלון — דקה לפני השעה", () => {
    // 07:59 = 479 דקות
    expect(isInTimeWindow(479, "08:00")).toBe(false);
  });

  it("מחוץ לחלון — 30 דקות אחרי (סוף החלון)", () => {
    // 08:30 = 510 דקות
    expect(isInTimeWindow(510, "08:00")).toBe(false);
  });

  it("מחוץ לחלון — שעה אחרי", () => {
    // 09:00 = 540 דקות
    expect(isInTimeWindow(540, "08:00")).toBe(false);
  });

  it("עובד עם שעת ערב 20:00", () => {
    // 20:00 = 1200 דקות
    expect(isInTimeWindow(1200, "20:00")).toBe(true);
    expect(isInTimeWindow(1229, "20:00")).toBe(true);
    expect(isInTimeWindow(1230, "20:00")).toBe(false);
    expect(isInTimeWindow(1199, "20:00")).toBe(false);
  });

  it("חלון מותאם אישית (15 דקות)", () => {
    expect(isInTimeWindow(480, "08:00", 15)).toBe(true);
    expect(isInTimeWindow(494, "08:00", 15)).toBe(true);
    expect(isInTimeWindow(495, "08:00", 15)).toBe(false);
  });

  it("שעת ערב 08:45 (באג!) — לא נופלת בחלון 16:00-23:00", () => {
    // 08:45 = 525 דקות
    // בשעה 20:00 (1200 דקות): 1200 >= 525 אבל 1200 < 555 = false
    expect(isInTimeWindow(1200, "08:45")).toBe(false);
    // בשעה 08:45 (525 דקות): 525 >= 525 וגם 525 < 555 = true
    // אבל הקרון לא רץ בשעה 08:45 לסיכום ערב!
    expect(isInTimeWindow(525, "08:45")).toBe(true);
  });
});
