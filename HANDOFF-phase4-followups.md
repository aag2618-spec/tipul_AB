# Phase 4 Follow-ups — HANDOFF לצ'אט חדש

המשתמש **אישר מראש** את כל המשימות בקובץ הזה. עבוד ברצף לפי הסדר, בלי לעצור לאישורים נוספים. בקרת 5 סוכנים לפני כל commit, push אוטומטי אחרי GREEN x 5.

> **למה זה ה-handoff הזה?** בצ'אט הקודם סיימנו את משימות 1, 2, 4 של Phase 4 המקורי (3 commits נדחפו ל-`main`). הסוכנים החזירו דוחות עם מספר YELLOW לא-חוסם — תיקונים קטנים שאפשר לעשות עכשיו. בנוסף, יש פערים ידועים שתועדו אבל לא טופלו.

---

## מה כבר נעשה — לא לגעת

| # | SHA | מה |
|---|---|---|
| 1 | `0003dd63` | Phase 4 משימה 1 — Card בעריכת לקוח (OWNER) → קישור ל-`/clinic-admin/transfer?clientId=` |
| 2 | `5589324f` | Phase 4 משימה 2 — דף `/clinic-admin/members/by-therapist` + API `/api/clinic-admin/clients-by-therapist` + פריט ניווט |
| 3 | `7d1b30a2` | ניקוי ESLint preexisting ב-`pay-client-debts` |

`HANDOFF-phase4-clinic-ownership-ui.md` הוא ה-handoff המקורי של Phase 4 — כבר מוצה. **המסמך הזה (`HANDOFF-phase4-followups.md`) מחליף אותו.**

---

## חוקים (חובה, לא משא ומתן)

### 1. סקופ קבצים — strict
- מותר לערוך **רק** קבצים שמופיעים במפורש במשימות למטה, או imports/types נחוצים-במישרין.
- **אסור** לגעת בקבצים שמופיעים ב-`git status` עם שינויים שלא ביקשת — הם של צ'אט אחר.
- אסור `git add .` או `git add -A`. תמיד `git add <נתיב מפורש>` לכל קובץ.

### 2. בקרת 5 סוכנים לפני כל commit
שלח במקביל דרך Task tool, **גם** ל-commit של תו אחד:

| סוכן | subagent_type | מטרה |
|---|---|---|
| Security audit | `explore` (readonly) | IDOR, escalation, info-leakage, injection |
| Backward-compat | `explore` (readonly) | רגרסיות בזרימות קיימות, תאימות API |
| Multi-tenancy | `explore` (readonly) | org isolation, RBAC לכל role + impersonation |
| UX & types | `explore` (readonly) | TS, RTL, עברית, חוזה UI עקבי |
| Build pipeline | `shell` (**NOT** readonly) | `npx tsc --noEmit`, `npm test -- --run`, `npx eslint <files>` |

חכה ל-GREEN x 5. YELLOW/RED → תקן והרץ שוב עד GREEN.

**הערה מהצ'אט הקודם:** לעיתים סוכני ה-Task לא חוזרים בזמן. אם עברו 10+ דקות ואין תשובה — הרץ את הבדיקות בעצמך (tsc, eslint, vitest), ועשה review ידני לפי הקטגוריות. רק אם הכל GREEN — commit.

### 3. שמירת תאימות לאחור
- אסור לשבור זרימות קיימות. אם תיקון אבטחה דורש שבירה — בקש אישור מפורש לפני יישום.
- מתפלים עצמאיים (`organizationId=null`) — חובה לשמור על התנהגות זהה לחלוטין.
- העדף הוספת capability על פני הקשחה ש"שוברת" UI קיים.

### 4. PowerShell (Windows!)
- השתמש ב-`;` ולא ב-`&&` בין פקודות.
- HEREDOC לא נתמך — השתמש ב-`git commit -F .git-commit-msg.tmp` (קובץ נמחק אוטומטית או על ידך).
- נתיבים עם סוגריים — בגרשיים כפולים: `"src/app/(dashboard)/..."`.
- `.gitignore` כבר מכסה `.pipeline-*.txt`, `.git-commit-msg.tmp`, `.prisma-gen.txt`.

### 5. הודעות commit + push
- עברית פשוטה, קצרה (1-2 משפטים), מסבירה את ה-**למה**, לא רק את ה-**מה**.
- **push אוטומטי** מיד אחרי commit מוצלח (`git push`) — אלא אם המשתמש כתב במפורש "אל תדחוף".
- אם `git pull --rebase` נכשל בגלל unstaged changes של צ'אט אחר — `git push` ישיר בלי rebase.

### 6. Race conditions עם צ'אטים אחרים
**אזהרה חשובה:** בצ'אט הקודם זיהיתי שצ'אט אחר עשה `git reset --mixed HEAD~1` באמצע ה-commit שלי, ומחק לי את `.git-commit-msg.tmp`. הזהירות:
- בצע `git add <files>` ו-`git commit -F .git-commit-msg.tmp` כפקודה אחת ב-Shell, מינימום חלון race.
- אם commit נכשל עם "no changes added" — בדוק שהקובץ עדיין על דיסק וחזור ל-`git add`.
- אל תניח ש-`.git-commit-msg.tmp` נשאר בין פקודות.

### 7. סקריפטים זמניים
- אסור להוסיף ל-commit: `.pipeline-*.txt`, `.prisma-gen.txt`, `.git-commit-msg.tmp` — `.gitignore` מכסה.
- HANDOFF docs (`HANDOFF-*.md`) — בסדר ל-commit, **בנפרד** מקוד פונקציונלי.

---

## מצב נוכחי של הפרויקט (snapshot)

### Commits אחרונים על `main` (ייתכן שזז מאז כתיבת ה-HANDOFF)
```
8868b85f תיעוד: HANDOFF ייעודי לסשן הבא — G3 פיצול הכנסות
5b7e5e05 תיעוד: עדכון HANDOFF M11 — סימון G5 כהושלם
6cd07540 security: force-dynamic ב-8 דפי dashboard עם PHI
065c47f0 M11.G5: דוח עומס מטפלים לבעלי קליניקה
afcfa76d fix(reports): ממצאי סוכני בדיקה — force-dynamic + a11y לטוגל
f9a12449 תיעוד: HANDOFF M11 — מה שנשאר (E3 + G1-G12)
c5c56b8d feat(reports): toggle הכנסות — לפי תאריך תשלום / לפי תאריך פגישה
2d4602b1 fix(commitments): השתתפות עצמית בכל מסלולי יצירת תשלום
7d1b30a2 ניקוי: react/no-unescaped-entities + unused imports ב-pay-client-debts ← שלי
5589324f Phase 4 — תצוגת "מטופלים לפי מטפל" בניהול קליניקה (OWNER) ← שלי
```

### קבצים שצ'אטים אחרים עובדים עליהם — **אסור לגעת**
הרץ `git status` בהתחלה. כל קובץ עם `M` או `??` שלא ביקשת לערוך — של צ'אט אחר. דוגמאות שראיתי בצ'אט הקודם:
- `src/app/(dashboard)/dashboard/page.tsx`
- `src/app/api/sessions/[id]/route.ts`
- `src/components/app-sidebar.tsx`
- `src/components/dashboard/today-session-card.tsx`
- `src/components/sessions/sessions-view.tsx`
- `src/hooks/use-calendar-actions.ts`
- `src/app/(dashboard)/dashboard/commitments/` (תיקייה חדשה)
- `HANDOFF-health-fund.md`, `HANDOFF-phase4-clinic-ownership-ui.md` (handoffs קיימים)

**אם בספק — תעצור ותשאל.**

---

## משימות — בסדר ביצוע

### משימה 1 (קטנה, בטוחה) — שיפור ניסוח "אודיט אוטומטי" → "תיעוד אוטומטי"

**הקובץ:** `src/app/(dashboard)/dashboard/clients/[id]/edit/page.tsx`

**הבעיה:** הסוכן UX זיהה ש"אודיט" הוא מונח אנגלי-טכני שלא מובן לבעלות קליניקה לא-טכניות. "תיעוד" / "רישום ביומן ההעברות" טבעי יותר.

**מה לשנות:**
- שורה 463 (בערך, שורות עלולות לזוז):
  ```tsx
  להעברת המטופל למטפל/ת אחר/ת בקליניקה — כולל פגישות עתידיות
  ואודיט אוטומטי
  ```
  →
  ```tsx
  להעברת המטופל למטפל/ת אחר/ת בקליניקה — כולל פגישות עתידיות
  ותיעוד אוטומטי ביומן ההעברות
  ```
- גם לעדכן את ההערה בשורות 450-453 (אם תרצה): "אודיט" → "תיעוד".

**הודעת commit מוצעת:**
```
ניסוח: "אודיט אוטומטי" → "תיעוד אוטומטי ביומן ההעברות"

הסוכן UX זיהה ש"אודיט" מונח אנגלי-טכני. תיקון לעברית פשוטה
שמובן לבעלות קליניקה לא-טכניות.
```

---

### משימה 2 (קטנה, אופציונלית) — normalize `CLINIC_OWNER` ב-`/api/user/permissions`

**הקבצים:**
- `src/app/api/user/permissions/route.ts`

**הבעיה (YELLOW מהסוכן Multi-tenancy):** ה-endpoint מחזיר `clinicRole` גולמי מ-DB. למשתמש עם `role = "CLINIC_OWNER"` ו-`clinicRole = null` (לגאסי — לפני שדה ה-`clinicRole` נוסף), הוא יחזיר `null`. בצ'אט הקודם הוספתי Card ב-edit page שמתבסס על `clinicRole === "OWNER"` — בעלים לגאסי לא יראה את ה-Card.

**הפתרון:**
- ב-`src/app/api/user/permissions/route.ts`, אחרי `loadScopeUser`:
  ```typescript
  // נירמול: בעלים גלובלי (role = CLINIC_OWNER) ללא clinicRole מפורש —
  // נחזיר "OWNER" כדי שכל ה-UI שמשתמש ב-clinicRole יראה את עצמו עקבי.
  // ההגנה האמיתית ב-server-side ממילא בודקת גם role וגם clinicRole.
  const effectiveClinicRole =
    scopeUser.clinicRole ??
    (scopeUser.role === "CLINIC_OWNER" ? "OWNER" : null);

  return NextResponse.json({
    isSecretary: isSecretary(scopeUser),
    clinicRole: effectiveClinicRole,
    permissions: { ... }
  });
  ```

**שמירת תאימות:**
- בעלים בלי `clinicRole` — עכשיו יראו את ה-Card. לא רגרסיה (UI gating בלבד, השרת ממילא אישר).
- בעלים עם `clinicRole = "OWNER"` — אין שינוי.
- THERAPIST/SECRETARY — אין שינוי (`role !== "CLINIC_OWNER"`, `clinicRole` נשאר כפי שהוא).
- עצמאי (role = "USER", clinicRole = null) — `effectiveClinicRole = null`. אין שינוי.

**הודעת commit מוצעת:**
```
תיקון: נירמול CLINIC_OWNER → clinicRole "OWNER" ב-/api/user/permissions

בעלים לגאסי עם role=CLINIC_OWNER ו-clinicRole=null היו רואים null
ב-useMyPermissions, ולכן לא ראו UI gating שמותנה ב-clinicRole==="OWNER"
(כמו ה-Card החדש בעריכת לקוח שמוביל למסך ההעברה). השרת ממילא אישר
להם, אז הם נחסמו רק ב-UI. הנירמול מבטיח עקביות בין השרת ל-client.
```

---

### משימה 3 — תיקון audit trail על שינוי `therapistId` ב-PUT `/api/clients/[id]`

**הקבצים:**
- `src/app/api/clients/[id]/route.ts`
- אופציונלי: schema ל-Prisma אם רוצים שדה חדש.

**הבעיה (פער ידוע ב-HANDOFF המקורי של Phase 4):** ב-Phase 3 פתחנו את `PUT /api/clients/[id]` לתמיכה ב-`therapistId` (בעלים + מזכירה עם `canCreateClient`). אבל אין רישום ב-`ClientTransferLog` — בניגוד ל-`/clinic-admin/transfer-client` שכן יוצר רישום.

**הפתרון:**
- ב-`PUT /api/clients/[id]`, אם הגיע `therapistId` שונה מהקיים:
  - אחרי ה-`prisma.client.update`, צור `ClientTransferLog`:
    ```typescript
    if (body.therapistId && body.therapistId !== existing.therapistId) {
      await prisma.clientTransferLog.create({
        data: {
          clientId: client.id,
          fromTherapistId: existing.therapistId,
          toTherapistId: body.therapistId,
          performedByUserId: userId,
          reason: "שינוי דרך עריכת מטופל (לא דרך מסך ההעברה)",
          // organizationId אם השדה קיים בסכמה
        },
      });
    }
    ```
  - עטוף ב-`prisma.$transaction([...])` יחד עם ה-update.

**שמירת תאימות:**
- שינויי שדות אחרים (שם, טלפון) — לא משפיעים על audit log.
- שינוי `therapistId` — עכשיו נרשם. לא רגרסיה — תוספת בלבד.
- ⚠️ זה **לא** מעביר פגישות עתידיות אוטומטית. ההמלצה: הוסף הערת toast בצד client שמציינת "להעברת פגישות עתידיות, השתמש במסך ההעברה".

**שאלה לפני ביצוע:**
- האם הסכמה של `ClientTransferLog` כוללת את כל השדות הנדרשים? בדוק ב-`prisma/schema.prisma`.
- האם להעביר גם פגישות עתידיות? **לא** — לפי ה-HANDOFF המקורי. רק רישום.

**הודעת commit מוצעת:**
```
audit: רישום ClientTransferLog גם בשינוי therapistId דרך PUT

עד עכשיו רישום ההעברה היה רק כשעוברים דרך /clinic-admin/transfer.
שינוי ישיר של therapistId דרך עריכת לקוח לא נרשם. עכשיו כל שינוי
של מטפל אחראי יוצר רישום (עם הסבר שזה שינוי דרך עריכה, לא דרך
מסך ההעברה הייעודי). פגישות עתידיות לא עוברות אוטומטית — צריך
להשתמש במסך ההעברה לזה (UX זהה).
```

---

### משימה 4 (אופציונלית, גדולה) — `canTransferClient` למזכירה

**זה משימה 3 המקורית של Phase 4 שלא בוצעה.** דורש דיון מקדים על UX לפני התחלה. **לא לבצע אלא אם המשתמש מבקש בפירוש.**

**שאלות שצריך לסגור עם המשתמש לפני התחלה:**
1. האם מזכירה עם ההרשאה תוכל לראות גם את יומן ההעברות (`ClientTransferLog`)?
2. האם תוכל לראות את כל חברי הקליניקה (כמו OWNER), או רק את המטפלים?
3. האם תוכל לראות את עמוד "מטופלים לפי מטפל" שאני בניתי?
4. האם נדרש sub-permission נוסף (למשל "להעברה רק בתוך הקליניקה" vs "כולל עזיבות")?

**הקבצים שיש לערוך אם המשימה תאושר:**
- `src/lib/scope.ts` — הוספת `canTransferClient` ל-`SecretaryPermissions`.
- `src/hooks/use-my-permissions.ts` — הוספה ל-`MyPermissions` type ול-`OPTIMISTIC_DEFAULT` / `FAIL_CLOSED`.
- `src/app/api/user/permissions/route.ts` — להחזיר את ההרשאה.
- `src/app/api/clinic-admin/me/route.ts` — לאפשר גישה למזכירה עם ההרשאה.
- `src/app/clinic-admin/layout.tsx` — לאפשר ניווט למזכירה עם ההרשאה.
- `src/app/api/clinic-admin/transfer-client/route.ts` — להסיר `isOwner` strict, לקבל גם מזכירה עם ההרשאה.
- `src/app/clinic-admin/members/page.tsx` — checkbox חדש ב-UI ניהול הרשאות.

---

### משימה 5 (קישוט קל, אופציונלית) — Skeleton במקום layout shift ב-Card החדש

**הקבצים:** `src/app/(dashboard)/dashboard/clients/[id]/edit/page.tsx`

**הבעיה:** הסוכן UX זיהה layout shift קל כש-`useMyPermissions.isLoading` חוזר אחרי ~100ms וה-Card "קופץ פנימה".

**הפתרון (אם המשתמש רוצה):**
```tsx
{myPermissions.isLoading ? (
  <Card>
    <CardHeader>
      <div className="h-6 w-48 bg-muted animate-pulse rounded" />
      <div className="h-4 w-72 bg-muted/60 animate-pulse rounded mt-2" />
    </CardHeader>
    <CardContent>
      <div className="h-9 w-36 bg-muted animate-pulse rounded" />
    </CardContent>
  </Card>
) : myPermissions.clinicRole === "OWNER" ? (
  // ה-Card האמיתי
) : null}
```

**הערה:** זה משאיר מקום ל-Card גם למטפלים/מזכירות במהלך הטעינה. אם זה לא רצוי — תשאיר את הקוד הנוכחי שמעדיף "fail-closed UX".

**עדיפות:** נמוכה. הדפוס הקיים (Card מתחיל מוסתר) הוא דפוס עקבי בפרויקט.

---

### משימה 6 (מחוץ לסקופ — תזכורת) — Dependabot vulnerabilities

4 vulnerabilities ב-GitHub Dependabot (1 high, 3 moderate). **לא לטפל בלי החלטה נפרדת** — שדרוג deps עלול לשבור build.

---

## בסיום

אחרי כל ה-commits — `git log --oneline -15` ובדוק ש-2-4 ה-commits החדשים שלך מופיעים בראש (יכול להיות שצ'אטים אחרים דחפו ביניהם — זה בסדר). `git status` חייב להיות נקי חוץ מ-WIP של צ'אטים אחרים ו-HANDOFFs.

עדכן את המשתמש בעברית פשוטה (לא רשימת bullet points ארוכה), קצר:
- כמה commits נדחפו
- ה-SHA-ים שלך
- מה הסוכנים אמרו (GREEN x 5 / YELLOW עם הסבר)
- מה נשאר פתוח

---

## פערים ידועים שלא בסקופ ה-HANDOFF הזה

- 4 vulnerabilities ב-GitHub Dependabot — נדחה.
- Tailwind warnings על `bg-gradient-to-r/br` — נדחה.
- העברת פגישות עתידיות אוטומטית כש-`therapistId` משתנה דרך PUT — דורש החלטה (יישוב עם משימה 3 או נשאר ידני דרך מסך ההעברה).
- הרחבת `/api/clinic-admin/clients` עם פילטר `?id=<X>` ייעודי במקום fetch של 500 רשומות ל-preselect — שיפור יעילות, לא דחוף.

---

**בהצלחה. תעבוד ברצף, בלי לעצור לאישורים, ותדחוף לאחר כל GREEN x 5.**
