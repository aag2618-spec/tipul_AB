# Stage 1.17.4 — סבב 3: Staff Bypass + תיקוני שאריות

## מטרה (לפי דרישת המשתמש)

> "אני רוצה שההגבלות שאני יחליט לעשות כל פעם לכל משתמשי התוכניות למניהם
> על כל סוגי הניתוח למינהם יחול על כולם גם על משתמשי הניסיון גם על האלה
> שנתתי להם מתנה למעט כאלו שהם מנהלים או מזכירים."

> "אדמין מזכיר או כל מנהל מסוג אחר להם יהיה ללא הגבלה."

**סמנטיקה ברורה:**
- `Role === "USER"` (כולל `subscriptionStatus === "TRIALING"` ו/או `isFreeSubscription === true`)
  → חלים כל ה-gates: ESSENTIAL block, trial cap (₪5), TierLimits מ-`/admin/tier-settings`,
  ו-`GlobalAISettings` (ב-`session-prep`).
- `Role === "ADMIN" || "MANAGER"` ("מזכיר" = `MANAGER` בסכמה)
  → bypass מלא של כל ה-gates. counters עדיין מתעדכנים (tracking, לא enforcement).

## שינויים בסבב 3

### 1. helper חדש `isStaff(role)` ב-`src/lib/usage-limits.ts`

```typescript
import type { AITier as PrismaAITier, Role } from "@prisma/client";

/**
 * Stage 1.17.4 (סבב 3): bypass של כל מגבלות ה-AI לאדמין/מזכיר.
 * ADMIN ו-MANAGER מקבלים גישה ללא הגבלה לכל פיצ'רי ה-AI ללא תלות ב-tier,
 * trial cap, מכסה חודשית, או rate-limit גלובלי.
 * USER (כולל TRIALING ו-isFreeSubscription) ממשיכים לעבור את כל ה-gates.
 *
 * Counters עדיין מתעדכנים גם ל-staff (tracking ולא enforcement).
 */
export function isStaff(role: Role): boolean {
  return role === "ADMIN" || role === "MANAGER";
}
```

### 2. בכל 5 ראוטי ה-AI: עטיפת ה-gates ב-`if (!staffBypass) { ... }`

#### `src/app/api/ai/session-prep/route.ts`
- חישוב `staffBypass = isStaff(user.role)` מיד אחרי load של ה-user.
- `usageMonth/usageYear` נשארו מחוץ לבלוק (נדרשים ל-`prisma.$transaction` upsert בסוף הראוט).
- כל הבדיקות (ESSENTIAL → trial → tier → globalAISettings) עטופות ב-`if (!staffBypass)`.
- ה-transaction בסוף הראוט (`aIUsageStats.upsert` + `monthlyUsage.upsert` עם `sessionPrepCount: { increment: 1 }`) רץ גם ל-staff (tracking).

#### `src/app/api/ai/questionnaire/analyze-single/route.ts`
#### `src/app/api/ai/questionnaire/analyze-combined/route.ts`
#### `src/app/api/ai/questionnaire/progress-report/route.ts`
- אותו דפוס: `staffBypass`, `currentCount` ו-`let limit = 0` נשארו מחוץ לבלוק (נדרשים ל-response payload).
- staff מקבלים `limit = 0` → ה-response payload יציג `remaining: null` (תואם לסמנטיקה של "ללא הגבלה" שהוגדרה בסבב 2).
- monthly upsert (increment של `singleQuestionnaireCount` / `combinedQuestionnaireCount` / `progressReportCount`) רץ גם ל-staff.

#### `src/app/api/ai/session/analyze/route.ts`
- הוספת `role: true` ל-`select` של ה-user (היה הקובץ היחיד עם `select` מפורש).
- `if (!staffBypass)` עוטף ESSENTIAL + trial + DETAILED-only-Enterprise gate.
- בלוק ה-`DETAILED quota check` (`consumeAiAnalysis` החדש או legacy quota) עכשיו `if (analysisType === "DETAILED" && !staffBypass)` — staff מדלגים על הצריכה לחלוטין.
- `userIdForRefund = user.id` נשאר מחוץ לבלוק; `aiConsumeReceipt` נשאר `null` ל-staff → `issueRefund()` no-op.

### 3. תיקונים מ-5 סוכני ביקורת מקבילים בסבב 3

#### תיקון BLOCKER מסבב 5: `QuotaExhaustedError` חסר `upgradeLink`
- ב-`session/analyze/route.ts` שורות 175-180: ה-branch של `QuotaExhaustedError` החזיר 429 בלי `upgradeLink` ועם הודעה לא תואמת.
- **תיקון:** הוספת `upgradeLink: "/dashboard/settings/billing"` והשלמת ההודעה ל-"שדרג את התוכנית שלך לקבלת מכסה נוספת" — תואם לכל שאר ה-429 בראוטים.

#### תיקון MAJOR מסבב 2 + 4: staff DETAILED + `USE_NEW_CONSUME_AI` → `detailedAnalysisCount` לא מתעדכן
- כש-staff עושה DETAILED ו-`USE_NEW_CONSUME_AI=true`:
  - `consumeAiAnalysis` מדולג (אין דדאקציית קרדיט).
  - אבל ה-`monthlyUsage.upsert` בסוף הראוט מניח שה-consume כבר עדכן את `detailedAnalysisCount` → לא מקדם אותו.
  - תוצאה: analytics gap — counter לא עולה ל-staff.
- **תיקון:** עדכון תנאי `isNewFlow` להחריג staff:
  ```typescript
  const isNewFlow =
    isNewConsumeAiEnabled() && analysisType === "DETAILED" && !staffBypass;
  ```
- staff נופל ל-branch הלגאסי של ה-upsert → `detailedAnalysisCount: { increment: 1 }` רץ. תיקון tracking נקי בלי שינוי בהתנהגות ל-USER.

## איך הסבב מתיישב עם 1+2

כל 14 התיקונים מסבבים 1+2 נשארו על כנם (אומת ע"י Reviewer 5):
- `getTierLimits` עם `select` מפורש ✓
- ESSENTIAL early return בכל 5 הראוטים ✓
- אין hardcoded limits ✓
- `upgradeLink` בכל error response (כולל ה-`QuotaExhausted` שתוקן עכשיו) ✓
- "שדרג את התוכנית שלך לקבלת מכסה נוספת" אחיד ✓
- `import type { AITier as PrismaAITier }` ✓
- `getTierLimits(tier: PrismaAITier)` signature ✓
- Runtime guard `if (!(tier in DEFAULT_LIMITS)) throw` ✓
- `as const` + `satisfies TierFeatureLimits` על `DEFAULT_LIMITS` ✓
- `logger.info` בלי PII ב-`session-prep` ✓
- `prisma.$transaction([...])` ב-`session-prep` ✓
- `remaining: limit === 0 ? null : ...` ב-3 ראוטי השאלון ✓
- Drift warning comments ב-`usage-limits.ts` + `admin/tier-limits/route.ts` ✓
- אין `as` casts על `user.aiTier` ב-`getTierLimits()` ✓

## הערות לא חוסמות (deferred)

- (Reviewer 2 #1-2) `updateTrialAiCost` רץ גם ל-staff. בטוח: `trial-limits.ts` בודק `subscriptionStatus === "TRIALING"` פנימית ועושה no-op כש-false. staff לא TRIALING בפועל.
- (Reviewer 2 #3) שלושת ראוטי השאלון לא בודקים `globalAISettings` כמו `session-prep`. **קיים מאז סבב 1**, לא רגרסיה. דורש ההחלטה מוצרית האם להוסיף.
- (Reviewer 3) `session/analyze` לא אוכף `conciseAnalysisLimit` ל-CONCISE. **קיים מאז סבב 1**, scope creep. דורש PR נפרד.
- (Reviewer 4 #6) ה-bypass מבוסס role ולא permission system (`hasPermission`). מכוון — `isStaff` פשוט יותר ועקבי לדפוס שכבר קיים ב-codebase (`middleware.ts`, `app-sidebar.tsx`, וכו').

## בדיקות

```bash
npx tsc --noEmit          # passed (clean)
npx vitest run src/lib/__tests__/credits.test.ts  # 19/19 passed
```

## תרחישי בדיקה ידנית (post-merge)

| תרחיש | role | aiTier | subscriptionStatus | isFreeSubscription | תוצאה צפויה |
|------|------|--------|--------------------|--------------------|-------------|
| A. trial על PRO ניצל ₪5 | USER | PRO | TRIALING | false | 429 trialLimitReached |
| B. trial על PRO לא ניצל cap, 60 קריאות | USER | PRO | TRIALING | false | 429 tier limit reached at #61 |
| C. מתנה (free unlimited) על PRO, 60 קריאות | USER | PRO | ACTIVE | true | 429 tier limit reached at #61 |
| D. ESSENTIAL | USER | ESSENTIAL | * | * | 403 |
| E. ADMIN על ENTERPRISE 100 קריאות | ADMIN | ENTERPRISE | * | * | 200 OK (bypass) |
| F. MANAGER על PRO 200 קריאות | MANAGER | PRO | * | * | 200 OK (bypass) |
| G. ADMIN על ESSENTIAL | ADMIN | ESSENTIAL | * | * | 200 OK (bypass — staff > tier) |
| H. ADMIN על PRO + DETAILED | ADMIN | PRO | * | * | 200 OK (bypass DETAILED-only-Enterprise) |

## קבצים ששונו בסבב 3 (רק שלי, לא נגעתי בקבצי הצ'אט השני)

- `src/lib/usage-limits.ts` (helper `isStaff` + import `Role`)
- `src/app/api/ai/session-prep/route.ts`
- `src/app/api/ai/session/analyze/route.ts`
- `src/app/api/ai/questionnaire/analyze-single/route.ts`
- `src/app/api/ai/questionnaire/analyze-combined/route.ts`
- `src/app/api/ai/questionnaire/progress-report/route.ts`

(`src/app/api/admin/tier-limits/route.ts` ללא שינוי בסבב 3 — נשאר עם תיקוני סבב 2.)

## קבצים שלא נגעתי בהם (שייכים לצ'אט שני)

- `prisma/schema.prisma`
- `src/lib/permissions.ts`
- `src/lib/billing-logger.ts`
- `src/lib/billing/service.ts`
- `src/lib/rate-limit.ts`
- `src/middleware.ts`
- `src/app/admin/layout.tsx`
- `src/app/api/communications/*`
- `src/app/api/communication-logs/*`
- `src/app/api/integrations/billing/*`
- `src/components/clients/correspondence-tab.tsx`
- וכל קובץ Cardcom/admin-billing חדש שהוא (`src/lib/cardcom/*`, `src/app/admin/billing/*`)
