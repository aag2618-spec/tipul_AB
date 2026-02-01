# הוספת תפקיד MANAGER למערכת

## מה השתנה?

הוספנו תפקיד חדש **MANAGER** (ניהול) למערכת, בנוסף ל-USER ו-ADMIN.

### תפקידים במערכת:
- **USER** - משתמש רגיל
- **MANAGER** - משתמש עם הרשאות ניהול (חדש!)
- **ADMIN** - מנהל מערכת מלא

---

## שינויים שבוצעו:

### 1. **Schema (מסד נתונים)**
`prisma/schema.prisma` - הוספנו MANAGER לטיפוס Role:
```prisma
enum Role {
  USER
  MANAGER  // משתמש עם הרשאות ניהול
  ADMIN
}
```

### 2. **דף ניהול שאלונים**
`src/app/(dashboard)/dashboard/admin/questionnaires/page.tsx`
- נוסף בדיקת הרשאות: רק ADMIN או MANAGER יכולים לגשת
- הוספנו useSession() לבדוק את ה-role של המשתמש
- אם אין הרשאה - מוצג מסך "אין הרשאת גישה"

### 3. **API של טעינת שאלונים**
`src/app/api/questionnaires/seed/route.ts`
- עודכנה בדיקת ההרשאות לקבל גם MANAGER
- הוספנו הודעת שגיאה ברורה: "Forbidden - requires ADMIN or MANAGER role"

### 4. **טיפוסים**
`src/types/index.ts` - הוספנו:
```typescript
export type UserRole = 'USER' | 'MANAGER' | 'ADMIN';
```

---

## איך להחיל את השינויים?

### **אופציה 1: Render (אוטומטי)**
Render יריץ את המיגרציה אוטומטית בעת הפריסה הבאה.

### **אופציה 2: ידנית (אם צריך)**
אם המיגרציה לא רצה אוטומטית:

1. **התחבר למסד הנתונים ב-Render:**
   - לך ל-Dashboard של Render
   - בחר את ה-PostgreSQL database שלך
   - לחץ "Connect" → "External Connection"
   - העתק את פרטי החיבור

2. **הרץ את המיגרציה:**
   ```sql
   ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'MANAGER';
   ```

3. **או דרך Prisma:**
   ```bash
   npx prisma migrate deploy
   ```

---

## איך לשנות משתמש ל-MANAGER?

### **דרך Prisma Studio (מומלץ):**
```bash
npx prisma studio
```
פתח את טבלת Users ושנה את השדה `role` ל-`MANAGER`

### **דרך SQL:**
```sql
UPDATE "User" 
SET role = 'MANAGER' 
WHERE email = 'example@gmail.com';
```

### **דרך Admin Panel (אם יש):**
בעתיד אפשר להוסיף ממשק לניהול תפקידים

---

## מי יכול לגשת לדף ניהול השאלונים?

✅ **ADMIN** - גישה מלאה  
✅ **MANAGER** - גישה מלאה  
❌ **USER** - אין גישה

---

## בדיקה:

1. שנה משתמש ל-MANAGER במסד הנתונים
2. התחבר עם המשתמש הזה
3. נווט ל: `/dashboard/admin/questionnaires`
4. אמור לראות את הדף ולוחץ "טען שאלונים"

---

## פתרון בעיות:

### שגיאה: "enum value already exists"
זה תקין - המיגרציה כבר רצה פעם.

### לא רואה את הדף
וודא שה-role של המשתמש הוא MANAGER או ADMIN (לא USER).

### 403 Forbidden בעת טעינת שאלונים
וודא שהמשתמש מחובר ויש לו role=MANAGER או ADMIN.

---

**זהו! המערכת מוכנה לעבוד עם תפקיד MANAGER.**
