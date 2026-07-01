# תוכנית: סדר במערכת התזמון + הכנה לקנה מידה

**תאריך:** 2026-06-18
**מטרה:** לאחד את מערכת התזמון (cron) למבנה אחד, אמין, ומוכן לגדול — ולסגור את הפער שבו ~10 משימות לא רצות.
**יעד עסקי שמכתיב את הארכיטקטורה:** האתר אמור לשרת **רבבות** מטפלים ומשתמשים.

---

## ✅ סטטוס ביצוע (עודכן 2026-06-18)
- **9 משימות חסרות הוקמו ב-Render** (דרך API, מאובטח — `CRON_SECRET` כמשתנה סביבה ולא בטקסט גלוי; build=live): `cleanup-idempotency`, `booking-outbox`, `audit-log-retention`, `data-access-audit-retention`, `data-retention`, `departure-deadlines`, `impersonation-hardkill`, `cardcom-webhook-stuck`, `custom-contract-renewals`. סה"כ 14 crons + השרת הראשי.
- **חיוב מנויים (`subscription-recurring-charge`): נוצר ונמחק בכוונה** — Render לא תומך בהשהיית cron דרך API. **להקים מחדש בהשקה** (אחרי חיבור Cardcom production + אימות שאין candidates). הפקודה המדויקת שמורה בהיסטוריית הצ'אט.
- **נותר:** שלב ג' (להעביר 6 משימות מהשעון הפנימי ל-crons + לכבות `ENABLE_IN_APP_SCHEDULER` — נוגע ב-redeploy של השרת) + שלב ד' (render.yaml). + ניקוי 2 הזבל ב-cron-job.org (המשתמש).
- **חוב אבטחה:** 5 ה-crons הישנים מטמיעים `CRON_SECRET` בטקסט גלוי (ה-9 החדשים לא). לשקול מיגרציה + **rotation של `CRON_SECRET`** (נחשף בצ'אט).

---

## 1. המצב הנוכחי (מאומת דרך Render API + cron-job.org, 2026-06-17/18)

יש **3 מערכות תזמון במקביל** — זה מקור תחושת ה"מפוזר":

| # | מערכת | מה היא מריצה |
|---|---|---|
| 1 | **שעון פנימי** ([scheduler.ts](src/lib/scheduler.ts), בתוך `tipul`, כל 15 דק') | reminders, reminders-2h, notifications, debt-reminders, subscription-reminders, fix-stuck-payments, generate-alerts |
| 2 | **5 Render crons** (Virginia) | cardcom-cleanup-pending, cardcom-invoice-sync, cardcom-pdf-backup, cardcom-pdf-rehash, trial-expiry |
| 3 | **cron-job.org** (השעון החיצוני של המשתמש) | notifications (כפול עם #1, יש מנעול בקוד), chat-attachment-orphan-cleanup + **2 כפילויות כבויות = זבל** |

### משימות שלא רצות באף מקום (~10):
`subscription-recurring-charge` (כסף), `booking-outbox` (אישורי שבת — רשת ביטחון), `audit-log-retention` + `data-access-audit-retention` + `data-retention` (חוק), `cardcom-webhook-stuck`, `custom-contract-renewals`, `departure-deadlines`, `cleanup-idempotency`, `impersonation-hardkill`.
(`promote-pending-tiers` — לא רלוונטי, ה-AI הוסר.)

### הערה כנה על דחיפות:
**כרגע (טרום-השקה) אף אחת מהמשימות החסרות לא גורמת נזק פעיל:** אין מנויים בתשלום (Cardcom production עוד לא מחובר), אין מידע בן 12 חודש למחוק, וזימון עצמי בשבת חסום. **הפער הוא סיכון רדום שמתממש בהשקה ובגדילה** — לכן מתקנים נכון, אבל בלי בהלה.

---

## 2. תובנת המפתח (בגלל יעד קנה המידה)

**השעון הפנימי הוא הבחירה הלא נכונה לגדילה.** כשיש הרבה משתמשים מריצים כמה עותקים של האתר במקביל; השעון הפנימי יושב בכל עותק → משימה אחת תרוץ כמה פעמים בו-זמנית (עומס וכפילות). שעון **חיצוני** מצלצל פעם אחת בלבד.

➡️ **העיקרון:** מקור תזמון **חיצוני אחד = מקור האמת**. השעון הפנימי **ייכבה**.

---

## 3. החלטות שכבר סוכמו עם המשתמש
- כיוון: לאחד למקום אחד מסודר (לא 3 שעונים).
- 3 משימות ה-Cardcom הכבדות (invoice-sync, pdf-backup, pdf-rehash) — נשארות crons נפרדים (ממילא חיצוני).
- cron-job.org בשימוש פעיל ומוכר למשתמש ("השעון החיצוני שלי").

---

## 4. השלבים

### שלב 0 — ניקוי מיידי (אפס סיכון) — *המשתמש*
מחיקת 2 הכפילויות הכבויות של "תזכורות יומיות" ב-cron-job.org. 2 קליקים.

### שלב א' — חיוב מנויים (קריטי לפני השקה) — *Claude + אימות*
- `subscription-recurring-charge` חייב לרוץ יומית לפני שמשיקים מנויים בתשלום.
- בטוח להפעיל כבר עכשיו: אין candidates → יחזיר 0 בלי לחייב אף אחד, בלי dunning, בלי חסימות.
- ⚠️ כלל: לא לחבר Cardcom production ולהשיק מנויים **לפני** שה-cron הזה רץ ומאומת.
- אימות: הרצה ידנית אחת → לוודא `{ candidates: 0 }` בלי שגיאה.

### שלב ב' — סגירת שאר הפערים (לפי עדיפות) — *Claude + אימות*
- חוק: `audit-log-retention`, `data-access-audit-retention`, `data-retention`.
- תשלומים: `cardcom-webhook-stuck`.
- תחזוקה: `cleanup-idempotency`, `impersonation-hardkill`, `custom-contract-renewals`, `departure-deadlines`, `booking-outbox` (רשת ביטחון).
- ⚠️ `chat-attachment-orphan-cleanup` כבר רץ ב-cron-job.org — **לא** ליצור שוב.

### שלב ג' — איחוד וכיבוי השעון הפנימי — *Claude (קוד) + אימות זהיר*
- להעביר ל-crons חיצוניים את 6 המשימות שרצות רק בשעון הפנימי: reminders, reminders-2h, debt-reminders, subscription-reminders, fix-stuck-payments, generate-alerts.
- notifications כבר חיצוני (cron-job.org) — לוודא כיסוי שעות נכון (בוקר+ערב).
- רק אחרי שכל ה-6 מכוסים חיצונית: **לכבות** את השעון הפנימי — `ENABLE_IN_APP_SCHEDULER=false` ב-Render env.
- (לשקול בעתיד: להסיר את scheduler.ts מהקוד לגמרי, או להשאיר ככיבוי-דיפולט.)

### שלב ד' — render.yaml כמקור אמת — *Claude (קוד)*
- לכתוב מחדש את [render.yaml](render.yaml) שישקף את המציאות (שם `tipul`, אזור Virginia) ויכלול את **כל** ה-crons במקום אחד, בבקרת-גרסאות. כך כל שינוי עתידי = עריכת קובץ אחד, לא קליקים ב-3 מקומות.

### עתיד (כשמתקרבים באמת לרבבות)
מערכת תורים/עובדים ייעודית (worker + queue). ה-end-game לקנה מידה. **לא עכשיו** — לא להנדס יתר על המידה.

---

## 5. החלטה פתוחה: איפה לארח את ה-crons החדשים?
**המלצה: Render crons, מוגדרים ב-render.yaml** (בבקרת-גרסאות, ניתן לשחזר, מקצועי לגדילה). חלופה: cron-job.org (המשתמש מכיר, אבל ידני ולא בבקרת-גרסאות).
מנגנון היצירה (Blueprint מול Render API) — ייבחר בתחילת הביצוע.

---

## 6. מי עושה מה
- **Claude (בקוד):** render.yaml, scheduler.ts, טסטים. אולי יצירת crons דרך Render API (באישור).
- **המשתמש:** מחיקת זבל ב-cron-job.org; כיבוי/הדלקת env ב-Render; חיבור Blueprint אם נבחר; **לבטל את שני מפתחות ה-API שנחשפו בצ'אט**.

## 7. תהליך (חובה — כסף/שבת/חוק)
- לפי [[feedback_critical_changes_process]]: לחיוב המנויים — TDD/בדיקה לפני שינוי לוגיקה.
- לפני כל פוש: build נקי + סוכני ביקורת (5 + סייבר + תקינות-אבטחה) עד נקי → פוש ל-main.
- שינוי אחד בכל פעם, commits קטנים, שמות קבצים מפורשים (לא `git add .`).
