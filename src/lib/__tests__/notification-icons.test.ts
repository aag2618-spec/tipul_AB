import { describe, it, expect } from "vitest";
import {
  NOTIFICATION_TYPES,
  getNotificationIconInfo,
} from "@/lib/notification-utils";

describe("getNotificationIconInfo — מיפוי אייקונים", () => {
  it("כל 10 סוגי ההתראות מכוסים עם אייקון שאינו ברירת מחדל", () => {
    for (const type of NOTIFICATION_TYPES) {
      const info = getNotificationIconInfo(type);
      // CUSTOM ו-PENDING_TASKS מקבלים list-todo, לא bell (ברירת מחדל)
      if (type === "CUSTOM" || type === "PENDING_TASKS") {
        expect(info.icon).toBe("list-todo");
      } else {
        expect(info.icon).not.toBe("bell");
      }
      expect(info.color).toBeTruthy();
    }
  });

  it("סוג לא מוכר מחזיר אייקון ברירת מחדל (bell)", () => {
    const info = getNotificationIconInfo("UNKNOWN_TYPE");
    expect(info.icon).toBe("bell");
    expect(info.color).toBe("text-gray-500");
  });

  it("MORNING_SUMMARY מקבל אייקון שמש", () => {
    const info = getNotificationIconInfo("MORNING_SUMMARY");
    expect(info.icon).toBe("sun");
    expect(info.color).toBe("text-amber-500");
  });

  it("EVENING_SUMMARY מקבל אייקון ירח", () => {
    const info = getNotificationIconInfo("EVENING_SUMMARY");
    expect(info.icon).toBe("moon");
    expect(info.color).toBe("text-indigo-500");
  });

  it("PAYMENT_REMINDER מקבל אייקון כרטיס אשראי", () => {
    const info = getNotificationIconInfo("PAYMENT_REMINDER");
    expect(info.icon).toBe("credit-card");
    expect(info.color).toBe("text-red-500");
  });

  it("CANCELLATION_REQUEST מקבל אייקון X כתום", () => {
    const info = getNotificationIconInfo("CANCELLATION_REQUEST");
    expect(info.icon).toBe("x-circle");
    expect(info.color).toBe("text-orange-500");
  });

  it("EMAIL_RECEIVED ו-EMAIL_SENT מקבלים אותו אייקון מייל", () => {
    const received = getNotificationIconInfo("EMAIL_RECEIVED");
    const sent = getNotificationIconInfo("EMAIL_SENT");
    expect(received.icon).toBe("mail");
    expect(sent.icon).toBe("mail");
    expect(received.color).toBe(sent.color);
  });
});
