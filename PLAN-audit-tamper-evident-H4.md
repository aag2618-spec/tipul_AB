# תכנית H4 — הקשחת יומן הביקורת מפני זיוף/מחיקה (tamper-evident audit)

סטטוס: **Phase 1 מומש (טרם נדחף/נבדק חי). Phase 2-3 פתוחים.** תאריך: 2026-06-29.

## עדכון יישום — Phase 1 (גילוי) מומש
- סכמה: `seq/prevHash/rowHash` (nullable) ל-2 הטבלאות + מודל `AuditChainHead`.
- `prisma/sql/audit-chain.sql`: pgcrypto + פונקציות hash + טריגרי BEFORE INSERT.
  - **שינוי מהעיצוב המקורי:** במקום advisory-lock + SELECT (שגרם ל-snapshot ישן
    תחת Serializable → prevHash שגוי → שבירה כוזבת), הטריגר משתמש ב-`UPDATE ...
    RETURNING` אטומי (נעילת שורה). תחת התנגשות Serializable — נתפס ב-EXCEPTION
    ונכתבת שורה לא-משורשרת (rowHash=NULL), בלי לחסום את ה-insert. ה-verifier
    מתעלם משורות לא-משורשרות.
- `package.json`: `prisma db execute --file=prisma/sql/audit-chain.sql || true` ב-start:prod.
- `src/lib/audit-chain.ts`: `verifyAllAuditChains()` — מחשב מחדש דרך אותן פונקציות SQL.
- `src/app/api/cron/audit-chain-verify/route.ts`: cron אימות + `AdminAlert` URGENT על שבירה (dedupe).
- בדיקות: 5 ל-cron (`__tests__/audit-chain-verify.test.ts`).
- **תיקון אגב:** `admin/audit/data-access` החזיר שורות מלאות ל-JSON → הוספת `omit`
  ל-seq/prevHash/rowHash (BigInt שובר JSON.stringify).
- **נדחה מ-Phase 1:** script עצמאי (`scripts/verify-audit-chain.ts`) — אימות
  ידני זמין דרך קריאת ה-cron endpoint עם CRON_SECRET. backfill לשורות legacy — נדחה.
- ⚠️ דורש `db push` (אדיטיבי, אוטומטי ב-deploy) + הרצת ה-SQL ב-deploy. לא נבדק חי.
- **תיקוני ביקורת (3 סוכנים):** (1) HIGH — הטריגר זורק-מחדש `serialization_failure`/
  `deadlock_detected` (במקום לבלוע) כדי ש-`withAudit` ינסה שוב ולא ייכתבו שורות
  לא-משורשרות בשקט; בולע רק כשלים אמיתיים. (2) HIGH — `withAudit.RETRY_CODES`
  הורחב ל-`P2034` (Prisma עוטף serialization conflict כ-P2034; פער קיים-מראש
  שיושר עם 8+ אתרים אחרים). (3) cron נרשם ב-render.yaml (יומי 02:00 UTC) +
  ניסוח ההתראה תוקן. נותר LOW פתוח (לא בתחום): `credits.ts` retry helper חסר גם הוא P2034.

---



## הבעיה
שתי טבלאות היומן — `AdminAuditLog` (פעולות ניהול) ו-`DataAccessAuditLog` (קריאות PHI) — כתובות "בעיפרון": מי שיש לו את הרשאות ה-DB של האפליקציה יכול `UPDATE`/`DELETE` שורות בלי שיישאר זכר. היומן הוא העֵד המרכזי לאירוע דליפה — ואם אפשר לזייפו, הוא חסר ערך ראייתי.

## מודל האיום (כן הגדרה ברורה — חשוב לציפיות)
- **מגן מפני:** באג בקוד שמוחק/מעדכן בטעות; אינסַיְדֶר/תוקף שהשיג את **הרשאות האפליקציה** ל-DB ומנסה למחוק עקבות; מחיקה/עריכה "שקטה".
- **לא מגן לבדו מפני:** Postgres **superuser** אמיתי, או הבעלים של הטבלאות, שיכול `DISABLE TRIGGER`/`DROP TRIGGER` ולחשב מחדש את כל השרשרת. הגנה מלאה מפני זה דורשת **עיגון חיצוני** (Phase 3) — פרסום תקופתי של "חותמת הקצה" למקום חיצוני בלתי-ניתן-לשינוי, כך שזיוף יתגלה גם אם הכל חושב מחדש.
- לכן זו **הגנה-לעומק רב-שכבתית**, לא "בלתי-שביר".

## ממצאי הקוד הקיים (בסיס לתכנית)
- כותבים ל-`AdminAuditLog`: `withAudit` (טרנזקציוני), `logAdminAction` (legacy), `logDelegatedCreate` (best-effort). כולם `prisma.adminAuditLog.create`.
- כותבים ל-`DataAccessAuditLog`: `writeAuditToDb` (fire-and-forget) דרך `logDataAccess`.
- **אין `UPDATE` על אף אחת מהטבלאות בכל הקוד.** שדות `revertedAt`/`undoable` ב-`AdminAuditLog` הם תשתית שלא חוברה לכתיבה.
- `DELETE` קיים רק בשני קרוני retention: `audit-log-retention` (12 חודש, `AdminAuditLog`) ו-`data-access-audit-retention` (24 חודש, `DataAccessAuditLog`), שניהם `deleteMany` ב-batches לפי `createdAt < cutoff`.
- **מנגנון פריסה קיים ומושלם למטרה:** `start:prod` מריץ `prisma db push` **וגם** `prisma db execute --file=prisma/sql/*.sql || true`. כלומר כבר רצים קבצי SQL גולמיים אידמפוטנטיים בכל deploy (תבנית `DO $$ ... IF NOT EXISTS ... $$`). זה הרכב המדויק לטריגרים.
- **אילוץ:** ה-DB המקומי = ייצור. אסור `prisma db push`/`db execute` מקומי. אי-אפשר לבדוק חי. בטוח מקומית: `tsc`/`build`/`vitest` + בדיקת SQL בעין.

---

## העיצוב — שלוש שכבות משלימות

### שכבה A — שרשרת חותמות (hash-chain) — *גילוי* זיוף
לכל טבלה מוסיפים 3 עמודות (אדיטיבי, nullable — לא שובר כתיבות קיימות):
- `seq BIGINT` — מונה עולה מונוטוני (`autoincrement`) לסדר דטרמיניסטי של השרשרת.
- `prevHash TEXT` — ה-`rowHash` של השורה הקודמת בשרשרת.
- `rowHash TEXT` — `sha256` של (השדות המהותיים של השורה + `prevHash`).

החישוב נעשה ב-**`BEFORE INSERT` trigger ב-Postgres** (לא בקוד האפליקציה). יתרון מכריע: טריגר אחד מכסה אוטומטית את **כל** ארבעת הכותבים, בלי לגעת בקוד שלהם. הטריגר:
1. נועל את השרשרת לטבלה הזו בתוך הטרנזקציה: `pg_advisory_xact_lock(<מספר קבוע לטבלה>)` — מסדרֵר inserts מקבילים כך ששתי שורות לא יקראו את אותו `prevHash`. הנעילה משתחררת אוטומטית ב-commit.
2. קורא את `rowHash` של השורה האחרונה (`ORDER BY seq DESC LIMIT 1`); אם אין — `prevHash := 'GENESIS'`.
3. מחשב `NEW.rowHash := encode(digest(prevHash || '|' || NEW.id || '|' || NEW.action || ... || NEW."createdAt", 'sha256'), 'hex')` באמצעות `pgcrypto`.

דורש `CREATE EXTENSION IF NOT EXISTS pgcrypto;` (קיים סטנדרטית ב-Render Postgres).

### שכבה B — append-only — *מניעת* שינוי/מחיקה
טריגרים נוספים בכל טבלה:
- **`BEFORE UPDATE`** → תמיד `RAISE EXCEPTION` (אין שום `UPDATE` לגיטימי היום).
- **`BEFORE DELETE`** → `RAISE EXCEPTION` **אלא אם** `OLD."createdAt" < now() - interval '12 months'` (ל-`AdminAuditLog`) / `'24 months'` (ל-`DataAccessAuditLog`). כך קרון ה-retention (שמוחק רק שורות ישנות מהסף) ממשיך לעבוד, אבל אי-אפשר למחוק שורה **עדכנית** — בדיוק החלון הפורנזי שחשוב להגן עליו.
- **`REVOKE TRUNCATE`** על הטבלאות מתפקיד האפליקציה (טריגרים לא נורים על `TRUNCATE`).

הערה: אם בעתיד יחובר פיצ'ר ה"ביטול" (`revertedAt`), יידרש carve-out בטריגר ה-`UPDATE` (להתיר עדכון של עמודות `revertedAt`/`revertedById` בלבד).

### שכבה C (אופציונלי, עתידי) — עיגון חיצוני
קרון שבועי שכותב את ה-`rowHash` האחרון של כל שרשרת למקום חיצוני append-only (לוג Render חתום / אחסון נפרד / חתימה במפתח offline). זה מה שסוגר את פרצת ה-superuser. נדחה כ-Phase עתידי.

---

## אימות השרשרת (verifier)
- כלי `scripts/verify-audit-chain.ts` (וגם קרון שמריץ אותו ומרים `AdminAlert` על שבירה).
- כדי למנוע **שתי מימושי-hash שמתפצלים** (TS מול SQL): ה-verifier יחשב מחדש **דרך שאילתת SQL** עם אותה נוסחת `digest` (מקור-אמת יחיד). הוא עובר על השורות לפי `seq`, ומוודא לכל שורה: `rowHash` תואם לחישוב-מחדש, ו-`prevHash` תואם ל-`rowHash` של קודמתה.
- **תאימות ל-retention:** מחיקת retention מסירה רק **תחילית** (השורות הכי ישנות), כי הסדר תואם ל-`createdAt`. לכן השורה השורדת הראשונה היא "עוגן" שה-`prevHash` שלה מצביע על שורה שנמחקה כדין — מקבלים אותה כעוגן. שבירה בכל נקודה **אחרת** (מחיקת/שינוי שורה באמצע) = זיהוי. שיפור אופציונלי: הקרון ירשום "watermark" של ה-hash האחרון שנמחק, כדי לאשר שהפער לגיטימי.

---

## חלוקה לשלבים (לפי סיכון — מהנמוך לגבוה)

**Phase 1 — גילוי (סיכון נמוך, אדיטיבי בלבד):**
שכבה A (עמודות + טריגר INSERT + pgcrypto) + ה-verifier + קרון אימות שמרים `AdminAlert` על שבירה. *לא* חוסם שום פעולה קיימת → סיכון מינימלי לשבור ייצור חי. נותן מיד "אם מישהו יזייף — נדע".

**Phase 2 — מניעה (סיכון בינוני, משנה התנהגות כתיבה):**
שכבה B (טריגרי UPDATE/DELETE + REVOKE TRUNCATE). דורש אימות שקרוני ה-retention עדיין עוברים ושאין כתיבת-עדכון לגיטימית (אומת: אין). סיכון: אם פעולה כלשהי כן מעדכנת/מוחקת שורה עדכנית — תיחסם.

**Phase 3 — עיגון חיצוני (אופציונלי, עתידי):** שכבה C.

---

## קבצים שייגעו (משוער)
- `prisma/schema.prisma` — 3 עמודות חדשות × 2 טבלאות (אדיטיבי).
- `prisma/sql/audit-chain.sql` (חדש) — `pgcrypto` + פונקציות + טריגרים, אידמפוטנטי.
- `package.json` — הוספת `prisma db execute --file=prisma/sql/audit-chain.sql || true` ל-`start:prod` (כמו הקבצים הקיימים).
- `scripts/verify-audit-chain.ts` (חדש) — אימות + הרצה ידנית.
- `src/app/api/cron/audit-chain-verify/route.ts` (חדש, Phase 1) — אימות מתוזמן + `AdminAlert`.
- שני קרוני ה-retention — אולי הוספת watermark (אופציונלי).
- בדיקות: יחידה לנוסחת ה-hash (TS שמשקף, אם נשאיר חישוב TS) + בדיקות ל-verifier.

## סיכונים ופתחים פתוחים
1. **מגבלת superuser** — מטופלת רק ב-Phase 3.
2. **אי-בדיקה חיה** — הטריגרים ייבדקו בעין + ב-staging אם קיים; ה-`|| true` ב-`start:prod` מונע שה-deploy ייתקע אם ה-SQL נכשל (אבל אז ההגנה לא תחול — צריך לוודא הצלחה ידנית אחרי deploy).
3. **drift בין hash ב-SQL ל-TS** — נמנע ע"י חישוב-מחדש ב-verifier דרך SQL (מקור יחיד).
4. **ביצועים** — ה-advisory lock מסדרֵר את כל כתיבות היומן. נפח היומן בינוני; צוואר-בקבוק לא צפוי, אך יש לוודא.
5. **שורות legacy קיימות** (לפני התוספת) — `rowHash=NULL`. ה-verifier יתחיל מהשורה הראשונה עם chain; שורות ישנות ללא chain מסומנות "pre-chain" ולא נכשלות. אופציה: backfill חד-פעמי שממלא chain לשורות הקיימות (script).
