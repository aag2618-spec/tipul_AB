// כיבוי 2FA למשתמש שננעל החוצה (2FA דלוק בלי שיטה תקינה / קוד לא מגיע).
// משנה אך ורק את שדות ה-2FA של המשתמש שצוין — שום דבר אחר.
// הרצה: npx tsx scripts/fix-disable-2fa.ts <email>
import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env.local" });

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set. Make sure .env.local exists.");
  process.exit(1);
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

const TARGET_EMAIL = process.argv[2];
if (!TARGET_EMAIL) {
  console.error("שימוש: npx tsx scripts/fix-disable-2fa.ts <email>");
  process.exit(1);
}

async function main() {
  const user = await prisma.user.findFirst({
    where: { email: { equals: TARGET_EMAIL, mode: "insensitive" } },
    select: {
      id: true,
      email: true,
      role: true,
      twoFactorEnabled: true,
      twoFactorMethod: true,
      sessionVersion: true,
    },
  });

  if (!user) {
    console.log(`❌ לא נמצא משתמש: ${TARGET_EMAIL}`);
    return;
  }

  console.log("\n--- לפני ---");
  console.table([
    {
      email: user.email,
      role: user.role,
      twoFactorEnabled: user.twoFactorEnabled,
      twoFactorMethod: user.twoFactorMethod ?? "null",
      sessionVersion: user.sessionVersion,
    },
  ]);

  if (!user.twoFactorEnabled && !user.twoFactorMethod) {
    console.log("\n✅ 2FA כבר כבוי לגמרי — אין צורך בשינוי.");
    return;
  }

  await prisma.user.update({
    where: { id: user.id },
    data: {
      twoFactorEnabled: false,
      twoFactorMethod: null,
      twoFactorSecret: null,
      twoFactorRecoveryCodes: null,
      // מגדיל sessionVersion כדי לבטל כל טוקן ישן (חצי-2FA) שעדיין קיים.
      sessionVersion: { increment: 1 },
    },
  });

  const after = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      email: true,
      twoFactorEnabled: true,
      twoFactorMethod: true,
      sessionVersion: true,
    },
  });

  console.log("\n--- אחרי ---");
  console.table([
    {
      email: after?.email,
      twoFactorEnabled: after?.twoFactorEnabled,
      twoFactorMethod: after?.twoFactorMethod ?? "null",
      sessionVersion: after?.sessionVersion,
    },
  ]);
  console.log("\n✅ 2FA כובה. המשתמש יכול להיכנס עכשיו עם מייל + סיסמה בלבד.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
