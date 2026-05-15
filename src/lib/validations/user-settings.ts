// H12: zod schemas ל-/api/user/* settings —
//   business-settings, communication-settings, notification-settings,
//   booking-settings/send-link.

import { z } from "zod";
import { zId } from "./shared";

const MAX_BUSINESS_NAME = 200;
const MAX_BUSINESS_ID = 20;
const MAX_BUSINESS_PHONE = 30;
const MAX_BUSINESS_ADDRESS = 500;
const MAX_RECEIPT_NUMBER = 999_999_999;
const MAX_TEMPLATE_LEN = 2_000;
const MAX_URL_LEN = 2_000;
const MAX_CUSTOM_MESSAGE = 1_000;
const MAX_CLIENT_BATCH = 50;

// helper: string?-עם-trim שתומך ב-null/"" (ניקוי השדה).
const optionalNullableString = (max: number, label: string) =>
  z
    .union([
      z.string().max(max, `${label} ארוך מדי (מקסימום ${max} תווים)`),
      z.null(),
    ])
    .optional();

// === PUT /api/user/business-settings ===========================================
export const updateBusinessSettingsSchema = z
  .object({
    businessType: z.enum(["NONE", "EXEMPT", "LICENSED"]).optional().nullable(),
    businessName: optionalNullableString(MAX_BUSINESS_NAME, "שם עסק"),
    businessIdNumber: optionalNullableString(MAX_BUSINESS_ID, "מספר עוסק/ח.פ."),
    businessPhone: optionalNullableString(MAX_BUSINESS_PHONE, "טלפון עסק"),
    businessAddress: optionalNullableString(MAX_BUSINESS_ADDRESS, "כתובת עסק"),
    nextReceiptNumber: z
      .number()
      .int("מספר קבלה הבא חייב להיות מספר שלם")
      .min(1, "מספר קבלה הבא חייב להיות חיובי")
      .max(
        MAX_RECEIPT_NUMBER,
        `מספר קבלה הבא לא יכול לעבור ${MAX_RECEIPT_NUMBER}`
      )
      .optional()
      .nullable(),
    receiptDefaultMode: z
      .enum(["ALWAYS", "ASK", "NEVER"])
      .optional()
      .nullable(),
  })
  .strict();
export type UpdateBusinessSettingsInput = z.infer<
  typeof updateBusinessSettingsSchema
>;

// === PUT /api/user/communication-settings ======================================
// M-XSS-1: paymentLink/logoUrl יוטמעו ב-HTML emails — חיוני לחסום
// javascript:/data:/vbscript:/file: וכל סכמה לא-http(s).
const safeHttpUrl = z
  .string()
  .max(MAX_URL_LEN, "כתובת URL ארוכה מדי")
  .refine(
    (val) => {
      if (val.length === 0) return true; // empty = clear
      try {
        const url = new URL(val);
        return url.protocol === "http:" || url.protocol === "https:";
      } catch {
        return false;
      }
    },
    {
      message:
        "כתובת לא תקינה — יש להזין URL מלא עם https:// (כתובות javascript:/data: חסומות).",
    }
  );

const safeHttpUrlOptional = z
  .union([safeHttpUrl, z.null(), z.literal("")])
  .optional();

const textField = (label: string, max = MAX_TEMPLATE_LEN) =>
  z
    .union([
      z.string().max(max, `${label} ארוך מדי (מקסימום ${max} תווים)`),
      z.null(),
    ])
    .optional();

const optionalBool = z.boolean().optional();
const optionalInt = z.number().int().optional();
const optionalNumber = z.number().optional();

export const updateCommunicationSettingsSchema = z
  .object({
    sendConfirmationEmail: optionalBool,
    send24hReminder: optionalBool,
    send2hReminder: optionalBool,
    customReminderEnabled: optionalBool,
    customReminderHours: optionalInt,
    allowClientCancellation: optionalBool,
    minCancellationHours: optionalInt,
    sendDebtReminders: optionalBool,
    debtReminderDayOfMonth: optionalInt,
    debtReminderMinAmount: optionalNumber,
    sendPaymentReceipt: optionalBool,
    sendReceiptToClient: optionalBool,
    sendReceiptToTherapist: optionalBool,
    receiptEmailTemplate: textField("תבנית מייל קבלה"),
    paymentInstructions: textField("הוראות תשלום"),
    paymentLink: safeHttpUrlOptional,
    emailSignature: textField("חתימת מייל"),
    logoUrl: safeHttpUrlOptional,
    customGreeting: textField("ברכת פתיחה"),
    customClosing: textField("ברכת סיום"),
    businessHours: textField("שעות פעילות"),
    // SMS toggles
    sendBookingConfirmationSMS: optionalBool,
    sendReminder24hSMS: optionalBool,
    sendReminderCustomSMS: optionalBool,
    sendCancellationSMS: optionalBool,
    sendSessionChangeSMS: optionalBool,
    sendNoShowSMS: optionalBool,
    sendDebtReminderSMS: optionalBool,
    // New email toggles
    sendCancellationEmail: optionalBool,
    sendSessionChangeEmail: optionalBool,
    sendNoShowEmail: optionalBool,
    // SMS quota — usage NOT writable; ה-schema מקבל אותו (כי ה-UI שולח GET-payload
    // חזרה ב-save), אבל ה-route מתעלם ממנו ולא מעדכן ב-DB.
    smsMonthlyQuota: optionalInt,
    smsMonthlyUsage: optionalInt,
    smsAlertAtPercent: optionalInt,
    // SMS templates
    templateBookingConfirmSMS: textField("תבנית SMS אישור"),
    templateReminder24hSMS: textField("תבנית SMS תזכורת 24ש"),
    templateReminderCustomSMS: textField("תבנית SMS תזכורת מותאמת"),
    templateCancellationSMS: textField("תבנית SMS ביטול"),
    templateSessionChangeSMS: textField("תבנית SMS שינוי"),
    templateNoShowSMS: textField("תבנית SMS אי-הגעה"),
    templateDebtReminderSMS: textField("תבנית SMS חוב"),
  })
  .strict();
export type UpdateCommunicationSettingsInput = z.infer<
  typeof updateCommunicationSettingsSchema
>;

// === PUT /api/user/notification-settings =======================================
// HH:MM או null/"" (ניקוי).
const hhmmOrEmptyOrNull = z
  .union([
    z.literal(""),
    z.null(),
    z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "שעה חייבת להיות בפורמט HH:MM"),
  ])
  .optional();

export const updateNotificationSettingsSchema = z
  .object({
    emailEnabled: z.boolean().optional(),
    pushEnabled: z.boolean().optional(),
    debtThresholdDays: z
      .number()
      .int("ימי חוב לפני התראה חייבים להיות מספר שלם")
      .min(0, "ימי חוב חייבים להיות 0 או יותר")
      .max(365, "ימי חוב לא יכולים לעבור 365")
      .optional()
      .nullable(),
    monthlyReminderDay: z
      .number()
      .int("יום בחודש חייב להיות מספר שלם")
      .min(1, "יום בחודש חייב להיות בין 1 ל-31")
      .max(31, "יום בחודש חייב להיות בין 1 ל-31")
      .optional()
      .nullable(),
    morningTime: hhmmOrEmptyOrNull,
    eveningTime: hhmmOrEmptyOrNull,
  })
  .strict();
export type UpdateNotificationSettingsInput = z.infer<
  typeof updateNotificationSettingsSchema
>;

// === POST /api/user/booking-settings/send-link =================================
export const sendBookingLinkSchema = z
  .object({
    clientIds: z
      .array(zId)
      .min(1, "חובה לבחור לפחות מטופל אחד")
      .max(MAX_CLIENT_BATCH, `ניתן לשלוח עד ${MAX_CLIENT_BATCH} מטופלים בפעם אחת`),
    customMessage: z
      .string()
      .max(
        MAX_CUSTOM_MESSAGE,
        `הודעה מותאמת ארוכה מדי (מקסימום ${MAX_CUSTOM_MESSAGE} תווים)`
      )
      .optional(),
  })
  .strict();
export type SendBookingLinkInput = z.infer<typeof sendBookingLinkSchema>;
