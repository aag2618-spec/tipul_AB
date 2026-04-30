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
  // H8 — fail-fast: לא להשתמש ב-credentials ברירת מחדל. אם הסקריפט
  // רץ ללא env מוגדר, נכשל מיידית במקום ליצור אדמין עם סיסמה ידועה
  // (admin@tipul.app / Admin123!) שכל מי שיודע את ה-default יכול להיכנס איתה.
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME || "מנהל המערכת";

  if (!email || !password) {
    console.error("❌ ERROR: ADMIN_EMAIL ו-ADMIN_PASSWORD חייבים להיות מוגדרים ב-env");
    console.error("דוגמה:");
    console.error("  ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=YourSecurePass npx tsx scripts/create-admin.ts");
    process.exit(1);
  }

  if (password.length < 12) {
    console.error("❌ ERROR: סיסמה חייבת להיות באורך 12 תווים לפחות");
    process.exit(1);
  }

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
  console.log(`   Role: ${user.role}`);
  // לא מדפיסים את הסיסמה ל-stdout — היא ב-env, וההדפסה עשויה לדלוף ל-logs.
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

