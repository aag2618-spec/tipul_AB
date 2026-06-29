# סיכום ביקורת אבטחה — מה שנותר לטפל

> נוצר 2026-06-29 מתוך ביקורת אבטחה רב-סוכנית (security-review, full mode, 17 סוכנים).
> מיועד לטיפול בצ'אט נפרד. הריצו security-review מחדש (mode: diff) אחרי כל תיקון.

## תמצית

נמצאו 9 ממצאים. שניים מהם בדרגת חומרה גבוהה ושניהם מסכנים מידע רפואי סודי: הראשון — תגובת השרת בעדכון סטטוס פגישה (PATCH /api/sessions/[id]/status) מחזירה למזכירה את נושא הפגישה (topic) ואת סיכום המטפל (notes) המפוענחים, כך שמזכירה יכולה לקצור תוכן קליני סודי של כל הקליניקה למרות שהממשק לעולם לא מציג לה שדות אלו. השני — קובץ .env.local בתחנת הפיתוח מכיל סודות ייצור חיים, כולל מפתח ההצפנה (ENCRYPTION_KEY) שמצפין את כל ה-PHI וחיבור ישיר ל-DB הייצור, ולכן מי שמשיג גישה למחשב יכול לפענח את כל המידע הרפואי. שאר 7 הממצאים בדרגות נמוכות/מידע בלבד (CSV injection, אינדיקטורים של idempotency והעדר rate-limit, וכמה הערות חוסן שאינן ניתנות לניצול כיום). מסקנה: יש סיכון ממשי לדליפת מידע רפואי — שני ה-HIGH דורשים טיפול מיידי לפני שמסתמכים על המערכת בייצור.

**ספירה:** קריטי 0 · גבוה 2 · בינוני 0 · נמוך 3 · (סה"כ 8 ממצאים)

## ✅ כבר טופל (לא בקובץ הזה)

- **#1 דליפת PHI ב-`PATCH /api/sessions/[id]/status`** — תוקן ונדחף ל-main (commit `7b56fb99`, 2026-06-29) + בדיקת יחידה. **אין צורך לטפל שוב.**

## ✅ תוקן 2026-06-29 (ממתין לאישור push)

- **#3 CSV Injection** — נוסף helper `neutralizeCsvCell` ב-`src/lib/export-utils.ts` (מיוצא), מוחל על שם מטופל/מספר קבלה/שם עסק/sessionType ב-`exportDetailedExcel`, `exportAccountantReport`, `exportToCSV`. בנוסף נסגר פער כיסוי שסוכן מצא: `src/app/admin/terms/page.tsx` (CSV ידני) קיבל ניטרול + escape גרשיים. `src/app/api/payments/export/route.ts` כבר היה מוגן עצמאית (`sanitizeCsvCell`).
- **#4 Idempotency אדמין** — `admin/cardcom/refund` + `admin/cardcom/charge-token`: המפתח עכשיו `${userId}:POST:<path>:<entityId>:${key}` + אכיפת TTL (`expiresAt > now`) בקריאה. חיפוש ה-idempotency הועבר לאחר אימות הגוף. בדיקות עודכנו (`expiresAt` עתידי).
- **#5 Rate-limit חיוב** — קבוע `CARDCOM_CHARGE_USER_RATE_LIMIT` (20/דקה, מפתח משותף `cardcom-charge:${userId}`) הוחל על `charge-cardcom`, `charge-saved-token`, `charge-cardcom-bulk`. סוכן אישר: flow טיפוסי = בקשה אחת (גם מצרפי), אין לולאת "חייב הכל" שתיחסם.
- **#7 reset-password** — הוסר אובייקט `user` מתגובת ההצלחה; עכשיו זהה לתשובת "לא נמצא" → אין דליפת קיום חשבון/role. אין קוראים שתלויים בשדה (אומת).
- **#8 add-credit** — נוספה בדיקת ownership מפורשת (`buildClientWhere`) לפני `createPaymentForSession`.

**אימות:** `tsc` נקי לקבצים שלי, `eslint` נקי, כל 1054 הבדיקות ירוקות, 3 סוכני ביקורת אינטגרציה (0 שבירות). ⚠️ נותר #2 (rotation סודות — תפעולי, לא קוד) + לא נבדק חי + ממתין לאישור push.

---

## מה שנותר

### 🟠 #2 · [גבוה] קובץ .env.local מכיל סודות ייצור חיים (כולל מפתח ההצפנה של כל ה-PHI) בתחנת הפיתוח

- **קובץ:** `.env.local` (שורה 1)
- **סוג:** Secrets Exposure / Cleartext Storage of Credentials
- **PHI בסיכון:** כן · **ביטחון:** high · **אימות:** 3/3 מאמתים אישרו

**ההסבר:**

קובץ .env.local במחשב הפיתוח מכיל סודות ייצור אמיתיים בטקסט גלוי: סיסמת ה-DB של הייצור ב-Render, מפתח Resend למייל, GOOGLE_CLIENT_SECRET ומפתחות Google API, NEXTAUTH_SECRET, CRON_SECRET, PULSEEM_API_KEY, והכי קריטי — ENCRYPTION_KEY, המפתח שמצפין את כל המידע הרפואי (נושאי פגישה, סיכומים, היסטוריה רפואית, תמלולים). אומת שהקובץ אינו ב-git ולא בהיסטוריה, כך שאין דליפה דרך ה-repo. אבל הסודות חשופים על הדיסק ומחוברים ישירות ל-DB הייצור. מי שמשיג גישה למחשב (גניבת מחשב, גיבוי לא מוצפן, סנכרון ענן, malware, או סוכן AI עם גישה לדיסק) מקבל מיד חיבור מלא ל-DB הייצור יחד עם מפתח הפענוח — כלומר יכול לקרוא את כל המידע הרפואי הסודי בלי שום שלב נוסף. זהו אותו ממצא שזוהה כבר במעבר קודם וסומן לטיפול דחוף.

**התיקון המומלץ:**

לבצע rotation מיידי לכל הסודות שדלפו: סיסמת DB ב-Render, RESEND_API_KEY, GOOGLE_CLIENT_SECRET ושני מפתחות Google API, NEXTAUTH_SECRET, CRON_SECRET, PULSEEM_API_KEY. אזהרה: ENCRYPTION_KEY דורש זהירות מיוחדת — אי אפשר פשוט להחליף אותו, כי החלפה דורשת הצפנה מחדש (re-encrypt) של כל השדות המוצפנים ב-DB. מומלץ מאוד להפריד סביבת פיתוח מ-DB הייצור: להקים DB פיתוח נפרד כדי לא לעבוד מול PHI אמיתי מקומית, ולוודא שאין גיבוי או סנכרון-ענן של תיקיית הפרויקט.

---

### 🔵 #3 · [נמוך] הזרקת נוסחאות לאקסל (CSV Injection) ביצוא תשלומים, דוחות רואה חשבון וייצוא CSV

- **קובץ:** `src/lib/export-utils.ts` (שורה 623)
- **סוג:** CSV/Formula Injection
- **PHI בסיכון:** כן · **ביטחון:** medium · **אימות:** לא עבר אימות יריבי (low/info)

**ההסבר:**

בקבצי ה-CSV/Excel שהמערכת מייצאת (יצוא תשלומים, דוח רואה חשבון, יצוא מפורט), ערכים שמקורם בנתוני משתמש — בעיקר שם המטופל ומספר הקבלה — נכתבים לתא בלי לנטרל תווי-נוסחה מובילים (=, +, -, @). הציטוט הקיים מונע שבירת מבנה ה-CSV אבל לא מונע שאקסל יפרש תא שמתחיל ב-= כנוסחה. מטופל שנרשם דרך טופס קליטה/רישום עצמי יכול להזין שם כמו =HYPERLINK(...) או =cmd|'/c calc'!A1, וכשהמטפל או רואה החשבון פותחים את הקובץ באקסל, התא מתפרש כנוסחה — מה שיכול להדליף תוכן תאים אחרים (סכומים, שמות, מספרי קבלה — PHI) לכתובת חיצונית, או במקרים נדירים להריץ פקודות. הסיכון מוגבר כי הקובץ נפתח מחוץ למערכת, אצל הרו"ח.

**התיקון המומלץ:**

להוסיף נטרול formula-injection לכל ערך טקסט שנכתב לתא CSV/XLSX: אם הערך מתחיל ב-= , + , - , @ , tab או CR — להקדים גרש בודד ('). למקם helper משותף, למשל neutralizeCsvCell, ולהחיל אותו על clientName/receiptNumber/bulkLabel בכל ה-exporters (exportToCSV, exportAccountantReport, exportDetailedExcel). היצוא ל-HTML כבר בטוח כי הוא עושה escape.

---

### 🔵 #4 · [נמוך] התנגשות מפתח Idempotency בין מסלולי החזר וחיוב של האדמין

- **קובץ:** `src/app/api/admin/cardcom/refund/route.ts` (שורה 36)
- **סוג:** Idempotency / replay
- **PHI בסיכון:** לא · **ביטחון:** high · **אימות:** לא עבר אימות יריבי (low/info)

**ההסבר:**

שני מסלולי האדמין (החזר כספי refund וחיוב charge-token) שומרים ומחפשים את רשומת ה-idempotency לפי מפתח שמורכב רק ממזהה המשתמש + ערך ה-Idempotency-Key, בלי רכיב של נתיב/מסלול — בניגוד למסלולי המטפל הרגילים שכוללים את הנתיב במפתח. לכן אם אותו לקוח/סקריפט משתמש שוב באותו ערך Idempotency-Key בשני המסלולים, הקריאה השנייה תקבל את התשובה השמורה של הראשונה במקום להתבצע — למשל בקשת חיוב עלולה להחזיר תשובת החזר ישנה, או החזר שני (בסכום אחר) יידלג בשקט ויחזיר את התשובה של החזר קודם. דורש משתמש ADMIN מאומת והוא לא נתיב להסלמת הרשאות — ההשפעה היא באג תפעולי/חשבונאי בלבד (החזר שנראה כאילו הצליח אך לא רץ).

**התיקון המומלץ:**

לכלול במפתח ה-idempotency של מסלולי האדמין את הנתיב ואת מזהה הישות הרלוונטית, בדיוק כמו במסלולי המטפל: למשל ${userId}:POST:/api/admin/cardcom/refund:${transaction.id}:${idempotencyKey}. בנוסף, מסלול ההחזר אינו אוכף TTL בבדיקת ה-lookup (מחזיר כל רשומה קיימת, בניגוד למסלולי המטפל שבודקים expiresAt > now) — יש להוסיף את אותה בדיקת TTL.

---

### 🔵 #5 · [נמוך] אין הגבלת קצב פר-משתמש על מסלולי יזום חיוב בכרטיס אשראי (Cardcom)

- **קובץ:** `src/app/api/payments/[id]/charge-cardcom/route.ts` (שורה 30)
- **סוג:** Rate limiting / abuse
- **PHI בסיכון:** לא · **ביטחון:** medium · **אימות:** לא עבר אימות יריבי (low/info)

**ההסבר:**

מסלולי החיוב של המטפל (charge-cardcom, charge-cardcom-bulk, charge-saved-token) מבצעים אימות, בדיקות scope ושמירת in-flight, אבל אף אחד מהם לא מפעיל הגבלת קצב פר-משתמש (checkRateLimit) — רק export ו-send-cardcom-link מפעילים. בפרט charge-saved-token מפעיל חיוב אמיתי מיידי מול token שמור של המטופל. בהיעדר הגבלת קצב, מטפל מאומת (או חשבון שנפרץ) יכול לשגר ריבוי בקשות חיוב, מה שעלול להוביל לשימוש לרעה מול Cardcom ולחיובים חוזרים. אין כאן חשיפה חוצת-ארגונים או לא-מאומתת.

**התיקון המומלץ:**

להוסיף checkRateLimit פר-משתמש על שלושת מסלולי יזום החיוב (charge-cardcom, charge-cardcom-bulk, charge-saved-token), עם דגש על charge-saved-token שמבצע חיוב מיידי. להגדיר סף שמרני (למשל מספר חיובים מוגבל לחלון זמן) ולהחזיר 429 בחריגה.

---

### ⚪ #6 · [מידע] שכבת האימות וההרשאות מהודקת — לא נמצאו פרצות הניתנות לניצול (סיכום כיסוי)

- **קובץ:** `src/lib/api-auth.ts` (שורה 34)
- **סוג:** Authentication/Authorization (coverage summary)
- **PHI בסיכון:** לא · **ביטחון:** high · **אימות:** לא עבר אימות יריבי (low/info)

**ההסבר:**

סקירה מלאה של מסלול האימות וההרשאות לא מצאה אף פרצה הניתנת לניצול. נבדקו: requireAuth/requireAdmin/requirePermission (כולם בודקים סיסמה ישנה/session פג/דרישת 2FA לפני החזרת userId); מפת ההרשאות עם דירוג שמונע ל-MANAGER לבצע פעולת ADMIN; ה-proxy שמגדר את /admin ו-/clinic-admin; מנגנון ההתחזות (impersonation) שטוען הכל מ-DB וחוסם cross-org והתחזות ל-ADMIN/OWNER; ה-2FA עם anti-bypass ו-session-binding ו-rate-limit כפול; ומסלולי setup/reset מוגנים ב-kill-switch וב-secret עם השוואת timing-safe. זהו סיכום כיסוי בלבד, לא פגיעות.

**התיקון המומלץ:**

להמשיך לאכוף את הדפוסים הקיימים: כל route חדש תחת /api/clinic-admin שאינו ב-whitelist חייב לקרוא requireClinicOwner/requireClinicAdminAccess ולא רק להסתמך על ה-proxy; כל פעולה עצמית רגישה חייבת disallowImpersonation; כל שינוי של credential (2FA/סיסמה) חייב להעלות sessionVersion ולנקות את ה-JWT cache.

---

### ⚪ #7 · [מידע] מסלול איפוס סיסמה של אדמין מדליף קיום חשבון ו-role דרך הבדל בתשובה

- **קובץ:** `src/app/api/admin/reset-password/route.ts` (שורה 111)
- **סוג:** Information Disclosure (response differential)
- **PHI בסיכון:** לא · **ביטחון:** high · **אימות:** לא עבר אימות יריבי (low/info)

**ההסבר:**

כשהמשתמש קיים, התשובה כוללת את האימייל/שם/role שלו; כשאינו קיים, מוחזרת הודעה גנרית בלבד. ההבדל הזה מאפשר לזהות אם חשבון קיים ומה ה-role שלו. אבל המסלול דורש ADMIN_SECRET (לפחות 32 תווים, השוואת timing-safe) + הגבלת קצב של 3 לשעה לכל IP, כך שרק מי שכבר מחזיק בסוד האדמיני בכלל יכול להגיע לכאן — מה שמנטרל את הניצולוּת בפועל. מדווח ברמת info לשלמות בלבד.

**התיקון המומלץ:**

להחזיר תשובה גנרית אחידה ('הסיסמה אופסה בהצלחה' בלבד, בלי אובייקט user) בשני המסלולים — קיים ולא-קיים — כדי לאחד את התשובה לחלוטין. ה-role/email כבר נרשמים ב-logger.warn לצורך אודיט, כך שאין צורך להחזירם ל-caller.

---

### ⚪ #8 · [מידע] הגנת IDOR במסלול add-credit נשענת עקיפות על ה-payment service (הערת חוסן)

- **קובץ:** `src/app/api/clients/[id]/add-credit/route.ts` (שורה 43)
- **סוג:** IDOR / Broken Object Level Authorization (defense-in-depth)
- **PHI בסיכון:** לא · **ביטחון:** high · **אימות:** לא עבר אימות יריבי (low/info)

**ההסבר:**

המסלול POST /api/clients/[id]/add-credit לא מבצע בדיקת ownership מפורשת על מזהה המטופל מה-URL לפני הקריאה ל-service, בניגוד כמעט לכל שאר מסלולי ה-[id]. הבידוד הרב-ארגוני נשען כולו על כך ש-createPaymentForSession מקבל scopeUser ובונה clientWhere עם buildClientWhere, ומחזיר 'מטופל לא נמצא' אם המטופל מחוץ ל-scope. נבדק ואומת שהבדיקה קיימת — ולכן כרגע אין פגיעות ניתנת לניצול: מטפל לא יכול להוסיף קרדיט למטופל של קליניקה אחרת. זו הערת חוסן בלבד: ההגנה היחידה היא עקיפה ותלויה במימוש פנימי של ה-service; אם בעתיד מישהו יסיר את העברת scopeUser, ייפתח IDOR פיננסי.

**התיקון המומלץ:**

להוסיף בדיקת ownership מפורשת ב-route עצמו, עקבית עם שאר ה-[id] routes, לפני הקריאה ל-service: prisma.client.findFirst({ where: { AND: [{ id }, buildClientWhere(scopeUser)] }, select: { id: true } }); ואם null — להחזיר 404. כך ה-route לא יסתמך רק על מימוש פנימי של ה-service כשכבת בידוד יחידה.

---

## פערי כיסוי (לא נבדק בביקורת הזו)

- שימוש לרעה במכסות/קרדיט (business-logic abuse): מנגנון מכסת ה-SMS (src/lib/clinic/sms-quota.ts), הקרדיט (src/lib/credits.ts) וה-limits (src/lib/clinic/limits.ts) לא נבדקו מול race condition. שתי בקשות מקבילות לשליחת SMS או ניכוי קרדיט עלולות לרדת מתחת לאפס או לעקוף מכסה אם הניכוי אינו אטומי (check ואז decrement בנפרד).
- שלמות והרשאות יומן הביקורת: src/lib/audit-logger.ts כותב ל-DB באופן fire-and-forget — אם הכתיבה נכשלת הפעולה ממשיכה ואין רשומת ביקורת (פער פורנזי). בנוסף מסלולי הקריאה של היומן (admin/audit/data-access, admin/audit-log) לא נבדקו: האם הם מסוננים לארגון (האם MANAGER של קליניקה א' רואה יומן של קליניקה ב'?) והאם נחשף PHI בשדה meta.
- עמידות ה-rate-limit ו-DoS: src/lib/rate-limit.ts הוא Map בזיכרון פר-instance. בריבוי instances ה-counters לא משותפים, כך שתוקף מקבל פי N הזדמנויות ל-brute-force של login/OTP/webhook. אין חסם זיכרון על ה-Map (גדילה לא-חסומה ממפתחות per-IP/per-user שונים = וקטור DoS).
- שמירת/מחיקת PHI (retention / right-to-erasure): אין כיסוי למחיקת מטופל — האם DELETE על Client מנקה ב-cascade את Sessions/Payments/Documents/QuestionnaireResponse/CommunicationLog המוצפנים, או משאיר PHI יתום. גם קבצי storage (מסמכים/צ'אט) — האם נמחקים עם הרשומה או נשארים נגישים דרך /api/uploads.
- תלויות צד-שלישי (supply-chain): לא הורץ npm audit ולא נבדקו CVE בתלויות (sharp לעיבוד תמונות, uuid, prisma, next). עיבוד sharp על תמונות שמעלה המשתמש (stripImageMetadata) הוא וקטור image-parsing קלאסי שלא נבחן.
- טיפול בנתיבים ב-/api/uploads/[...path]: החסימה בודקת רק '..' ו-null byte. לא נבדק '..' מקודד או backslash על Windows, וה-content-type נקבע לפי סיומת הנתיב (לא magic-bytes). ראוי לוודא שאין נתיב להגיש svg/html דרך קטגוריה שאינה support (allowlist סיומות).
- TOCTOU בטוקנים חד-פעמיים: לא נבדק race בין שימוש-חוזר/ביטול לבין מימוש של טוקנים שבהם הטוקן הוא ההרשאה היחידה — self-booking OTP, departure-choice token, clinic-invite token (double-use של OTP/token חד-פעמי).
- src/lib/two-factor.ts — לוגיקת OTP/2FA לעומק (replay של קוד) לא נבדקה במלואה.
- src/lib/storage.ts — שכבת האחסון (R2/דיסק): הרשאות, ניקוי וטיפול בנתיבים לא נבדקו.

## צעדים מומלצים להמשך

- ✅ ~~מיידי — לתקן את דליפת ה-PHI ב-PATCH /api/sessions/[id]/status (rank 1)~~ — **בוצע** (commit `7b56fb99`, 2026-06-29). שאר הצעדים למטה עדיין פתוחים.
- מיידי — לבצע rotation לכל סודות הייצור שב-.env.local (rank 2), ובמיוחד להפריד את ENCRYPTION_KEY בזהירות (דורש re-encrypt, אסור החלפה ישירה), ולהקים DB פיתוח נפרד כדי לא לעבוד מול PHI ייצור מקומית.
- בטווח קצר — להוסיף נטרול CSV formula injection (rank 3) בכל ה-exporters, ולהוסיף הגבלת קצב פר-משתמש למסלולי החיוב (rank 5, בעיקר charge-saved-token).
- לסגור את פערי הכיסוי בעדיפות גבוהה: לוודא שמסלולי קריאת יומן הביקורת מסוננים לארגון ולא חושפים PHI, ולהפוך את ניכוי המכסות/קרדיט לאטומי (אטומיות check-then-decrement מול race).
- לתכנן בדיקה ייעודית למחיקת מטופל (right-to-erasure): לוודא cascade מלא של כל ה-PHI המוצפן ושל קבצי ה-storage — דרישה רגולטורית (זכות למחיקה).
- להריץ npm audit ולבדוק את עיבוד sharp על תמונות שהמשתמש מעלה, וכן לחזק את טיפול הנתיבים ב-/api/uploads (allowlist סיומות, '..' מקודד, backslash).
