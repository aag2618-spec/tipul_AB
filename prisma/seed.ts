/**
 * Prisma seed script — Stage 2.0
 *
 * מטרה: יצירת נתוני ברירת מחדל לטבלאות global-state (FeatureFlag,
 * GlobalAISettings). מחליף את lazy-init שהיה ב-GET endpoints.
 *
 * הרצה:
 *   npx prisma db seed           # רץ אוטומטית
 *   # או ידנית: npx tsx prisma/seed.ts
 *
 * הסקריפט idempotent (upsert) — ניתן להריץ כמה פעמים ללא נזק.
 * רשומות קיימות לא יידרסו; חסרות ייוצרו.
 *
 * הערה: ה-lazy-init ב-GET handlers (feature-flags/route.ts, ai-settings/route.ts)
 * נשמר כ-fallback לסביבות שלא הריצו seed. זו "defense in depth" עד שנוסיף
 * `prisma db seed` ל-build pipeline של Render.
 */

import { PrismaClient } from "@prisma/client";
import {
  DEFAULT_AI_SETTINGS,
  DEFAULT_FEATURE_FLAGS,
  GLOBAL_AI_SETTINGS_ID,
} from "../src/lib/defaults";

const prisma = new PrismaClient();

async function seedFeatureFlags() {
  console.log("→ Seeding feature flags...");
  // upsert pattern — עקביות עם lazy-init ב-feature-flags route.
  // update: {} שומר על שדות קיימים (לא מאלץ override של isEnabled/tiers
  // ש-admin יכול היה לשנות).
  for (const flag of DEFAULT_FEATURE_FLAGS) {
    await prisma.featureFlag.upsert({
      where: { key: flag.key },
      update: {},
      create: {
        key: flag.key,
        name: flag.name,
        description: flag.description,
        isEnabled: true,
        tiers: [...flag.tiers],
      },
    });
  }

  console.log(`   ✓ feature flags: ${DEFAULT_FEATURE_FLAGS.length} ensured`);
}

async function seedAISettings() {
  console.log("→ Seeding global AI settings...");

  // upsert על id קבוע (singleton). update:{} שומר על שינויי admin.
  await prisma.globalAISettings.upsert({
    where: { id: GLOBAL_AI_SETTINGS_ID },
    update: {},
    create: { id: GLOBAL_AI_SETTINGS_ID, ...DEFAULT_AI_SETTINGS },
  });
  console.log("   ✓ ai settings: ensured");
}

async function main() {
  console.log("🌱 Prisma seed — starting\n");

  await seedFeatureFlags();
  await seedAISettings();

  console.log("\n✅ Seed completed successfully");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
