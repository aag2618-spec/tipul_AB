# Key Versioning / Rotation להצפנה (חלק ב', HIGH)

מקור: סבב ביקורת אבטחה 2026-06-29. זהו **הפריט הפתוח #2 (rotation סודות)** מהסבב הקודם.

סטטוס: **התשתית נבנתה (אינרטית) + נבדקה ב-TDD. ⚠️ טרם נדחף, טרם בוצע סיבוב בייצור.**
החלטות שהתקבלו: צורת env = מפתחות ממוספרים; היקף = בניית תשתית + סקריפט, ואז סיבוב
בפועל (אין משתמשים אמיתיים → רגוע). מימוש:
- `src/lib/encryption.ts` — key registry + פורמט מגורסה `v<id>:salt:iv:authTag:ct`,
  אינרטי בלי `ENCRYPTION_KEY_CURRENT`. 10 בדיקות ב-`encryption-rotation.test.ts`.
- `src/lib/encrypted-fields-map.ts` — מקור-אמת אחד למפת השדות (נתונים טהורים, ללא imports).
- `scripts/rotate-encryption.ts` — re-encrypt; מייבא את `encrypt`/`decrypt` האמיתיים
  (אפס שכפול, interop מובטח) + מפת השדות. dry-run כברירת מחדל.

---

## הבעיה

הפורמט הנוכחי ב-`src/lib/encryption.ts`:
```
salt:iv:authTag:ciphertext        (4 חלקים, salt אקראי)
iv:authTag:ciphertext             (3 חלקים, legacy salt קבוע)
```
המפתח נגזר מ-`ENCRYPTION_KEY` יחיד דרך `scryptSync(ENCRYPTION_KEY, salt, 32)`.
**אין מזהה-מפתח (key-id) בתוך ה-ciphertext.** לכן החלפת `ENCRYPTION_KEY` שוברת את
**כל** ה-PHI ההיסטורי בבת אחת: notes, sessionNote, twoFactorSecret, טוקני Cardcom,
account tokens, credentials של קופות חולים ועוד — כולם מחזירים marker שגיאת פענוח.
אי אפשר לסובב מפתח בלי downtime, ואין דרך להחזיק שני מפתחות יחד בזמן migration.

## נקודת המינוף

**כל** ההצפנה/פענוח במערכת עוברת דרך `encrypt()`/`decrypt()` ב-`encryption.ts`:
- ה-Prisma extension (כל `ENCRYPTED_FIELDS` + `ENCRYPTED_JSON_FIELDS`) דרך `encrypted-fields.ts`.
- הצפנות ידניות: `billing/service.ts`, `cardcom/user-config.ts`,
  `api/integrations/billing/route.ts`, `api/integrations/cardcom/setup/route.ts`.

לכן **שינוי במקום אחד (`encryption.ts`) מכסה אוטומטית את כל הצרכנים.** זה הלב של התכנית.

---

## העיצוב המוצע

### 1. פורמט ciphertext מגורסה
```
v<id>:salt:iv:authTag:ciphertext   (5 חלקים — חדש, מגורסה)
```
- `v<id>` = מזהה מפתח אטומי קצר (`v2`, `v3`...). תבנית `^v[0-9]+$` — לא מתנגשת עם
  salt הקסדצימלי (32 תווי `[0-9a-f]`), אז פיצול ל-5 חלקים עם `parts[0]` שתואם
  לתבנית = רשומה מגורסה חד-משמעית.
- **תאימות לאחור מלאה:** רשומות בלי prefix (4 חלקים נוכחי / 3 חלקים legacy)
  ממשיכות להתפענח עם `ENCRYPTION_KEY` הקיים. **אפס migration ביום הראשון.**

### 2. רישום מפתחות (key registry) ב-`encryption.ts`
בטעינת המודול בונים מפה:
```
ENCRYPTION_KEY            → מפתח "legacy/default" — תמיד מפענח רשומות בלי prefix.
ENCRYPTION_KEY_V<n>       → מפתחות ממוספרים נוספים (נוספים בזמן rotation).
ENCRYPTION_KEY_CURRENT    → מצביע על המפתח שאיתו מצפינים כתיבות **חדשות**.
```
- אם `ENCRYPTION_KEY_CURRENT` **לא** מוגדר → מצב legacy: `encrypt()` כותב בפורמט
  4-חלקים הנוכחי (בלי prefix). **אפס שינוי התנהגות** עד שמפעילים rotation במפורש.
- אם מוגדר (`=v2`) → `encrypt()` כותב `v2:...` עם מפתח v2; פענוח בוחר מפתח לפי
  ה-prefix (או default לרשומות בלי prefix).
- ה-derivation (`scryptSync` + salt אקראי per-record) **לא משתנה** — רק בחירת הסוד.

### 3. עדכוני `decrypt` / `isEncrypted` / `encrypt`
- `decrypt`: 5 חלקים + `parts[0]` תואם תבנית → חיפוש מפתח לפי id; 4 → default;
  3 → default + legacy salt. מפתח לא-מוכר → נכשל בטוח (זורק → marker בקריאה),
  **לעולם לא plaintext שקט**.
- `isEncrypted`: יזהה גם את צורת 5-החלקים — קריטי כדי שה-idempotency של ה-extension
  (`if (isEncrypted(value)) return value`) לא יצפין כפול ciphertext מגורסה.
- `encrypt`: משתמש ב-current key; פורמט מגורסה רק אם `ENCRYPTION_KEY_CURRENT` מוגדר.

### 4. סקריפט re-encrypt (`scripts/migrate-encryption.ts` — להרחיב)
⚠️ **רשימת השדות בשלד הנוכחי מיושנת** — מפרטת Transcription/Analysis/comprehensiveAnalysis
שכבר לא מוצפנים, ו**חסרה את רוב השדות האמיתיים**. לתקן ע"י **ייבוא ישיר** של
`ENCRYPTED_FIELDS`/`ENCRYPTED_JSON_FIELDS` במקום שכפול. חייב לכלול גם את ההצפנות
הידניות שאינן ב-extension: `BillingProvider.apiKey/apiSecret/webhookSecret/previousWebhookSecret`.
- לכל ערך: לפענח עם המפתח לפי ה-prefix שלו → להצפין מחדש עם current → `v<current>:...`.
- idempotent (דילוג על רשומות שכבר ב-current), batch, resumable, `--dry-run` ברירת מחדל,
  `--execute` להחלה. רץ ב-Render Shell **אחרי backup**.

### 5. `receipt-token.ts` — המלכודת שהביקורת סימנה
`receipt-token.ts` משתמש ב-`ENCRYPTION_KEY` (דרך שרשרת fallback) כסוד HMAC לחתימת
קישורי קבלה ציבוריים. אלה HMAC דטרמיניסטיים — **לא ciphertext הפיך, אין מה "להצפין מחדש".**
אם `ENCRYPTION_KEY` משתנה ו-receipt-token עדיין נופל אליו — **כל קישור קבלה שהונפק נשבר**.
- פתרון: לוודא ש-`RECEIPT_TOKEN_SECRET` **מוגדר בייצור** (כבר קודם ב-precedence,
  מוצהר ב-`render.yaml`). אז סיבוב `ENCRYPTION_KEY` לא נוגע בטוקני קבלות כלל.
- **Runbook:** קבע `RECEIPT_TOKEN_SECRET` = הערך הנוכחי של `ENCRYPTION_KEY` **לפני**
  הסיבוב, כדי שקישורים ישנים ימשיכו לעבוד. רק אחר כך לסובב.

### 6. Runbook הפעלה (תפעולי, לא קוד)
1. לפרוס את קוד הגרסאות (**אינרטי** — עדיין כותב בלי prefix, מפענח הכל). אפס סיכון.
2. לוודא `RECEIPT_TOKEN_SECRET` מוגדר בייצור (= `ENCRYPTION_KEY` הנוכחי).
3. **Backup ל-DB.**
4. להוסיף מפתח חדש: `ENCRYPTION_KEY_V2=<חדש>` + `ENCRYPTION_KEY_CURRENT=v2`. redeploy.
   כתיבות חדשות → v2; ישנות עדיין מתפענחות עם default/old.
5. להריץ re-encrypt (`--dry-run` ואז `--execute`) — migration ישן→v2.
6. אחרי אימות — בעתיד אפשר לפרוש את המפתח הישן מהרישום (רק כש-0 רשומות נשארו בו).

### 7. בדיקות (TDD — הצפנה = קריטי)
- `decrypt` של `v2:...` עם מפתח v2 → plaintext.
- `decrypt` של 4-חלקים בלי prefix → עדיין עובד (default). **תאימות לאחור.**
- `decrypt` של 3-חלקים legacy → עדיין עובד.
- `encrypt` במצב legacy (רק `ENCRYPTION_KEY`) → בלי prefix (אפס שינוי).
- `encrypt` במצב רישום (`ENCRYPTION_KEY_CURRENT=v2`) → `v2:...`, round-trip.
- `isEncrypted` מזהה צורה מגורסה (idempotency).
- Cross-key: נתון מ-v1 מתפענח עם v1 גם כש-current=v2.
- keyId לא-מוכר → נכשל בטוח (marker, לא plaintext); ה-guard מחלק א' מונע דריסה.

---

## Runbook ביצוע סיבוב (תפעולי — אחרי שהקוד נדחף)

1. **לפרוס את הקוד** (אינרטי — עדיין כותב בלי prefix, מפענח הכל). אפס סיכון.
2. לוודא `RECEIPT_TOKEN_SECRET` מוגדר בייצור (= הערך הנוכחי של `ENCRYPTION_KEY`),
   כדי שקישורי קבלה ישנים לא יישברו. (בעיצוב הזה `ENCRYPTION_KEY` *לא* מוחלף, אז
   ה-fallback ב-receipt-token ממילא ממשיך לעבוד — זו חגורה נוספת.)
3. **Backup ל-DB.**
4. ב-Render → Environment, להוסיף:
   - `ENCRYPTION_KEY_V2` = מפתח חדש (`openssl rand -hex 32`).
   - `ENCRYPTION_KEY_CURRENT` = `v2`.
   לשמור ולפרוס. מעכשיו כתיבות חדשות נחתמות `v2:`; ישנות עדיין נקראות עם `ENCRYPTION_KEY`.
   (אם `ENCRYPTION_KEY_CURRENT` מוגדר אך `ENCRYPTION_KEY_V2` חסר — האפליקציה נכשלת
   ב-boot בכוונה, fail-fast.)
5. **dry-run** ב-Render Shell: `npx tsx scripts/rotate-encryption.ts`. לוודא בסיכום
   ש-`Errors: 0` ו-`Skipped markers: 0` (כל ערך גבוה מ-0 = רשומות שלא יסובבו —
   לברר לפני להמשיך; לרוב סימן שמפתח ישן חסר ב-env). ⚠️ כל המפתחות הישנים
   (`ENCRYPTION_KEY` + כל `ENCRYPTION_KEY_V<n>` קודם) חייבים להיות מוגדרים בזמן ההרצה.
6. **execute**: `npx tsx scripts/rotate-encryption.ts --execute`. בטוח לחזור (idempotent).
7. אימות: פתיחת כרטיס מטופל/הגדרות → הכול נקרא תקין. אפשר להריץ dry-run שוב ולראות
   `Already current` לכל הרשומות, `Rotated: 0`.
8. בעתיד (אופציונלי), אחרי שאין יותר רשומות בלי prefix — אפשר לשקול לפרוש את המפתח
   הישן. **לא למהר** — `ENCRYPTION_KEY` עדיין משמש את receipt-token וכ-fallback.

## אינווריאנטים (לא לשבור)
- מנגנון AES-256-GCM, IV אקראי, auth tag, fail-safe בכתיבה — **לא משתנה**.
- fail-soft בקריאה (marker, לא זריקה) — נשמר.
- הguard מחלק א' (סירוב להצפין marker) — נשמר. הסקריפט גם מדלג על markers.
- מפתח לא-מוכר בפענוח → זריקה (→marker בקריאה), לעולם לא plaintext דלוף.
- אסור `prisma db push` מקומי. אסור push ל-main בלי אישור מפורש.

## אינווריאנטים (לא לשבור)
- מנגנון AES-256-GCM, IV אקראי, auth tag, fail-safe בכתיבה — **לא משתנה**.
- fail-soft בקריאה (marker, לא זריקה) — נשמר.
- הguard מחלק א' (סירוב להצפין marker) — נשמר.
- אסור `prisma db push` מקומי. אסור push ל-main בלי אישור מפורש.
