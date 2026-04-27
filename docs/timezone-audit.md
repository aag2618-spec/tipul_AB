# ביקורת עקביות Timezone — MyTipul

**סטטוס:** שלב 0 — גרסה 7 (סונכרנה עם permission-matrix v7; תוכן זהה ל-v6).
**תאריך:** 21.4.2026.
**מטרה:** לאתר מקומות בקוד שמניחים UTC בשקט כאשר צריכים `Asia/Jerusalem`, ולהחליט איך לסגור את הפערים **לפני** שמרחיבים את מערכת ה-SMS/AI quota.

## שינויים מגרסה 1 (לאחר ביקורת קוד)

- **🟢 False positive הוסר:** `subscription-reminders:543` לא שגוי — משתמש בטריק noon-UTC בטוח לחלוטין.
- **🔴 9 ממצאים קריטיים חדשים:** כתיבות ל-`MonthlyUsage` ב-6 קבצי API (AI + user) נעשות ב-UTC — **בעיה מבנית**, לא נקודתית.
- **🟠 3 ממצאים נוספים ב-admin stats/ai-stats/audit-log.**
- **המלצה חדשה:** פונקציית עטיפה מרכזית `getCurrentUsageKey()` — חובה כדי למנוע 2 buckets בחלון מעבר.

---

## הקשר

- **הלקוח:** מטפל חרדי בישראל.
- **Hosting:** Render (שרת UTC).
- **קריטי הלכתית:** חסימת שבת ב-`Asia/Jerusalem`.
- **קריטי עסקית:** מכסות חודשיות מתאפסות ב-1 לחודש בחצות ישראל (לא UTC). קבלות ודוחות חשבונאיים לפי שנה/חודש ישראלי.

אם חישוב של "חודש" רץ ב-UTC במקום בישראל, אז **בחלון של 2-3 שעות בסוף החודש** המערכת תטעה:
- מכסת SMS תתחדש שעתיים מאוחר מדי → משתמש חסום לא מוצדק.
- קבלה של 1.1 בחצות ישראל תקבל מספר עם שנת 2025 (בגלל ש-Render עדיין ב-UTC = 2025).
- דוח רואה חשבון של רבעון 1 יחסיר תשלומים של סוף רבעון 4 שקרו בחלון.

---

## מה נבדק

Grep רחב:
```
rg "Asia/Jerusalem|toLocaleString.*he-IL|new Date\(\)\.getMonth|new Date\(\)\.getHours|getTimezoneOffset|\.setHours\(|\.setDate\(|startOfMonth|endOfMonth|startOfDay" src/
```

Grep נוסף שהיה חסר: `new Date\(\w+\.getFullYear\(\)` (לתפוס בניית startOfMonth/startOfDay עם מספרים UTC).

**אחרי סינון ואימות מלא — 21 findings (29 מיקומי קוד בפועל):**

| רמה | findings | מיקומי קוד |
|---|---|---|
| 🔴 CRITICAL (`MonthlyUsage` + SMS) | 10 | 18 |
| 🟠 HIGH (דוחות + admin stats) | 10 | 10 |
| 🟡 LOW (תצוגה) | 1 | 1 |
| **סה"כ** | **21** | **29** |

_הסבר: חלק מה-findings מתייחסים לשורה אחת, וחלק (כמו `session/analyze`) לקובץ שלם עם 3 מיקומי קוד שונים._

---

## ממצאים לפי חומרה

### 🔴 CRITICAL — 10 findings (18 מיקומי קוד)

**זו בעיה מבנית, לא נקודתית.** `MonthlyUsage.month/year` נכתב ונקרא מ-**7 קבצים שונים** — 6 מהם ב-UTC (באגים), 1 כבר TZ-aware (`generate-alerts`). אם נתקן רק חלק — **המצב יהיה גרוע מהיום** (היום הכל שגוי-עקבי; אחרי תיקון חלקי נהיה עם 2 buckets בחלון מעבר).

#### קריאות/עדכונים ל-`MonthlyUsage` (9 findings בטבלה, 17 מיקומי קוד, 6 קבצים עם UTC bugs)

| # | קובץ:שורות | פעולה |
|---|---|---|
| 1 | [src/lib/usage-limits.ts:113-114](src/lib/usage-limits.ts#L113-L114) | `checkLimit()` — קריאה |
| 2 | [src/lib/usage-limits.ts:166-167](src/lib/usage-limits.ts#L166-L167) | `incrementUsage()` — עדכון |
| 3 | [src/app/api/ai/usage/route.ts:34-35](src/app/api/ai/usage/route.ts#L34-L35) | קריאה של שימוש חודשי |
| 4 | [src/app/api/ai/usage/route.ts:104-105](src/app/api/ai/usage/route.ts#L104-L105) | כתיבה/upsert |
| 5 | [src/app/api/user/usage/route.ts:87-88](src/app/api/user/usage/route.ts#L87-L88) | קריאה |
| 6 | [src/app/api/ai/session/analyze/route.ts:111-112, 289-290, 295-296](src/app/api/ai/session/analyze/route.ts) | 3 כתיבות |
| 7 | [src/app/api/ai/questionnaire/analyze-single/route.ts:74-75, 261-262, 267-268](src/app/api/ai/questionnaire/analyze-single/route.ts) | 3 כתיבות |
| 8 | [src/app/api/ai/questionnaire/analyze-combined/route.ts:73-74, 269-270, 275-276](src/app/api/ai/questionnaire/analyze-combined/route.ts) | 3 כתיבות |
| 9 | [src/app/api/ai/questionnaire/progress-report/route.ts:73-74, 306-307, 312-313](src/app/api/ai/questionnaire/progress-report/route.ts) | 3 כתיבות |

**בכל המקומות:** `month: now.getMonth() + 1, year: now.getFullYear()` — ב-TZ השרת (UTC ב-Render).

**השפעה קריטית:**
- משתמש ישראלי שמבצע ניתוח ב-31/12 23:30 ישראל (21:30 UTC) → נרשם לחודש 12 שנת UTC, אבל הוא כבר בחודש 1 ישראל.
- ב-1/1 00:30 ישראל (22:30 UTC של 31/12) → עדיין UTC בחודש 12.
- חלון של 2-3 שעות בסוף כל חודש שבו יש אי-עקביות.

#### איפוס SMS

| # | קובץ:שורה | בעיה |
|---|---|---|
| 10 | [src/lib/sms.ts:109](src/lib/sms.ts#L109) | `now.getMonth() !== resetDate.getMonth()` — איפוס מכסת SMS ב-UTC |

### 🟠 HIGH — 10 findings (דוחות חשבונאיים / מספרי קבלות / סטטיסטיקות admin)

| # | קובץ:שורה | בעיה | השפעה |
|---|---|---|---|
| 11 | [src/lib/export-utils.ts:120, 122](src/lib/export-utils.ts#L120-L122) | `paidDate.getFullYear/getMonth()` | תשלומי סוף שנה בישראל ייכנסו לשנת UTC הקודמת בדוח |
| 12 | [src/lib/export-utils.ts:291, 293](src/lib/export-utils.ts#L291-L293) | חזרה באותו קובץ | |
| 13 | [src/lib/export-utils.ts:602](src/lib/export-utils.ts#L602) | חישוב summary חודשי | |
| 14 | [src/lib/export-utils.ts:620](src/lib/export-utils.ts#L620) | חישוב רבעון (`getMonth() / 3`) | רואה חשבון מקבל רבעון עם חודשים מרבעון שכן |
| 15 | [src/lib/payments/receipt-service.ts:41](src/lib/payments/receipt-service.ts#L41) | `new Date().getFullYear()` למספר קבלה | קבלה ב-1.1.2026 בחצות ישראל תקבל מספר 2025-XXX |
| 16 | [src/app/api/payments/monthly-total/route.ts:34-42, 53, 58-59](src/app/api/payments/monthly-total/route.ts) | `toLocaleString` + `new Date()` hack | השיטה יוצרת Date בלוקלי ולא ב-ISO, לא עקבי |
| 17 | [src/app/api/admin/stats/route.ts:22-23](src/app/api/admin/stats/route.ts#L22-L23) | `new Date(now.getFullYear(), now.getMonth(), 1)` + `startOfDay` ב-UTC | MRR/משתמשים חדשים/קריאות API לפי חודש UTC — מסולף ב-2-3 שעות |
| 18 | [src/app/api/admin/ai-stats/route.ts:16, 47, 60](src/app/api/admin/ai-stats/route.ts) | `todayStart`/`startOfMonth`/`startOfYear` ב-UTC | כל דשבורד AI stats מסולף |
| 19 | [src/app/api/admin/ai-stats/route.ts:107-110](src/app/api/admin/ai-stats/route.ts#L107-L110) | לולאה `for (m = 0; m <= now.getMonth(); m++)` + `.getMonth() <= m` | סיכום חודשי לפי UTC — מחסיר/מוסיף חודש סביב מעבר |
| 20 | [src/app/api/admin/audit-log/route.ts:33](src/app/api/admin/audit-log/route.ts#L33) | `toDate.setHours(23, 59, 59, 999)` — TZ שרת (UTC ב-Render) | סינון תאריך ב-audit log מפספס רשומות של 2-3 שעות אחרונות |

### 🟡 LOW (פורמט תצוגה בלבד)

| # | קובץ | בעיה | השפעה |
|---|---|---|---|
| 21 | [src/lib/email-templates.ts:22-29](src/lib/email-templates.ts#L22-L29) | `toLocaleDateString` עם `Asia/Jerusalem` | נכון! אבל הערה בקוד לא מבהירה שזה TZ-aware — מפתח עתידי עלול להעתיק בלי TZ |

---

## ✅ מה עובד טוב — דוגמאות לחיקוי

### [src/lib/scheduler.ts:99-107](src/lib/scheduler.ts#L99-L107) — `getIsraelHour`

פונקציה קיימת שמחזירה את השעה בישראל דרך `Intl.DateTimeFormat` עם `timeZone: "Asia/Jerusalem"`. **זו הטכניקה שצריך להעתיק לכל פונקציות date-utils החדשות.**

### [src/app/api/cron/generate-alerts/route.ts:168-175](src/app/api/cron/generate-alerts/route.ts#L168-L175) — קריאת `MonthlyUsage` TZ-aware

**דוגמה מצוינת — זה הדפוס שאפשר להעתיק ל-6 הקבצים האחרים (שיחד עם `generate-alerts` = 7 קבצי `MonthlyUsage`):**

```ts
const israelDateParts = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' }).split('-');
const currentYear = parseInt(israelDateParts[0]);
const currentMonth = parseInt(israelDateParts[1]);

const highUsageUsers = await prisma.monthlyUsage.findMany({
  where: { month: currentMonth, year: currentYear },
  // ...
});
```

הטכניקה: `toLocaleDateString('en-CA')` מחזיר `yyyy-MM-dd` ב-`Asia/Jerusalem`, split לפי `-`, parse למספרים. זה בדיוק `getCurrentUsageKey()` המומלץ — אפשר לרפקטר את זה לפונקציה משותפת.

#### 🚨 תובנה קריטית — כבר יש אי-עקביות פעילה בפרודקשן!

`generate-alerts` הוא **המקום ה-7 שנוגע ב-`MonthlyUsage`** בפרויקט. אבל בניגוד ל-6 הכותבים:
- 6 קבצי AI/usage **כותבים** ל-`MonthlyUsage` עם `month/year` של **UTC**.
- `generate-alerts` **קורא** מ-`MonthlyUsage` עם `month/year` של **ישראל**.

**תוצאה בחלון מעבר החודש** (31/12 23:00 — 01:59 UTC, שהוא 01:00 — 03:59 ישראל):
- ה-writers כתבו record עם `month=12`.
- `generate-alerts` (שרץ cron) מחפש `month=1` — **כי בישראל כבר ינואר**.
- **ההתראות "שימוש גבוה" מפספסות רשומות שנכתבו באותן שעות.**

**זו אי-עקביות שקטה שקיימת היום**, לא חשש עתידי. האזהרה "אסור לתקן חלקית" (סעיף הבא) חלה גם עליה — **אחרי התיקון, `generate-alerts` יעבור ל-`getCurrentUsageKey()`** לאחידות סגנון (אותה לוגיקה, סגנון אחיד).

### [src/app/api/cron/subscription-reminders/route.ts:543-546](src/app/api/cron/subscription-reminders/route.ts#L543-L546) — חישוב תאריך חסימה (טריק noon-UTC)

**הוסר מהרשימה השגויה של ה-CRITICAL.** גרסה 1 סימנה את זה כבאג, אבל הקוד בפועל **בטוח לחלוטין**:

```ts
const israelNowStr = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jerusalem' });
const blockDate = new Date(`${israelNowStr}T12:00:00Z`);
blockDate.setDate(blockDate.getDate() + daysLeft);
const blockDateStr = blockDate.toLocaleDateString("he-IL", { timeZone: 'Asia/Jerusalem' });
```

הלוגיקה: לוקח תאריך ישראלי כ-`yyyy-MM-dd`, בונה Date בחצות יום UTC (= 14:00-15:00 בישראל, בטוח מכל מעבר DST), מוסיף ימים, ומעצב חזרה ב-`Asia/Jerusalem`. **זה pattern טוב לחיקוי כשצריך להוסיף ימים ליום ישראלי.**

### [src/lib/shabbat.ts](src/lib/shabbat.ts)

הקובץ הקריטי ביותר הלכתית — **נכתב נכון לחלוטין**:

| מאפיין | מצב |
|---|---|
| `Asia/Jerusalem` מפורש | ✅ שורות 23-24 |
| `Intl.DateTimeFormat` עם `timeZone` | ✅ שורות 72-76, 90 |
| תמיכה ב-DST (IST/IDT) | ✅ שורות 26-28 |
| Fail-closed (אם ספריית hebcal קורסת — חוסם) | ✅ שורות 178-185, 239-250 |
| הבחנה בין יו"ט (חוסם) לחוה"מ (לא חוסם) | ✅ שורות 126-135 |

**מסקנה:** זה המודל שצריך להחיל על שאר הקוד.

---

## הבעיה המבנית

**אין ספרייה מרכזית** ל-"חודש/שנה ישראלי". הקובץ `src/lib/date-utils.ts` מכיל רק `parseIsraelTime()` (המרת input) — אבל **חסר**:

- `getIsraelMonth(date)` — החודש בזמן ישראל
- `getIsraelYear(date)` — השנה בזמן ישראל
- `isSameIsraelMonth(a, b)` — האם שני תאריכים באותו חודש ישראלי
- `isNewMonthSince(prevDate)` — האם עברנו חודש מאז
- **`getCurrentUsageKey()`** — מחזיר `{ month, year }` לפי TZ ישראל (לשימוש ב-7 הקבצים של `MonthlyUsage` — 6 שנתקנים + `generate-alerts` לאחידות).

כתוצאה, **כל מפתח ממציא את הגלגל מחדש** — או שוכח את ה-TZ לגמרי (20 בעיות לתיקון + ממצא LOW אחד של תיעוד חסר).

## ⚠️ אזהרה קריטית — אסור לתקן חלקית!

אם נתקן רק את `usage-limits.ts` בלי לתקן את 5 הקבצים האחרים שכותבים ל-`MonthlyUsage`:

**התוצאה:** מצב גרוע מהיום.
- היום: הכל שגוי ב-UTC, אבל **עקבי** (קריאה וכתיבה באותו bucket).
- אחרי תיקון חלקי: חלק קורא/כותב ב-Israel month, חלק ב-UTC month → **בחלון מעבר נוצרים 2 bucket שונים לאותו משתמש** → אי-עקביות בדאטה (checkLimit רואה bucket אחד, incrementUsage כותב לאחר).

**לכן:** כל 7 הקבצים שנוגעים ב-`MonthlyUsage` חייבים להשתמש ב-`getCurrentUsageKey()` **באותו commit** (6 כותבים שמתוקנים + `generate-alerts` שיעבור לאותו helper). אין אפשרות לפצל.

---

## ההמלצה — הוספה לשלב 1

### שלב 1.0 חדש (לפני הכל) — הרחבת `date-utils.ts`

**להוסיף ל-`src/lib/date-utils.ts`:**

```ts
const IL_TZ = "Asia/Jerusalem";

/**
 * מחזיר את החודש (1-12) בזמן ישראל.
 * דוגמה: Date שנוצר ב-31/12 23:30 UTC יחזיר 1 (ינואר) כי בישראל כבר 2:30 בלילה.
 */
export function getIsraelMonth(date: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: IL_TZ,
    month: "numeric",
  }).formatToParts(date);
  return parseInt(parts.find(p => p.type === "month")!.value, 10);
}

/**
 * מחזיר { month, year } בזמן ישראל — שימוש מרכזי ל-MonthlyUsage.
 * חובה שכל 7 הקבצים שנוגעים ב-MonthlyUsage ישתמשו בזה, אחרת יתרחשו 2 buckets בחלון מעבר.
 */
export function getCurrentUsageKey(date: Date = new Date()): { month: number; year: number } {
  return { month: getIsraelMonth(date), year: getIsraelYear(date) };
}

/**
 * מחזיר את השנה בזמן ישראל.
 */
export function getIsraelYear(date: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: IL_TZ,
    year: "numeric",
  }).formatToParts(date);
  return parseInt(parts.find(p => p.type === "year")!.value, 10);
}

/**
 * בודק אם שני תאריכים באותו חודש-שנה ישראלי.
 */
export function isSameIsraelMonth(a: Date, b: Date): boolean {
  return getIsraelYear(a) === getIsraelYear(b)
      && getIsraelMonth(a) === getIsraelMonth(b);
}

/**
 * בודק אם עברנו חודש (ב-TZ ישראלי) מאז prevDate.
 */
export function isNewIsraelMonthSince(prevDate: Date): boolean {
  return !isSameIsraelMonth(prevDate, new Date());
}

/**
 * מחזיר את הרבעון (1-4) בזמן ישראל.
 */
export function getIsraelQuarter(date: Date = new Date()): number {
  return Math.floor((getIsraelMonth(date) - 1) / 3) + 1;
}
```

**יתרונות:**
- נקודת משיכה יחידה.
- מפתח שכותב חדש — מייבא ומשתמש. לא יטעה.
- טסטי unit פשוטים (מוק Date ב-31/12 23:30 UTC → חייב להחזיר 1 לינואר בישראל).

### שלב 1.0.1 — החלפת 20 הבעיות (מחולק ל-3 קבוצות)

#### קבוצה A — `MonthlyUsage` (חייבת להיות ב-commit אחד!)
| # | קובץ | החלפה |
|---|---|---|
| 1-2 | `src/lib/usage-limits.ts` | `{ month, year }` → `getCurrentUsageKey(now)` |
| 3-4 | `src/app/api/ai/usage/route.ts` | 2 מקומות → `getCurrentUsageKey()` |
| 5 | `src/app/api/user/usage/route.ts` | `getCurrentUsageKey()` |
| 6 | `src/app/api/ai/session/analyze/route.ts` | 3 כתיבות → `getCurrentUsageKey()` |
| 7 | `src/app/api/ai/questionnaire/analyze-single/route.ts` | 3 כתיבות → `getCurrentUsageKey()` |
| 8 | `src/app/api/ai/questionnaire/analyze-combined/route.ts` | 3 כתיבות → `getCurrentUsageKey()` |
| 9 | `src/app/api/ai/questionnaire/progress-report/route.ts` | 3 כתיבות → `getCurrentUsageKey()` |

**חובה:** כל 7 הקבצים בcommit אחד. אחרת 2 buckets בחלון מעבר.

#### קבוצה B — SMS + דוחות חשבונאיים
| # | קובץ | החלפה |
|---|---|---|
| 10 | `src/lib/sms.ts` | השוואת חודשים → `isSameIsraelMonth(now, resetDate)` |
| 11-14 | `src/lib/export-utils.ts` | 6 מקומות → `getIsraelYear/getIsraelMonth/getIsraelQuarter` |
| 15 | `src/lib/payments/receipt-service.ts` | `getFullYear()` → `getIsraelYear(new Date())` |
| 16 | `src/app/api/payments/monthly-total/route.ts` | שימוש ב-`getIsraelMonth` במקום `toLocaleString` |

#### קבוצה C — Admin stats + audit-log
| # | קובץ | החלפה |
|---|---|---|
| 17 | `src/app/api/admin/stats/route.ts` | `startOfMonth`/`startOfDay` → פונקציות helper TZ-aware |
| 18-19 | `src/app/api/admin/ai-stats/route.ts` | 5 מקומות → פונקציות helper |
| 20 | `src/app/api/admin/audit-log/route.ts` | `setHours(23,59,59,999)` → helper `endOfIsraelDay(date)` |

**הערה:** `email-templates.ts` ו-`subscription-reminders:543` **כבר עובדים נכון** — לא צריך תיקון.

### שלב 1.0.2 — טסטי edge-cases

```ts
describe("date-utils — Israel TZ", () => {
  it("Dec 31 23:30 UTC → January in Israel", () => {
    const date = new Date("2025-12-31T23:30:00Z");
    expect(getIsraelMonth(date)).toBe(1);  // כבר ינואר בישראל
    expect(getIsraelYear(date)).toBe(2026);
  });

  it("Jan 1 00:30 UTC → January in Israel (+2h = 02:30 IL)", () => {
    const date = new Date("2026-01-01T00:30:00Z");
    expect(getIsraelMonth(date)).toBe(1);
    expect(getIsraelYear(date)).toBe(2026);
  });

  it("DST transition day (Mar 29 01:30 UTC = 03:30 IL = IDT starts)", () => {
    const date = new Date("2026-03-29T01:30:00Z");
    expect(getIsraelMonth(date)).toBe(3);
    // ... בדיקה שהפונקציה לא קורסת במעבר שעון
  });
});
```

---

## סיכונים של אי-תיקון

אם נתחיל שלב 1 של התוכנית (`consumeSms` / `consumeAiAnalysis`) **בלי לתקן** את `usage-limits.ts` ו-`sms.ts` — **הבאג הקיים יורש למערכת החדשה**:

- ה-`consumeSms` החדש יתקרא מתוך `sendSms` שבודק חודש ב-UTC.
- המכסה החודשית תתאפס שעתיים מאוחר מדי ב-UTC.
- משתמש ישראלי ש-31/12 23:00 ישראל יכול לשלוח — יגלה שהוא "עדיין במכסה של דצמבר" עד 02:00 של 1/1 ישראל.

**החלטה:** שלב 1.0 (התשתית של date-utils) **חובה** לפני שלב 1 הרגיל.

---

## ממצאים נוספים (נבדקו בקוד)

### ✅ `smsQuotaResetDate` כבר קיים ב-Prisma
[prisma/schema.prisma:915](prisma/schema.prisma#L915) — `CommunicationSetting.smsQuotaResetDate: DateTime?`. אין צורך להוסיף שדה — רק לוודא שההשוואות עליו בקוד נעשות ב-TZ ישראל (שזה בדיוק באג #3 ב-`sms.ts`).

### 🔴 חסר `engines.node` ב-package.json
[package.json](package.json) — אין שדה `engines`. זה קריטי כי `Intl.DateTimeFormat` עם `timeZone` דורש **Node 13+ עם ICU מלא** (full-icu build). Render עלול להריץ Node ישן או stripped-ICU, ואז כל ה-shabbat.ts ו-date-utils החדש יקרסו בשקט.

**חובה להוסיף לשלב 1.0:**
```json
"engines": {
  "node": ">=20.0.0"
}
```
ולוודא ש-Render משתמש ב-image עם full-icu (ברירת מחדל ב-Node רשמי מ-13+).

## שאלות פתוחות לסבב ד'

1. **Render TZ env** — האם להגדיר `TZ=Asia/Jerusalem` ב-environment? זה **לא פותר** את הבעיה היסודית, רק מקל. ההמלצה: לא לסמוך על זה, לתקן בקוד.
2. **date-fns-tz** — להוסיף dependency (~15KB) או `Intl.DateTimeFormat`? ההמלצה: Intl.
3. **Migration של רשומות היסטוריות ב-`MonthlyUsage`** — כשנוסיף את `getCurrentUsageKey()`, הרשומות הישנות כתובות ב-UTC. יש פער של עד שעתיים. **החלטה מומלצת:** לא לתקן רטרואקטיבית — הפער קיים ממילא ב-`generate-alerts` היום (ראו התובנה למעלה). רק מרגע ההחלטה והלאה — הכל בישראל.
4. **engines.node** — להוסיף בשלב 1.0. האם גרסת Node המינימלית צריכה להיות 18, 20 או 22?

---

## שלב הבא

לאחר אישור:
1. הוספה ל-`src/lib/date-utils.ts` של 5 הפונקציות + טסטים.
2. החלפת 20 המקומות לפי הטבלה.
3. עדכון `prisma/schema.prisma` אם נדרש (שדה `smsQuotaResetDate` — לוודא שהוא בזמן נכון).
4. הרצת build + טסטי unit של edge-cases של TZ.
5. רק אחרי שזה יציב — להתחיל שלב 1 של תוכנית הניהול.

---

**סיום טיוטה. ממתין לביקורת סבב ד'.**
