# Phase 3 — משימות המשך (HANDOFF לצ'אט הבא)

המשתמש **כבר אישר מראש** את כל המשימות כאן (כולל זו ששוברת תאימות לאחור), בתנאי שתבצע אותן ברצף ועם בקרת 5-סוכנים לפי החוקים. אל תעצור לאישורים נוספים.

---

## מצב נוכחי (Done — לא לגעת)

| Commit | תיאור |
|---|---|
| `6266a952` | Server-side gate ל-`createPayment`/`markAsPaid` ב-`PUT /api/sessions/[id]` למזכירה ללא `canViewPayments` + UI ב-`ChargeConfirmationDialog`. |
| `77919d8f` | סגירת H1 (`/api/payments/pay-client-debts`), M1 (`/api/sessions/calendar` — סינון `payment` בתגובה), M2 (`/api/sessions/[id]` — `expectedAmount` sync חסום ללא `canViewPayments`). |
| `9ca9a798` | UI therapist picker בטופס `/clients/new` + endpoint חדש `GET /api/clinic/therapists`. |
| `29cb144b` | ניקוי 4 unused imports/vars ב-`calendar/page.tsx` + הסרת eslint-disable יתום ב-`session-detail-dialog.tsx`. |

ה-`HANDOFF-health-fund.md` ב-`git status` **לא שלך** — צ'אט מקביל. **אל תיגע בו.**

---

## חוקים (חובה, לא משא ומתן)

1. **סקופ קבצים strict** — `git add` רק על קבצים שאתה שינית במשימה הזו, נתיב מפורש (אסור `git add .`).
2. **לפני כל commit — 5 סוכנים במקביל ב-Task tool**:
   - Security (`explore` readonly) — IDOR, escalation, info-leakage
   - Backward-compat (`explore` readonly) — רגרסיות בזרימות קיימות
   - Multi-tenancy (`explore` readonly) — org isolation, RBAC לכל role + impersonation
   - UX & types (`explore` readonly) — TS, RTL, עברית, חוזה UI
   - Build (`shell` **NOT readonly**) — `npx tsc --noEmit`, `npm test`, `npx eslint <files>`
3. חכה ל-GREEN x 5. YELLOW/RED → תקן והרץ אותו סוכן שוב.
4. הודעת commit בעברית קצרה — מסבירה את ה-**למה**. דרך HEREDOC או `git commit -F .git-commit-msg.tmp`.
5. **push אוטומטי** מיד אחרי commit מוצלח.
6. אל תיצור branches, אל תפתח PR — push ל-`main` ישר.
7. PowerShell: השתמש ב-`;` ולא ב-`&&`. שים נתיבים עם סוגריים בגרשיים: `"src/app/(dashboard)/..."`.
8. קובץ זמני להודעת commit (`.git-commit-msg.tmp`) — מחק אחרי שדחפת. `.gitignore` כבר מכסה.

---

## משימות — בסדר ביצוע (כל אחת = commit + push נפרד)

### משימה 1 — L1: gate `secretaryCan(canViewPayments)` ב-add-credit (אבטחה)

**קובץ:** `src/app/api/clients/[id]/add-credit/route.ts`

**הבעיה:** הקובץ קורא ל-`createPaymentForSession` (יוצר רשומת `Payment` עם `paymentType: "ADVANCE"`). היום יש רק `requireAuth` + `loadScopeUser`. **מזכירה ללא `canViewPayments` יכולה להוסיף קרדיט** — backdoor analog ל-H1 שסגרנו ב-`/api/payments/pay-client-debts`.

**התיקון (פשוט מאוד):** אחרי `const scopeUser = await loadScopeUser(userId);` (שורה 29), הוסף:

```typescript
if (isSecretary(scopeUser) && !secretaryCan(scopeUser, "canViewPayments")) {
  return NextResponse.json(
    { message: "אין הרשאה לפעולות תשלום" },
    { status: 403 }
  );
}
```

ועדכן את ה-import בראש הקובץ:

```typescript
import { isSecretary, loadScopeUser, secretaryCan } from "@/lib/scope";
```

**שמירת תאימות לאחור:**
- מטפל עצמאי (`organizationId=null`) — `isSecretary` יחזיר false, יעבור הלאה. **אין שינוי התנהגות.**
- מטפל בקליניקה (THERAPIST/OWNER) — `isSecretary` false. **אין שינוי.**
- מזכירה עם `canViewPayments=true` — `secretaryCan` true. **אין שינוי.**
- מזכירה עם `canViewPayments=false` — 403. **זה התיקון.**

**UI כבר מותאם:** ה-`useMyPermissions` כבר משמש ב-app להסתיר כפתורי תשלום ממזכירות חסומות. אם איפשהו יש כפתור add-credit שלא מוסתר — סוכן ה-UX יסמן את זה ב-YELLOW. אם כן — הסתר את הכפתור ב-UI במקביל (אותו commit).

**איך לוודא שאין UI שמראה כפתור add-credit למזכירה חסומה:**
- `grep` ל-`add-credit` או `addCredit` בכל `src/`.
- בכל מקום שמופיע כפתור/קישור — ודא שהוא תחת `if (myPermissions.canViewPayments)` או דומה.

**הודעת commit מוצעת:**
```
Phase 3 L1: gate canViewPayments ב-/api/clients/[id]/add-credit

הסיבה: מזכירה ללא canViewPayments יכלה להוסיף קרדיט (יצירת Payment עם
ADVANCE). זה analog ל-H1 שסגרנו ב-pay-client-debts. עכשיו 403 לפני
שמגיעים ל-createPaymentForSession.
```

---

### משימה 2 — `?new=true` deep-link מ-Dashboard לפתיחת NewSessionDialog (חיווט)

**הקבצים:**
- `src/app/(dashboard)/dashboard/page.tsx` — שני קישורים ל-`/dashboard/calendar?new=true` (שורות 336 ו-456).
- `src/app/(dashboard)/dashboard/calendar/page.tsx` — צריך לקרוא `new=true` ולפתוח את `NewSessionDialog` אוטומטית.

**הבעיה:** הקישורים מ-dashboard ל-`/dashboard/calendar?new=true` קיימים, אבל הפרמטר לא מטופל ביומן. המשתמש לוחץ "קבע פגישה חדשה" → מגיע ליומן בלי שום דיאלוג נפתח. UX מבולבל.

**התיקון:**
1. ב-`calendar/page.tsx`, בתוך `CalendarPageContent`, הוסף:
   ```typescript
   const newParam = searchParams.get('new');
   ```
2. ב-`useEffect` חדש, אם `newParam === 'true'`: קרא ל-`setShowNewSessionDialog(true)` (או הסטייט המתאים — חפש `showNewSessionDialog` או דומה בקובץ), ואחר כך נקה את הפרמטר מה-URL (`router.replace('/dashboard/calendar', { scroll: false })`) כדי שרענון לא יפתח שוב.
3. ודא שכאשר הדיאלוג נסגר ה-URL כבר נקי.

**הערה:** הסרנו את `newParam` ב-commit `29cb144b` כי הוא לא היה בשימוש. עכשיו מחזירים אותו עם handler אמיתי.

**שמירת תאימות:** אם משתמש מגיע ל-`/dashboard/calendar` בלי `?new=true` — אין שינוי. אם מגיע עם `?new=true` ולא היה אף לקוח — הדיאלוג נפתח עם state ריק, וזה בסדר.

**הודעת commit:**
```
חיווט ?new=true ביומן — פותח NewSessionDialog אוטומטית

הסיבה: הקישורים מ-dashboard ל-/dashboard/calendar?new=true היו inert
(הפרמטר לא נקרא). עכשיו הדיאלוג נפתח, וה-URL מתנקה אחרי הפתיחה כדי
שרענון לא יפתח שוב.
```

---

### משימה 3 — Picker ב-NewSessionDialog למצב "מטופל מהיר" (UX)

**קובץ:** `src/components/calendar/new-session-dialog.tsx`

**הבעיה:** סוכן ה-UX של משימה 1 סימן: כשבעלים/מזכירה יוצרים פגישה ובוחרים "מטופל מהיר" (`isQuickClientMode=true`), הקוד ב-שורה 281 שולח `POST /api/clients` **בלי `therapistId`** — וה-resolver בשרת בוחר את המשתמש המחובר. אם זאת מזכירה — היא מקבלת לקוח על שמה (לא מטפלת!). זה אותו באג שתיקנו ב-`/clients/new` במשימה 1.

**התיקון:**
1. ב-`NewSessionDialog`, ייבא `useMyPermissions` + state ל-`clinicTherapists` ו-`pickedTherapistId`.
2. אם `myPermissions.clinicRole === "OWNER" || "SECRETARY"`, fetch ל-`/api/clinic/therapists` (ה-endpoint כבר קיים מ-commit `9ca9a798`).
3. הצג Select בתוך הבלוק של `isQuickClientMode`, חובה לבחור לפני submit.
4. ב-שורה 281 — צרף את `therapistId` ל-body של ה-POST:
   ```typescript
   body: JSON.stringify({
     name: quickClientName.trim(),
     isQuickClient: true,
     ...(pickedTherapistId ? { therapistId: pickedTherapistId } : {}),
   }),
   ```
5. אם זאת מזכירה ולא נבחר `therapistId` — `toast.error("יש לבחור מטפל/ת אחראי/ת")` ולא לשלוח.

**שמירת תאימות:**
- THERAPIST/עצמאי — אין picker, אין `therapistId` ב-body, resolver בוחר self. **אין שינוי.**
- מזכירה/OWNER — נדרש picker.

**הערה לשלמות:** תוודא שהזרימה של "מטופל קיים" (`!isQuickClientMode`) לא נוגעת ב-`therapistId` — כי שם בוחרים לקוח קיים (`formData.clientId`) ולא יוצרים חדש.

**הודעת commit:**
```
Phase 3 — picker מטפל גם ב-NewSessionDialog למצב מטופל מהיר

הסיבה: כשבעלים/מזכירה יצרו "מטופל מהיר" מהיומן, ה-resolver בשרת בחר
את המשתמש המחובר כמטפל אחראי. למזכירה זה באג (לא מטפלת). אותו תיקון
כמו ב-/clients/new ממשימה 1.
```

---

### משימה 4 — תמיכה ב-`therapistId` ב-`PUT /api/clients/[id]` (פיצ'ר חסר)

**הקבצים:**
- `src/lib/validations/client.ts` — `updateClientSchema` (שורה 52).
- `src/app/api/clients/[id]/route.ts` — `PUT` handler (שורה 196).
- אופציונלי: UI עריכת לקוח (`src/app/(dashboard)/dashboard/clients/[id]/edit/page.tsx` או דומה).

**הבעיה:** היום אין דרך לשנות מטפל אחראי אחרי שלקוח נוצר. במציאות זה קורה (מטפלת עוזבת, מעבר בין מטפלים בקליניקה).

**התיקון:**
1. הוסף ל-`updateClientSchema` ב-`validations/client.ts`:
   ```typescript
   therapistId: z.string().min(1).optional(),
   ```
2. ב-`PUT` handler, הוסף `therapistId` ל-destructuring של `parsed.data` (שורה 227).
3. **הרשאות נדרשות (קריטי):**
   - מטפל עצמאי (`organizationId=null`) — לא רלוונטי, התעלם מ-`therapistId` בכלל (אין למי להעביר).
   - THERAPIST בקליניקה — **אסור**. הוא יכול לעדכן את הלקוח שלו, אבל לא להעביר אותו למטפל אחר. החזר 403 אם `therapistId` קיים ב-body והוא לא OWNER/SECRETARY.
   - OWNER — מותר.
   - SECRETARY — בדוק `secretaryCan(scopeUser, "canCreateClient")` (כבר נבדק שורה 232).
4. **ולידציה ש-`therapistId` שייך לאותה קליניקה:** השתמש ב-`resolveTherapistIdForClient` או בדוק ישירות עם `prisma.user.findFirst({ where: { id: therapistId, organizationId: scopeUser.organizationId, isBlocked: false, clinicRole: { in: ["THERAPIST", "OWNER"] } } })`. אם לא נמצא — 400 "מטפל לא תקין".
5. הוסף ל-`prisma.client.update` data (שורה 284):
   ```typescript
   ...(therapistId !== undefined ? { therapistId } : {}),
   ```

**שמירת תאימות:** body בלי `therapistId` (היום זה כל הקריאות הקיימות) — `therapistId` לא ייכלל ב-update. **אין שינוי בהתנהגות.**

**UI (אופציונלי לפיצ'ר השלם):** הוסף Select דומה למשימה 1 בעמוד עריכת לקוח. אם המשתמש סוגר את המשימה ללא UI — אישור.

**הודעת commit:**
```
תמיכה בשינוי מטפל אחראי ב-PUT /api/clients/[id]

הסיבה: היום אין דרך להעביר לקוח בין מטפלים אחרי יצירה. נדרש בקליניקה
כשמטפלת עוזבת. OWNER+SECRETARY (עם canCreateClient) יכולים לעדכן,
THERAPIST לא יכול להעביר ללקוח אחר. ולידציה שהמטפל החדש מאותה קליניקה
ולא חסום.
```

---

### משימה 5 — הקשחת `/api/clients` POST למזכירה (שובר תאימות לאחור — מאושר!)

**קובץ:** `src/app/api/clients/route.ts` (POST handler).

**הבעיה:** היום מזכירה יכולה לקרוא ל-`POST /api/clients` בלי `therapistId` ב-body — ו-`resolveTherapistIdForClient` נופל ל-default ובוחר את המזכירה עצמה כ-"מטפלת אחראית". זה לא הגיוני (מזכירה לא מטפלת). ב-commit `9ca9a798` ה-UI כבר מוודא שמזכירה בוחרת, אבל בקשה ישירה (Postman/script/UI ישן) עוקפת את זה.

**התיקון:**
1. אחרי `loadScopeUser` ו-לפני קריאה ל-`resolveTherapistIdForClient`, בדוק:
   ```typescript
   if (isSecretary(scopeUser) && !body.therapistId) {
     return NextResponse.json(
       { message: "חובה לבחור מטפל אחראי" },
       { status: 400 }
     );
   }
   ```

**זהירות — שובר תאימות לאחור:**
- **משתמש מאושר את השבירה** (ראה תחתית — המשתמש אישר את כל המשימות).
- ה-UI שעודכן ב-commit `9ca9a798` כבר שולח `therapistId`. אז ה-UI הראשי בסדר.
- ה-UI של `NewSessionDialog` ייתקן במשימה 3 (תיקון לפני הקשחה).
- **סדר ביצוע קריטי:** משימה 3 חייבת להיגמר ולהיות commit-ed לפני משימה 5.

**עוד נקודות לבדיקה לפני המשימה הזו:**
- חפש כל `fetch("/api/clients"` בכל `src/` ובכל `tests/`. וודא שכל מקור שיוצר לקוח כמזכירה שולח `therapistId`.
- בדוק תרחישי import/migration אם קיימים. אם קיימים scripts שיוצרים לקוחות בכמות — וודא שהם רצים תחת user שאינו `SECRETARY`, או מעבירים `therapistId`.

**הודעת commit:**
```
הקשחת POST /api/clients — מזכירה חייבת therapistId

הסיבה: ה-UI כבר אוכף בחירת מטפל אחראי למזכירה, אבל בקשה ישירה (Postman/
script) עקפה את זה ובחרה את המזכירה כברירת מחדל. עכשיו 400 בלי
therapistId. שובר תאימות (במכוון, באישור משתמש) — דורש UI מעודכן בלבד
לכל הזרימות שיוצרות לקוחות כמזכירה.
```

---

### משימה 6 — בדיקה סופית (לא commit) — `react-hooks/exhaustive-deps` ב-session-detail-dialog L140

**זה NOT MUST DO** — אזהרה קוסמטית. אם נשאר זמן:

1. קרא את ה-`useEffect` ב-`src/components/calendar/session-detail-dialog.tsx` סביב שורה 140.
2. הבן למה `session.client` חסר ב-deps array.
3. או הוסף אותו, או הוסף `// eslint-disable-next-line react-hooks/exhaustive-deps` עם הסבר מדויק למה.
4. אם הוספת ה-dep גורם ל-re-fetch אינסופי — זה לא ניקוי, זה bug. עזוב והמשך.

אם תיקנת — commit + push בנפרד עם הודעה: `ניקוי: react-hooks/exhaustive-deps ב-session-detail-dialog`.

---

## בסיום

אחרי כל ה-commits — `git log --oneline -10` ובדוק ש-5 ה-commits החדשים שלך בראש (1-5, אופציונלית 6). `git status` חייב להיות נקי חוץ מ-`HANDOFF-health-fund.md` ו-`HANDOFF-phase3-followup.md` (שני HANDOFFים — של צ'אט אחר ושל זה).

עדכן את המשתמש בעברית, קצר, עם:
- כמה commits נדחפו
- ה-SHA-ים
- מה ה-pipeline אמר על כל אחד (GREEN x 5)
- מה נשאר פתוח (אם בכלל)

---

## פערים ידועים שלא בסקופ ה-HANDOFF הזה

- 4 vulnerabilities ב-GitHub Dependabot (1 high, 3 moderate) — דורש החלטה נפרדת.
- UI לעריכת `therapistId` ב-`/dashboard/clients/[id]/edit` (משימה 4 מטפלת בשרת, ה-UI עצמו אופציונלי).
- Tailwind warnings על `bg-gradient-to-r` שב-ReadLints — אזהרת lint עתידי, לא דחוף.

---

**בהצלחה. תעבוד ברצף, בלי לעצור לאישורים, ותדחוף לאחר כל GREEN x 5.**
