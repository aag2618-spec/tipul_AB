/**
 * baseline-direct.ts
 * Direct DB baseline — bypasses prisma CLI (which doesn't play well with
 * driver adapters in our prisma.config.ts setup).
 *
 * What it does:
 *   1. Connects to Render DB using `pg` directly
 *   2. Creates `_prisma_migrations` table if it doesn't exist
 *   3. For each migration in prisma/migrations/, inserts a row marking it
 *      as already applied (with proper sha256 checksum)
 *
 * Usage:
 *   $env:DATABASE_URL = "postgres://..."
 *   npx tsx scripts/baseline-direct.ts
 *
 * Or one-liner:
 *   npx tsx scripts/baseline-direct.ts "postgres://..."
 */

import { Pool } from "pg";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";

const MIGRATIONS_DIR = "prisma/migrations";

const CREATE_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS "_prisma_migrations" (
  "id"                    VARCHAR(36) PRIMARY KEY,
  "checksum"              VARCHAR(64) NOT NULL,
  "finished_at"           TIMESTAMPTZ,
  "migration_name"        VARCHAR(255) NOT NULL,
  "logs"                  TEXT,
  "rolled_back_at"        TIMESTAMPTZ,
  "started_at"            TIMESTAMPTZ NOT NULL DEFAULT now(),
  "applied_steps_count"   INTEGER NOT NULL DEFAULT 0
);
`;

async function main() {
  const databaseUrl = process.argv[2] || process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("[X] DATABASE_URL not provided.");
    console.error("    Usage: npx tsx scripts/baseline-direct.ts \"postgres://...\"");
    process.exit(1);
  }

  const urlSafe = databaseUrl.replace(/:[^:@]+@/, ":***@");
  console.log(`[i] Connecting to: ${urlSafe}`);

  // List migrations
  const entries = await readdir(MIGRATIONS_DIR, { withFileTypes: true });
  const migrations = entries
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .filter((name) => name !== "migration_lock.toml")
    .sort();

  if (migrations.length === 0) {
    console.error("[X] No migrations found in prisma/migrations/");
    process.exit(1);
  }

  console.log(`[i] Found ${migrations.length} migrations:`);
  for (const m of migrations) console.log(`    - ${m}`);

  const pool = new Pool({ connectionString: databaseUrl });

  try {
    // Test connectivity
    const ping = await pool.query("SELECT 1 as ok");
    console.log(`[OK] Connection successful (ping returned ${ping.rows[0].ok})`);

    // Create table
    await pool.query(CREATE_TABLE_SQL);
    console.log("[OK] _prisma_migrations table ready");

    // Insert rows
    let inserted = 0;
    let skipped = 0;
    const now = new Date();

    for (const migration of migrations) {
      const sqlPath = join(MIGRATIONS_DIR, migration, "migration.sql");
      let checksum: string;
      try {
        const content = await readFile(sqlPath, "utf-8");
        // Normalize line endings (prisma uses LF) and sha256
        const normalized = content.replace(/\r\n/g, "\n");
        checksum = createHash("sha256").update(normalized).digest("hex");
      } catch (err) {
        console.log(`    - ${migration}: SKIP (no migration.sql)`);
        skipped++;
        continue;
      }

      // Check if already exists
      const exists = await pool.query(
        `SELECT id FROM "_prisma_migrations" WHERE migration_name = $1 LIMIT 1`,
        [migration]
      );
      if (exists.rows.length > 0) {
        console.log(`    - ${migration}: already in table`);
        skipped++;
        continue;
      }

      await pool.query(
        `
        INSERT INTO "_prisma_migrations"
          (id, checksum, migration_name, started_at, finished_at, applied_steps_count, logs, rolled_back_at)
        VALUES
          ($1, $2, $3, $4, $5, $6, NULL, NULL)
        `,
        [randomUUID(), checksum, migration, now, now, 1]
      );
      console.log(`    - ${migration}: OK marked applied`);
      inserted++;
    }

    console.log("");
    console.log("=======================================");
    console.log(`[OK] Inserted:  ${inserted}`);
    console.log(`[i] Skipped:   ${skipped}`);
    console.log("");
    console.log("[OK] Baseline complete!");
    console.log("");
    console.log("Verification:");
    console.log('  SELECT migration_name, finished_at FROM "_prisma_migrations" ORDER BY started_at;');
    console.log("");
    console.log("Now you can switch render.yaml + package.json from `db push` to `migrate deploy`.");
  } catch (err) {
    console.error("[X] FAILED:", err instanceof Error ? err.message : String(err));
    if (err instanceof Error && err.stack) {
      console.error(err.stack);
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("[X] UNHANDLED ERROR:", err);
  process.exit(1);
});
