// READ-ONLY: מאתר משתמשים שתקועים במצב 2FA בעייתי — twoFactorEnabled=true
// בלי שיטה תקינה, או בעלי תפקיד בכיר שעלולים להינעל. לא משנה כלום.
// הרצה: npx tsx scripts/scan-2fa-trapped.ts
import { config as dotenvConfig } from "dotenv";
dotenvConfig({ path: ".env.local" });

import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL is not set.");
  process.exit(1);
}

const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  // הקבוצה הבעייתית: 2FA דלוק אבל twoFactorMethod ריק (NULL) — שריד מהסרת TOTP
  // בהתנהגות הישנה. אצל תפקיד בכיר (CLINIC_OWNER/ADMIN) זה כופה 2FA בכל כניסה.
  const trapped = await prisma.user.findMany({
    where: { twoFactorEnabled: true, twoFactorMethod: null },
    select: {
      email: true,
      role: true,
      clinicRole: true,
      lastActivityAt: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  console.log(`\n=== משתמשים תקועים (twoFactorEnabled=true, twoFactorMethod=NULL): ${trapped.length} ===`);
  if (trapped.length > 0) {
    console.table(
      trapped.map((u) => ({
        email: u.email,
        role: u.role,
        clinicRole: u.clinicRole ?? "—",
        seniorForced2FA: u.role === "ADMIN" || u.role === "CLINIC_OWNER",
        lastActivityAt: u.lastActivityAt?.toISOString() ?? "—",
      }))
    );
  } else {
    console.log("✅ אין משתמשים במצב הזה.");
  }

  // לצורך הקשר: כמה משתמשים בכלל עם 2FA דלוק, ובאיזו שיטה.
  const allEnabled = await prisma.user.groupBy({
    by: ["twoFactorMethod"],
    where: { twoFactorEnabled: true },
    _count: { _all: true },
  });
  console.log("\n=== פילוח כל מי ש-2FA דלוק אצלו, לפי שיטה ===");
  console.table(
    allEnabled.map((g) => ({
      twoFactorMethod: g.twoFactorMethod ?? "NULL (תקוע)",
      count: g._count._all,
    }))
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
