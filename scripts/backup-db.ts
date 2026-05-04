/**
 * Full DB backup → JSON file
 *
 * ⚠️ חשוב: לא ניתן להריץ סקריפט זה מהמחשב המקומי כי Render חוסם
 * חיבורים חיצוניים ל-DB מסיבות אבטחה. צריך להריץ אותו מתוך Render Shell:
 *
 *   1. Render Dashboard → Web Service tipul → Shell
 *   2. הקלד: npx tsx scripts/backup-db.ts
 *   3. הקובץ יישמר ב-/tmp ב-Render container
 *   4. הורד לוקאלית עם: cat /tmp/tipul-backup-*.json (העתק)
 *
 * אופציה חלופית (יותר טובה): השתמש ב-Render Backups בתוך Database settings.
 *
 * Connects directly via pg (no Prisma) for SSL reliability.
 * Dumps ALL tables found in public schema → JSON.
 *
 * The JSON file is saved OUTSIDE the repo to avoid accidentally committing it.
 */

import { Client } from "pg";
import { writeFileSync, mkdirSync, existsSync, statSync } from "fs";
import { join } from "path";
import { homedir } from "os";
import { config as loadEnv } from "dotenv";

loadEnv({ path: join(process.cwd(), ".env.local") });

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL not found in .env.local");
  process.exit(1);
}

function timestamp(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

async function main() {
  const ts = timestamp();
  // ב-Render Shell אין access ל-homedir/Documents — נשתמש ב-/tmp.
  // ב-מחשב מקומי (Windows) — Documents/tipul-backups (לא יעבוד כי החיבור חסום).
  const isRender = process.env.RENDER === "true" || !!process.env.RENDER_SERVICE_ID;
  const backupDir = isRender
    ? "/tmp"
    : join(homedir(), "Documents", "tipul-backups");
  if (!existsSync(backupDir)) mkdirSync(backupDir, { recursive: true });
  const outFile = join(backupDir, `tipul-backup-${ts}.json`);

  console.log(`\n========================================`);
  console.log(`  Tipul DB Backup → ${outFile}`);
  console.log(`========================================\n`);

  // L6: rejectUnauthorized:true ב-default (אם ה-DB מציע self-signed cert,
  // אפשר לעקוף עם DANGEROUS_DISABLE_SSL_VERIFY=true — לא מומלץ אלא ל-debug).
  const allowInsecure = process.env.DANGEROUS_DISABLE_SSL_VERIFY === "true";
  const client = new Client({
    connectionString,
    ssl: allowInsecure
      ? { rejectUnauthorized: false }
      : { rejectUnauthorized: true },
  });

  await client.connect();
  console.log("  ✓ Connected to DB\n");

  // Discover all tables in public schema
  const tablesResult = await client.query<{ table_name: string }>(
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
     ORDER BY table_name`
  );

  const tables = tablesResult.rows.map((r) => r.table_name);
  console.log(`  Found ${tables.length} tables\n`);

  const data: Record<string, unknown[]> = {};
  const counts: Record<string, number> = {};
  let totalRows = 0;
  let errorCount = 0;

  for (const table of tables) {
    try {
      const result = await client.query(`SELECT * FROM "${table}"`);
      data[table] = result.rows;
      counts[table] = result.rows.length;
      totalRows += result.rows.length;
      console.log(`  ✓ ${table.padEnd(32)} ${String(result.rows.length).padStart(6)} rows`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log(`  ✗ ${table}: ERROR — ${msg}`);
      data[table] = [];
      counts[table] = 0;
      errorCount++;
    }
  }

  await client.end();

  // JSON-safe replacer (handles BigInt, Date, Buffer)
  const replacer = (_key: string, value: unknown) => {
    if (typeof value === "bigint") return value.toString();
    if (value instanceof Buffer) return value.toString("base64");
    return value;
  };

  const json = JSON.stringify(
    {
      backupVersion: 1,
      timestamp: new Date().toISOString(),
      tableCount: tables.length,
      counts,
      totalRows,
      data,
    },
    replacer,
    2
  );

  writeFileSync(outFile, json, "utf8");
  const sizeMB = (statSync(outFile).size / 1024 / 1024).toFixed(2);

  console.log(`\n========================================`);
  console.log(`  Summary`);
  console.log(`========================================`);
  console.log(`  Tables:       ${tables.length}`);
  console.log(`  Total rows:   ${totalRows}`);
  console.log(`  Errors:       ${errorCount}`);
  console.log(`  File size:    ${sizeMB} MB`);
  console.log(`  File:         ${outFile}`);

  if (errorCount > 0) {
    console.log(`\n  ❌ BACKUP FAILED — ${errorCount} tables had errors.\n`);
    process.exit(1);
  }
  console.log(`\n  ✅ BACKUP COMPLETE — safe to proceed with encryption.\n`);
}

main().catch((err) => {
  console.error("Backup failed:", err);
  process.exit(1);
});
