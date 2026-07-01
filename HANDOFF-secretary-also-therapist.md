# HANDOFF — מזכירה שהיא גם מטפלת (Secretary-also-Therapist)

תאריך התחלה: 2026-06-29
סטטוס: ✅ נדחף ל-main 2026-06-29 (commit 931dbe68). ביקורת אבטחה: 0 ממצאים בפיצ'ר. ⚠️ לא נבדק חי. דורש prisma db push (אדיטיבי, אוטומטי בפריסה). 10 משימות-המשך לחוב הקיים נפתחו כ-chips.

## מה הושלם (tsc נקי + 1064 בדיקות ירוקות)
- schema: `User.secretaryIsTherapist Boolean @default(false)`.
- `scope.ts`: ScopeUser+שדה, `isSecretaryTherapist()`, אכלוס ב-loadScopeUser, שחרור
  שיוך מטופל/פגישה למזכירה-מטפלת ב-resolveTherapistIdForClient/Session.
- `secretary-mode.ts`: cookie `mytipul_sec_mode` + `applySecretaryMode` (flip→THERAPIST)
  + `loadScopeUserWithMode`. בדיקות: scope.test.ts (+isSecretaryTherapist),
  secretary-mode.test.ts (אינווריאנט PHI: therapist mode ⇒ own-only + full clinical צמודים).
- members API+UI: validation+PATCH (כולל מחסום כיבוי כשיש מטופלים) + GET + צ'קבוקס
  בדיאלוג + תווית "גם מטפל/ת" בשורה.
- ניתוב dashboard/page.tsx: raw load → mode → apply; SecretaryHome עם canSwitchToTherapist.
- כפתורי מעבר: `secretary-mode-switch.tsx` ("למסך הטיפול שלי" ב-SecretaryHome /
  "למסך המזכירות" בדשבורד המטפל), מציבים cookie + מנווטים.
- סבב הטמעה: ~94 קבצים, loadScopeUser→loadScopeUserWithMode בכל עמודי הדשבורד
  וה-API מבוססי-הבקשה (clients/sessions/payments/questionnaires/consent/documents/
  tasks/waitlist/recurring/communications/cancellation/content-unblock/rooms/calendar/
  uploads). דולגו במכוון: cron/admin/clinic-admin/maintenance/בדיקות.
- 5 קבצי בדיקות עודכנו למקמק `@/lib/secretary-mode`.
- picker מטפלים: `/api/clinic/therapists` + `/api/clinic-admin/clients-by-therapist`
  כוללים עכשיו מזכירה-מטפלת → מופיעה בבורר "מטופל חדש", ביומן הרב-מטפלי, וכיעד העברה.

## נותר/לבדוק
- ✅ transfer-client API: תוקן — מזכירה-מטפלת יעד תקף (SECRETARY+secretaryIsTherapist), מזכירה רגילה חסומה.
- clinic-admin layout "לדשבורד הטיפולים": לא מציב cookie=therapist (המעבר נעשה דרך
  SecretaryHome). לא חוסם — עקבי (מצב מזכירות).
- available-slots/waitlist/staff-tasks: רשימות מטפלים משניות — לא עודכנו (לשקול).
- ⚠️ ביקורת אבטחה + בדיקה חיה.

---
סטטוס מקורי: בעבודה (foundation)

## המטרה
מזכירה בקליניקה רב-מטפלים שתהיה **גם מטפלת מלאה**, עם **כפתור מעבר** בין שני עולמות
(אפשרות ב' — מעבר פשוט בין עמודים, לא מתג גלובלי), בדיוק כמו שמנהלת-שהיא-מטפלת
עוברת בין `/clinic-admin` ל-`/dashboard`.

החלטות מהמשתמש:
- **מטפלת מלאה**: אפשר לשייך לה מטופלים, מופיעה בבורר המטפלים + יומן רב-מטפלי, נספרת בדוחות.
- **המנהלת/בעלים מדליק/ה** את ההגדרה בהגדרות הצוות (`/clinic-admin/members`).

## הנקודה הקריטית (PHI)
היום מזכירה חסומה־בקוד מתוכן קליני (notes/topic/אבחנות/שאלונים) — לפי חוק. מזכירה-מטפלת
צריכה גישה קלינית **מלאה למטופלים שלה** אבל **חסומה לשאר מטופלי הקליניקה**.

**אינווריאנט אבטחה (חובה לשמור!):** גישה קלינית מלאה תינתן *אך ורק* יחד עם scope
מצומצם-לעצמה (`therapistId=user.id`). אסור לעולם שיתקיים במקביל "scope ארגוני" + "גישה
קלינית מלאה". שני אלה נגזרים תמיד מאותו `clinicRole` אפקטיבי — ולכן הם תמיד צמודים.

## המנגנון — "תפקיד אפקטיבי" לפי cookie
מקביל מדויק ל-`view-scope.ts` (המתג "שלי/כל הקליניקה" של הבעלים).

- cookie חדש: `mytipul_sec_mode` = `"therapist"` | `"secretary"` (ברירת מחדל `"secretary"`).
- מודול חדש `src/lib/secretary-mode.ts`:
  - `getSecretaryMode()` — קורא cookie.
  - `loadScopeUserWithMode(userId)` — עוטף `loadScopeUser`; אם המשתמש מזכירה-מטפלת
    וה-cookie = `"therapist"` → מחזיר עותק עם `clinicRole: "THERAPIST"` (ו-`role`
    מנוטרל מ-CLINIC_SECRETARY). כך **כל** ה-helpers הקיימים (isSecretary, buildClientWhere,
    getSessionIncludeForRole, resolveTherapistId...) מתנהגים נכון בלי שינוי — כי כולם
    נגזרים מ-clinicRole.
- **Fail-safe**: route ששוכח להשתמש ב-mode → המזכירה-מטפלת נשארת SECRETARY שם
  (ארגוני + חסום) = בטוח, לכל היותר UX לא עקבי. הכיוון המסוכן (ארגוני+קליני) לא יכול
  לקרות כי flip של clinicRole אטומי.

## שינויי קוד
1. **schema.prisma** — `User.secretaryIsTherapist Boolean @default(false)` (ליד secretaryPermissions).
   db push אדיטיבי (חל אוטומטית ב-start:prod). שדה חדש עם default → אין backfill.
2. **scope.ts**:
   - `ScopeUser.secretaryIsTherapist?: boolean | null` + loadScopeUser מאכלס.
   - `isSecretaryTherapist(user)` = `isSecretary(user) && secretaryIsTherapist === true`
     (על בסיס התפקיד הגולמי, לפני flip).
   - `resolveTherapistIdForClient/Session`: לאפשר יעד שהוא מזכירה-מטפלת (היום נחסם
     "לא ניתן לשייך מטופל למזכירה"). לשלוף secretaryIsTherapist ביעד; לחסום רק מזכירה
     רגילה (secretaryIsTherapist=false).
3. **secretary-mode.ts** — חדש (לעיל).
4. **dashboard/page.tsx** — מזכירה-מטפלת ב-mode "therapist" → דשבורד מטפל (effective role);
   אחרת → SecretaryHome כרגיל.
5. **כפתורי מעבר**:
   - `/dashboard` (app-sidebar) → "מסך המזכירות" (קיים אצל מזכירה? לבדוק) + עבור מזכירה-מטפלת.
   - `/clinic-admin` layout → "לדשבורד הטיפולים" כבר קיים; לוודא לא חסום למזכירה-מטפלת
     + שהוא מציב את ה-cookie ל-"therapist".
   - הכפתור מציב cookie לפני הניווט (client component קטן, כמו view-scope-toggle).
6. **members/page.tsx + API** — checkbox "מזכירה זו היא גם מטפלת" בדיאלוג ההרשאות
   (PATCH /api/clinic-admin/members/[id] — להוסיף secretaryIsTherapist).
7. **בורר מטפלים / יומן רב-מטפלי / דוחות** — לכלול מזכירה-מטפלת ברשימת המטפלים
   (היום מסננים clinicRole IN [OWNER, THERAPIST]). **סבב ייעודי — לסרוק את כל המקומות.**
8. **clinic-admin/me route** — להחזיר secretaryIsTherapist (לכפתור המעבר ב-layout).

## בדיקות (TDD — שינוי קריטי)
- scope.test.ts: isSecretaryTherapist, resolveTherapistId מאפשר מזכירה-מטפלת.
- secretary-mode.test.ts: flip של clinicRole רק כש-mode=therapist + מזכירה-מטפלת; אינווריאנט.

## אבטחה לפני push
סבב סוכני אבטחה מלא (PHI + הרשאות + scope.ts הוא לב המערכת). ⛔ אישור מפורש לפני push ל-main.

## קבצים מרכזיים (reference)
- `src/lib/scope.ts` — לב ההרשאות.
- `src/lib/view-scope.ts` — דפוס ה-cookie לחיקוי.
- `src/app/(dashboard)/dashboard/page.tsx` — ניתוב (שורה ~255 isSecretary→SecretaryHome).
- `src/app/clinic-admin/layout.tsx` — כפתור "לדשבורד הטיפולים" (שורה ~383).
- `src/app/clinic-admin/members/page.tsx` — דיאלוג הרשאות מזכירה.
- `src/lib/clinic/secretary-permissions-ui.ts` — רשימת ההרשאות ל-UI.
