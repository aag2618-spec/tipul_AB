// קבועים משותפים ל-UI של הרשאות מזכירה — רשימת התצוגה (label/help) וברירת
// המחדל. נחלצו מ-members/page.tsx כדי שגם דיאלוג ההזמנה (invitations/page.tsx)
// וגם ברירת המחדל בשרת (invitations/route.ts) ישתמשו באותו source-of-truth
// ולא ייווצר drift (כמו שקרה עם canTransferClient שהושמט מברירת המחדל בהזמנה).
//
// קובץ זה client-safe בכוונה — בלי import של prisma/scope.ts (שמושך קוד שרת).
// ה-source-of-truth ל-*type* המלא הוא `SecretaryPermissions` ב-src/lib/scope.ts;
// בעת הוספת הרשאה חדשה יש לעדכן: scope.ts, validations/clinic-admin.ts,
// use-my-permissions.ts, והקובץ הזה.

export type SecretaryPermissionKey =
  | "canViewPayments"
  | "canIssueReceipts"
  | "canSendReminders"
  | "canCreateClient"
  | "canViewDebts"
  | "canViewStats"
  | "canViewConsentForms"
  | "canTransferClient"
  | "canAssignTasks";

export type SecretaryPermissions = Partial<Record<SecretaryPermissionKey, boolean>>;

/**
 * רשימת ההרשאות לתצוגה ב-UI (סדר + תוויות + הסבר קצר).
 * משמשת גם בדיאלוג עריכת הרשאות ("חברי קליניקה") וגם בדיאלוג ההזמנה.
 */
export const SECRETARY_PERMS: {
  key: SecretaryPermissionKey;
  label: string;
  help: string;
}[] = [
  { key: "canCreateClient", label: "יצירת מטופל חדש", help: "פתיחת תיק מטופל" },
  { key: "canSendReminders", label: "שליחת תזכורות", help: "SMS/Email לפגישות" },
  { key: "canViewPayments", label: "צפייה בתשלומים", help: "ראייה של היסטוריית חיוב" },
  { key: "canIssueReceipts", label: "הוצאת קבלות", help: "Cardcom — קבלה דיגיטלית" },
  { key: "canViewDebts", label: "צפייה בחובות", help: "מי לא שילם" },
  { key: "canViewStats", label: "סטטיסטיקות עסק", help: "דוחות ביצועים" },
  {
    key: "canViewConsentForms",
    label: "צפייה בטפסי הסכמה",
    help: "טפסי קבלה ותוכניות (אדמיניסטרטיבי)",
  },
  {
    key: "canTransferClient",
    label: "העברת מטופלים בין מטפלים",
    help: "גישה למסכי ניהול הקליניקה הרלוונטיים (העברה, מטופלים לפי מטפל)",
  },
  {
    key: "canAssignTasks",
    label: "הקצאת מטלות צוות",
    help: "יצירת מטלות לעובדים ומעקב אחר הביצוע",
  },
];

/**
 * ברירת המחדל להרשאות מזכירה — deny by default, פרט להרשאות תפעוליות בסיסיות
 * (שליחת תזכורות + יצירת מטופל) שמזכירה כמעט תמיד צריכה. כולל את כל 9 השדות
 * במפורש כדי שלא יישמט אף אחד (source-of-truth אחד ל-frontend ול-backend).
 */
export const DEFAULT_SECRETARY_PERMISSIONS: Required<
  Record<SecretaryPermissionKey, boolean>
> = {
  canViewPayments: false,
  canIssueReceipts: false,
  canSendReminders: true,
  canCreateClient: true,
  canViewDebts: false,
  canViewStats: false,
  canViewConsentForms: false,
  canTransferClient: false,
  canAssignTasks: false,
};
