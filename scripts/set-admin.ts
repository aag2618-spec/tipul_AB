/**
 * Script to set a user as admin
 * 
 * Usage:
 *   npx tsx scripts/set-admin.ts <email>
 * 
 * Example:
 *   npx tsx scripts/set-admin.ts admin@example.com
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const email = process.argv[2];

  if (!email) {
    console.error("Usage: npx tsx scripts/set-admin.ts <email>");
    console.error("Example: npx tsx scripts/set-admin.ts admin@example.com");
    process.exit(1);
  }

  console.log(`Looking for user with email: ${email}`);

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true, role: true },
  });

  if (!user) {
    console.error(`User with email "${email}" not found.`);
    
    // List available users
    const users = await prisma.user.findMany({
      select: { email: true, name: true },
      take: 10,
    });
    
    if (users.length > 0) {
      console.log("\nAvailable users:");
      users.forEach((u) => {
        console.log(`  - ${u.email} (${u.name || "No name"})`);
      });
    }
    
    process.exit(1);
  }

  if (user.role === "ADMIN") {
    console.log(`User "${user.name || user.email}" is already an admin.`);
    process.exit(0);
  }

  const updatedUser = await prisma.user.update({
    where: { id: user.id },
    data: { role: "ADMIN" },
    select: { id: true, name: true, email: true, role: true },
  });

  console.log(`\n✅ Successfully set "${updatedUser.name || updatedUser.email}" as ADMIN`);
  console.log(`   User ID: ${updatedUser.id}`);
  console.log(`   Email: ${updatedUser.email}`);
  console.log(`   Role: ${updatedUser.role}`);
  console.log(`\nThe user can now access /admin`);
}

main()
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

