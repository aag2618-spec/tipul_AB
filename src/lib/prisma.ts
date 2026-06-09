import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { logger } from './logger';
import {
  ENCRYPTED_FIELDS,
  ENCRYPTED_JSON_FIELDS,
  encryptFields,
  decryptDeep,
} from './encrypted-fields';

// Returns true if a model has ANY encrypted field (string or JSON).
function hasEncryptedFields(model: string): boolean {
  return model in ENCRYPTED_FIELDS || model in ENCRYPTED_JSON_FIELDS;
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  // For Prisma 7, we need to use an adapter
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  // ── הגדרת ה-pool של pg ──
  // קודם היה `new Pool({ connectionString })` בלבד — שלוש בעיות שגרמו ל"טעינה
  // אינסופית" ולקריסות שרת מזדמנות:
  //  1. ללא `connectionTimeoutMillis` — אם כל החיבורים תפוסים, בקשה חדשה ממתינה
  //     *לנצח* לחיבור פנוי. בצד הלקוח זה מתבטא כגלגל טעינה שלא נגמר.
  //  2. ללא מאזין 'error' על ה-pool — pg מחייב אותו: כשמסד-הנתונים מנתק חיבור
  //     idle (Render ורשתות ענן עושים זאת בשקט), pg פולט 'error' על הלקוח ה-idle.
  //     בלי מאזין, השגיאה הופכת ל-uncaughtException ש*מפיל את כל תהליך השרת* —
  //     ואז כל הבקשות נתקעות עד שהשירות עולה מחדש (10-60ש').
  //  3. ללא `keepAlive` — חיבורים לא-פעילים מתנתקים בשקט ע"י ה-NAT/load-balancer.
  const pool = new Pool({
    connectionString,
    max: Number(process.env.DB_POOL_MAX) || 10,
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 30_000,
    keepAlive: true,
  });

  // חובה לפי תיעוד pg: מאזין שגיאות ל-pool. רק מתעדים — pg כבר מסיר את החיבור
  // הפגום מה-pool אוטומטית, ולכן אסור לזרוק כאן (זריקה תחזיר אותנו בדיוק לקריסה
  // שאנחנו מונעים).
  pool.on('error', (err) => {
    logger.error('[prisma] שגיאה לא-צפויה בחיבור idle למסד-הנתונים', {
      error: err instanceof Error ? err.message : String(err),
    });
  });

  // ── Keep-alive ping: שמירה על חיבור "חם" ומניעת חיבורים מתים ──
  // בלי זה, אחרי תקופת חוסר-פעילות החיבורים נסגרים (idleTimeoutMillis=30ש') או
  // מתנתקים בשקט ע"י ה-NAT — והבקשה הראשונה אחרי הפסקה משלמת מחיר "התנעה קרה"
  // (פתיחת חיבור חדש) או נתקעת על חיבור-מת עד timeout. זה בדיוק מה שגורם
  // ל"איטיות/תקיעה אחרי זמן שלא נכנסתי". ping קליל (SELECT 1) כל 20ש':
  //   • משאיר לפחות חיבור אחד חם → הבקשה הראשונה אחרי הפסקה מהירה.
  //   • "מפעיל" חיבורים בקביעות כך שחיבור-מת מתגלה ומפונה (ע"י ה-error listener)
  //     לפני שבקשת משתמש נופלת עליו.
  // עטוף ב-catch — לעולם לא זורק (DB לא-זמין רגעית בזמן deploy/אתחול לא יפיל את
  // התהליך). unref() — לא חוסם יציאת תהליך נקייה (סקריפטים/טסטים).
  const keepAliveTimer = setInterval(() => {
    pool.query('SELECT 1').catch(() => {
      // שקט — DB לא-זמין רגעית; ה-ping הבא יחמם מחדש.
    });
  }, 20_000);
  // unref כדי שה-timer לא יחזיק תהליך קצר-חיים (סקריפט/טסט) מלהסתיים.
  // cast בטוח: בסביבת Node מוחזר Timeout עם unref; ב-DOM lib מוחזר number.
  (keepAliveTimer as unknown as { unref?: () => void }).unref?.();

  const adapter = new PrismaPg(pool);

  const base = new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

  // ── Encryption layer ──
  // Auto-encrypt בכתיבה (create/update/upsert) ו-auto-decrypt בקריאה
  // (find*) על השדות הרגישים שב-`ENCRYPTED_FIELDS`.
  //
  // הצפנה ברמת DB מבטיחה שגם אם DB ידלוף — התוקף לא יוכל לקרוא תוכן
  // קליני. ENCRYPTION_KEY חייב להיות מוגדר ב-env vars.
  const extended = base.$extends({
    name: "encryption",
    query: {
      $allModels: {
        async create({ args, query, model }) {
          const lower = lowerFirst(model);
          if (hasEncryptedFields(lower) && args.data) {
            encryptFields(lower, args.data);
          }
          const result = await query(args);
          if (hasEncryptedFields(lower)) decryptDeep(lower, result);
          return result;
        },
        async createMany({ args, query, model }) {
          const lower = lowerFirst(model);
          if (hasEncryptedFields(lower) && args.data) {
            const arr = Array.isArray(args.data) ? args.data : [args.data];
            for (const row of arr) encryptFields(lower, row);
          }
          return query(args);
        },
        async update({ args, query, model }) {
          const lower = lowerFirst(model);
          if (hasEncryptedFields(lower) && args.data) {
            encryptFields(lower, args.data);
          }
          const result = await query(args);
          if (hasEncryptedFields(lower)) decryptDeep(lower, result);
          return result;
        },
        async updateMany({ args, query, model }) {
          const lower = lowerFirst(model);
          if (hasEncryptedFields(lower) && args.data) {
            encryptFields(lower, args.data);
          }
          return query(args);
        },
        async upsert({ args, query, model }) {
          const lower = lowerFirst(model);
          if (hasEncryptedFields(lower)) {
            if (args.create) encryptFields(lower, args.create);
            if (args.update) encryptFields(lower, args.update);
          }
          const result = await query(args);
          if (hasEncryptedFields(lower)) decryptDeep(lower, result);
          return result;
        },
        async findUnique({ args, query, model }) {
          const result = await query(args);
          const lower = lowerFirst(model);
          return decryptDeep(lower, result);
        },
        async findUniqueOrThrow({ args, query, model }) {
          const result = await query(args);
          const lower = lowerFirst(model);
          return decryptDeep(lower, result);
        },
        async findFirst({ args, query, model }) {
          const result = await query(args);
          const lower = lowerFirst(model);
          return decryptDeep(lower, result);
        },
        async findFirstOrThrow({ args, query, model }) {
          const result = await query(args);
          const lower = lowerFirst(model);
          return decryptDeep(lower, result);
        },
        async findMany({ args, query, model }) {
          const result = await query(args);
          const lower = lowerFirst(model);
          return decryptDeep(lower, result);
        },
      },
    },
  });

  // Cast back to PrismaClient — the extension changes the inferred type but
  // the runtime API is identical (query interceptors only). This keeps
  // existing call sites that use `Prisma.TransactionClient` working.
  return extended as unknown as PrismaClient;
}

function lowerFirst(s: string): string {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;

export default prisma;
