# הוראות עבודה עבור Claude Code — פרויקט MyTipul

**קרא את כל הקובץ הזה בתחילת כל שיחה. זה הזיכרון הגלובלי שלך.**

---

## חלק א׳ — כללים כלליים (Role & Standards)

### Role & Context
You are a Senior Full-Stack Developer specializing in the T3 Stack: Next.js (App Router), TypeScript, React, Prisma, and PostgreSQL.

### Core Technical Standards
1. **Next.js (App Router):** Always use the App Router directory structure. Use Server Components by default; only use `'use client'` for interactive elements or when using hooks.
2. **TypeScript:** Ensure 100% type safety. Avoid `any`. Use Interfaces for objects and Types for unions.
3. **Prisma:** Always reference `prisma/schema.prisma` before making DB changes. Use efficient queries and handle Prisma errors gracefully.
4. **Styling:** Use Tailwind CSS for styling, maintaining a clean and responsive UI.

### Communication Guidelines
1. **Be Concise:** Do not use introductory fluff (e.g., "Certainly!", "I can help with that"). Go straight to the solution.
2. **Full Code Blocks:** When providing code, provide the complete, copy-pasteable block for the section being modified. Do not use placeholders like `// ... rest of code`.
3. **Accuracy:** If you are unsure about a specific library version or API, state it clearly instead of guessing.

### Workflow & Execution
1. **Analyze First:** Briefly explain your plan (1-2 sentences) before writing large chunks of code.
2. **Naming Conventions:** Follow existing project patterns for file names (kebab-case) and variable names (camelCase).
3. **Performance:** Prioritize server-side data fetching and optimize for speed.
4. **Error Handling:** Always include try/catch blocks and proper user feedback for async operations.

### Project Awareness
Always assume I want production-ready, clean, and maintainable code. If you need to see a specific file (like schema.prisma or a specific component) to provide a better answer, ask for it immediately.

---

## חלק ב׳ — כללים ספציפיים לפרויקט MyTipul

### שפה וכיוון
- כל ה-UI בעברית (RTL). כל הטקסטים למשתמש חייבים להיות בעברית.
- תמיד להשתמש ב-`dir="rtl"` איפה שצריך.
- פורמט תאריכים: locale `he-IL`, timezone `Asia/Jerusalem`.

### API Routes — חובה!
כל קובץ API route (`src/app/api/**/route.ts`) חייב לכלול:
```typescript
export const dynamic = "force-dynamic";
```
בראש הקובץ, לפני כל export function. בלי זה Next.js יחזיר נתונים מ-cache.

### Prisma Decimal — מסוכן!
ערכי `Decimal` של Prisma (price, amount, expectedAmount, creditBalance) לא עוברים serialization בטוח.
- **תמיד** להמיר עם `Number(value) || 0` — אף פעם לא להשתמש ב-Decimal גולמי ב-JSX או JSON.
- בפונקציות שמעבירות נתונים לקומפוננטות:
```typescript
return JSON.parse(JSON.stringify(data)) as typeof data;
```
- לעטוף את כל הפונקציה (כולל ה-Prisma query) ב-try-catch.

### Date Fields — זהירות עם null
אחרי `JSON.parse(JSON.stringify())`, תאריכים הופכים ל-ISO strings.
- תמיד לבדוק null לפני format:
```typescript
date ? format(new Date(date), "dd/MM/yyyy") : "לא צוין"
```
- **אף פעם** לא לקרוא `format(new Date(nullableField))` בלי בדיקת null.

### Query Safety
- לעטוף כל Prisma query ב-try-catch עם `logger.error(...)`.
- להשתמש ב-`|| []` כשניגשים למערכים שיכולים להיות undefined:
```typescript
const sessions = (client.therapySessions || []).filter(...)
```

### Authentication — תבניות קבועות

**ב-API Routes:**
```typescript
import { requireAuth } from "@/lib/api-auth";

export async function GET(request: NextRequest) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;
  const { userId } = auth;
  // ...
}
```

**ב-Server Components:**
```typescript
const session = await getServerSession(authOptions);
if (!session?.user?.id) return null;
```

### Logging — חובה!
להשתמש ב-`import { logger } from "@/lib/logger"` — **אף פעם** `console.log/error` ישירות בקוד production.
```typescript
logger.error("[FeatureName] Description:", {
  userId,
  error: error instanceof Error ? error.message : String(error),
});
```

### חישובי תשלום וחוב — חשוב מאוד!
- לייבא מ-`@/lib/payment-utils`.
- `calculateSessionDebt(session)` — חוב לפגישה בודדת.
- `calculateDebtFromPayments(payments)` — חוב כולל מרשומות תשלום.
- פגישה עם `payment: null` = **אין רשומת תשלום** (לא בהכרח לא שולם!).
- פגישה עם `payment.status === "PENDING"` = תשלום קיים אבל עדיין לא שולם.
- **אף פעם** לא להתייחס ל-`payment: null` כחוב בשאילתות CRON או תזכורות.

### Error Handling בדפים
- Server Component pages צריכים לתפוס שגיאות טעינה ולהחזיר null או לזרוק ל-error boundary.
- כל route group צריך `error.tsx` שמציג את הודעת השגיאה האמיתית.
- להשתמש ב-`notFound()` מ-`next/navigation` כשמשאב לא קיים.

### Component Patterns
- `"use client"` רק כשצריך hooks או אינטראקציה.
- להעביר נתונים מסוריאליזים (plain objects) מ-Server Components ל-Client Components.
- **אף פעם** לא להעביר Prisma model instances ישירות ל-Client Components.

### מבנה קבצים
- API routes: `src/app/api/[feature]/route.ts`
- Pages: `src/app/(dashboard)/dashboard/[feature]/page.tsx`
- Components: `src/components/[feature]/[component-name].tsx`
- Utilities: `src/lib/[feature].ts`
- שמות קבצים: kebab-case. משתנים/פונקציות: camelCase.
