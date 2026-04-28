/**
 * Migration script for legacy 3-part encryption format to 4-part format.
 *
 * Usage: npx tsx scripts/migrate-encryption.ts
 *
 * This script:
 * 1. Finds all encrypted fields in the database
 * 2. Decrypts values in legacy 3-part format
 * 3. Re-encrypts with new 4-part format (random salt)
 * 4. Updates the database row
 *
 * Flags:
 *   --dry-run   (default) Show what would be migrated without changing data
 *   --execute   Actually perform the migration
 */

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import crypto from 'crypto';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('DATABASE_URL environment variable is required.');
  process.exit(1);
}
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
// NOTE: Using base PrismaClient (no encryption extension). The extension
// auto-encrypts on write, but here we use $executeRawUnsafe / $queryRawUnsafe
// to bypass it — we want raw access to read plaintext and write ciphertext
// without going through the extension's hooks.
const prisma = new PrismaClient({ adapter });

// ---- Encryption helpers (inlined to avoid import issues with tsx) ----

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
const ALGORITHM = 'aes-256-gcm';
const LEGACY_SALT = 'salt';

if (!ENCRYPTION_KEY) {
  console.error('ENCRYPTION_KEY environment variable is required.');
  process.exit(1);
}

function deriveKey(salt: string | Buffer): Buffer {
  return crypto.scryptSync(ENCRYPTION_KEY!, salt, 32);
}

function isLegacyFormat(text: string): boolean {
  const parts = text.split(':');
  // Legacy = exactly 3 parts, each 32 hex chars (iv:authTag:encrypted)
  return parts.length === 3 && parts[0].length === 32 && parts[1].length === 32;
}

function isNewFormat(text: string): boolean {
  const parts = text.split(':');
  return parts.length === 4 && parts[0].length === 32 && parts[1].length === 32 && parts[2].length === 32;
}

function decryptLegacy(encryptedText: string): string {
  const [ivHex, authTagHex, encrypted] = encryptedText.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const key = deriveKey(LEGACY_SALT);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

function encryptNew(text: string): string {
  const salt = crypto.randomBytes(16);
  const iv = crypto.randomBytes(16);
  const key = deriveKey(salt);

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();

  return `${salt.toString('hex')}:${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

// ---- Field definitions ----

interface EncryptedFieldDef {
  model: string;
  table: string;
  idField: string;
  fields: string[];
}

const ENCRYPTED_FIELDS: EncryptedFieldDef[] = [
  // Existing — kept for backward-compatibility migration of legacy 3-part format.
  {
    model: 'BillingProvider',
    table: 'BillingProvider',
    idField: 'id',
    fields: ['apiKey', 'apiSecret'],
  },
  // Phase 4 — clinical data encryption. אותם שדות שב-`src/lib/encrypted-fields.ts`.
  // אחרי deploy של הextension, רץ legacy plaintext דרך migrateField שממיר
  // אותו ל-new format (4-part). אחרי migration זה — כל read יפענח אוטומטית.
  {
    model: 'Client',
    table: 'Client',
    idField: 'id',
    fields: ['notes', 'initialDiagnosis', 'intakeNotes', 'approachNotes', 'culturalContext', 'comprehensiveAnalysis'],
  },
  {
    model: 'SessionNote',
    table: 'SessionNote',
    idField: 'id',
    fields: ['content'],
  },
  {
    model: 'Transcription',
    table: 'Transcription',
    idField: 'id',
    fields: ['content'],
  },
  {
    model: 'Analysis',
    table: 'Analysis',
    idField: 'id',
    fields: ['summary', 'nextSessionNotes'],
  },
  {
    model: 'TherapySession',
    table: 'TherapySession',
    idField: 'id',
    fields: ['topic', 'notes'],
  },
];

// ---- Migration logic ----

interface MigrationResult {
  model: string;
  rowId: string;
  field: string;
  status: 'migrated' | 'already_new' | 'not_encrypted' | 'error';
  error?: string;
}

async function migrateField(
  row: Record<string, unknown>,
  idField: string,
  field: string,
  model: string,
  dryRun: boolean,
): Promise<MigrationResult> {
  const rowId = String(row[idField]);
  const value = row[field];

  if (typeof value !== 'string' || !value) {
    return { model, rowId, field, status: 'not_encrypted' };
  }

  if (isNewFormat(value)) {
    return { model, rowId, field, status: 'already_new' };
  }

  // Determine the plaintext to encrypt:
  // - Legacy 3-part format → decrypt with legacy key, then re-encrypt
  // - Plaintext (anything else) → encrypt as-is
  let plaintext: string;
  try {
    if (isLegacyFormat(value)) {
      plaintext = decryptLegacy(value);
    } else {
      plaintext = value; // pre-encryption plaintext data
    }

    const newCiphertext = encryptNew(plaintext);

    if (!dryRun) {
      await prisma.$executeRawUnsafe(
        `UPDATE "${model}" SET "${field}" = $1 WHERE "${idField}" = $2`,
        newCiphertext,
        rowId,
      );
    }

    return { model, rowId, field, status: 'migrated' };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { model, rowId, field, status: 'error', error: message };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--execute');

  console.log(`\n========================================`);
  console.log(`  Encryption Migration: ${dryRun ? 'DRY RUN' : 'EXECUTE'}`);
  console.log(`========================================\n`);

  if (dryRun) {
    console.log('Running in dry-run mode. No data will be changed.');
    console.log('Pass --execute to perform the actual migration.\n');
  }

  const results: MigrationResult[] = [];

  for (const def of ENCRYPTED_FIELDS) {
    console.log(`--- Scanning ${def.model} (fields: ${def.fields.join(', ')}) ---`);

    // Fetch all rows from the table
    const rows: Record<string, unknown>[] = await prisma.$queryRawUnsafe(
      `SELECT "${def.idField}", ${def.fields.map(f => `"${f}"`).join(', ')} FROM "${def.table}"`,
    );

    console.log(`  Found ${rows.length} rows`);

    for (const row of rows) {
      for (const field of def.fields) {
        const result = await migrateField(row, def.idField, field, def.table, dryRun);
        results.push(result);
      }
    }
  }

  // ---- Summary ----
  const migrated = results.filter(r => r.status === 'migrated');
  const alreadyNew = results.filter(r => r.status === 'already_new');
  const notEncrypted = results.filter(r => r.status === 'not_encrypted');
  const errors = results.filter(r => r.status === 'error');

  console.log('\n========================================');
  console.log('  Summary');
  console.log('========================================');
  console.log(`  Legacy -> New:    ${migrated.length}${dryRun ? ' (would migrate)' : ' (migrated)'}`);
  console.log(`  Already new:      ${alreadyNew.length}`);
  console.log(`  Not encrypted:    ${notEncrypted.length}`);
  console.log(`  Errors:           ${errors.length}`);

  if (errors.length > 0) {
    console.log('\n  Errors:');
    for (const e of errors) {
      console.log(`    ${e.model}.${e.field} [${e.rowId}]: ${e.error}`);
    }
  }

  if (migrated.length > 0 && dryRun) {
    console.log('\nRe-run with --execute to apply changes.');
  }

  console.log('');
}

main()
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
