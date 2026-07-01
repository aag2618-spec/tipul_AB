// READ-ONLY: בודק את התפקיד האמיתי של aag2618 + רשימת כל ה-ADMIN/MANAGER.
// לא משנה כלום. הרצה: npx tsx scripts/check-my-role.ts
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
  console.log("\n=== aag2618@gmail.com ===");
  const me = await prisma.user.findUnique({
    where: { email: "aag2618@gmail.com" },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      clinicRole: true,
      organizationId: true,
      isBlocked: true,
    },
  });
  console.table(me ? [me] : []);

  console.log("\n=== כל ה-ADMIN / MANAGER במערכת ===");
  const privileged = await prisma.user.findMany({
    where: { role: { in: ["ADMIN", "MANAGER"] } },
    select: { email: true, name: true, role: true, clinicRole: true },
    orderBy: { role: "asc" },
  });
  console.table(privileged);

  console.log("\n=== מספר קליניקות + מי הבעלים ===");
  const orgs = await prisma.organization.findMany({
    select: {
      name: true,
      ownerIsTherapist: true,
      owner: { select: { email: true } },
    },
  });
  console.table(
    orgs.map((o) => ({
      name: o.name,
      owner: o.owner?.email ?? "—",
      ownerIsTherapist: o.ownerIsTherapist,
    }))
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
