// READ-ONLY: בודק אם פניות "צרו קשר" (Lead) נשמרות + הגדרת מייל admin.
// לא משנה כלום. הרצה: npx tsx scripts/check-leads.ts
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

async function main() {
  console.log("\n=== טבלת Lead (פניות צרו קשר) ===");
  try {
    const count = await prisma.lead.count();
    console.log("מספר פניות:", count);
    const recent = await prisma.lead.findMany({
      orderBy: { createdAt: "desc" },
      take: 10,
      select: {
        name: true, email: true, phone: true,
        organization: true, source: true, status: true, createdAt: true,
      },
    });
    console.table(recent);
  } catch (e) {
    console.log("שגיאת טבלת Lead (אולי db push לא רץ בייצור):", e instanceof Error ? e.message : String(e));
  }

  console.log("\n=== מייל לקבלת פניות ===");
  const email = await prisma.siteSetting.findUnique({ where: { key: "admin_business_email" } });
  console.log("admin_business_email:", email?.value ?? "לא מוגדר");
  console.log("ADMIN_EMAIL (env):", process.env.ADMIN_EMAIL ?? "לא מוגדר");
  console.log("RESEND_API_KEY:", process.env.RESEND_API_KEY ? "מוגדר" : "לא מוגדר");

  console.log("\n=== זיהוי DB ===");
  console.log("מספר משתמשים:", await prisma.user.count());
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
