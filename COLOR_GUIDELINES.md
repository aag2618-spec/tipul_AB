# 🎨 כללי עיצוב וצבעים - מערכת טיפול

## 📋 **מדוע קובץ זה חשוב?**
כדי לשמור על **מראה מקצועי, קריא ונגיש** לאורך כל האתר, גם בעתיד.

---

## ✅ **הכלל המרכזי: ניגודיות גבוהה**

### **רקעים פסטליים (50) + טקסט כהה (900)**

```typescript
// ✅ כן - קריא ומקצועי
bg-emerald-50 text-emerald-900 font-semibold border border-emerald-200

// ❌ לא - קשה לקרוא
bg-emerald-100 text-emerald-700
```

---

## 🎨 **טבלת הצבעים המאושרת**

| מצב/סטטוס | רקע | טקסט | גבול | דוגמה |
|-----------|-----|------|------|-------|
| **הצלחה/פעיל** | `bg-emerald-50` | `text-emerald-900` | `border-emerald-200` | ✅ פעיל |
| **אזהרה/ממתין** | `bg-amber-50` | `text-amber-900` | `border-amber-200` | ⏳ ממתין |
| **שגיאה/בוטל** | `bg-red-50` | `text-red-900` | `border-red-200` | ❌ בוטל |
| **מידע/תשלום** | `bg-blue-50` | `text-blue-900` | `border-blue-200` | 💳 שולם |
| **ניטרלי** | `bg-slate-50` | `text-slate-900` | `border-slate-200` | ⚪ כללי |
| **ארכיון** | `bg-purple-50` | `text-purple-900` | `border-purple-200` | 📦 ארכיון |

---

## 🏷️ **טמפלטים מוכנים**

### **Badge רגיל**
```tsx
<Badge className="bg-emerald-50 text-emerald-900 font-semibold border border-emerald-200">
  פעיל
</Badge>
```

### **Badge עם אייקון**
```tsx
<Badge className="bg-blue-50 text-blue-900 font-semibold border border-blue-200">
  <CheckCircle className="h-3 w-3 ml-1" />
  הושלם
</Badge>
```

### **Badge עם Hover**
```tsx
<Badge className="bg-amber-50 text-amber-900 font-semibold border border-amber-200 hover:bg-amber-100">
  ממתין
</Badge>
```

---

## 🚫 **אל תעשה**

### ❌ **אל תשתמש ב-100/700**
```typescript
// ❌ קשה לקרוא
bg-emerald-100 text-emerald-700
bg-blue-200 text-blue-600
```

### ❌ **אל תשתמש בצבעים עזים מדי**
```typescript
// ❌ "ילדותי" מדי
bg-pink-500 text-white
bg-cyan-500 text-white
```

### ❌ **אל תשכח font-semibold**
```typescript
// ❌ חסר עובי
bg-emerald-50 text-emerald-900

// ✅ נכון
bg-emerald-50 text-emerald-900 font-semibold
```

---

## ✅ **תעשה**

### ✅ **השתמש ב-50/900 תמיד**
```typescript
// ✅ מקצועי וקריא
bg-emerald-50 text-emerald-900 font-semibold border border-emerald-200
```

### ✅ **הוסף גבול דק**
```typescript
// ✅ מוסיף עומק
border border-emerald-200
```

### ✅ **הוסף font-semibold**
```typescript
// ✅ בולט יותר
font-semibold
```

---

## 📍 **קטגוריות שאלונים - מקרה מיוחד**

לקטגוריות שאלונים (כותרות גדולות), משתמשים בצבעים כהים (700-800):

```typescript
// ✅ קטגוריות שאלונים
const categoryColors = {
  "דיכאון": "bg-slate-700 text-white border-slate-600",
  "חרדה": "bg-blue-700 text-white border-blue-600",
  "טראומה": "bg-red-800 text-white border-red-700",
  "ילדים": "bg-teal-700 text-white border-teal-600",
  // וכו'...
}
```

**למה שונה?** כי זה **כותרת גדולה** ולא טקסט קטן - צריך contrast הפוך (רקע כהה + טקסט בהיר).

---

## 🔍 **איך לבדוק אם צבע מתאים?**

### **שאלות לבדיקה:**
1. ✅ האם אני רואה את הטקסט בבירור ממרחק מטר?
2. ✅ האם זה נראה מקצועי (לא ילדותי)?
3. ✅ האם יש לי `font-semibold` על הטקסט?
4. ✅ האם הרקע הוא `-50` והטקסט `-900`?

אם כל התשובות "כן" - **מעולה!** ✅

---

## 📝 **דוגמאות מהפרויקט**

### **סטטוס מטופל**
```typescript
// src/app/(dashboard)/dashboard/clients/page.tsx
const statusConfig = {
  ACTIVE: { 
    bgColor: "bg-emerald-50", 
    textColor: "text-emerald-900 font-semibold", 
    borderColor: "border-emerald-200" 
  },
  WAITING: { 
    bgColor: "bg-amber-50", 
    textColor: "text-amber-900 font-semibold", 
    borderColor: "border-amber-200" 
  },
  // ...
}
```

### **Badge בדף תיק מטופל**
```tsx
// src/app/(dashboard)/dashboard/clients/[id]/page.tsx
<Badge className={
  client.status === "ACTIVE" 
    ? "bg-emerald-50 text-emerald-900 font-semibold border border-emerald-200" 
    : "bg-amber-50 text-amber-900 font-semibold border border-amber-200"
}>
  {client.status === "ACTIVE" ? "פעיל" : "ממתין"}
</Badge>
```

---

## 🎓 **למידע נוסף**

- [WCAG 2.1 Contrast Guidelines](https://www.w3.org/WAI/WCAG21/Understanding/contrast-minimum.html)
- [Tailwind Color Palette](https://tailwindcss.com/docs/customizing-colors)

---

## 📅 **עדכון אחרון**
**תאריך:** ינואר 2026  
**גרסה:** 1.0  
**מעודכן על ידי:** מערכת הטיפול

---

**💡 זכור:** צבעים זה לא רק יופי - זה גם **נגישות** ו**מקצועיות**! 🎯
