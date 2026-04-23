// Email templates for cancellation requests and session communications

import { escapeHtml } from "./email-utils";

export interface EmailCustomization {
  customGreeting?: string | null;
  customClosing?: string | null;
  emailSignature?: string | null;
  businessHours?: string | null;
}

export interface EmailTemplateData {
  clientName: string;
  therapistName: string;
  date: string;
  time: string;
  reason?: string;
  rejectionReason?: string;
  dashboardLink?: string;
  address?: string;
  customization?: EmailCustomization | null;
}

function formatEmailDate(date: Date): string {
  return date.toLocaleDateString('he-IL', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: 'Asia/Jerusalem',
  });
}

function formatEmailTime(date: Date): string {
  return date.toLocaleTimeString('he-IL', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Jerusalem',
  });
}

export function formatSessionDateTime(date: Date): { date: string; time: string } {
  return {
    date: formatEmailDate(date),
    time: formatEmailTime(date),
  };
}

// פונקציות עזר להתאמה אישית
function getGreeting(clientName: string, customization?: EmailCustomization | null): string {
  if (customization?.customGreeting) {
    return customization.customGreeting.replace(/{שם}/g, clientName);
  }
  return `שלום ${clientName}`;
}

function getFooter(therapistName: string, customization?: EmailCustomization | null): string {
  const closing = customization?.customClosing || "בברכה";
  const signature = customization?.emailSignature || therapistName;
  const hours = customization?.businessHours
    ? `<p style="color: #9ca3af; font-size: 12px; margin-top: 12px;">⏰ ${customization.businessHours}</p>`
    : "";
  return `
    <p style="color: #666; font-size: 14px; margin-top: 30px;">
      ${closing},<br/>
      ${signature}
    </p>
    ${hours}
  `;
}

// Base email template wrapper
function wrapInEmailTemplate(content: string): string {
  return `
    <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; line-height: 1.6;">
      ${content}
    </div>
  `;
}

// ==================== Session Confirmation ====================
export function createSessionConfirmationEmail(data: EmailTemplateData) {
  return {
    subject: `אישור תור - ${data.therapistName}`,
    html: wrapInEmailTemplate(`
      <h2 style="color: #333;">${getGreeting(data.clientName, data.customization)},</h2>
      <p>תורך אושר בהצלחה!</p>
      <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 8px 0;"><strong>📅 תאריך:</strong> ${data.date}</p>
        <p style="margin: 8px 0;"><strong>🕐 שעה:</strong> ${data.time}</p>
        <p style="margin: 8px 0;"><strong>👤 מטפל/ת:</strong> ${data.therapistName}</p>
        ${data.address ? `<p style="margin: 8px 0;"><strong>📍 כתובת:</strong> ${data.address}</p>` : ''}
      </div>
      <p>לביטול או שינוי תור, נא ליצור קשר לפחות 24 שעות מראש.</p>
      ${getFooter(data.therapistName, data.customization)}
    `),
  };
}

// ==================== 24 Hour Reminder ====================
export function create24HourReminderEmail(data: EmailTemplateData) {
  return {
    subject: `תזכורת: תור מחר ב-${data.time}`,
    html: wrapInEmailTemplate(`
      <h2 style="color: #333;">${getGreeting(data.clientName, data.customization)},</h2>
      <p>מזכירים לך שיש לך תור מחר:</p>
      <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 8px 0;"><strong>📅 מחר,</strong> ${data.date}</p>
        <p style="margin: 8px 0;"><strong>🕐 שעה:</strong> ${data.time}</p>
      </div>
      <p>נשמח לראותך!</p>
      <p>לביטול, נא ליצור קשר בהקדם.</p>
      ${getFooter(data.therapistName, data.customization)}
    `),
  };
}

// ==================== 2 Hour Reminder ====================
export function create2HourReminderEmail(data: EmailTemplateData) {
  return {
    subject: `תזכורת: תור בעוד שעתיים`,
    html: wrapInEmailTemplate(`
      <h2 style="color: #333;">${getGreeting(data.clientName, data.customization)},</h2>
      <p>תור בעוד שעתיים!</p>
      <div style="background: #e8f5e9; padding: 20px; border-radius: 8px; margin: 20px 0;">
        <p style="margin: 8px 0;"><strong>🕐 היום בשעה:</strong> ${data.time}</p>
        ${data.address ? `<p style="margin: 8px 0;"><strong>📍 כתובת:</strong> ${data.address}</p>` : ''}
      </div>
      <p>נתראה בקרוב!</p>
      ${getFooter(data.therapistName, data.customization)}
    `),
  };
}

// ==================== Cancellation Request - To Client ====================
export function createCancellationRequestToClientEmail(data: EmailTemplateData) {
  return {
    subject: `בקשת ביטול התקבלה`,
    html: wrapInEmailTemplate(`
      <h2 style="color: #333;">${getGreeting(data.clientName, data.customization)},</h2>
      <p>בקשתך לביטול התור התקבלה.</p>
      <div style="background: #fff3e0; padding: 20px; border-radius: 8px; margin: 20px 0; border-right: 4px solid #ff9800;">
        <p style="margin: 8px 0;"><strong>📅 תור:</strong> ${data.date} בשעה ${data.time}</p>
      </div>
      <p>המטפל/ת יבדוק את הבקשה ויעדכן אותך בהקדם.</p>
      ${getFooter(data.therapistName, data.customization)}
    `),
  };
}

// ==================== Cancellation Request - To Therapist ====================
export function createCancellationRequestToTherapistEmail(data: EmailTemplateData) {
  return {
    subject: `🔔 בקשת ביטול חדשה - ${data.clientName}`,
    html: wrapInEmailTemplate(`
      <h2 style="color: #333;">יש לך בקשת ביטול חדשה ממתינה לאישור</h2>
      <div style="background: #fff3e0; padding: 20px; border-radius: 8px; margin: 20px 0; border-right: 4px solid #ff9800;">
        <p style="margin: 8px 0;"><strong>👤 מטופל/ת:</strong> ${data.clientName}</p>
        <p style="margin: 8px 0;"><strong>📅 תור:</strong> ${data.date} בשעה ${data.time}</p>
        ${data.reason ? `<p style="margin: 8px 0;"><strong>💬 סיבה:</strong> ${data.reason}</p>` : ''}
      </div>
      <p>היכנס/י למערכת לאישור או דחייה.</p>
      ${data.dashboardLink ? `
        <p style="margin-top: 20px;">
          <a href="${data.dashboardLink}" style="display: inline-block; background: #0ea5e9; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px;">
            צפייה בבקשה
          </a>
        </p>
      ` : ''}
    `),
  };
}

// ==================== Cancellation Approved ====================
export function createCancellationApprovedEmail(data: EmailTemplateData) {
  return {
    subject: `ביטול התור אושר`,
    html: wrapInEmailTemplate(`
      <h2 style="color: #333;">${getGreeting(data.clientName, data.customization)},</h2>
      <p>ביטול התור אושר.</p>
      <div style="background: #ffebee; padding: 20px; border-radius: 8px; margin: 20px 0; border-right: 4px solid #f44336;">
        <p style="margin: 8px 0;"><strong>❌ תור מבוטל:</strong> ${data.date} בשעה ${data.time}</p>
      </div>
      <p>לקביעת תור חדש, ניתן ליצור קשר או להיכנס למערכת.</p>
      ${getFooter(data.therapistName, data.customization)}
    `),
  };
}

// ==================== Cancellation Rejected ====================
export function createCancellationRejectedEmail(data: EmailTemplateData) {
  return {
    subject: `בקשת ביטול נדחתה`,
    html: wrapInEmailTemplate(`
      <h2 style="color: #333;">${getGreeting(data.clientName, data.customization)},</h2>
      <p>בקשתך לביטול התור נדחתה.</p>
      <div style="background: #e8f5e9; padding: 20px; border-radius: 8px; margin: 20px 0; border-right: 4px solid #4caf50;">
        <p style="margin: 8px 0;"><strong>📅 התור נשאר על כנו:</strong> ${data.date} בשעה ${data.time}</p>
      </div>
      ${data.rejectionReason ? `
        <div style="background: #f5f5f5; padding: 15px; border-radius: 8px; margin: 20px 0;">
          <p style="margin: 0;"><strong>💬 סיבה:</strong> ${data.rejectionReason}</p>
        </div>
      ` : ''}
      <p>לשאלות נוספות, ניתן ליצור קשר.</p>
      ${getFooter(data.therapistName, data.customization)}
    `),
  };
}

// ==================== Admin Email Templates ====================

/**
 * תבניות מייל מוכנות לשימוש באדמין
 * ניתן להעתיק ולשלוח מהמערכת
 */

export interface AdminEmailTemplate {
  subject: string;
  body: string;
  placeholders: string[];
}

export const ADMIN_EMAIL_TEMPLATES: Record<string, AdminEmailTemplate> = {
  // תזכורת תשלום
  PAYMENT_REMINDER: {
    subject: "תזכורת תשלום - טיפול",
    body: `שלום {שם},

רצינו להזכיר שיש תשלום פתוח בסכום ₪{סכום}.

ניתן לשלם באמצעות:
- העברה בנקאית
- אשראי
- מזומן בפגישה הבאה

לכל שאלה אנחנו כאן.

בברכה,
{שם_מטפל}`,
    placeholders: ["{שם}", "{סכום}", "{שם_מטפל}"],
  },

  // תשלום באיחור
  PAYMENT_OVERDUE: {
    subject: "תשלום ממתין - נשמח לסגור",
    body: `שלום {שם},

שמנו לב שיש תשלום פתוח מתאריך {תאריך} בסכום ₪{סכום}.

אשמח אם נוכל להסדיר את התשלום.
אם יש קושי כלשהו, אנא צרו קשר ונמצא פתרון יחד.

בברכה,
{שם_מטפל}`,
    placeholders: ["{שם}", "{תאריך}", "{סכום}", "{שם_מטפל}"],
  },

  // חידוש מנוי
  SUBSCRIPTION_RENEWAL: {
    subject: "המנוי שלך עומד להתחדש",
    body: `שלום {שם},

המנוי שלך במערכת טיפול עומד להתחדש בתאריך {תאריך}.

פרטי התוכנית:
- תוכנית: {תוכנית}
- מחיר: ₪{מחיר}/חודש

אם ברצונך לשנות תוכנית או לבטל, אנא צור קשר לפני תאריך החידוש.

בברכה,
צוות טיפול`,
    placeholders: ["{שם}", "{תאריך}", "{תוכנית}", "{מחיר}"],
  },

  // מנוי פג
  SUBSCRIPTION_EXPIRED: {
    subject: "המנוי שלך פג - חדש עכשיו",
    body: `שלום {שם},

המנוי שלך במערכת טיפול פג בתאריך {תאריך}.

כרגע אין לך גישה לתכונות המערכת.
לחידוש המנוי, אנא היכנס למערכת או צור קשר.

נשמח לראותך חוזר!

בברכה,
צוות טיפול`,
    placeholders: ["{שם}", "{תאריך}"],
  },

  // ברוכים הבאים
  WELCOME: {
    subject: "ברוכים הבאים למערכת טיפול!",
    body: `שלום {שם},

שמחים שהצטרפת למערכת טיפול!

התוכנית שלך: {תוכנית}

כמה דברים שכדאי לדעת:
• הוספת מטופלים - לחץ על "מטופלים" > "הוסף מטופל"
• קביעת פגישות - בלוח השנה או מדף המטופל
• ניהול תשלומים - במסך "תשלומים"

לכל שאלה, אנחנו כאן.

בהצלחה!
צוות טיפול`,
    placeholders: ["{שם}", "{תוכנית}"],
  },

  // שדרוג תוכנית
  TIER_UPGRADE: {
    subject: "התוכנית שלך שודרגה!",
    body: `שלום {שם},

שמחים לבשר שהתוכנית שלך שודרגה ל-{תוכנית_חדשה}!

מה חדש בתוכנית שלך:
{תכונות_חדשות}

התחל להשתמש בתכונות החדשות עכשיו.

בברכה,
צוות טיפול`,
    placeholders: ["{שם}", "{תוכנית_חדשה}", "{תכונות_חדשות}"],
  },
};

/**
 * החלפת placeholders בתבנית
 */
export function fillTemplate(
  template: AdminEmailTemplate,
  values: Record<string, string>
): { subject: string; body: string } {
  let subject = template.subject;
  let body = template.body;

  Object.entries(values).forEach(([key, value]) => {
    const placeholder = key.startsWith("{") ? key : `{${key}}`;
    subject = subject.replace(new RegExp(placeholder, "g"), value);
    body = body.replace(new RegExp(placeholder, "g"), value);
  });

  return { subject, body };
}

/**
 * קבלת תבנית לפי סוג התראה
 */
export function getTemplateForAlertType(alertType: string): AdminEmailTemplate | null {
  switch (alertType) {
    case "PAYMENT_DUE":
    case "PAYMENT_OVERDUE":
      return ADMIN_EMAIL_TEMPLATES.PAYMENT_OVERDUE;
    case "PAYMENT_FAILED":
      return ADMIN_EMAIL_TEMPLATES.PAYMENT_OVERDUE;
    case "SUBSCRIPTION_EXPIRING":
      return ADMIN_EMAIL_TEMPLATES.SUBSCRIPTION_RENEWAL;
    case "SUBSCRIPTION_EXPIRED":
      return ADMIN_EMAIL_TEMPLATES.SUBSCRIPTION_EXPIRED;
    case "NEW_USER":
      return ADMIN_EMAIL_TEMPLATES.WELCOME;
    case "TIER_CHANGE_REQUEST":
      return ADMIN_EMAIL_TEMPLATES.TIER_UPGRADE;
    default:
      return null;
  }
}

export function createVerificationEmailHtml(params: {
  name: string;
  verifyUrl: string;
  trialDays: number;
  trialTier: string;
}): { subject: string; html: string } {
  const { name, verifyUrl, trialDays, trialTier } = params;
  const safeName = escapeHtml(name || "").trim();
  const greeting = safeName ? `שלום ${safeName},` : "שלום,";
  return {
    subject: "אימות חשבון - Tipul",
    html: `
      <div dir="rtl" style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #16a34a; font-size: 28px; margin: 0;">Tipul</h1>
          <p style="color: #64748b; margin-top: 4px;">ברוכים הבאים!</p>
        </div>

        <div style="background: #f8fafc; border-radius: 12px; padding: 30px; border: 1px solid #e2e8f0;">
          <h2 style="color: #1e293b; font-size: 20px; margin-top: 0;">${greeting}</h2>
          <p style="color: #475569; line-height: 1.6;">
            תודה שנרשמת ל-Tipul! כדי להשלים את ההרשמה ולהתחיל את
            <strong>תקופת הניסיון של ${trialDays} ימים</strong> במסלול <strong>${trialTier}</strong>,
            נא לאמת את כתובת המייל שלך:
          </p>

          <div style="text-align: center; margin: 30px 0;">
            <a href="${verifyUrl}"
               style="display: inline-block; background: linear-gradient(135deg, #0284c7, #7c3aed); color: white;
                      padding: 14px 40px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 16px;">
              אמת את החשבון שלי
            </a>
          </div>

          <p style="color: #64748b; font-size: 13px;">
            הקישור תקף ל-24 שעות. אם לא נרשמת, התעלם מהודעה זו.
          </p>
        </div>

        <div style="text-align: center; margin-top: 20px; color: #94a3b8; font-size: 12px;">
          <p>© Tipul ${new Date().getFullYear()}</p>
        </div>
      </div>
    `,
  };
}
