/**
 * Migration Script: Update existing users with default AI settings
 * 
 * This script updates all existing users to have:
 * - aiTier: ESSENTIAL (default, no AI)
 * - maxActiveClients: 40
 * - analysisStyle: professional
 * - aiTone: formal
 * 
 * Run this after running `npx prisma db push`
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Starting migration...\n');

  // Note: All User fields have @default values in schema, so no need to update existing users
  console.log('ℹ️  All User model fields have default values - skipping user updates');

  // Count users by tier (for info)
  const totalUsers = await prisma.user.count();
  console.log(`📊 Total users in system: ${totalUsers}`);

  if (totalUsers > 0) {
    const tierCounts = await prisma.user.groupBy({
      by: ['aiTier'],
      _count: true,
    });

    console.log('\n📊 Current user distribution:');
    tierCounts.forEach(({ aiTier, _count }) => {
      console.log(`   ${aiTier}: ${_count} users`);
    });
  }

  // Create default GlobalAISettings if not exists
  const existingSettings = await prisma.globalAISettings.findFirst();
  
  if (!existingSettings) {
    await prisma.globalAISettings.create({
      data: {
        id: 'default',
        dailyLimitPro: 30,
        dailyLimitEnterprise: 100,
        monthlyLimitPro: 600,
        monthlyLimitEnterprise: 2000,
        maxMonthlyCostBudget: 5000,
        alertThreshold: 4000,
        blockOnExceed: false,
        alertAdminOnExceed: true,
        enableCache: true,
        compressPrompts: true,
      }
    });
    console.log('\n✅ Created default GlobalAISettings');
  } else {
    console.log('\n✅ GlobalAISettings already exists');
  }

  console.log('\n🎉 Migration completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Migration failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
