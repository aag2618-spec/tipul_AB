/**
 * Unit tests — dedup ל-SMS בתזכורות חוב (debt-reminders) — סבב אבטחה 2026-06-18.
 *
 * חוב (זהה לזה שתוקן ב-reminders 24h/2h): ה-dedup חסם רק EMAIL-SENT (בדיקת
 * subject "תזכורת תשלום"). כשאין מייל ללקוח (רק טלפון), או כש-EMAIL-log נכשל,
 * ה-SMS עלול להישלח שוב בריצה הבאה של ה-cron — SMS כפול + בזבוז קרדיט (כסף).
 * התיקון: בדיקת CommunicationLog(type:"DEBT_REMINDER", channel:"SMS", status:"SENT")
 * לאותו לקוח בחלון החודש לפני sendSMSIfEnabled — סימטרי ל-dedup של המייל.
 *
 * כסף מעורב → TDD.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const settingFindMany = vi.fn();
const clientFindMany = vi.fn();
const logFindMany = vi.fn();
const logFindFirst = vi.fn();
const logCreate = vi.fn();
const notificationCreate = vi.fn();
const sendEmail = vi.fn();
const sendSMSIfEnabled = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    communicationSetting: { findMany: (...a: unknown[]) => settingFindMany(...a) },
    client: { findMany: (...a: unknown[]) => clientFindMany(...a) },
    communicationLog: {
      findMany: (...a: unknown[]) => logFindMany(...a),
      findFirst: (...a: unknown[]) => logFindFirst(...a),
      create: (...a: unknown[]) => logCreate(...a),
    },
    notification: { create: (...a: unknown[]) => notificationCreate(...a) },
  },
}));
vi.mock("@/lib/resend", () => ({ sendEmail: (...a: unknown[]) => sendEmail(...a) }));
vi.mock("@/lib/sms", () => ({
  sendSMSIfEnabled: (...a: unknown[]) => sendSMSIfEnabled(...a),
}));
vi.mock("@/lib/payment-utils", () => ({ calculateSessionDebt: () => 100 }));
vi.mock("@/lib/email-utils", () => ({
  escapeHtml: (s: string) => s,
  safeHttpUrl: () => null,
}));
vi.mock("@/lib/shabbat", () => ({ isShabbatOrYomTov: () => false }));
vi.mock("@/lib/cron-auth", () => ({ checkCronAuth: () => Promise.resolve(null) }));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { GET } from "../debt-reminders/route";

type NReq = import("next/server").NextRequest;
function req(): NReq {
  return new Request("https://test.local/api/cron/debt-reminders", {
    method: "GET",
  }) as unknown as NReq;
}

const SETTING = {
  user: { id: "therapist-1", name: 'ד"ר כהן' },
  debtReminderMinAmount: 0,
  customGreeting: null,
  customClosing: null,
  emailSignature: null,
  paymentInstructions: null,
  paymentLink: null,
  businessHours: null,
  templateDebtReminderSMS: null,
};

const CLIENT = {
  id: "client-1",
  name: "ישראל ישראלי",
  firstName: "ישראל",
  email: "test@example.com",
  phone: "050-1111111",
  therapySessions: [
    {
      startTime: new Date("2026-06-01T10:00:00Z"),
      type: "ONLINE",
      status: "COMPLETED",
      payment: { status: "PENDING" },
    },
  ],
};

// משתנה שנקרא בזמן הקריאה ל-findFirst (closure) — שולט אם כבר קיים SMS-SENT.
let smsAlreadySent = false;

beforeEach(() => {
  vi.resetAllMocks();
  smsAlreadySent = false;
  // EMAIL dedup (findMany) תמיד [] (מאפשר שליחת מייל); SMS dedup (findFirst) לפי הדגל.
  logFindMany.mockResolvedValue([]);
  logFindFirst.mockImplementation((args: { where: { channel: string } }) => {
    if (args?.where?.channel === "SMS") {
      return Promise.resolve(smsAlreadySent ? { id: "log-sms" } : null);
    }
    return Promise.resolve(null);
  });
  logCreate.mockResolvedValue({});
  notificationCreate.mockResolvedValue({});
  sendEmail.mockResolvedValue({ success: true, messageId: "m1" });
  sendSMSIfEnabled.mockResolvedValue({ success: true });
  settingFindMany.mockResolvedValue([{ ...SETTING }]);
  clientFindMany.mockResolvedValue([{ ...CLIENT }]);
});

describe("cron debt-reminders — dedup ל-SMS", () => {
  it("כש-SMS חוב כבר נשלח החודש → לא שולח שוב", async () => {
    smsAlreadySent = true;
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(sendSMSIfEnabled).not.toHaveBeenCalled();
  });

  it("כשאין SMS חוב קודם → שולח פעם אחת", async () => {
    smsAlreadySent = false;
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(sendSMSIfEnabled).toHaveBeenCalledTimes(1);
  });

  // התרחיש שהוליד את החוב: כתיבת ה-EMAIL-log נכשלת / אין מייל — ה-dedup ל-SMS
  // עצמאי, כך שה-SMS נשלח *פעם אחת* בלבד (ולא חוזר בכל ריצה).
  it("מייל נכשל ואין SMS קודם → SMS נשלח פעם אחת", async () => {
    smsAlreadySent = false;
    sendEmail.mockResolvedValue({ success: false, error: "smtp error" });
    const res = await GET(req());
    expect(res.status).toBe(200);
    expect(sendSMSIfEnabled).toHaveBeenCalledTimes(1);
  });
});
