/**
 * Script to create a new admin user
 * 
 * Usage:
 *   npx tsx scripts/create-admin.ts
 * 
 * Or with environment variables:
 *   ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=your-password npx tsx scripts/create-admin.ts
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // Default admin credentials - CHANGE THESE!
  const email = process.env.ADMIN_EMAIL || "admin@tipul.app";
  const password = process.env.ADMIN_PASSWORD || "Admin123!";
  const name = process.env.ADMIN_NAME || "מנהל המערכת";

  console.log("Creating admin user...");
  console.log(`Email: ${email}`);

  // Check if user already exists
  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    if (existingUser.role === "ADMIN") {
      console.log("\n✅ Admin user already exists!");
      console.log(`   Name: ${existingUser.name}`);
      console.log(`   Email: ${existingUser.email}`);
      console.log(`   Role: ${existingUser.role}`);
      return;
    }

    // Update existing user to admin
    const updatedUser = await prisma.user.update({
      where: { id: existingUser.id },
      data: { role: "ADMIN" },
    });

    console.log("\n✅ Existing user upgraded to admin!");
    console.log(`   Name: ${updatedUser.name}`);
    console.log(`   Email: ${updatedUser.email}`);
    console.log(`   Role: ${updatedUser.role}`);
    return;
  }

  // Create new admin user
  const hashedPassword = await bcrypt.hash(password, 12);

  const user = await prisma.user.create({
    data: {
      name,
      email,
      password: hashedPassword,
      role: "ADMIN",
    },
  });

  // Create default notification settings
  await prisma.notificationSetting.createMany({
    data: [
      {
        userId: user.id,
        channel: "email",
        enabled: true,
        eveningTime: "20:00",
        morningTime: "08:00",
      },
      {
        userId: user.id,
        channel: "push",
        enabled: true,
        eveningTime: "20:00",
        morningTime: "08:00",
      },
    ],
  });

  console.log("\n✅ Admin user created successfully!");
  console.log(`   Name: ${user.name}`);
  console.log(`   Email: ${user.email}`);
  console.log(`   Password: ${password}`);
  console.log(`   Role: ${user.role}`);
  console.log("\n⚠️  Please change the password after first login!");
  console.log("\n🔗 Login at: /login");
  console.log("🔗 Admin panel at: /admin");
}

main()
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

