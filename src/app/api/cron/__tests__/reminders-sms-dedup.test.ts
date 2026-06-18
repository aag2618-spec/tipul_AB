/**
 * Unit tests — dedup ל-SMS בתזכורות 24h/2h (סבב אבטחה 2026-06-18).
 *
 * חוב: ה-dedup חסם רק EMAIL-SENT. כש-sendEmail נכשל (FAILED) ה-route לא דילג,
 * וה-SMS נשלח שוב בכל ריצה של המתזמן (כל 15 דק') — הצפת המטופל + בזבוז קרדיט.
 * התיקון: בדיקת CommunicationLog(channel:"SMS", status:"SENT") לפני sendSMSIfEnabled.
 *
 * הבדיקה מאמתת ששני המסלולים (reminders ו-reminders-2h) מדלגים על שליחת SMS
 * כשכבר קיים SMS-SENT לאותה פגישה, ושולחים פעם אחת כשאין.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";

const findManySessions = vi.fn();
const findManyUsers = vi.fn();
const logFindFirst = vi.fn();
const logCreate = vi.fn();
const sendEmail = vi.fn();
const sendSMSIfEnabled = vi.fn();

vi.mock("@/lib/prisma", () => ({
  default: {
    therapySession: { findMany: (...a: unknown[]) => findManySessions(...a) },
    user: { findMany: (...a: unknown[]) => findManyUsers(...a) },
    communicationLog: {
      findFirst: (...a: unknown[]) => logFindFirst(...a),
      create: (...a: unknown[]) => logCreate(...a),
    },
  },
}));
vi.mock("@/lib/resend", () => ({ sendEmail: (...a: unknown[]) => sendEmail(...a) }));
vi.mock("@/lib/sms", () => ({
  sendSMSIfEnabled: (...a: unknown[]) => sendSMSIfEnabled(...a),
}));
vi.mock("@/lib/email-templates", () => ({
  create24HourReminderEmail: () => ({ subject: "תזכורת", html: "<p>hi</p>" }),
  create2HourReminderEmail: () => ({ subject: "תזכורת", html: "<p>hi</p>" }),
  formatSessionDateTime: () => ({ date: "01/07/2026", time: "10:00" }),
}));
vi.mock("@/lib/shabbat", () => ({
  isShabbatOrYomTov: () => false,
  wasShabbatInLastHours: () => false,
}));
vi.mock("@/lib/cron-auth", () => ({ checkCronAuth: () => Promise.resolve(null) }));
vi.mock("@/lib/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { GET as GET24 } from "../reminders/route";
import { GET as GET2H } from "../reminders-2h/route";

type NReq = import("next/server").NextRequest;
function req(): NReq {
  return new Request("https://test.local/api/cron/reminders", {
    method: "GET",
  }) as unknown as NReq;
}

const SESSION = {
  id: "session-1",
  startTime: new Date("2026-07-01T10:00:00Z"),
  location: "חדר 1",
  clientId: "client-1",
  therapistId: "therapist-1",
  client: {
    name: "ישראל ישראלי",
    firstName: "ישראל",
    email: "test@example.com",
    phone: "050-1111111",
  },
  therapist: { name: "ד\"ר כהן", communicationSetting: { send24hReminder: true } },
};

const SETTINGS_2H = {
  send2hReminder: true,
  customReminderEnabled: false,
  customReminderHours: 2,
  templateReminderCustomSMS: null,
  customGreeting: null,
  customClosing: null,
  emailSignature: null,
  businessHours: null,
};

// משתנה שנקרא בזמן הקריאה ל-findFirst (closure) — שולט אם כבר קיים SMS-SENT.
let smsAlreadySent = false;

beforeEach(() => {
  vi.resetAllMocks();
  smsAlreadySent = false;
  // EMAIL dedup תמיד null (מאפשר שליחת מייל); SMS dedup לפי הדגל.
  logFindFirst.mockImplementation((args: { where: { channel: string } }) => {
    if (args.where.channel === "SMS") {
      return Promise.resolve(smsAlreadySent ? { id: "log-sms" } : null);
    }
    return Promise.resolve(null);
  });
  logCreate.mockResolvedValue({});
  sendEmail.mockResolvedValue({ success: true, messageId: "m1" });
  sendSMSIfEnabled.mockResolvedValue({ success: true });
  findManySessions.mockResolvedValue([{ ...SESSION }]);
  findManyUsers.mockResolvedValue([
    { id: "therapist-1", name: "ד\"ר כהן", communicationSetting: SETTINGS_2H },
  ]);
});

describe("cron reminders 24h — dedup ל-SMS", () => {
  it("כש-SMS כבר נשלח → לא שולח שוב", async () => {
    smsAlreadySent = true;
    const res = await GET24(req());
    expect(res.status).toBe(200);
    expect(sendSMSIfEnabled).not.toHaveBeenCalled();
  });

  it("כשאין SMS קודם → שולח פעם אחת", async () => {
    smsAlreadySent = false;
    const res = await GET24(req());
    expect(res.status).toBe(200);
    expect(sendSMSIfEnabled).toHaveBeenCalledTimes(1);
  });
});

describe("cron reminders 2h — dedup ל-SMS", () => {
  it("כש-SMS כבר נשלח → לא שולח שוב", async () => {
    smsAlreadySent = true;
    const res = await GET2H(req());
    expect(res.status).toBe(200);
    expect(sendSMSIfEnabled).not.toHaveBeenCalled();
  });

  it("כשאין SMS קודם → שולח פעם אחת", async () => {
    smsAlreadySent = false;
    const res = await GET2H(req());
    expect(res.status).toBe(200);
    expect(sendSMSIfEnabled).toHaveBeenCalledTimes(1);
  });
});

// התרחיש שהוליד את החוב: מייל נכשל (FAILED) — ה-dedup ל-SMS עצמאי מהמייל,
// כך שה-SMS נשלח *פעם אחת* (ולא נחסם בטעות, וגם לא חוזר — ראה טסטי ה-dedup לעיל).
describe("cron reminders — מייל נכשל, SMS עצמאי", () => {
  it("24h: מייל נכשל ואין SMS קודם → SMS נשלח פעם אחת", async () => {
    smsAlreadySent = false;
    sendEmail.mockResolvedValue({ success: false, error: "smtp error" });
    const res = await GET24(req());
    expect(res.status).toBe(200);
    expect(sendSMSIfEnabled).toHaveBeenCalledTimes(1);
  });

  it("2h: מייל נכשל ואין SMS קודם → SMS נשלח פעם אחת", async () => {
    smsAlreadySent = false;
    sendEmail.mockResolvedValue({ success: false, error: "smtp error" });
    const res = await GET2H(req());
    expect(res.status).toBe(200);
    expect(sendSMSIfEnabled).toHaveBeenCalledTimes(1);
  });
});
