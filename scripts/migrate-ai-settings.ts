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

  // Update all users without aiTier
  const result = await prisma.user.updateMany({
    where: {
      OR: [
        { aiTier: null },
        { maxActiveClients: null },
      ]
    },
    data: {
      aiTier: 'ESSENTIAL',
      maxActiveClients: 40,
      analysisStyle: 'professional',
      aiTone: 'formal',
      therapeuticApproaches: [],
    }
  });

  console.log(`✅ Updated ${result.count} users with default AI settings`);

  // Count users by tier
  const tierCounts = await prisma.user.groupBy({
    by: ['aiTier'],
    _count: true,
  });

  console.log('\n📊 Current user distribution:');
  tierCounts.forEach(({ aiTier, _count }) => {
    console.log(`   ${aiTier}: ${_count} users`);
  });

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
