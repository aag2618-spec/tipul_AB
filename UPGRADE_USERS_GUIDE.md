# 🎯 מדריך: שדרוג משתמשים לתוכניות AI

## 🔄 3 דרכים לשדרג משתמש

---

## 1️⃣ דרך Prisma Studio (הכי פשוטה)

### שלבים:
```bash
# פתח Prisma Studio
npx prisma studio
```

1. לחץ על טבלת **"User"**
2. מצא את המשתמש (לפי email/name)
3. ערוך את השדה **`aiTier`**:
   - `ESSENTIAL` → 🥉 100₪ (ללא AI)
   - `PRO` → 🥈 120₪ (GPT-4o-mini)
   - `ENTERPRISE` → 🥇 150₪ (GPT-4o)
4. לחץ **Save**

✅ המשתמש מיד יקבל גישה ל-AI!

---

## 2️⃣ דרך SQL ישיר

### Update בודד:
```sql
UPDATE "User" 
SET "aiTier" = 'PRO' 
WHERE "email" = 'user@example.com';
```

### Update מרובה (לפי domain):
```sql
UPDATE "User" 
SET "aiTier" = 'ENTERPRISE' 
WHERE "email" LIKE '%@company.com';
```

### שדרג את כל ה-Essential ל-Pro:
```sql
UPDATE "User" 
SET "aiTier" = 'PRO' 
WHERE "aiTier" = 'ESSENTIAL';
```

---

## 3️⃣ דרך API (לעתיד - Stripe)

כשתחבר Stripe, זה יקרה אוטומטית:
1. משתמש בוחר תוכנית
2. מבצע תשלום דרך Stripe
3. Webhook מעדכן את `aiTier` אוטומטית
4. המערכת שולחת מייל אישור

---

## 🎁 מתנה: סקריפט שדרוג המוני

צור קובץ `scripts/upgrade-users.ts`:

```typescript
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function upgradeUsers() {
  // דוגמה: שדרג 10 משתמשים ראשונים ל-Pro
  const result = await prisma.user.updateMany({
    where: {
      aiTier: 'ESSENTIAL',
      createdAt: {
        lt: new Date('2026-01-01'), // משתמשים ותיקים
      }
    },
    data: {
      aiTier: 'PRO',
    },
    take: 10,
  });

  console.log(`✅ שודרגו ${result.count} משתמשים ל-Pro`);
}

upgradeUsers()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
```

הרצה:
```bash
npx ts-node scripts/upgrade-users.ts
```

---

## 🔍 בדיקה שהשדרוג עבד

### 1. Prisma Studio
```bash
npx prisma studio
```
בדוק את `aiTier` של המשתמש.

### 2. SQL Query
```sql
SELECT email, "aiTier", "therapeuticApproaches" 
FROM "User" 
WHERE "aiTier" != 'ESSENTIAL';
```

### 3. בממשק המערכת
1. התחבר כמשתמש
2. לך ל: **הגדרות → AI Assistant**
3. אמור לראות את התוכנית החדשה!

---

## ⚙️ מה קורה אחרי שדרוג?

### אוטומטי:
- ✅ Badge בסיידבר משתנה
- ✅ גישה ל-AI Session Prep
- ✅ הגדרות AI Assistant פתוחות
- ✅ Rate limits מתעדכנים

### ידני (צריך לעשות):
1. הגדיר **גישות טיפוליות** (לפחות 1)
   - **הגדרות → AI Assistant**
2. צור **סיכום אחד לפחות** לפגישה
3. נסה **Session Prep** ראשון!

---

## 📊 Downgrade (הורדת תוכנית)

אותו תהליך, רק הפוך:

```sql
UPDATE "User" 
SET "aiTier" = 'ESSENTIAL' 
WHERE "email" = 'user@example.com';
```

**שים לב:**
- ❌ המשתמש יאבד גישה ל-AI
- ✅ ההגדרות שלו נשמרות (אם ישדרג שוב)
- ✅ ה-SessionPrep היסטוריה נשמרת

---

## 🎁 קמפיין שדרוג המוני

### דוגמה: שדרג 20% מה-Essential ל-Pro

```typescript
// scripts/campaign-upgrade.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function campaignUpgrade() {
  // קבל את כל ה-Essential
  const essentialUsers = await prisma.user.findMany({
    where: { aiTier: 'ESSENTIAL' },
    take: Math.ceil(100 * 0.2), // 20% מ-100 משתמשים
  });

  console.log(`🎯 מצאתי ${essentialUsers.length} משתמשים לשדרוג...`);

  // שדרג אותם
  for (const user of essentialUsers) {
    await prisma.user.update({
      where: { id: user.id },
      data: { aiTier: 'PRO' },
    });
    console.log(`✅ ${user.email} שודרג ל-Pro`);
  }

  console.log(`\n🎉 ${essentialUsers.length} משתמשים שודרגו!`);
}

campaignUpgrade()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
```

---

## 🚨 טיפים חשובים

1. **גבה לפני שדרוג המוני**:
   ```bash
   pg_dump DATABASE_URL > backup.sql
   ```

2. **בדוק אחרי שדרוג**:
   - Admin Dashboard
   - Users page
   - AI Usage stats

3. **שלח מייל למשתמשים** (ידני כרגע):
   > "היי! שדרגנו אותך ל-Pro בחינם! תהנה מ-AI Session Prep 🎉"

---

## 🎓 FAQ

### ש: האם צריך לאתחל את המערכת?
**ת:** לא! השינוי מיידי.

### ש: מה קורה ל-AIUsageStats?
**ת:** נשאר כמו שהיה. מתחיל לעקוב מעכשיו.

### ש: אפשר לשדרג זמנית?
**ת:** כן! שדרג ל-PRO למשך חודש, אחר כך downgrade.

### ש: איך לשדרג דרך Stripe?
**ת:** בגרסה הבאה. כרגע רק ידני.

---

## 🎯 סיכום מהיר

| דרך | מהירות | קל? | המלצה |
|-----|--------|-----|-------|
| Prisma Studio | ⚡ מיידי | ✅ מאוד | **משתמש בודד** |
| SQL | ⚡ מיידי | ⚠️ זהירות | **מרובים** |
| Script | 🐌 כמה שניות | ✅ בטוח | **קמפיין** |

---

**💡 עצה:** התחל עם Prisma Studio למשתמש אחד, ואחר כך עבור ל-SQL/Scripts לשדרוגים המוניים.

**🎉 בהצלחה!**
