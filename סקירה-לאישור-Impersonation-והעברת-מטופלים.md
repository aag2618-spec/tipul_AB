# סקירה לאישור — Impersonation + העברת מטופלים מתקדמת

**תאריך:** 2026-05-07
**סטטוס:** ⏸ ממתין לאישור — אין עדיין `git push`
**גרסה:** 3 — אחרי 3 סבבי ביקורת (סוכנים פנימיים + Cursor חיצוני). סך הכל **12 בעיות תוקנו** (8 קריטיות/חמורות + 4 nice-to-have/UX).
**תהליך:** התוכנית יושמה במלואה. רצו 2 סבבים של 5 סוכני ביקורת + סבב ביקורת חיצונית (Cursor). סך הכל **8 בעיות קריטיות/חמורות תוקנו**. נוסף test suite ייעודי. כעת מוגש לאישורך.

⚠ **לא נוגעים בקבצי ה-Cardcom של הצ'אט המקביל** — ה-commit ייצור add ספציפי על קבצי impersonation/transfer בלבד.

---

## פיצ'ר 1 — Impersonation (כניסה כעין חבר/ה לצורך ביקורת)

### מה זה עושה
בעל/ת קליניקה (OWNER) יכול/ה ללחוץ "היכנס/י כעין" ליד מטפל/ה או מזכיר/ה ולקבל את חוויית המשתמש שלו/ה (data scope, dashboard, רשימות) — לצורך **ביקורת בלבד**. כל פעולה תחת המצב מתועדת באודיט עם זהות ה-OWNER האמיתי.

### זרימת המשתמש
1. `/clinic-admin/members` → לחיצה על "היכנס/י כעין" ליד חבר → דיאלוג מבקש סיבה (5+ תווים) → לחיצה על אישור.
2. דשבורד נטען בזהות ה-target. **באנר אדום קבוע** למעלה: "מצב התחזות: את/ה פועל/ת כעת בתור [שם]. כל פעולה שתבוצע תירשם".
3. כפתור "צא ממצב התחזות" בבאנר → חזרה לזהות OWNER.
4. בעמוד `/dashboard/settings/impersonation-history` כל target יכול/ה לראות את ה-50 הכניסות האחרונות אליה (שקיפות).

### מגבלות שנאכפות בשרת
- אסור להתחזות לעצמך
- אסור להתחזות ל-ADMIN/MANAGER/OWNER
- אסור להתחזות למשתמש מארגון אחר
- אסור להתחזות למשתמש חסום
- מקסימום 4 שעות (lazy timeout בכל קריאה)
- impersonation אחד פעיל ב-OWNER (partial unique index ב-DB)
- בעת חסימת user או הסרתו מקליניקה — כל ה-impersonation סשנים שלו נסגרים אוטומטית

### סקירת אבטחה (אחרי 2 סבבי ביקורת)
- ✅ `actingAs` ב-JWT נטען **בלבד מה-DB** דרך `loadVerifiedImpersonation()` — קליינט לא יכול לזייף role
- ✅ sessionId שנשלח מהקליינט מאומת מול `impersonatorId === token.id` (אסור לאחר OWNER להשתמש בסשן של אחר)
- ✅ fail-secure: אם DB לא זמין או sessionId לא תקף — actingAs נמחק, לא נשמר מיושן
- ✅ ולידציה לפני יצירה: organization, role, blocked, target type
- ✅ partial unique index `(impersonatorId WHERE endedAt IS NULL)` — race נתפס וזורק 409
- ✅ אודיט: כל פעולה ב-`withAudit` מתחת ל-impersonation נרשמת עם `details.impersonation = { impersonatorId, impersonationSessionId, targetUserId, targetName }` ו-`adminId = OWNER`. שרשרת אחריות נשמרת.

### קבצים שנוצרו (Impersonation)
- `prisma/migrations/20260507100000_add_impersonation_session/migration.sql` — Table + indexes + partial unique index + FKs
- `src/app/api/clinic-admin/impersonate/start/route.ts` — POST start עם 8 ולידציות
- `src/app/api/clinic-admin/impersonate/stop/route.ts` — POST stop
- `src/app/api/clinic-admin/impersonate/status/route.ts` — GET status
- `src/components/impersonation-banner.tsx` — Banner אדום sticky z-50 עם aria-live="assertive"
- `src/app/(dashboard)/dashboard/settings/impersonation-history/page.tsx` — היסטוריה ל-target

### קבצים שעודכנו (Impersonation)
- `prisma/schema.prisma` — model ImpersonationSession + relations ב-User ו-Organization
- `src/lib/auth.ts` — JWT/Session callbacks תומכים ב-actingAs + `loadVerifiedImpersonation()`
- `src/lib/api-auth.ts` — `requireAuth()` מחזיר `originalUserId`, `isImpersonating`, `actingAs`
- `src/lib/audit.ts` — `withAudit` רושם `impersonation` ב-details כש-OWNER מתחזה
- `src/components/providers.tsx` — מוסיף ImpersonationBanner סביב כל האפליקציה
- `src/app/clinic-admin/members/page.tsx` — כפתור "היכנס/י כעין" + דיאלוג סיבה
- `src/app/api/clinic-admin/members/[id]/route.ts` — סוגר impersonation בעת DELETE
- `src/app/api/admin/users/[id]/toggle-block/route.ts` — סוגר impersonation בעת חסימה

---

## פיצ'ר 2 — העברת מטופלים מתקדמת

### מה זה עושה
בעל/ת קליניקה יכול/ה להעביר מטופל ממטפל למטפל. כעת יש **שני מצבים**:
1. **ברירת מחדל (Switch כבוי):** כל הפגישות העתידיות הפעילות מבוטלות. מטפל היעד יוצר פגישות חדשות לפי הצורך.
2. **מצב מתקדם (Switch דלוק):** דיאלוג מציג כל פגישה עתידית עם בדיקת חפיפה, ומאפשר לבחור פר-פגישה בין: העברה / העברה עם override של חפיפה / ביטול.

### עקרונות
- היסטוריה (פגישות עבר ו-COMPLETED/CANCELLED) **תמיד נשארת** משויכת למטפל המקורי.
- פגישה עם `payment` או `recording` — לא נמחקת אלא מסומנת CANCELLED עם note אוטומטי (כדי לשמור על שרשרת חיוב/קבלה).
- פגישה ללא תשלום/הקלטה — נמחקת לחלוטין.

### סקירת data integrity (אחרי 2 סבבי ביקורת)
- ✅ Race guard: `client.therapistId` נקרא **שוב בתוך ה-tx** — אם השתנה בין הזמנים, throw ידידותי + rollback
- ✅ updateMany בעיה תוקנה: SELECT-then-update — מחזירים IDs אמיתיים שעודכנו, לא slice של הקלט
- ✅ בדיקת חפיפה כפולה (preview + שוב ב-tx) — מונע race עם פגישות חדשות אצל היעד
- ✅ Serializable isolation + retry על 40001/40P01 (דרך `withAudit`)
- ✅ Audit log מתעד transferredSessionIds, overriddenSessionIds, deletedSessionIds, cancelledSessionIds — לכל פגישה רשום מה קרה

### קבצים שנוצרו (Transfer)
- `src/lib/transfer-cancel-or-delete.ts` — helper שמחליט DELETE vs CANCELLED לפי payment/recording
- `src/app/api/clinic-admin/transfer-client/preview/route.ts` — GET preview של פגישות + חפיפות
- `src/components/clinic-admin/transfer-future-sessions-dialog.tsx` — Dialog UI (loading/error/empty/loaded states)

### קבצים שעודכנו (Transfer)
- `src/app/api/clinic-admin/transfer-client/route.ts` — מקבל transferFutureSessions + 3 רשימות, race guards, SELECT-then-update
- `src/app/clinic-admin/transfer/page.tsx` — Switch + dialog wiring + טקסט הסבר דינמי

---

## תיקונים שבוצעו אחרי סבבי הביקורת

### גרסה 1 (3 תיקונים) — סבב ביקורת ראשון

| # | חומרה | בעיה | תיקון |
|---|------|------|------|
| 1 | 🔴 קריטי | JWT callback קיבל `actingAs` מהcalient ללא verification — privilege escalation דרך DevTools | נוספה `loadVerifiedImpersonation()` שטוענת מה-DB ומאמתת `impersonatorId === token.id`. fail-secure במקרה של DB down. |
| 2 | 🔴 קריטי | `updateMany` מחזיר רק count — `slice(0, count)` מחזיר IDs לא נכונים → audit לא תקין | SELECT-then-update: בודקים IDs שעוברים את ה-WHERE, ואז מעדכנים רק אותם. validForTransfer/validIds. |
| 3 | 🟠 חמור | `client.therapistId` נקרא מחוץ ל-tx — שני OWNERs במקביל יכולים לדרוס | קוראים את ה-client שוב **בתוך ה-tx** ומאמתים שלא השתנה. throw ידידותי אם כן. |

### גרסה 2 (5 תיקונים נוספים) — סבב ביקורת חיצונית (Cursor)

| # | חומרה | בעיה | תיקון |
|---|------|------|------|
| 4 | 🔴 גבוה | N+1 query ב-preview (findFirst per session) — מטופל עם 30 פגישות = 31 קריאות DB | טוענים את כל המועמדים להתנגשות בquery יחיד עם טווח [minStart, maxEnd], ואז התאמה ב-memory. 1 SELECT במקום N. |
| 5 | 🔴 גבוה | Loop ב-`cancelOrDeleteFutureSessions` תחת Serializable transaction = סיכון 40001/timeout עם N=30 | Bulk operations: 1 SELECT + עד 2 פעולות (deleteMany + updateMany). הוסר append ל-notes (רק cancellationReason ב-bulk; ה-transferLogId שמור שם ל-forensics). |
| 6 | 🔴 גבוה | חוסר `disallowImpersonation` — OWNER ב-impersonation יכל לחבר Cardcom של target, לבטל מנוי, לערוך פרופיל | הוספת `requireAuth({ disallowImpersonation: true })` כopt-in. הוחל על: Cardcom setup (POST/DELETE), billing providers (POST/PATCH/DELETE), subscription create/cancel, user/profile PUT. |
| 7 | 🔴 גבוה | History page הציג היסטוריה של ה-target במצב impersonation במקום של ה-OWNER | שימוש ב-`session.user.originalUserId ?? session.user.id`. תוספת אזהרה ב-UI במצב impersonation. |
| 8 | 🟠 חמור | חוצה-קליניקה: target הועבר לקליניקה אחרת אחרי start — לא נבדק | `loadVerifiedImpersonation` בודק כעת `impersonator.organizationId === targetUser.organizationId`. בודק גם שה-impersonator לא חסום באמצע. |

### גרסה 3 (4 תיקונים נוספים) — סבב ביקורת אחרון

| # | חומרה | בעיה | תיקון |
|---|------|------|------|
| 9 | 🟡 | Banner ללא תזכורת זמן עד timeout | נוסף countdown ב-banner: "סיום אוטומטי בעוד {X דקות/שעות}". מתעדכן כל 30s. pluralization עברית נכון ("דקה אחת" יחיד / "X דקות" רבים). |
| 10 | 🟡 | אין rate limit על `/start` (DoS על DB) | `checkRateLimit("impersonate_start:${userId}", 10/דקה)` — 429 אם חרג. |
| 11 | 🟡 | אין kill-switch גלובלי | ENV var `IMPERSONATION_DISABLED=true` → 503. flip מהיר ב-production בלי deploy. |
| 12 | 🟢 | תצוגת history מציגה "0 דקות" לסשן < 60s | תנאי לתצוגת שניות (עם pluralization נכון: "שנייה אחת"/"X שניות"). |

### Test suite חדש (15)

נוצר `src/lib/__tests__/impersonation.test.ts` עם **11 unit tests**:
- Wrong impersonator → null (privilege escalation guard)
- Already ended session → null
- Target blocked → null
- Impersonator blocked → null
- Cross-organization (target moved) → null
- DB error → null (fail-secure)
- Valid → returns full DB payload
- targetNameSnapshot preservation
- startedAt as epoch ms (JWT-safe)

✅ 11/11 tests עוברים. ה-test suite הכולל: 312 tests עוברים.

---

## סקירה — אזורים שלא תוקנו (במכוון)

הסוכנים מצאו עוד נקודות, אבל אלו **לא bugs** או **out of scope**:

- **Permissions agent טען ש-OWNER במצב impersonation לא יכול לבצע פעולות OWNER** — זוהי ההתנהגות **המכוונת** של impersonation. מי שרוצה לפעול כ-OWNER יוצא מ-impersonation. כשיש סשן פעיל המשתמש רואה רק את חווית ה-target.
- **2FA check ב-impersonation/start** — כבר מטופל ע"י `requireAuth()` שזורק 403 אם requires2FA.
- **Email לא מוחלף ב-session בעת impersonation** — קוד downstream משתמש ב-`session.user.id` לזהות, לא ב-email. השארתי כך כדי לא לשבור פלואים אחרים.
- **Cron לסגירת timeouts** — Lazy check בכל JWT callback מספיק. אם המשתמש לא פעיל, ה-DB record נשאר פתוח אבל לא ניתן לשימוש.
- **Google Calendar sync של פגישות שמועברות/מבוטלות** — TODO מתועד בתוכנית המקורית, מחוץ ל-scope.
- **`ml-1` במקום `mr-1` ב-RTL** — convention של הפרויקט (כל הקוד הקיים משתמש ב-`ml-*` ב-RTL).

---

## אימותים אוטומטיים שעברו (גרסה 3)

```
✅ npx prisma validate
✅ npx prisma generate
✅ npx tsc --noEmit (EXIT_CODE=0)
✅ npx eslint על כל הקבצים החדשים והעודכנים (0 errors; 9 warnings על משתני session
   לא בשימוש — קיים בקוד מלפני השינויים, לא קשור לפיצ'ר הזה)
✅ npx next build (full production build עבר)
✅ npx vitest run src/lib/__tests__/impersonation.test.ts (11/11 פאסים)
✅ npx vitest run (כללי) — 312 tests עוברים. 3 כשלים פרה-קיימים שלא קשורים
   (sms-quota integration test דורש DATABASE_URL חי).
```

---

## רשימת קבצים מלאה

### חדשים (12)
1. `prisma/migrations/20260507100000_add_impersonation_session/migration.sql`
2. `src/app/api/clinic-admin/impersonate/start/route.ts`
3. `src/app/api/clinic-admin/impersonate/stop/route.ts`
4. `src/app/api/clinic-admin/impersonate/status/route.ts`
5. `src/app/api/clinic-admin/transfer-client/preview/route.ts`
6. `src/lib/transfer-cancel-or-delete.ts`
7. `src/lib/impersonation.ts` (גרסה 2 — extracted ל-testability)
8. `src/lib/__tests__/impersonation.test.ts` (גרסה 2 — 11 unit tests)
9. `src/components/impersonation-banner.tsx`
10. `src/components/clinic-admin/transfer-future-sessions-dialog.tsx`
11. `src/app/(dashboard)/dashboard/settings/impersonation-history/page.tsx`
12. `סקירה-לאישור-Impersonation-והעברת-מטופלים.md` (הקובץ הזה)

### עודכנים (15)
1. `prisma/schema.prisma`
2. `src/lib/auth.ts`
3. `src/lib/api-auth.ts` (גרסה 2 — אופציה `disallowImpersonation`)
4. `src/lib/audit.ts`
5. `src/components/providers.tsx`
6. `src/app/clinic-admin/members/page.tsx`
7. `src/app/clinic-admin/transfer/page.tsx`
8. `src/app/api/clinic-admin/transfer-client/route.ts`
9. `src/app/api/clinic-admin/members/[id]/route.ts`
10. `src/app/api/admin/users/[id]/toggle-block/route.ts`
11. `src/app/api/integrations/cardcom/setup/route.ts` (גרסה 2 — disallowImpersonation)
12. `src/app/api/integrations/billing/route.ts` (גרסה 2)
13. `src/app/api/integrations/billing/[id]/route.ts` (גרסה 2)
14. `src/app/api/subscription/cancel/route.ts` (גרסה 2)
15. `src/app/api/subscription/create/route.ts` (גרסה 2)
16. `src/app/api/user/profile/route.ts` (גרסה 2)

---

## נקודות שהביקורת החיצונית העלתה ולא תוקנו (במכוון/דחוי)

| # | חומרה | בעיה | החלטה |
|---|------|------|------|
| 7 | 🟢 | Logout enforcement at stop — sessionId נשאר ב-token עד JWT cache invalidation | **כבר מכוסה** ע"י verification ב-JWT callback בכל קריאה (`loadVerifiedImpersonation` עם בדיקת endedAt). |
| 11 | 🟡 | `targetType` case inconsistency באודיט | בקבצים שלי הכל PascalCase ("User"/"Client"). הקובץ היחיד שמשתמש ב-lowercase ("user") הוא `toggle-block` (קוד פרה-קיים, לא נגעתי בtargetType שלו). |
| 13 | 🟡 | אין index ייעודי ל-impersonation queries ב-AdminAuditLog | אופטימיזציית schema גדולה (חוצה-מערכת). דחוי לעתיד. |
| - | 🟢 | router.refresh()+push() ב-banner | אופטימיזציה קלה, לא חוסמת. |

---

## מה נדרש ממך עכשיו

1. **קרא/י את הסקירה.** במיוחד את הסעיפים "תיקונים שבוצעו" (גרסה 1 + גרסה 2) ו-"Test suite חדש".
2. **בדיקה ידנית מומלצת:**
   - `/clinic-admin/members` → כפתור "היכנס/י כעין" → דיאלוג סיבה → בנאר אדום למעלה.
   - `/clinic-admin/transfer` → Switch כבוי = ביטול הכל; Switch דלוק = דיאלוג פר-פגישה.
   - בעת impersonation: לנסות לגשת ל-`/api/integrations/cardcom/setup` (POST) → אמור להחזיר 403.
   - `/dashboard/settings/impersonation-history` במצב impersonation → אמור להראות אזהרה.
3. **לאשר לפוש** — ענה/י "אישור פוש" או "פוש" ואני יוצר commit + push.
4. **או לדחות** — אם משהו לא בסדר, ציין/י מה ואני מתקן.

⚠ **לא נעשה `git add .`** — אעשה add ספציפי לקבצי impersonation/transfer בלבד, כדי לא לפגוע בעבודת ה-Cardcom של הצ'אט המקביל (שיש לה `סקירה-תשלום-מצרפי-באשראי-Cardcom.md` משלה, וקבצים שמופיעים ב-`git status` שאינם שלי).

**שום commit לא נוצר עדיין. הקבצים שונו במחשב המקומי בלבד.**
