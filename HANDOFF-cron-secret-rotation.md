# HANDOFF — סיבוב (rotation) של CRON_SECRET + תיקון 5 crons עם סוד קשיח

**תאריך פתיחה:** 2026-06-19
**רגישות:** 🔴 קריטי — נוגע בכסף (cron-ים של Cardcom/חיובים). לפי `feedback_critical_changes_process`: זהירות, צעד-צעד, אימות אחרי כל שלב.
**סטטוס:** 🟡 שלב 1+2 הושלמו ב-Render (2026-06-19). נותר: cron-job.org (משתמש) → bake 24-48ש' → שלב 4 (הסרת PREVIOUS) → ניקוי מפתחות.

**ערכים (לעבודה זו בלבד):** OLD=`ac55cc6bbe29ace5a062d7c7793bcd5c`. NEW=64 hex, שמור ב-`C:\Users\User\.render-cron-rotation\new-secret.txt` (preview `9257...28f4`). web service id=`srv-d59i6pbuibrs73baocgg`.

---

## 1. הבעיה
5 cron-ים ישנים ב-Render מטמיעים את ה-`CRON_SECRET` בטקסט גלוי בתוך ה-`startCommand`:
```
... -H "Authorization: Bearer ac55cc6bbe29ace5a062d7c7793bcd5c"
```
במקום `Bearer $CRON_SECRET`. כל מי שיש לו גישת קריאה ל-Render (dashboard/API) רואה את הסוד ויכול להפעיל את כל endpoints ה-cron — כולל פעולות כספיות.

**הסוד שנחשף (OLD):** `ac55cc6bbe29ace5a062d7c7793bcd5c` (32 hex = 128 ביט). נחשף גם בצ'אטים קודמים. **חייב להיות מוחלף (rotated).**

## 2. החדשות הטובות — הקוד כבר בנוי לזה
- `src/lib/cron-auth.ts` תומך ב-`CRON_SECRET` + `CRON_SECRET_PREVIOUS` במקביל (zero-downtime rotation). נוהל מתועד בקוד (שורות 88-91).
- מנגנון `AdminAlert` ("CRON_SECRET rotation incomplete") נוצר אוטומטית כש-cron נקרא עם ה-secret הישן — חיווי שצריך לסיים rotation.
- `render.yaml` מראה את הדפוס התקין (`Bearer $CRON_SECRET`). **שים לב:** `render.yaml` **אינו** מקור האמת לפריסה (ראה `project_render_deployment`) — הפריסה נוצרה ידנית. לא נוגעים בו במשימה הזו.

## 3. מפת הצרכנים של CRON_SECRET
| # | צרכן | תפקיד | טיפול ב-rotation |
|---|---|---|---|
| 1 | שרת web `tipul` (hostname `tipul-mh2t.onrender.com`) | **מאמת** | מגדירים `CRON_SECRET=NEW` + `CRON_SECRET_PREVIOUS=OLD` |
| 2 | מתזמן פנימי (`scheduler.ts`, בתוך `tipul`) | שולח | **אוטומטי** — קורא env של השרת |
| 3 | 14 Render crons | שולחים | מעדכנים `CRON_SECRET=NEW` בכל אחד; 5 הישנים גם תיקון `startCommand` |
| 4 | cron-job.org (2 jobs פעילים: notifications, chat-attachment-orphan-cleanup) | שולח | **המשתמש** מעדכן header ל-NEW |

## 4. 5 ה-crons הישנים לתיקון (service IDs)
| שם | service ID | מתודה |
|---|---|---|
| cardcom-pdf-rehash | `crn-d7niandckfvc73f0kfa0` | POST |
| cardcom-pdf-backup | `crn-d7niamkvikkc73b9k5ng` | POST |
| cardcom-cleanup-pending | `crn-d7niakreo5us73fasck0` | POST |
| cardcom-invoice-sync | `crn-d7niak77f7vs73fpc940` | POST |
| trial-expiry-cron | `crn-d6kkku7tskes73aokqe0` | GET |

לכל אחד צריך: (א) `startCommand` → `process.env.CRON_SECRET` (במקום הקשיח). (ב) **להוסיף** env var `CRON_SECRET=NEW` (כרגע אין להם אף env var).

## 4.5 מצב חי מאומת (2026-06-19, דרך Render API, limit=100)
- שרת web: `srv-d59i6pbuibrs73baocgg` (name `tipul`), 31 env vars, יש `CRON_SECRET`=OLD, **אין** `CRON_SECRET_PREVIOUS`.
- 9 crons חדשים: לכל אחד env var יחיד `CRON_SECRET`=OLD; startCommand תקין.
- 5 crons ישנים: **0 env vars**; סוד קשיח.
- אין env group רלוונטי (היחיד ריק). כל שירות מחזיק `CRON_SECRET` משלו.
- **מיקום ה-startCommand ב-API:** `serviceDetails.envSpecificDetails.startCommand`. הפקודה היא `node -e "..."` (לא curl), hostname קשיח `tipul-mh2t.onrender.com` (לא סוד — להשאיר).
- **דפוס חדש מוכח (cleanup-idempotency):**
  ```
  node -e "const h=require('https');const o={hostname:'tipul-mh2t.onrender.com',path:'/api/cron/<PATH>',method:'<METHOD>',headers:{'Authorization':'Bearer '+process.env.CRON_SECRET<,Content-Length:0 ל-POST>}};const r=h.request(o,res=>{let d='';res.on('data',x=>d+=x);res.on('end',()=>{console.log('status:'+res.statusCode);console.log(d);process.exit(res.statusCode>=400?1:0)})});r.on('error',e=>{console.error(e);process.exit(1)});r.end();"
  ```
  התיקון = החלפת `'Bearer ac55cc6b...'` ב-`'Bearer '+process.env.CRON_SECRET` בלבד.
- **סדר קריטי לכל cron ישן:** קודם להוסיף env `CRON_SECRET=NEW`, ורק אז לתקן startCommand (אחרת רגע ביניים של `Bearer undefined`). כל עוד PREVIOUS=OLD, הסוד הקשיח עובד עד הרגע שמחליפים.

---

## 5. התוכנית המדויקת (סדר קריטי!)

**עיקרון מנחה:** בכל רגע נתון, כל שולח חייב לשלוח סוד שהמאמת מקבל. לכן **פותחים את חלון החפיפה לפני** שמחליפים שולחים.

### שלב 0 — אימות מצב חי (קריאה בלבד, אפס סיכון)
1. `GET /v1/services?limit=100` — לאתר את service ID של שרת ה-web (`type=web_service`, name `tipul`).
2. `GET /v1/services/{id}` לכל אחד מ-5 הישנים — לאשר את ה-startCommand הקשיח + לבדוק אילו env vars קיימים (יש CRON_SECRET? יש RENDER_EXTERNAL_URL? URL קשיח?).
3. `GET /v1/services/{webId}/env-vars` — לאשר ש-CRON_SECRET קיים בשרת + לבדוק אם CRON_SECRET_PREVIOUS כבר מוגדר.
4. (מדגם) `GET` על cron חדש אחד תקין — לאשר את הדפוס הרצוי.

### שלב 1 — לייצר NEW + לפתוח חלון חפיפה (השרת הראשי)
1. לייצר NEW חזק: 64 hex (256 ביט) דרך CSPRNG. **לא** לכתוב לקובץ בריפו; לשמור זמנית מחוץ לריפו (למשל `C:\Users\User\.render-cron-rotation\new-secret.txt`), למחוק בסיום.
2. PATCH/PUT env של שרת `tipul`:
   - `CRON_SECRET_PREVIOUS = OLD` (`ac55cc6b...`)
   - `CRON_SECRET = NEW`
3. זה מפעיל redeploy של השרת (~דקות). אחרי שעלה: השרת מקבל **גם OLD וגם NEW**.
4. ✅ אימות: `curl` ל-endpoint GET לא-מזיק (למשל `/api/cron/cleanup-idempotency`) עם `Bearer NEW` → צריך 200 (לא "לא מורשה"); עם bearer שגוי → 401.

> מרגע זה, כל שולח שעדיין על OLD ממשיך לעבוד (דרך PREVIOUS). אין חלון כשל.

### שלב 2 — להחליף את כל השולחים ל-NEW (סדר לא קריטי בתוך השלב)
- **5 crons ישנים:** PATCH `startCommand` ל-`Bearer $CRON_SECRET` (+ תיקון URL אם קשיח) **וגם** PUT env `CRON_SECRET=NEW`. (PUT למפתח בודד, לא bulk — bulk מוחק env אחרים!)
- **9 crons חדשים:** PUT env `CRON_SECRET=NEW` (ה-startCommand כבר תקין).
- **cron-job.org:** *המשתמש* מעדכן את ה-Authorization header ל-NEW ב-2 ה-jobs.
- **מתזמן פנימי:** כבר טופל בשלב 1 (קורא env של השרת).
- ✅ אימות לכל cron ששונה: לקרוא בחזרה את ה-startCommand+env (GET) ולוודא שאין יותר `ac55cc6b`. אופציונלי: "Run now" בדאשבורד ולבדוק success.

### שלב 3 — תקופת המתנה + אימות מלא (24-48ש')
- לוודא שאין יותר ריצות עם OLD: לבדוק שלא נוצרת התראת "CRON_SECRET rotation incomplete" חדשה ב-AdminAlert, ושאין warnings בלוגים.
- לוודא שכל ה-crons רצים בהצלחה (לוגי ריצה ב-Render). ה-cron האיטי ביותר הוא חודשי (cardcom-pdf-rehash, 1 לחודש) — אפשר "Run now" ידני כדי לא לחכות חודש.
- ⚠️ **לפני שלב 4:** לוודא ש-cron-job.org עודכן (קל לשכוח — זו מערכת חיצונית).

### שלב 4 — לסגור את החלון
- להסיר `CRON_SECRET_PREVIOUS` מ-env של השרת. מרגע זה OLD מת.
- אם משהו פוספס — הוא יתחיל להחזיר 401 ונראה את זה מיד (הפיך: להחזיר את PREVIOUS).

---

## 6. Rollback
- **אם אימות שלב 1 נכשל** (NEW לא מתקבל): להחזיר את `CRON_SECRET` ל-OLD בשרת, להסיר PREVIOUS. חוזרים למצב המקורי.
- **אם cron ספציפי נכשל אחרי שינוי:** PREVIOUS=OLD עדיין פעיל → הוא לא באמת נשבר; לתקן את ה-startCommand/env של אותו cron.
- **אם אחרי שלב 4 משהו 401:** להחזיר `CRON_SECRET_PREVIOUS=OLD` זמנית, לאתר את השולח שפוספס, לעדכן, ואז להסיר שוב.

## 7. Render API — רפרנס
- בסיס: `https://api.render.com/v1` — header `Authorization: Bearer <RENDER_API_KEY>`.
- `GET /v1/services?limit=100` — רשימת שירותים.
- `GET /v1/services/{id}` — שירות בודד (cron: startCommand תחת `serviceDetails`).
- `PATCH /v1/services/{id}` — עדכון (כולל startCommand של cron).
- `GET /v1/services/{id}/env-vars` — env vars.
- `PUT /v1/services/{id}/env-vars/{key}` — עדכון env var בודד (לא לדרוס bulk!).
- ⚠️ צריך מפתח עם **הרשאת כתיבה**. המפתחות הקודמים היו read-only ו-**אמורים להתבטל** (ראה PLAN-cron-scheduling-consolidation שורה 90).

## 8. Checklist
- [x] שלב 0: אומת מצב חי (web ID, 5 crons, env vars) — 2026-06-19
- [x] שלב 1: NEW נוצר; web עודכן (CRON_SECRET=NEW, PREVIOUS=OLD); אימות 200(NEW)/401(שגוי)/200(OLD) עבר — deploy live
- [x] שלב 2 (Render): 5 ישנים תוקנו (startCommand→process.env + env=NEW); 9 חדשים env=NEW; כל 14 deploys=live; סריקה סופית 0 בעיות
- [ ] שלב 2 (משתמש): **cron-job.org** — לעדכן header ל-NEW ב-2 jobs (notifications, chat-attachment-orphan-cleanup)
- [ ] שלב 3: 24-48ש' ללא התראת rotation / 401; כל ה-crons בריאים (בדיקת run logs)
- [ ] שלב 4: הסרת CRON_SECRET_PREVIOUS מהשרת (רק אחרי cron-job.org + bake)
- [ ] ניקוי: מחיקת `C:\Users\User\.render-cron-rotation\`; ביטול מפתח Render API זמני; ביטול מפתחות חשופים ישנים
- [x] עדכון memory `project_render_deployment` — 2026-06-19

> ℹ️ עד שלב 4 צפויה התראת AdminAlert "CRON_SECRET rotation incomplete" + warnings — **תקין**: cron-job.org עדיין שולח OLD (מתקבל דרך PREVIOUS). נעלם אחרי עדכון cron-job.org + הסרת PREVIOUS.
