# HANDOFF — קבלות: גמישות אחידה לכל המשתמשים

**תאריך:** 2026-06-25
**סטטוס:** הקוד הושלם, עבר tsc + 230 בדיקות. ממתין לבדיקה ידנית ואישור push.

## ההחלטה (מהמשתמש)
**מודל אחיד לכל המשתמשים** (לא רק עוסק פטור):
- **אשראי** → תמיד תופק קבלה (הכסף עובר בקארדקום, הוא מפיק את המסמך בסליקה).
- **מזומן / העברה / צ'ק** → המטפל/ת בוחר/ת אם להפיק קבלה, לפי `receiptDefaultMode` (תמיד / לשאול / לעולם לא) — **בכל סוג עסק וכל ספק**.

אין יותר כפיית קבלה לפי סוג עסק/ספק. עוסק מורשה מחויב חוקית בקבלה על כל תקבול — האחריות עליו, לא על המערכת (המשתמש אישר במפורש, אחרי הבהרה).

## איפה הקבלה מופקת (לא השתנה — זה כבר היה כך)
- עוסק פטור → קבלה פנימית (מספור רץ של המערכת).
- עוסק מורשה + קארדקום → קארדקום.
- עוסק מורשה + iCount → iCount.
- (עוסק פטור עם iCount → עדיין קבלה פנימית; iCount לא נכנס לפעולה אצל פטור.)

## התיקון

### שרת — פושט (הוסרה כל הכפייה)
- `receipt-service.ts`: **הוסר** ה-helper `isReceiptMandatoryViaCardcom` (נוצר ונמחק באותו צ'אט — המודל החדש לא צריך כפייה).
- `payment-creator.ts`: `resolveIssueReceipt(shouldIssueReceipt)` → מחזיר `shouldIssueReceipt !== false` בלבד (סינכרוני, בלי userId/orgId). 3 ה-callers עודכנו. אשראי דרך קארדקום עדיין מדלג דרך `isCardcomPendingFlow` (הקבלה מהסליקה).
- `bulk-payment.ts`: 2 מקומות → `shouldIssueReceipt !== false`.

### UI — ההודעה "תופק דרך קארדקום" רק באשראי
- `business-settings/route.ts`: מחזיר `hasActiveCardcom: boolean` (חדש). `externalReceiptProvider` עדיין מוחזר אך **כבר לא נצרך באף מסך** (לא מזיק).
- 5 מסכים: הוסר `externalReceiptProvider` מה-state/useEffect/תנאי. כעת: `method === "CREDIT_CARD" && hasActiveCardcom` → הודעה; אחרת checkbox (אם `receiptMode !== "NEVER"`). `issueReceipt` ברירת מחדל לפי `receiptMode` בלבד:
  - `update-session-dialog.tsx`, `sessions/complete-session-dialog.tsx`, `payments/quick-mark-paid.tsx`, `payments/pay-client-debts.tsx` (גם `willIssueReceipt`), `payments/[id]/mark-paid/page.tsx`

## בדיקות
- [x] `npx tsc --noEmit` נקי
- [x] vitest: 230 עוברות. נמחק `receipt-mandatory-cardcom.test.ts` (helper הוסר); נוקה ה-mock ב-`combined-receipt.test.ts`.
- [x] eslint: רק 2 errors + 8 warnings **קיימים מראש** (`סה"כ` בבלוק "שלם הכל" + imports/props ישנים). אין בעיה חדשה.
- [ ] בדיקה ידנית (המשתמש): פטור+קארדקום מזומן ASK לא-מסומן=אין קבלה; מורשה+קארדקום מזומן=checkbox (היה כפוי); כל סוג עסק אשראי=הודעת קארדקום.
- [ ] ביקורת רב-סוכנית (כסף/קבלות) — לפי בקשת המשתמש.
- [ ] ⛔ אישור מפורש לפני push ל-main.
