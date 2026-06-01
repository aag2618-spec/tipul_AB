# Phase 4 — שיפור ניהול בעלות לקוחות בקליניקה (HANDOFF לצ'אט הבא)

המשתמש **אישר מראש** את כל המשימות בקובץ הזה. אל תעצור לאישורים נוספים. עבוד ברצף לפי הסדר, בקרת 5 סוכנים לפני כל commit, push אוטומטי אחרי GREEN x 5.

---

## מצב נוכחי (Done — לא לגעת)

### מה כבר קיים בפרויקט

| יכולת | מיקום | מי ניגש? |
|---|---|---|
| **שדה `therapistId` ב-PUT `/api/clients/[id]`** | `src/app/api/clients/[id]/route.ts` שורות 291-359 | OWNER, SECRETARY עם `canCreateClient` (מאומת בולידציה מלאה) |
| **מסך העברת לקוח מלא** עם בחירת מטפל יעד, סיבה, פגישות עתידיות, אודיט (`ClientTransferLog`) | `src/app/clinic-admin/transfer/page.tsx` + `src/app/api/clinic-admin/transfer-client/route.ts` | **רק OWNER** (SECRETARY חסום בלייאאוט `src/app/clinic-admin/layout.tsx`) |
| **API חברי קליניקה** עם `_count.clients` | `src/app/api/clinic-admin/members/route.ts` | רק OWNER |
| **API לקוחות הקליניקה** עם `therapist: { id, name, email }` | `src/app/api/clinic-admin/clients/route.ts` | רק OWNER |
| **picker מטפל ב-`/clients/new`** | `src/app/(dashboard)/dashboard/clients/new/page.tsx` שורות 449-483 | OWNER + SECRETARY (עם `canCreateClient`) |
| **picker מטפל ב-NewSessionDialog** (פגישת ייעוץ) | `src/components/calendar/new-session-dialog.tsx` שורות 700-738 | OWNER + SECRETARY |
| **`/api/clinic/therapists`** | `src/app/api/clinic/therapists/route.ts` | OWNER + SECRETARY בלבד |
| **`useMyPermissions` hook** עם `clinicRole` ו-`permissions` | `src/hooks/use-my-permissions.ts` | כל ה-client components |

### ה-`SecretaryPermissions` הקיים (לידיעה)

ב-`src/lib/scope.ts` שורה 41-48:

```typescript
export type SecretaryPermissions = {
  canViewPayments?: boolean;
  canIssueReceipts?: boolean;
  canSendReminders?: boolean;
  canCreateClient?: boolean;
  canViewDebts?: boolean;
  canViewStats?: boolean;
  canViewConsentForms?: boolean;
};
```

### Commit אחרון לפני ה-HANDOFF הזה

```
bce56b02 ניקוי: react-hooks/exhaustive-deps ב-session-detail-dialog
d1c0aade הקשחת POST /api/clients — מזכירה חייבת therapistId
3cafbed3 תמיכה בשינוי מטפל אחראי ב-PUT /api/clients/[id]
c8e7d9ba Phase 3 — picker מטפל גם ב-NewSessionDialog למצב מטופל מהיר
280ce3d5 חיווט ?new=true ביומן — פותח NewSessionDialog אוטומטית
46e73aed Phase 3 L1: gate canViewPayments ב-/api/clients/[id]/add-credit
```

### קבצים שצ'אטים אחרים עובדים עליהם — אסור לגעת

קרא `git status` בהתחלה. כל קובץ עם שינוי שלא ביקשת — של צ'אט אחר. דוגמאות אחרונות: `src/app/clinic-admin/billing/page.tsx`, `src/lib/scope.ts` (שינויים של consent-forms), `src/app/api/consent-forms/*`, `HANDOFF-health-fund.md`. אם בספק — **תעצור ותשאל**.

---

## חוקים (חובה, לא משא ומתן)

1. **סקופ קבצים strict** — `git add` רק על קבצים שאתה שינית, נתיב מפורש (אסור `git add .` או `git add -A`).
2. **לפני כל commit — 5 סוכנים במקביל ב-Task tool**:
   - Security (`explore` readonly) — IDOR, escalation, info-leakage, injection.
   - Backward-compat (`explore` readonly) — רגרסיות בזרימות קיימות.
   - Multi-tenancy (`explore` readonly) — org isolation, RBAC לכל role + impersonation.
   - UX & types (`explore` readonly) — TS, RTL, עברית, חוזה UI עקבי.
   - Build (`shell` **NOT readonly**) — `npx tsc --noEmit`, `npm test -- --run`, `npx eslint <files>`.
3. חכה ל-GREEN x 5. YELLOW/RED → תקן והרץ אותו סוכן שוב, סבב הלוך-חזור עד GREEN.
4. הודעת commit בעברית קצרה — מסבירה את ה-**למה**. דרך HEREDOC או `git commit -F .git-commit-msg.tmp`.
5. **push אוטומטי** מיד אחרי commit מוצלח. אם `git pull --rebase` נכשל על unstaged changes של צ'אט אחר — push בלי rebase.
6. אל תיצור branches, אל תפתח PR — push ל-`main` ישר.
7. PowerShell: השתמש ב-`;` ולא ב-`&&`. שים נתיבים עם סוגריים בגרשיים: `"src/app/(dashboard)/..."`.
8. קובץ זמני להודעת commit (`.git-commit-msg.tmp`) — מחק אחרי שדחפת (אם עוד קיים — לפעמים `git pull` מוחק אותו). `.gitignore` כבר מכסה.
9. הסוכנים יכולים להחזיר טקסט עברית עם קידוד פגום — קרא ישירות מקבצי ה-JSONL ב-`agent-transcripts` אם צריך.

---

## משימות — בסדר ביצוע (כל אחת = commit + push נפרד)

### משימה 1 — קישור מ-`/dashboard/clients/[id]/edit` ל-`/clinic-admin/transfer` (UX, OWNER בלבד)

**הקבצים:**
- `src/app/(dashboard)/dashboard/clients/[id]/edit/page.tsx` — להוסיף Card עם כפתור.
- אופציונלי: ייבוא `useMyPermissions`.

**הבעיה:** ב-Phase 3 פתחנו את ה-API לעדכון `therapistId` ב-PUT, אבל אין UI לזה. בעלים שצריך להעביר לקוח צריך לזכור ללכת ל-`/clinic-admin/transfer` בנפרד — אין קישור ממסך עריכת הלקוח.

**הפתרון המוצע (מינימליסטי, בטוח):**
- לא לבנות picker inline בעמוד edit (מסתבך מהר — מטפלת עזיבה, פגישות עתידיות, אודיט).
- במקום זה: להוסיף **Card נפרד** עם כותרת "העברת מטופל לקוב המטפל" וכפתור "פתח/י את מסך ההעברה" שמוביל ל-`/clinic-admin/transfer?clientId={id}`.
- המסך עצמו ידע לבחור את הלקוח אוטומטית מהפרמטר (חיווט נוסף ב-`transfer/page.tsx`).
- ה-Card מוצג **רק** אם `myPermissions.clinicRole === "OWNER"`.

**שינויים נדרשים:**

1. ב-`edit/page.tsx`:
   - ייבוא: `import { useMyPermissions } from "@/hooks/use-my-permissions";` ו-`import { ArrowLeftRight } from "lucide-react";`.
   - בתוך הקומפוננטה: `const myPermissions = useMyPermissions();`.
   - בסוף ה-form (לפני Submit buttons), הוסף:
   ```tsx
   {myPermissions.clinicRole === "OWNER" && (
     <Card>
       <CardHeader>
         <CardTitle className="text-base flex items-center gap-2">
           <ArrowLeftRight className="h-4 w-4 text-primary" />
           העברת מטופל בין מטפלים
         </CardTitle>
         <CardDescription>
           להעברת המטופל למטפל/ת אחר/ת בקליניקה — כולל פגישות עתידיות
           ואודיט אוטומטי
         </CardDescription>
       </CardHeader>
       <CardContent>
         <Button asChild variant="outline">
           <Link href={`/clinic-admin/transfer?clientId=${id}`}>
             פתח/י את מסך ההעברה
           </Link>
         </Button>
       </CardContent>
     </Card>
   )}
   ```

2. ב-`src/app/clinic-admin/transfer/page.tsx`:
   - אחרי `const [search, setSearch] = useState("");`, הוסף:
   ```typescript
   const searchParams = useSearchParams();
   const preselectedClientId = searchParams.get("clientId");
   ```
   - אחרי `await Promise.all([fetchMembers(), fetchClients()])` בתוך ה-useEffect הראשון:
   ```typescript
   if (preselectedClientId) {
     const found = clients.find((c) => c.id === preselectedClientId);
     // הערה: ה-fetch כבר רץ בתוך ה-Promise.all; כאן נמשוך את הלקוח שוב
     // כי הוא לא בהכרח ברשימה (q ריק → מחזיר 100 ראשונים).
     try {
       const res = await fetch(`/api/clinic-admin/clients?limit=500`);
       if (res.ok) {
         const data: Client[] = await res.json();
         const target = data.find((c) => c.id === preselectedClientId);
         if (target) selectClient(target);
       }
     } catch {
       // ignore — המשתמש יבחר ידנית
     }
   }
   ```
   הערה: זה ידרוש לייבא `useSearchParams` מ-`next/navigation`.

**שמירת תאימות לאחור:**
- THERAPIST/SECRETARY/עצמאי לא רואים את ה-Card → אין שינוי.
- OWNER עם הקישור הישן בלי `clientId` → המסך נטען רגיל.
- OWNER מקליק על ה-Card → preselect → לחיצה אחת והוא בעצם בחירת מטפל יעד.

**הודעת commit מוצעת:**
```
Phase 4 — קישור מעריכת לקוח למסך העברת מטופל

הסיבה: ב-Phase 3 פתחנו PUT /api/clients/[id] עם therapistId, אבל בעלים
שצריך להעביר לקוח צריך לזכור ללכת ל-/clinic-admin/transfer בנפרד.
עכשיו יש Card עם כפתור ישירות מתוך עריכת לקוח (רק לבעלים), שמעביר
ל-/clinic-admin/transfer עם preselect של הלקוח.
```

---

### משימה 2 — תצוגה חדשה: "מטופלים לפי מטפל" (פיצ'ר חדש)

**הקבצים:**
- חדש: `src/app/clinic-admin/members/by-therapist/page.tsx` (או כטאב במסך `members` — בחר לפי שיקול דעת).
- אפשר להרחיב את `src/app/api/clinic-admin/clients/route.ts` עם פרמטר `groupBy=therapist`, או ליצור endpoint חדש `src/app/api/clinic-admin/clients-by-therapist/route.ts`. ההמלצה: endpoint נפרד כדי לא לשבור את ה-shape הקיים של `transfer/page.tsx`.
- קישור ב-`src/app/clinic-admin/layout.tsx` ל-`navItems`.

**הבעיה:** היום מסך `members` מראה מספר לקוחות לכל חבר אבל בלי רשימה, ובלי click-through. בעלים שצריך לראות "מי המטופלים של מטפלת X לפני שעוזבת" — אין מסך כזה (יש flow ב-departures, אבל זה ייעודי לעזיבה).

**הפתרון:**

1. **endpoint חדש** `src/app/api/clinic-admin/clients-by-therapist/route.ts`:
   ```typescript
   import { NextRequest, NextResponse } from "next/server";
   import { Prisma } from "@prisma/client";
   import prisma from "@/lib/prisma";
   import { logger } from "@/lib/logger";
   import { requireAuth } from "@/lib/api-auth";

   export const dynamic = "force-dynamic";

   export async function GET(request: NextRequest) {
     try {
       const auth = await requireAuth();
       if ("error" in auth) return auth.error;
       const { userId } = auth;

       const me = await prisma.user.findUnique({
         where: { id: userId },
         select: { role: true, clinicRole: true, organizationId: true },
       });
       if (!me) return NextResponse.json({ message: "המשתמש לא נמצא" }, { status: 404 });

       const isOwner = me.role === "CLINIC_OWNER" || me.clinicRole === "OWNER";
       if (!isOwner) return NextResponse.json({ message: "אין הרשאה" }, { status: 403 });
       if (!me.organizationId) return NextResponse.json({ message: "אינך משויך/ת לקליניקה" }, { status: 400 });

       const therapists = await prisma.user.findMany({
         where: {
           organizationId: me.organizationId,
           isBlocked: false,
           clinicRole: { in: ["OWNER", "THERAPIST"] },
         },
         select: {
           id: true,
           name: true,
           email: true,
           clinicRole: true,
           clients: {
             where: { status: { not: "ARCHIVED" } },
             select: {
               id: true,
               firstName: true,
               lastName: true,
               name: true,
               phone: true,
               email: true,
               status: true,
               isQuickClient: true,
               _count: { select: { therapySessions: true } },
             },
             orderBy: [{ lastName: "asc" }, { firstName: "asc" }],
           },
         },
         orderBy: [{ clinicRole: "asc" }, { name: "asc" }],
       });

       return NextResponse.json(JSON.parse(JSON.stringify(therapists)));
     } catch (error) {
       logger.error("[clinic-admin/clients-by-therapist] GET error:", {
         error: error instanceof Error ? error.message : String(error),
       });
       return NextResponse.json({ message: "שגיאה בטעינה" }, { status: 500 });
     }
   }
   ```

2. **דף חדש** `src/app/clinic-admin/members/by-therapist/page.tsx` (מומלץ — שמירה על המבנה הקיים של `members`):
   - "use client".
   - state ל-`therapists` (מטיפוס שמכיל גם `clients[]`).
   - fetch ל-`/api/clinic-admin/clients-by-therapist`.
   - לכל מטפל — Card מתקפלת (Collapsible) עם:
     - שם, role badge (Crown/Stethoscope), מספר לקוחות סה"כ.
     - מתחת — טבלה/רשימה של לקוחות עם click-through ל-`/dashboard/clients/{id}`.
   - שורת חיפוש פילטור (לפי שם לקוח/טלפון).
   - "מטפל ללא לקוחות" מוצג בכל זאת (UX — בעלים רוצה לראות שאין).

3. **ניווט** — ב-`src/app/clinic-admin/layout.tsx` אחרי שורה 55 (`departures`):
   ```typescript
   { href: "/clinic-admin/members/by-therapist", label: "מטופלים לפי מטפל", icon: Users },
   ```
   (או אייקון אחר אם רוצה שונה. שים לב שיש כבר `Users` ב-import.)

**שמירת תאימות לאחור:**
- endpoint חדש לא משפיע על קוד קיים.
- דף חדש לא משפיע על קוד קיים.
- ניווט חדש בלייאאוט — מוסיף שורה, אין שינוי בקיים.
- מטפל עצמאי / מטפל בקליניקה (לא OWNER) — 403 מה-API. UI לא נגיש להם (לייאאוט חוסם).

**הערה אופציונלית — שדרוג עתידי שלא במשימה זו:**
לאפשר ל-SECRETARY עם הרשאה חדשה לראות את המסך הזה. דורש:
- הוספת `canManageTherapistAssignments` (או דומה) ל-`SecretaryPermissions` ב-`src/lib/scope.ts`.
- עדכון `/api/clinic-admin/me` להחזיר flag חדש או שינוי ה-403 בלייאאוט שיתיר גישה למזכירה עם ההרשאה (לפי הקיים, היום הלייאאוט פותח רק ל-OWNER).
- הוספת checkbox ב-`members/page.tsx` של ניהול הרשאות מזכירה.
- **לא לבצע כעת אלא אם המשתמש יבקש בפירוש** — שינוי הרשאות הוא עניין רגיש.

**הודעת commit מוצעת:**
```
Phase 4 — תצוגת "מטופלים לפי מטפל" בניהול קליניקה

הסיבה: היום בעלים רואה מספר לקוחות לכל חבר ב-/clinic-admin/members,
אבל אין רשימת לקוחות לכל מטפל ואין click-through לתיק. תצוגה חדשה
מציגה את כל המטפלים עם הלקוחות שלהם, מתאימה לבעלים שצריך לסקור
חלוקת תיקים לפני העברה/עזיבה. רק OWNER.
```

---

### משימה 3 (אופציונלית, רק אם המשתמש מבקש בפירוש) — פתיחת `/clinic-admin/transfer` למזכירה

**הקבצים אם תבוצע:**
- `prisma/schema.prisma` — הוספת מיגרציה (שדה JSON `secretaryPermissions` כבר קיים, אז זה רק שינוי בקוד).
- `src/lib/scope.ts` — הוספת `canTransferClient` ל-`SecretaryPermissions`.
- `src/hooks/use-my-permissions.ts` — הוספה ל-`MyPermissions` type ול-defaults.
- `src/app/api/user/permissions/route.ts` — להחזיר את ההרשאה החדשה.
- `src/app/api/clinic-admin/me/route.ts` — לאפשר גישה למזכירה עם ההרשאה.
- `src/app/clinic-admin/layout.tsx` — הוספת תנאי שלא חוסם מזכירה עם ההרשאה.
- `src/app/api/clinic-admin/transfer-client/route.ts` — הסרת `isOwner` strict וקבלה גם של מזכירה עם ההרשאה.
- `src/app/clinic-admin/members/page.tsx` — הוספת ה-permission ל-UI ניהול ההרשאות.

**זהירות:** שינוי רחב, נוגע במספר shipped API endpoints. דורש דיון מקדים עם המשתמש על UX (האם מזכירה גם תוכל לראות `ClientTransferLog`? לראות חברי קליניקה? לראות יומן עזיבות?). **לא לבצע בלי אישור מפורש.**

---

### משימה 4 (אופציונלית, ניקיון מתועד מ-Phase 3) — תיקוני preexisting ESLint

**הקבצים:**
- `src/app/(dashboard)/dashboard/payments/pay/[clientId]/page.tsx`

**הבעיות (preexisting, לא נוגעות לפיצ'רים חדשים):**
- L427:62 ו-L541:62 — `react/no-unescaped-entities` על `סה"כ` (להחליף `"` ב-`&quot;`).
- L13:53 — `'User' is defined but never used`.
- L16:37 — `'calculateSessionDebt' is defined but never used`.
- L58:6 — `react-hooks/exhaustive-deps`: ל-`useEffect` חסר dependency `'fetchClientData'`.

**הפתרון:** מכני בלבד. עבור L58 — להוסיף `fetchClientData` ל-deps; אם זה גורם ל-re-fetch אינסופי, להחליף ל-`useCallback`. אם לא בטוח, `eslint-disable-next-line` עם הסבר (כמו במשימה 6 הקודמת).

**הודעת commit מוצעת:**
```
ניקוי: react/no-unescaped-entities + unused imports ב-pay-client-debts

הסיבה: warnings preexisting בקובץ /dashboard/payments/pay/[clientId]
שצברנו מאז Phase 1. החלפת " ב-&quot; ב-"סה"כ", הסרת 2 imports
לא בשימוש, ותיקון תלות חסרה ב-useEffect.
```

---

## בסיום

אחרי כל ה-commits — `git log --oneline -10` ובדוק ש-2-3 ה-commits החדשים שלך בראש (משימה 1 + 2, ואופציונלית 4). `git status` חייב להיות נקי חוץ מ-HANDOFF-* (שלך + של צ'אטים אחרים) ו-WIP של צ'אטים אחרים.

עדכן את המשתמש בעברית, קצר, עם:
- כמה commits נדחפו
- ה-SHA-ים
- מה ה-pipeline אמר על כל אחד (GREEN x 5)
- מה נשאר פתוח (אם בכלל)

---

## פערים ידועים שלא בסקופ ה-HANDOFF הזה

- 4 vulnerabilities ב-GitHub Dependabot (1 high, 3 moderate) — דורש החלטה נפרדת.
- Sessions של לקוח אחרי `therapistId` reassignment דרך PUT (לא דרך `/clinic-admin/transfer`) — לא מועברות אוטומטית. הדפוס הקיים: השתמש ב-`/clinic-admin/transfer` שמטפל בזה. אם רוצים גם ב-PUT — דורש החלטה.
- Audit trail על `therapistId` reassignment ב-PUT `/api/clients/[id]` — אין `ClientTransferLog`. רק `/clinic-admin/transfer` יוצר את זה. החלטה האם להוסיף.
- Tailwind warnings על `bg-gradient-to-r/br` (אזהרת lint עתידי, לא דחוף).
- אין הרשאה למזכירה לנהל הקצאת לקוחות (משימה 3 כאן). תלוי בהחלטת המשתמש.

---

**בהצלחה. תעבוד ברצף, בלי לעצור לאישורים, ותדחוף לאחר כל GREEN x 5.**
