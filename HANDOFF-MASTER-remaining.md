# HANDOFF מאוחד — כל מה שנשאר לעשות (MyTipul)

> **מטרת המסמך:** קובץ אחד שמרכז את **כל** העבודה הפתוחה בפרויקט נכון ל-29.5.2026.
> מחליף את הצורך לקרוא את 3 ה-HANDOFFs הנפרדים (`HANDOFF-health-fund.md`,
> `HANDOFF-phase4-clinic-ownership-ui.md`, `HANDOFF-phase4-followups.md`) — סיכום
> מצבם בתוך המסמך הזה.
>
> **איך מתחילים בצ'אט חדש:** הדבק את ההודעה הזו —
> *"תקרא את `HANDOFF-MASTER-remaining.md` בשורש הפרויקט. תתחיל מקבוצה C (health-fund)
> כי שם המשימות הקריטיות לפיצ'ר. תעבוד ברצף, בקרת 5 סוכנים לפני כל commit,
> push אוטומטי אחרי GREEN. משימות שמסומנות 'דורש החלטה' — תשאל אותי קודם."*

---

## 0. מצב נוכחי — מה כבר נדחף ל-`main` (לא לגעת)

| תחום | סטטוס | Commits מרכזיים |
|---|---|---|
| **Phase 4 — `canTransferClient` למזכירה** | ✅ **הושלם במלואו** | `4a842c1e`, `bbd7f79b`, `89c36fdd`, `da172bb2`, `8b7e4d12`, `607cf6d6`, `5907edce` |
| **G3 — דוח/snapshot פיצול הכנסות** | ✅ בסיס עובד | `00544290` (קומיט A), `21e86843` (קומיט B) |
| **קופות חולים + התחייבויות (health-fund)** | ⚠️ **בסיס בלבד** — חסרים 2 פיצ'רים מרכזיים | `fc33bd1f`, `ce9de3eb`, `ddeb03f9`, `847a1bf3`, `5600fa51` |

**לפני שמתחילים:** הרץ `git status` ו-`git log --oneline -10`. כל קובץ עם `M`/`??`
שלא ביקשת לערוך — של צ'אט אחר, **אסור לגעת**.

---

## חוקי עבודה (חובה, לכל הקבוצות)

1. **סקופ קבצים strict** — `git add <נתיב מפורש>` בלבד. אסור `git add .` / `git add -A`.
2. **בקרת 5 סוכנים לפני כל commit** (במקביל דרך Task tool):
   - Security (`explore` readonly) — IDOR, escalation, info-leakage, injection.
   - Backward-compat (`explore` readonly) — רגרסיות בזרימות קיימות.
   - Multi-tenancy (`explore` readonly) — org isolation, RBAC לכל role + impersonation.
   - UX & types (`explore` readonly) — TS, RTL, עברית, חוזה UI.
   - Build pipeline (`shell` **NOT readonly**) — `npx tsc --noEmit`, `npm test -- --run`, `npx eslint <files>`.
   - חכה ל-GREEN x 5. YELLOW/RED → תקן והרץ שוב עד GREEN. אם סוכן לא חוזר תוך 10 דק' — הרץ הבדיקות בעצמך ועשה review ידני.
3. **תאימות לאחור** — אסור לשבור זרימות קיימות. מתפלים עצמאיים (`organizationId=null`) — התנהגות זהה לחלוטין. הקשחה ש"שוברת" UI — רק אחרי אישור מפורש.
4. **commit + push** — הודעה בעברית קצרה (ה-**למה**). `git commit -F .git-commit-msg.tmp` (HEREDOC לא נתמך ב-PowerShell). push אוטומטי אחרי GREEN, אלא אם נכתב "אל תדחוף".
5. **PowerShell (Windows)** — `;` ולא `&&`. נתיבים עם סוגריים בגרשיים כפולים: `"src/app/(dashboard)/..."`.
6. **`.gitignore` מכסה** `.pipeline-*.txt`, `.prisma-gen.txt`, `.git-commit-msg.tmp` — אל תוסיף ל-commit.
7. **תבניות חובה בקוד:**
   - כל API route: `export const dynamic = "force-dynamic";`
   - auth: `requireAuth()` → `loadScopeUser()` → `buildClientWhere()` → action.
   - `logger` ולא `console`.
   - Decimal של Prisma: `Number(value) || 0`. סריאליזציה: `JSON.parse(JSON.stringify(data))`.
   - עברית/RTL בכל ה-UI.

---

## 🔴 קבוצה C — קופות חולים והתחייבויות (health-fund) — **העדיפות הגבוהה ביותר**

הבסיס קיים (DB + API + UI לניהול התחייבויות), אבל **שני הפיצ'רים שהמשתמש הכי
רוצה עדיין חסרים**, ויש בעיית deploy פתוחה.

### C0 (דחוף תפעולית) — migration כושלת ב-Render
- **הבעיה:** ה-migration `20260527100000_add_client_health_fund_and_commitments`
  נכשלה ב-DB של Render כי ה-enum `CommitmentStatus` כבר היה קיים (נוצר ע"י צ'אט אחר).
  ה-SQL כבר תוקן להיות idempotent (`IF NOT EXISTS`), אבל יש רשומת `failed`
  ב-`_prisma_migrations`.
- **הפעולה:** המשתמש כבר עדכן את ה-Build Command ב-Render עם
  `npx prisma migrate resolve --rolled-back 20260527100000_... || true` לפני
  `migrate deploy`. **לוודא עם המשתמש שה-deploy עבר פעם אחת, ואז להחזיר את ה-build
  command למקור** (להסיר את שורת ה-resolve). זו פעולה בקונסולת Render, לא בקוד.

### C1 (פיצ'ר מרכזי חסר) — ספירת טיפולים אוטומטית `usedSessions++`
- **מה צריך:** כשפגישה מסומנת `COMPLETED`, אם ללקוח יש `ClientCommitment` עם
  `status="ACTIVE"` — להעלות `usedSessions` ב-1.
- **הקובץ:** `src/app/api/sessions/[id]/route.ts` — ב-`PUT`, באזור הטיפול ב-
  `status === "COMPLETED"` (סביב שורות 370-410), **אחרי** יצירת ה-Payment.
- **קוד מוצע:**
  ```typescript
  if (therapySession.clientId) {
    await prisma.clientCommitment.updateMany({
      where: { clientId: therapySession.clientId, status: "ACTIVE" },
      data: { usedSessions: { increment: 1 } },
    });
  }
  ```
- **שים לב:** הקובץ הזה היה ב-WIP של צ'אט אחר בעבר (`git status`). ודא שהוא נקי
  לפני עריכה, אחרת תאם עם המשתמש.

### C2 (הפיצ'ר הכי חשוב למשתמש) — השתתפות עצמית בדיאלוג סיום פגישה
- **מה צריך:** בדיאלוג "סיום פגישה", אם ללקוח התחייבות פעילה — הסכום לתשלום =
  `copaymentAmount` מההתחייבות (למשל 50₪) **במקום** `session.price` (למשל 320₪),
  + הודעה "קופת חולים: כללית | השתתפות עצמית: 50₪".
- **הקובץ:** `src/components/sessions/complete-session-dialog.tsx`.
- **איך:**
  1. ב-`useEffect` על פתיחת הדיאלוג — `fetch('/api/clients/${clientId}/commitments')`,
     לחפש commitment עם `status === "ACTIVE"`.
  2. אם נמצאה — `setAmount(commitment.copaymentAmount.toString())` + badge "השתתפות עצמית".
  3. `client.id` כבר קיים ב-interface של ה-session.
- **API קיים:** `src/app/api/clients/[id]/commitments/route.ts` (GET).

### קבצים מרכזיים ל-health-fund (לידיעה)
| קובץ | תפקיד |
|---|---|
| `src/components/sessions/complete-session-dialog.tsx` | **לשנות (C2)** |
| `src/app/api/sessions/[id]/route.ts` | **לשנות (C1)** |
| `src/app/api/clients/[id]/commitments/route.ts` | GET/POST התחייבויות |
| `src/components/clients/commitment-management.tsx` | UI ניהול התחייבויות (קיים) |

---

## 🟡 קבוצה B — שיפורים ל-G3 (פיצול הכנסות) — אופציונלי, לא חוסם

עבר GREEN בביקורת. אלה חיזוקים. המערכת עובדת בלעדיהם.

| # | הבעיה | תיאור פשוט | מאמץ | קובץ עיקרי |
|---|---|---|---|---|
| B1 | snapshot helper לא בודק tenant שוב | חגורה כפולה — אם בעתיד ישכחו לבדוק שייכות, ה-helper יבדוק לבד | קטן | `src/lib/clinic/revenue-snapshot.ts` |
| B2 | אפשר לעדכן אחוז למטפלת **חסומה** | מטפלת חסומה (`isBlocked`) — לחסום עריכת אחוז | קטן | `src/app/api/clinic-admin/revenue-settings/route.ts` |
| B3 | מטפלת עצמאית מקבלת "אסור" במקום "אינך שייכת לקליניקה" | שיפור טקסט 403 בלבד | קטן | `revenue-settings/route.ts` |
| B4 | Webhooks (Cardcom/Meshulam) לא יוצרים snapshot | תשלומי סליקה אוטומטית — אין snapshot (הדוח עדיין עובד בחישוב חי) | בינוני | webhook routes של תשלומים |
| B5 | מצב dirty פשוט מדי בדף הגדרות | אפשר "לשמור" ערך זהה למקור | קטן | `src/app/clinic-admin/revenue-settings/page.tsx` |
| B6 | הדוח מחשב חי במקום להשתמש ב-snapshot | snapshot שמור אך לא בשימוש — מעבר אליו ימנע רגרסיה אם אחוז משתנה | בינוני-גדול | `src/app/api/clinic-admin/revenue-report/route.ts` |

**המלצה:** B1–B3, B5 ב-commit אחד (קלים); B4 ו-B6 בנפרד (לוגיקה).

---

## 🟡 קבוצה A — שיפורי polish ל-`canTransferClient` — אופציונלי

הפיצ'ר **עובד E2E** (מזכירה עם ההרשאה מעבירה מטופלים). אלה YELLOWs מהביקורת
שלא חוסמים:

| # | הבעיה | קובץ | הערה |
|---|---|---|---|
| A1 | `/api/clinic-admin/me` חושף `aiTier`/`subscriptionStatus`/`pricingPlan.name` למזכירה | `src/app/api/clinic-admin/me/route.ts` | info-leakage מינורי — לצמצם select למזכירה |
| A2 | `/api/clinic-admin/clients` מציג quick clients ו-`therapist.email` | `src/app/api/clinic-admin/clients/route.ts` | יותר מידע מהנדרש להעברה |
| A3 | `?error=clinic_owner_only` ב-dashboard אין לו handler להצגת באנר | דף dashboard ראשי | UX — באנר הסבר |
| A4 | Sidebar למזכירה עדיין מציג plan/status בכותרת | `src/app/clinic-admin/layout.tsx` | להסתיר למי שאינו owner |
| A5 | `startsWith` ב-whitelist של `/api/clinic-admin/clients` ו-`/transfer-client` | `src/proxy.ts` (`SECRETARY_CLINIC_ADMIN_PATHS`) | footgun עתידי אם יוצרים sub-routes — לשקול exact match |
| A6 | אין unit tests ל-`canTransferClient` | `src/lib/__tests__/` | להוסיף בדיקות ל-`requireClinicAdminAccess` |

---

## ⚪ קבוצה D — פערים ידועים חוצי-מערכת (דורשים החלטה — לשאול לפני ביצוע)

| # | נושא | למה דורש החלטה |
|---|---|---|
| D1 | impersonation audit ב-`ClientTransferLog` — שמור `performedById` של ה-target ולא של המתחזה | דורש **migration** (שדה `impersonatedByUserId`). קיים גם ב-`/clinic-admin/transfer-client` — לא רגרסיה חדשה |
| D2 | העברת פגישות עתידיות אוטומטית כש-`therapistId` משתנה דרך PUT | כיום רק רישום, לא העברה. הדפוס: להשתמש במסך ההעברה. שינוי = החלטת UX |
| D3 | 4 vulnerabilities ב-GitHub Dependabot (1 high, 3 moderate) | שדרוג deps עלול לשבור build — החלטה נפרדת |
| D4 | 2 שגיאות ESLint preexisting ב-`edit/page.tsx` (~שורה 509, גרשיים ב"אזור מסוכן") | מחוץ לסקופ — ניקוי מכני, לא דחוף |
| D5 | Tailwind warnings על `bg-gradient-to-r/br` | אזהרת lint עתידי, לא דחוף |
| D6 | `secretaryPermissionsSchema` ב-`src/lib/validations/clinic-admin.ts` הוא `z.record` גנרי | `canTransferClient` כן נשמר (record מקבל כל key) — אבל אין all-list מפורש. שיפור אופציונלי |

---

## סדר ביצוע מומלץ

1. **קבוצה C** — הפיצ'ר האמיתי שחסר למשתמש (C0 תפעולי → C1 → C2).
2. **קבוצה B** — סגירת G3 (B1–B3+B5 יחד, אז B4, אז B6).
3. **קבוצה A** — polish ל-`canTransferClient` (A1, A4 חשובים יותר; השאר לפי זמן).
4. **קבוצה D** — רק אחרי דיון עם המשתמש (D1 ו-D2 דורשים החלטות מוצר).

## בסיום כל קבוצה
- `git log --oneline -10` — ודא שה-commits שלך בראש.
- `git status` נקי חוץ מ-WIP של צ'אטים אחרים ו-HANDOFFs.
- עדכן את המשתמש בעברית קצרה: כמה commits, ה-SHA-ים, מה הסוכנים אמרו, מה נשאר פתוח.

---

**הערה:** המסמכים `HANDOFF-health-fund.md`, `HANDOFF-phase4-clinic-ownership-ui.md`,
`HANDOFF-phase4-followups.md` מוצו/סוכמו כאן. אפשר למחוק אותם אחרי שמוודאים שכל
מה שרלוונטי הועתק — אבל **לא חובה**, והם לא מפריעים.
