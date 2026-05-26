# תוכנית מעבר Storage ל-S3/R2 — עם הצפנה

## למה צריך את זה?

הקלטות פגישות, מסמכים, סריקות — כל הקבצים יושבים על דיסק מקומי של Render **בלי הצפנה**.
- אם השרת מתאתחל → קבצים יכולים להימחק
- אם מישהו ניגש לדיסק → הקבצים חשופים כמו שהם
- אין backup אוטומטי לקבצים
- הדאטהבייס מוצפן (AES-256) אבל הקבצים לא

## מצב נוכחי

### Storage module
- `src/lib/storage.ts` — interface `StorageProvider` עם `read`, `write`, `delete`, `exists`
- כרגע רק `LocalStorageProvider` ממומש
- **רק 2 callers** משתמשים ב-module: `support-attachments.ts`, `documents/[id]/route.ts`
- **6+ routes** עובדים ישירות עם `fs` (writeFile/readFile) — צריך להעביר אותם ל-storage module

### קבצים שנשמרים

| קטגוריה | נתיב | סוגים | מקור |
|----------|------|-------|------|
| מסמכים | `documents/` | PDF, DOCX, DOC, images | `api/documents/route.ts` |
| הקלטות | `recordings/` | WebM, MP3, WAV, OGG | `api/recordings/route.ts` |
| קבצי לקוח (email) | `clients/{clientId}/` | JPEG, PNG, PDF, DOCX | `api/communications/attachments/route.ts` |
| תמיכה | `support/{ticketId}/` | JPG, PNG, PDF, DOCX | `lib/support-attachments.ts` |
| מיילים שנשלחו | `sent/{clientId}/` | מצורפים | `api/communications/reply/route.ts` |
| חשבוניות Cardcom | `cardcom-invoices/` | PDF | `lib/cardcom/pdf-backup.ts` |

### Routes שמשתמשים ב-fs ישירות (צריך להעביר ל-storage)

| קובץ | פעולות | שורות |
|------|--------|-------|
| `src/app/api/documents/route.ts` | mkdir, writeFile | 148, 151 |
| `src/app/api/recordings/route.ts` | mkdir, writeFile | 177, 182 |
| `src/app/api/uploads/[...path]/route.ts` | readFile, stat | 172, 167 |
| `src/app/api/recordings/[id]/audio/route.ts` | readFile, stat | 152, 141 |
| `src/app/api/communications/attachments/route.ts` | mkdir, writeFile | 196, 204 |
| `src/app/api/communications/reply/route.ts` | mkdir, writeFile | 256, 263 |
| `src/app/api/cron/recording-orphan-cleanup/route.ts` | unlink | 92 |
| `src/app/api/cron/cardcom-pdf-rehash/route.ts` | readFile | 78 |
| `src/lib/cardcom/pdf-backup.ts` | mkdir, writeFile | 135, 138 |

### משתני סביבה קיימים
- `UPLOADS_DIR` — תיקיית root (`/opt/render/project/uploads`)
- `RECORDING_URL_SECRET` — HMAC ל-signed URLs

## תוכנית מעבר — 5 שלבים

### שלב 1: הרחבת storage.ts עם S3Provider

**קובץ:** `src/lib/storage.ts`

1. התקנת `@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner`
2. יצירת `S3StorageProvider` שממש את `StorageProvider`:
   - `read()` → `GetObjectCommand`
   - `write()` → `PutObjectCommand` עם `ServerSideEncryption: "AES256"`
   - `delete()` → `DeleteObjectCommand`
   - `exists()` → `HeadObjectCommand`
3. בחירה אוטומטית: אם `S3_BUCKET` קיים → S3, אחרת → Local
4. הוספת `getSignedUrl()` method ל-interface

**משתני סביבה חדשים:**
```
S3_BUCKET=mytipul-uploads
S3_REGION=eu-central-1          # או auto (Cloudflare R2)
S3_ACCESS_KEY_ID=...
S3_SECRET_ACCESS_KEY=...
S3_ENDPOINT=...                 # רק ל-R2/MinIO
```

**Cloudflare R2 מומלץ:** תואם S3, בלי egress fees, encryption-at-rest מובנה, $0.015/GB/חודש.

### שלב 2: העברת כל ה-fs callers ל-storage module

לכל 9 הקבצים ברשימה למעלה — להחליף `fs.writeFile/readFile/unlink/mkdir` בקריאות ל-`storage.write/read/delete/exists`.

**סדר עבודה:**
1. קודם uploads/[...path] (קריאה) — כי הוא משרת את כל הקבצים
2. documents + recordings (כתיבה)
3. communications (כתיבה)
4. cron jobs (ניקוי + rehash)
5. cardcom pdf-backup

### שלב 3: שינוי URL pattern

**היום:** קבצים מוגשים דרך `/api/uploads/[...path]` שקורא מדיסק.

**אחרי:** 
- Option A: **Signed URLs** — `/api/uploads/[...path]` מחזיר redirect ל-signed S3 URL (15 דקות)
- Option B: **Proxy** — `/api/uploads/[...path]` קורא מ-S3 ומחזיר ישירות (איטי יותר, אבל שולט ב-headers)

**מומלץ:** Option A (signed URLs) — כבר יש pattern עובד להקלטות (`recordings/[id]/audio/route.ts`).

### שלב 4: מיגרציה של קבצים קיימים

סקריפט one-time שרץ פעם אחת:
1. סורק את כל הקבצים ב-`UPLOADS_DIR`
2. מעלה כל קובץ ל-S3 עם `ServerSideEncryption: "AES256"`
3. מוודא שה-upload הצליח (checksum)
4. **לא מוחק מהדיסק** — שומר כגיבוי עד שמאמתים

### שלב 5: ניקוי

1. הסרת `UPLOADS_DIR` מ-render.yaml
2. הסרת `LocalStorageProvider` (או שמירה כ-fallback לdev)
3. עדכון `render.yaml` — הסרת volume mount

## בדיקות

- [ ] Upload מסמך → נשמר ב-S3 עם encryption
- [ ] Download מסמך → signed URL עובד
- [ ] Upload הקלטה → נשמר ב-S3
- [ ] Signed URL להקלטה → פג אחרי 15 דקות
- [ ] מזכירה → חסומה מהורדת מסמכים קליניים (לא נשבר)
- [ ] Export ZIP → עדיין עובד (קורא מ-S3)
- [ ] Cron orphan cleanup → מוחק מ-S3
- [ ] Cron PDF rehash → קורא מ-S3

## הערכת עלות

**Cloudflare R2:**
- אחסון: $0.015/GB/חודש
- פעולות: Class A (write) $4.50/מיליון, Class B (read) $0.36/מיליון
- **אין egress fees**
- הערכה למערכת קטנה (10GB, 1000 פעולות/יום): ~$0.50/חודש

**AWS S3:**
- אחסון: $0.023/GB/חודש
- Egress: $0.09/GB (יכול להתייקר)
- הערכה: ~$2-5/חודש
