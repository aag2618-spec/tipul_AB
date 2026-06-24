// נתוני התוכן של דף הנחיתה — מערכי טקסט סטטיים בלבד.
// ⚠️ לא מייבאים כאן את worksheets-content*.mjs הכבד — רק רשימת שמות הגישות.

import {
  Users,
  Calendar,
  Bell,
  ClipboardList,
  CreditCard,
  FileCheck,
  CalendarCheck,
  Sparkles,
  FileText,
  UsersRound,
  ListChecks,
  MessageSquare,
  BarChart3,
  DoorOpen,
  ArrowLeftRight,
  Clock,
  Lock,
  Shield,
  Zap,
  Database,
  type LucideIcon,
} from "lucide-react";

export interface FeatureItem {
  icon: LucideIcon;
  title: string;
  description: string;
}

// פיצ'רים שכל מטפל פרטי מקבל.
export const PRIVATE_FEATURES: FeatureItem[] = [
  { icon: Users, title: "ניהול מטופלים", description: "תיקים מקצועיים, היסטוריה טיפולית מלאה ומעקב התקדמות לכל מטופל" },
  { icon: Calendar, title: "יומן פגישות חכם", description: "לוח שנה אינטואיטיבי עם ניהול פגישות, תזמון אוטומטי ותצוגות מגוונות" },
  { icon: Bell, title: "תזכורות אוטומטיות", description: "תזכורות SMS ומייל למטופלים — לפגישות, חובות וחידושים, ללא מאמץ" },
  { icon: ClipboardList, title: "שאלונים ואבחונים", description: "מעל 20 שאלונים מקצועיים מוכנים — PHQ-9, GAD-7, BDI-II ועוד" },
  { icon: CreditCard, title: "תשלומים וקבלות", description: "מעקב חובות, תשלומים, קבלות וחשבוניות דיגיטליות מסודרות" },
  { icon: FileCheck, title: "מסמכים וחתימות", description: "טפסי הסכמה דיגיטליים, חתימה אלקטרונית וניהול מסמכים מאובטח" },
  { icon: CalendarCheck, title: "זימון עצמי", description: "קישור אישי לכל מטופל לקביעת תור — מסונכרן ליומן שלכם" },
  { icon: Sparkles, title: "הכנה לפגישה", description: "מסך מרוכז שמסכם את כל מה שצריך לדעת לפני כל פגישה" },
  { icon: FileText, title: "שאלוני פנייה", description: "שאלוני אינטייק דיגיטליים שהמטופל ממלא עוד לפני הפגישה הראשונה" },
];

// פיצ'רים נוספים שמקבלים בקליניקה / מרכז טיפולי עם צוות.
export const CLINIC_FEATURES: FeatureItem[] = [
  { icon: UsersRound, title: "ניהול צוות", description: "הזמנת מטפלים ומזכירות, הרשאות מדויקות וניהול חברי הקליניקה" },
  { icon: ListChecks, title: "מטלות צוות", description: "הקצאת משימות לעובדים עם מעקב, תזכורות ותבניות חוזרות" },
  { icon: MessageSquare, title: "צ'אט צוות", description: "תקשורת פנימית מאובטחת בין המנהלת לצוות המזכירות" },
  { icon: BarChart3, title: "אנליטיקה ודוחות", description: "הכנסות לכל מטפל, מגמות, אי-הגעות ומדדים ניהוליים" },
  { icon: DoorOpen, title: "ניהול חדרים", description: "שיוך חדרי טיפול לפגישות, בדיקת חפיפות וקביעה במקביל" },
  { icon: ArrowLeftRight, title: "העברת מטופלים", description: "העברה מסודרת בין מטפלים, כולל תהליכי עזיבה" },
  { icon: Clock, title: "רשימת המתנה", description: "ניהול ממתינים ומילוי משבצות שמתפנות באופן חכם" },
  { icon: Calendar, title: "יומן רב-מטפלים", description: "תצוגת יומן של כל הקליניקה עם סטטוסים, סינון ובורר מטפל" },
];

export const SECURITY_ITEMS: FeatureItem[] = [
  { icon: Lock, title: "הצפנת מידע", description: "הצפנת נתונים ברמת AES-256 לכל המידע הרגיש במערכת" },
  { icon: Shield, title: "הגנת סיסמאות", description: "הסיסמאות מוצפנות ולעולם לא נשמרות בטקסט גלוי" },
  { icon: Zap, title: "גישה מאובטחת", description: "כל גישה למידע מאומתת ומורשית עם אבטחה מרובת שכבות" },
  { icon: Database, title: "הנתונים שלך בלבד", description: "המידע שייך רק לך ולא נמכר, נחשף או נשמר אצל צד שלישי" },
];

// ~18 גישות טיפוליות — מוצגות כענן badges בסקציית דפי העבודה.
// color = גוון Tailwind למיון ויזואלי בלבד (לא מקודד משמעות).
export interface ApproachTag {
  label: string;
  color: string;
}

export const APPROACHES: ApproachTag[] = [
  { label: "CBT — קוגניטיבי־התנהגותי", color: "teal" },
  { label: "DBT — דיאלקטי", color: "violet" },
  { label: "ACT — קבלה ומחויבות", color: "orange" },
  { label: "קשיבות", color: "blue" },
  { label: "CFT — חמלה עצמית", color: "rose" },
  { label: "פסיכולוגיה חיובית", color: "amber" },
  { label: "פוליוואגלי", color: "emerald" },
  { label: "ניהול כעס", color: "red" },
  { label: "לוגותרפיה", color: "indigo" },
  { label: "נרטיבי", color: "cyan" },
  { label: "IFS — משפחה פנימית", color: "fuchsia" },
  { label: "סכמה תרפיה", color: "purple" },
  { label: "טרנס־תיאורטי", color: "lime" },
  { label: "טיפול מציאות", color: "sky" },
  { label: "ממוקד פתרון", color: "pink" },
  { label: "גשטלט", color: "green" },
  { label: "ניתוח טרנזקציוני", color: "teal" },
  { label: "אדלריאני", color: "orange" },
];
