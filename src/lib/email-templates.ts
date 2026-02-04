/**
 * תבניות מייל מוכנות לשימוש
 * ניתן להעתיק ולשלוח מהמערכת
 */

export interface EmailTemplate {
  subject: string;
  body: string;
  placeholders: string[];
}

export const EMAIL_TEMPLATES: Record<string, EmailTemplate> = {
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
  template: EmailTemplate,
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
export function getTemplateForAlertType(alertType: string): EmailTemplate | null {
  switch (alertType) {
    case "PAYMENT_DUE":
    case "PAYMENT_OVERDUE":
      return EMAIL_TEMPLATES.PAYMENT_OVERDUE;
    case "PAYMENT_FAILED":
      return EMAIL_TEMPLATES.PAYMENT_OVERDUE;
    case "SUBSCRIPTION_EXPIRING":
      return EMAIL_TEMPLATES.SUBSCRIPTION_RENEWAL;
    case "SUBSCRIPTION_EXPIRED":
      return EMAIL_TEMPLATES.SUBSCRIPTION_EXPIRED;
    case "NEW_USER":
      return EMAIL_TEMPLATES.WELCOME;
    case "TIER_CHANGE_REQUEST":
      return EMAIL_TEMPLATES.TIER_UPGRADE;
    default:
      return null;
  }
}
