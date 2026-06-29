// src/lib/encrypted-fields-map.ts
//
// **מקור-אמת אחד** למפת השדות המוצפנים — נתונים טהורים בלבד, **ללא imports**.
//
// למה קובץ נפרד: גם ה-Prisma extension (`encrypted-fields.ts`) וגם סקריפט
// ה-re-encrypt (`scripts/rotate-encryption.ts`) צריכים את אותה רשימת שדות.
// הסקריפט רץ תחת `tsx` שלא פותר את alias `@/`, ולכן הוא לא יכול לייבא את
// `encrypted-fields.ts` (שמייבא מ-`@/lib/encryption`). קובץ זה נטול imports →
// ניתן לייבוא יחסי משני הצדדים בלי drift בין הרשימות.
//
// השדות כאן הם שדות שה-extension מצפין אוטומטית. **הצפנות ידניות** מחוץ
// ל-extension (כמו `BillingProvider.apiKey/apiSecret/webhookSecret/
// previousWebhookSecret`) אינן כאן — הסקריפט מוסיף אותן בנפרד.

/**
 * מפת המודלים והשדות (טקסט פשוט) שאנחנו מצפינים.
 *
 * המפתחות הם **lowercase** של שמות המודלים (כמו ש-Prisma חושף ב-client).
 * השדות הם רשימת string field names ב-model.
 */
export const ENCRYPTED_FIELDS: Record<string, readonly string[]> = {
  client: ["notes", "initialDiagnosis", "intakeNotes", "approachNotes", "culturalContext"],
  sessionNote: ["content"],
  therapySession: ["topic", "notes"],
  // OAuth tokens של Google (Calendar). access_token יכול לקרוא/לכתוב אירועים
  // ביומן של המשתמש; refresh_token מאפשר לחדש את access_token לתמיד עד
  // revoke. אם DB ידלוף — תוקף יקבל גישה רציפה ל-Google של כל המטפלים.
  // הצפנה ב-AES-256-GCM מבטיחה שגם dump של DB לא חושף.
  account: ["access_token", "refresh_token", "id_token"],
  // הגדרות חיבור לקופות חולים — credentials של פורטלי הקופות.
  // meuhedetUsername + meuhedetPassword: login user/pass של פורטל מאוחדת.
  // clalitApiKey + clalitFacilityId: מזהה מתקן + מפתח API של כללית.
  // maccabiApiKey + maccabiProviderId: מזהה ספק + מפתח API של מכבי.
  // leumitApiKey + leumitClinicCode: קוד מרפאה + מפתח API של לאומית.
  // אם DB ידלוף — תוקף יוכל להגיש דוחות בשם המטפל ו/או לחייב כוזב.
  // ה-IDs (facilityId/providerId/clinicCode) פחות רגישים בעצמם, אבל הם
  // משלימים לזיהוי מטפל מול קופה — מצפינים יחד עם ה-API key.
  insurerSettings: [
    "meuhedetUsername",
    "meuhedetPassword",
    "clalitApiKey",
    "clalitFacilityId",
    "maccabiApiKey",
    "maccabiProviderId",
    "leumitApiKey",
    "leumitClinicCode",
  ],
  // H4: TOTP secret (base32) של User. אם DB דולף, תוקף יכול ליצור קודים
  // תקפים ולעבור את ה-2FA. הצפנת AES-256-GCM הופכת את ה-leak לחסר ערך.
  user: ["twoFactorSecret"],
  // C3 (סבב אבטחה 14, 2026-05-19): Cardcom recurring token. ה-token מאפשר
  // חיוב חוזר של הלקוח ב-Cardcom — דליפת DB מאפשרת לתוקף לחייב סכומים
  // נוספים. `tokenHash` (SHA-256 דטרמיניסטי, נפרד) משמש ל-uniqueness/lookup.
  // אין משתמשים בייצור עדיין → אין צורך ב-backfill (records חדשים יהיו
  // מוצפנים מההתחלה; ה-legacy backfill code שמחפש `tokenHash: null` יסונן
  // החוצה אוטומטית כי records חדשים מקבלים hash מלא).
  savedCardToken: ["token"],
  // M16.9 (סבב אבטחה 16f, 2026-05-20): CommunicationLog body fields.
  // מיילים/SMS שמטפל שולח/מקבל למטופל עלולים להכיל PHI: "תזכורת לפגישה
  // לגבי הסוגיה ש...", "נא להביא את התרופה X", subject "תוצאות אבחון".
  // לפי חוק זכויות החולה תקשורת רפואית = PHI.
  //
  // בדוק קודם שאין WHERE על content/subject בקוד (lookup חוזר במצב מוצפן
  // לא יעבוד) — Grep לא מצא בעיה. dual-read של maybeDecrypt יטפל אוטומטית
  // ב-records ישנים שעדיין plaintext.
  //
  // errorMessage: לרוב Resend/Pulseem error strings (לא PHI), אבל יכול
  // להכיל data מהbody — מצפינים defensively.
  communicationLog: ["content", "subject", "errorMessage"],
  // R18f (סבב אבטחה 18, 2026-05-25): מודלים קליניים @db.Text. dual-read מטפל ב-plaintext ישן.
  consentForm: ["content", "signatureData"],
  insurerReport: ["reportData", "errorMessage"],
} as const;

/**
 * Phase 4.5 — שדות JSON שצריכים להיות מוצפנים.
 *
 * JSON ב-Prisma הוא `Json?` — לא string. אנחנו לא יכולים להחליף אותו ב-string
 * המוצפן ישירות (Prisma יידחה את הכתיבה). במקום, אנחנו עוטפים את ה-value
 * המוצפן ב-marker object: `{ "__enc__": "<encrypted-string>" }`.
 *
 * בקריאה — מחפשים את ה-marker, מפענחים, ומחזירים את ה-value המקורי.
 *
 * תועלת: לא דורש schema change. JSON field נשאר Json בschema.
 */
export const ENCRYPTED_JSON_FIELDS: Record<string, readonly string[]> = {
  client: ["medicalHistory"],
  // H13 (סבב אבטחה 14, 2026-05-19): answers של שאלוני הערכה (התשובות הקליניות
  // עצמן של הלקוח). dual-read: `maybeDecryptJson` מטפל ב-legacy plaintext
  // אוטומטית — records ישנים ממשיכים לעבוד.
  questionnaireResponse: ["answers"],
  // H13: responses של intake (שאלון קבלה קליני). מכיל מידע אישי, רקע, וכל
  // מה שהמטופל ענה ב-onboarding. dual-read.
  intakeResponse: ["responses"],
} as const;

/** marker key שעוטף JSON מוצפן: `{ "__enc__": "<encrypted-string>" }`. */
export const JSON_ENC_MARKER = "__enc__";
