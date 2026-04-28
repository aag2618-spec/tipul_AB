import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import {
  ENCRYPTED_FIELDS,
  encryptFields,
  decryptDeep,
} from './encrypted-fields';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient(): PrismaClient {
  // For Prisma 7, we need to use an adapter
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  const pool = new Pool({ connectionString });
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
          if (lower in ENCRYPTED_FIELDS && args.data) {
            encryptFields(lower, args.data);
          }
          const result = await query(args);
          if (lower in ENCRYPTED_FIELDS) decryptDeep(lower, result);
          return result;
        },
        async createMany({ args, query, model }) {
          const lower = lowerFirst(model);
          if (lower in ENCRYPTED_FIELDS && args.data) {
            const arr = Array.isArray(args.data) ? args.data : [args.data];
            for (const row of arr) encryptFields(lower, row);
          }
          return query(args);
        },
        async update({ args, query, model }) {
          const lower = lowerFirst(model);
          if (lower in ENCRYPTED_FIELDS && args.data) {
            encryptFields(lower, args.data);
          }
          const result = await query(args);
          if (lower in ENCRYPTED_FIELDS) decryptDeep(lower, result);
          return result;
        },
        async updateMany({ args, query, model }) {
          const lower = lowerFirst(model);
          if (lower in ENCRYPTED_FIELDS && args.data) {
            encryptFields(lower, args.data);
          }
          return query(args);
        },
        async upsert({ args, query, model }) {
          const lower = lowerFirst(model);
          if (lower in ENCRYPTED_FIELDS) {
            if (args.create) encryptFields(lower, args.create);
            if (args.update) encryptFields(lower, args.update);
          }
          const result = await query(args);
          if (lower in ENCRYPTED_FIELDS) decryptDeep(lower, result);
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
