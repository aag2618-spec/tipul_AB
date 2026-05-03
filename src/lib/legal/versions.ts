// Stage 6-A.3 — מטא-דאטה למסמכים המשפטיים.
// תשתית ל-versioning של ConsentForm/TermsAcceptance — כל שינוי בקובץ legal/*.md
// מחייב bump של הגרסה כאן, ואז משתמשים שכבר אישרו את הגרסה הקודמת
// יקבלו פופ-אפ אישור מחודש בכניסה הבאה (יישום בעתיד).
//
// הקבצים עצמם נמצאים תחת /legal/*.md בריפו (טיוטות לעו"ד).
// כשייפתחו לציבור — יעלה /legal/[slug]/page.tsx שיציג אותם דרך next-mdx-remote
// או דרך fs.readFile + react-markdown.

export type LegalDocSlug =
  | "terms"
  | "privacy"
  | "dpa"
  | "therapist-template"
  | "patient-notice";

export interface LegalDocMeta {
  slug: LegalDocSlug;
  title: string;
  shortTitle: string;
  /** גרסה סמנטית. לבעוד bump במקרה של שינוי מהותי. */
  version: string;
  /** YYYY-MM-DD — לתצוגה בפוטר ובדף עצמו. */
  effectiveDate: string;
  /** האם המסמך דורש אישור מפורש מהמשתמש בכניסה? */
  requiresAcceptance: boolean;
  /** מי קהל היעד — לסינון בדפים שונים. */
  audience: "PUBLIC" | "THERAPIST" | "CLINIC_OWNER" | "PATIENT";
  /** קוד שמשמש כ-`termsType` בטבלת `TermsAcceptance`. */
  acceptanceType?:
    | "TERMS_OF_USE"
    | "PRIVACY_POLICY"
    | "CLINIC_DPA"
    | "PATIENT_NOTICE";
  /** נתיב הקובץ ב-repo — לקריאה מ-fs בדף /legal/[slug]. */
  filePath: string;
}

/**
 * רשימת המסמכים המשפטיים. לעדכון כשמוסיפים מסמך חדש או משנים גרסה.
 *
 * **חשוב:** עדכון `version` מכאן ייגרור הצגת מודל אישור מחדש למשתמשים
 * שכבר אישרו גרסה ישנה (כשנממש את ה-flow ב-PR נפרד).
 */
export const LEGAL_DOCS: Record<LegalDocSlug, LegalDocMeta> = {
  terms: {
    slug: "terms",
    title: "תנאי שימוש כלליים",
    shortTitle: "תנאי שימוש",
    version: "1.0.0",
    effectiveDate: "2026-05-01",
    requiresAcceptance: true,
    audience: "PUBLIC",
    acceptanceType: "TERMS_OF_USE",
    filePath: "legal/terms.md",
  },
  privacy: {
    slug: "privacy",
    title: "מדיניות פרטיות",
    shortTitle: "פרטיות",
    version: "1.0.0",
    effectiveDate: "2026-05-01",
    requiresAcceptance: true,
    audience: "PUBLIC",
    acceptanceType: "PRIVACY_POLICY",
    filePath: "legal/privacy.md",
  },
  dpa: {
    slug: "dpa",
    title: "הסכם עיבוד נתונים — קליניקה ↔ MyTipul (DPA)",
    shortTitle: "DPA",
    version: "1.0.0",
    effectiveDate: "2026-05-01",
    requiresAcceptance: true,
    audience: "CLINIC_OWNER",
    acceptanceType: "CLINIC_DPA",
    filePath: "legal/dpa.md",
  },
  "therapist-template": {
    slug: "therapist-template",
    title: "תבנית הסכם קליניקה ↔ מטפלת",
    shortTitle: "הסכם מטפל/ת",
    version: "1.0.0",
    effectiveDate: "2026-05-01",
    requiresAcceptance: false,
    audience: "CLINIC_OWNER",
    filePath: "legal/therapist-template.md",
  },
  "patient-notice": {
    slug: "patient-notice",
    title: "הודעת מטופל — איסוף נתונים",
    shortTitle: "הודעת מטופל",
    version: "1.0.0",
    effectiveDate: "2026-05-01",
    requiresAcceptance: false,
    audience: "PATIENT",
    acceptanceType: "PATIENT_NOTICE",
    filePath: "legal/patient-notice.md",
  },
} as const;

export const LEGAL_DOC_LIST: ReadonlyArray<LegalDocMeta> =
  Object.values(LEGAL_DOCS);

export function getLegalDoc(slug: string): LegalDocMeta | null {
  return (LEGAL_DOCS as Record<string, LegalDocMeta>)[slug] ?? null;
}

/**
 * הערה על דיסקליימר חוקי.
 *
 * כל המסמכים תחת `legal/` הם **טיוטות התחלתיות בלבד**.
 * **חובה** להעביר אותם לעיון עו"ד ישראלי המתמחה בפרטיות
 * ובחוק זכויות החולה לפני שליחה לייצור (ראה `review-legal` ב-plan).
 */
export const LEGAL_DRAFT_DISCLAIMER =
  "טיוטה — דורשת ביקורת עו\"ד ישראלי לפני שימוש בפועל.";
