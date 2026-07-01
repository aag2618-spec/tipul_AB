# HANDOFF — מסך "תשלום חדש": השלמה למודל הקבלה האחיד

**משימה:** להתאים את מסך "תשלום חדש" למדיניות הקבלה האחידה שכבר נדחפה ל-main (commit `634ae6f2`, 2026-06-25). זה הקובץ היחיד שנשאר מחוץ למודל.

---

## רקע — מהו "המודל האחיד" (כבר קיים בקוד)

מדיניות הפקת קבלה בתשלום מטופל:
- **אשראי** → תמיד תופק קבלה אוטומטית דרך קארדקום (הכסף עובר בסליקה, ה-webhook מפיק את המסמך). אין בחירה.
- **מזומן / העברה / צ'ק** → המטפל/ת בוחר/ת אם להפיק קבלה, לפי `receiptDefaultMode` שבהגדרות (ALWAYS=תמיד / ASK=לפי checkbox / NEVER=אף פעם) — **בכל סוג עסק** (פטור או מורשה) וכל ספק.

5 מסכי תשלום כבר מיישמים את זה. **התבנית המדויקת לחיקוי:** `src/components/payments/quick-mark-paid.tsx` (וזהה ב-update-session-dialog, complete-session-dialog, pay-client-debts, payments/[id]/mark-paid).

---

## הקובץ לתיקון (יחיד)

`src/app/(dashboard)/dashboard/payments/new/page.tsx`

## הבעיה המדויקת

1. שורה ~130: `issueReceipt: formData.status === "PAID"` — מפיק קבלה תמיד כששולם, **בלי לכבד** את `receiptDefaultMode` (NEVER/ASK) ובלי checkbox.
2. אין במסך state של הגדרות העסק (`businessType`/`receiptMode`/`hasActiveCardcom`) ואין תיבת "הוצא קבלה".

(שורה ~93 — מסלול ה-Cardcom — שולח `issueReceipt: false` וזה **נכון**, אל תיגע בו.)

---

## מה צריך לעשות

### 1. הוסף state (ליד `formData`)
```ts
const [businessType, setBusinessType] = useState<"NONE" | "EXEMPT" | "LICENSED">("NONE");
const [receiptMode, setReceiptMode] = useState<"ALWAYS" | "ASK" | "NEVER">("ASK");
const [hasActiveCardcom, setHasActiveCardcom] = useState(false);
const [issueReceipt, setIssueReceipt] = useState(false);
```

### 2. הוסף useEffect שטוען הגדרות עסק (העתק מ-quick-mark-paid)
```ts
useEffect(() => {
  fetch("/api/user/business-settings")
    .then((res) => res.json())
    .then((data) => {
      if (data.businessType) setBusinessType(data.businessType);
      if (data.receiptDefaultMode) setReceiptMode(data.receiptDefaultMode);
      setHasActiveCardcom(data.hasActiveCardcom === true);
      if (data.receiptDefaultMode === "ALWAYS") setIssueReceipt(true);
      else if (data.receiptDefaultMode === "NEVER") setIssueReceipt(false);
    })
    .catch(() => {});
}, []);
```
(ה-API `/api/user/business-settings` כבר מחזיר את `hasActiveCardcom: boolean` — אין צורך לשנות שרת.)

### 3. הוסף בלוק UI של "הוצא קבלה" — **רק כשהסטטוס "שולם"**
מקם אותו בטופס אחרי בורר "אמצעי תשלום" ולפני "הערות". צריך `import { Checkbox } from "@/components/ui/checkbox";` ו-`FileText` מ-`lucide-react`. השתמש בדיוק באותו מבנה ועיצוב כמו ב-quick-mark-paid.tsx (כדי להתמזג):
```tsx
{formData.status === "PAID" && businessType !== "NONE" && (
  formData.method === "CREDIT_CARD" && hasActiveCardcom ? (
    // הודעה ירוקה: "קבלה תופק אוטומטית דרך קארדקום"
  ) : receiptMode === "NEVER" ? null : (
    // תיבת checkbox כחולה: "הוצא קבלה", disabled={receiptMode === "ALWAYS"}
  )
)}
```
חשוב: הבלוק מוצג **רק** כש-`status === "PAID"` — כי כשרושמים "חוב" (PENDING) אין תשלום בפועל ואין קבלה.

### 4. עדכן את ה-POST הרגיל (שורה ~130)
```ts
issueReceipt: formData.status === "PAID" && businessType !== "NONE" && issueReceipt,
```

---

## אזהרות / מה לא לשבור
- **אל תיגע במסלול ה-Cardcom** (הבלוק `if (formData.status === "PAID" && formData.method === "CREDIT_CARD")` ~שורה 78). שם `issueReceipt: false` נכון — קארדקום מפיק בסליקה.
- הבלוק החדש מוצג רק ב-status=PAID. בחוב (PENDING) — לא.
- באשראי+קארדקום מציגים **הודעה** (לא checkbox); הזרם ממילא הולך לסליקה.
- אל תוסיף `externalReceiptProvider` — הוא הוצא מהמודל; משתמשים רק ב-`hasActiveCardcom`.

## בדיקות (חובה לפני סיום)
- `npx tsc --noEmit` — נקי.
- `npx vitest run src/lib/payments` — ירוק (אמורות לעבור, לא נגעת בשרת).
- `npx eslint "src/app/(dashboard)/dashboard/payments/new/page.tsx"` — בלי errors **חדשים** (יש errors/warnings ישנים בפרויקט שלא קשורים).
- בדיקה ידנית: עוסק פטור/מורשה + "שולם" + מזומן ב-ASK → תיבה לא מסומנת=אין קבלה, מסומנת=קבלה; ב-NEVER → אין תיבה ואין קבלה; אשראי → הודעת קארדקום.

## כללי עבודה (חשוב — יש צ'אטים מקבילים פעילים בפרויקט!)
- ⚠️ **לא `git add .`** — יש שינויים של צ'אטים אחרים ב-working tree. הוסף **רק** `src/app/(dashboard)/dashboard/payments/new/page.tsx` בשם מפורש.
- ⛔ **אל תדחוף ל-main בלי אישור מפורש מהמשתמש.**
- עבודה ישירה על main (לא ענף נפרד).
- Windows: אם build — `npx next build` (לא `npm run build`). tsc/eslint/vitest דרך Git Bash.
- אין צורך ב-`prisma db push` (שינוי קוד בלבד).

## הקשר נוסף
ראה memory `project_receipt_policy_uniform` לפרטי המודל המלא. אחרי הסיום — שווה לעדכן שם שהפער של payments/new נסגר.
