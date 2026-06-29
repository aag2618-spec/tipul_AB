/**
 * rotate-encryption.ts — הצפנה מחדש של כל ה-PHI אל המפתח הנוכחי (key rotation).
 *
 * חלק ב' של סבב אבטחה 2026-06-29. משלים את תשתית ה-versioning ב-
 * `src/lib/encryption.ts`: סורק את כל השדות המוצפנים, מפענח כל ערך עם המפתח
 * המתאים לפי ה-key-id שלו, ומצפין מחדש עם המפתח הנוכחי (`ENCRYPTION_KEY_CURRENT`).
 *
 * הרצה:
 *   npx tsx scripts/rotate-encryption.ts            # dry-run (ברירת מחדל, קריאה בלבד)
 *   npx tsx scripts/rotate-encryption.ts --execute  # החלה בפועל
 *
 * env נדרש:
 *   DATABASE_URL            — מסד הנתונים.
 *   ENCRYPTION_KEY          — המפתח ה-default/legacy (מפענח רשומות בלי key-id).
 *   ENCRYPTION_KEY_V<n>     — המפתח/ות הממוספרים (למשל ENCRYPTION_KEY_V2).
 *   ENCRYPTION_KEY_CURRENT  — היעד: ה-key-id שאליו מצפינים מחדש (למשל "v2").
 *
 * חשוב:
 *   • הסקריפט משתמש ב-`encrypt`/`decrypt` **האמיתיים** מ-`src/lib/encryption.ts`
 *     (אותו קוד שרץ באפליקציה) — אין שכפול לוגיקת הצפנה, אין סיכון interop.
 *   • idempotent: רשומות שכבר במפתח הנוכחי מדולגות → בטוח להריץ שוב.
 *   • ⚠️ `.env.local` המקומי מחובר ל-DB הייצור — `--execute` מקומית משנה ייצור.
 *     עדיף Render Shell אחרי backup.
 *   • הסקריפט **לעולם לא** כותב marker שגיאה ולא דורס ערך שלא הצליח להתפענח —
 *     ערך כזה מדווח ונשאר ללא שינוי.
 */

import { config as dotenvConfig } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { encrypt, decrypt, isEncrypted } from "../src/lib/encryption";
import {
  ENCRYPTED_FIELDS,
  ENCRYPTED_JSON_FIELDS,
  JSON_ENC_MARKER,
} from "../src/lib/encrypted-fields-map";

dotenvConfig({ path: ".env.local" });

// ---- env + אימות תצורת rotation ----

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is required. Make sure .env.local exists.");
  process.exit(1);
}
if (!process.env.ENCRYPTION_KEY) {
  console.error("ENCRYPTION_KEY is required (the default/legacy key).");
  process.exit(1);
}

const KEY_ID_RE = /^v[0-9]+$/;
const CURRENT_KEY_ID = process.env.ENCRYPTION_KEY_CURRENT?.trim();
if (!CURRENT_KEY_ID) {
  console.error(
    "ENCRYPTION_KEY_CURRENT is required — this script re-encrypts everything TO that key.\n" +
      'Set it to a versioned id like "v2" and define the matching ENCRYPTION_KEY_V2.',
  );
  process.exit(1);
}
if (!KEY_ID_RE.test(CURRENT_KEY_ID)) {
  console.error(`Invalid ENCRYPTION_KEY_CURRENT "${CURRENT_KEY_ID}" — expected form like "v2".`);
  process.exit(1);
}
if (!process.env[`ENCRYPTION_KEY_${CURRENT_KEY_ID.toUpperCase()}`]) {
  console.error(
    `ENCRYPTION_KEY_CURRENT=${CURRENT_KEY_ID} but ENCRYPTION_KEY_${CURRENT_KEY_ID.toUpperCase()} is not set.`,
  );
  process.exit(1);
}

// ה-markers שמערכת ההצפנה מחזירה בכשל פענוח (מתוך `encrypted-fields.ts`).
// מוטמעים כאן (encrypted-fields.ts מייבא alias `@/` שלא נפתר תחת tsx) כדי לסרב
// לדרוס PHI שכבר אבד — לעולם לא להצפין marker.
const DECRYPT_ERROR_MARKER = "[שגיאת פענוח — צור קשר עם תמיכה]";
const DECRYPT_JSON_ERROR_MARKER = "[שגיאת פענוח JSON — צור קשר עם תמיכה]";

/** ה-key-id של ciphertext, או null אם לא-מגורסה / legacy. */
function keyIdOf(text: string): string | null {
  const parts = text.split(":");
  return parts.length === 5 && KEY_ID_RE.test(parts[0]) ? parts[0] : null;
}

// ---- הגדרת השדות (מקור-אמת אחד מ-encrypted-fields-map) ----

function pascal(model: string): string {
  return model.charAt(0).toUpperCase() + model.slice(1);
}

interface FieldDef {
  table: string;
  fields: string[];
}

// שדות טקסט — מהמפה + ההצפנות הידניות של BillingProvider (שאינן ב-extension).
const STRING_DEFS: FieldDef[] = [
  ...Object.entries(ENCRYPTED_FIELDS).map(([model, fields]) => ({
    table: pascal(model),
    fields: [...fields],
  })),
  { table: "BillingProvider", fields: ["apiKey", "apiSecret", "webhookSecret", "previousWebhookSecret"] },
];

// שדות JSON (jsonb, עטופים ב-{ __enc__ }).
const JSON_DEFS: FieldDef[] = Object.entries(ENCRYPTED_JSON_FIELDS).map(([model, fields]) => ({
  table: pascal(model),
  fields: [...fields],
}));

// ---- לוגיקת ה-rotation ----

const prisma = new PrismaClient({ adapter: new PrismaPg(new Pool({ connectionString })) });

type Status = "rotated" | "already_current" | "empty" | "skipped_marker" | "error";
interface Result {
  table: string;
  field: string;
  rowId: string;
  status: Status;
  error?: string;
}

async function rotateStringField(
  row: Record<string, unknown>,
  table: string,
  field: string,
  dryRun: boolean,
): Promise<Result> {
  const rowId = String(row.id);
  const value = row[field];

  if (typeof value !== "string" || value.length === 0) {
    return { table, field, rowId, status: "empty" };
  }
  // הגנה: לעולם לא להצפין marker שגיאה (היה דורס PHI שכבר אבד).
  if (value === DECRYPT_ERROR_MARKER) {
    return { table, field, rowId, status: "skipped_marker" };
  }

  try {
    let plaintext: string;
    if (isEncrypted(value)) {
      if (keyIdOf(value) === CURRENT_KEY_ID) {
        return { table, field, rowId, status: "already_current" };
      }
      plaintext = decrypt(value); // בוחר מפתח לפי ה-key-id של הרשומה
    } else {
      plaintext = value; // legacy plaintext שטרם הוצפן — נצפין אותו עכשיו
    }

    const newCt = encrypt(plaintext); // מצפין עם המפתח הנוכחי (מגורסה)
    if (!dryRun) {
      await prisma.$executeRawUnsafe(`UPDATE "${table}" SET "${field}" = $1 WHERE "id" = $2`, newCt, rowId);
    }
    return { table, field, rowId, status: "rotated" };
  } catch (err) {
    return { table, field, rowId, status: "error", error: err instanceof Error ? err.message : String(err) };
  }
}

async function rotateJsonField(
  row: Record<string, unknown>,
  table: string,
  field: string,
  dryRun: boolean,
): Promise<Result> {
  const rowId = String(row.id);
  const value = row[field];

  if (value === null || value === undefined) {
    return { table, field, rowId, status: "empty" };
  }

  try {
    const isObj = typeof value === "object" && !Array.isArray(value);
    // הגנה: צורת כשל הפענוח של JSON — לא לדרוס.
    if (isObj && (value as Record<string, unknown>).error === DECRYPT_JSON_ERROR_MARKER) {
      return { table, field, rowId, status: "skipped_marker" };
    }

    const encStr = isObj ? (value as Record<string, unknown>)[JSON_ENC_MARKER] : undefined;

    let plaintextJson: string;
    if (typeof encStr === "string") {
      if (keyIdOf(encStr) === CURRENT_KEY_ID) {
        return { table, field, rowId, status: "already_current" };
      }
      plaintextJson = decrypt(encStr);
    } else {
      plaintextJson = JSON.stringify(value); // legacy plaintext JSON
    }

    const wrapped = JSON.stringify({ [JSON_ENC_MARKER]: encrypt(plaintextJson) });
    if (!dryRun) {
      await prisma.$executeRawUnsafe(`UPDATE "${table}" SET "${field}" = $1::jsonb WHERE "id" = $2`, wrapped, rowId);
    }
    return { table, field, rowId, status: "rotated" };
  } catch (err) {
    return { table, field, rowId, status: "error", error: err instanceof Error ? err.message : String(err) };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes("--execute");

  const dbHost = (() => {
    try {
      return new URL(connectionString!).host;
    } catch {
      return "(unparsed)";
    }
  })();

  console.log(`\n========================================`);
  console.log(`  Encryption Rotation → ${CURRENT_KEY_ID}  [${dryRun ? "DRY RUN" : "EXECUTE"}]`);
  console.log(`  DB host: ${dbHost}`);
  console.log(`========================================\n`);
  if (dryRun) {
    console.log("Dry-run — no data will be changed. Pass --execute to apply.\n");
  } else {
    console.log("⚠️  EXECUTE mode — rows will be rewritten. Ensure you have a DB backup.\n");
  }

  const results: Result[] = [];

  for (const def of STRING_DEFS) {
    const cols = def.fields.map((f) => `"${f}"`).join(", ");
    const rows: Record<string, unknown>[] = await prisma.$queryRawUnsafe(`SELECT "id", ${cols} FROM "${def.table}"`);
    console.log(`--- ${def.table} (text: ${def.fields.join(", ")}) — ${rows.length} rows`);
    for (const row of rows) {
      for (const field of def.fields) {
        results.push(await rotateStringField(row, def.table, field, dryRun));
      }
    }
  }

  for (const def of JSON_DEFS) {
    const cols = def.fields.map((f) => `"${f}"`).join(", ");
    const rows: Record<string, unknown>[] = await prisma.$queryRawUnsafe(`SELECT "id", ${cols} FROM "${def.table}"`);
    console.log(`--- ${def.table} (json: ${def.fields.join(", ")}) — ${rows.length} rows`);
    for (const row of rows) {
      for (const field of def.fields) {
        results.push(await rotateJsonField(row, def.table, field, dryRun));
      }
    }
  }

  const by = (s: Status) => results.filter((r) => r.status === s).length;
  console.log("\n========================================");
  console.log("  Summary");
  console.log("========================================");
  console.log(`  Rotated:          ${by("rotated")}${dryRun ? " (would rotate)" : ""}`);
  console.log(`  Already current:  ${by("already_current")}`);
  console.log(`  Empty/null:       ${by("empty")}`);
  console.log(`  Skipped markers:  ${by("skipped_marker")}`);
  console.log(`  Errors:           ${by("error")}`);

  const markers = results.filter((r) => r.status === "skipped_marker");
  if (markers.length > 0) {
    console.log("\n  ⚠️  Skipped (decryption-error markers — PHI already lost, left untouched):");
    for (const m of markers) console.log(`    ${m.table}.${m.field} [${m.rowId}]`);
  }
  const errors = results.filter((r) => r.status === "error");
  if (errors.length > 0) {
    console.log("\n  ❌ Errors (left untouched):");
    for (const e of errors) console.log(`    ${e.table}.${e.field} [${e.rowId}]: ${e.error}`);
  }

  if (by("rotated") > 0 && dryRun) {
    console.log("\nRe-run with --execute to apply.");
  }
  console.log("");
}

main()
  .catch((err) => {
    console.error("Rotation failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
