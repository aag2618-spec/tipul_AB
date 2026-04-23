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

const prisma = new PrismaClient();

const DEFAULT_FEATURE_FLAGS = [
  {
    key: "ai_session_prep",
    name: "הכנה לפגישה עם AI",
    description: "הכנה אוטומטית לפגישות באמצעות AI",
    tiers: ["PRO", "ENTERPRISE"],
  },
  {
    key: "ai_detailed_analysis",
    name: "ניתוח מפורט AI",
    description: "ניתוח מפורט של פגישות באמצעות AI",
    tiers: ["ENTERPRISE"],
  },
  {
    key: "ai_questionnaire",
    name: "ניתוח שאלונים AI",
    description: "ניתוח שאלונים אוטומטי באמצעות AI",
    tiers: ["PRO", "ENTERPRISE"],
  },
  {
    key: "email_threads",
    name: "שרשורי מייל",
    description: "ניהול שרשורי אימייל עם מטופלים",
    tiers: ["PRO", "ENTERPRISE"],
  },
  {
    key: "file_attachments",
    name: "קבצים מצורפים",
    description: "צירוף קבצים להודעות ולפגישות",
    tiers: ["PRO", "ENTERPRISE"],
  },
  {
    key: "advanced_reports",
    name: "דוחות מתקדמים",
    description: "גישה לדוחות ואנליטיקה מתקדמים",
    tiers: ["ENTERPRISE"],
  },
] as const;

const DEFAULT_AI_SETTINGS = {
  id: "default",
  dailyLimitEssential: 0,
  dailyLimitPro: 30,
  dailyLimitEnterprise: 100,
  monthlyLimitEssential: 0,
  monthlyLimitPro: 600,
  monthlyLimitEnterprise: 2000,
  maxMonthlyCostBudget: 5000,
  alertThreshold: 4000,
  blockOnExceed: false,
  alertAdminOnExceed: true,
  enableCache: true,
  compressPrompts: true,
} as const;

async function seedFeatureFlags() {
  console.log("→ Seeding feature flags...");
  let created = 0;
  let skipped = 0;

  for (const flag of DEFAULT_FEATURE_FLAGS) {
    const existing = await prisma.featureFlag.findUnique({
      where: { key: flag.key },
    });

    if (existing) {
      skipped++;
      continue;
    }

    await prisma.featureFlag.create({
      data: {
        key: flag.key,
        name: flag.name,
        description: flag.description,
        isEnabled: true,
        tiers: [...flag.tiers],
      },
    });
    created++;
  }

  console.log(`   ✓ feature flags: ${created} created, ${skipped} skipped`);
}

async function seedAISettings() {
  console.log("→ Seeding global AI settings...");

  const existing = await prisma.globalAISettings.findFirst();
  if (existing) {
    console.log("   ✓ ai settings: already present, skipped");
    return;
  }

  await prisma.globalAISettings.create({
    data: DEFAULT_AI_SETTINGS,
  });
  console.log("   ✓ ai settings: created");
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
